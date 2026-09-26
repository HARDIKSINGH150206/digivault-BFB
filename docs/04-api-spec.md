# 04 — API Spec

Locks the request/response contract for the five flows in `docs/02-architecture-and-dataflow.md`. Field names and shapes are pulled directly from `packages/crypto-core/src/types.ts` (the `DocumentHashResult`/`TileHash`/`PageRaster` the crypto-core pipeline actually emits — see `docs/03-crypto-and-merkle-spec.md` for how those values are computed) and from `prisma/schema.prisma` (the DB models these endpoints read/write). Wire format uses `snake_case` field names, matching the naming already used in `docs/02`'s diagram (`client_hash`, `merkle_root`); this maps 1:1 onto the camelCase Prisma/TS fields (`clientHash` → `client_hash`, etc.) at the API boundary.

All timestamps are ISO-8601 UTC. All hashes are lowercase hex-encoded SHA-256 (64 chars) unless stated otherwise.

## The rule that governs every endpoint below

**CLAUDE.md rule 4 — client hashes first, server re-verifies — applies literally, not just "the server also checks something."** Wherever a client submits a hash (upload) or a set of tile selections that will change a hash (confirm-redactions), the server:
1. Independently recomputes the value from the actual bytes it received (PNG pages, or its own re-rendered redacted PNGs) — same algorithm as crypto-core: raw-pixel-per-tile SHA-256 → Merkle tree (`sortPairs: false`, page-major/row-major leaf order). Server-side this runs in Node, which has synchronous `crypto.createHash('sha256')` for *both* leaf and internal-node hashing — no async/sync split is needed there (that split in `packages/crypto-core` exists only because browsers have no synchronous WebCrypto). Output is byte-identical either way; it's the same algorithm.
2. Compares its own recomputed value against whatever the client submitted.
3. On mismatch: rejects the request (`409 Conflict`, code `HASH_MISMATCH`), persists nothing, does not queue anything downstream.
4. On match: persists **the server's own recomputed value**, never the client-submitted one directly — the client's submission is only ever used as the thing being checked, never as the thing stored.

**CLAUDE.md rule 2 — AI/OCR output never touches the hash.** Endpoint 2 (redaction suggestions) is explicitly one-directional: it reads tile hashes to know which tiles exist, but nothing it returns is ever an input to any hash computation. This is called out again inline below because it's the rule most likely to get quietly violated by a future "just also update the hash while we're saving the suggestion" shortcut.

---

## 0. Authentication and step-up

Every `/api/v1/*` route except the share-link routes (section 7) requires `Authorization: Bearer <session_token>` and checks the caller's role. Errors: `401 UNAUTHENTICATED` (missing/invalid/expired token), `403 FORBIDDEN` (wrong role).

### `POST /api/auth/login`
```json
{ "serviceNumber": "DL/2019/3301", "pin": "223344" }
```
Service number is case-insensitive. PINs are bcrypt-hashed (cost 12). **`200`:**
```json
{ "token": "…", "user_id": "ckuser001", "role": "INVESTIGATING_OFFICER", "service_number": "DL/2019/3301", "department": "Women Safety Division" }
```
- `401 UNAUTHENTICATED` — `"Invalid service number or PIN"` (same message whether the service number or the PIN is wrong).
- `429 RATE_LIMITED` + `Retry-After` — 5 **failed** attempts per 15 min, counted per client IP and per service number (in-memory, single process).

Session tokens are HMAC-signed `userId.role.expiry`, valid 1 hour.

### Step-up (`X-StepUp-Token`)
Three high-stakes actions additionally require `X-StepUp-Token`, proving the officer just passed a fingerprint / Face ID check (or the PIN fallback):

| Action | Route |
|---|---|
| Confirm redactions | `POST …/versions/{versionId}/redactions/confirm` |
| Retry anchoring | `POST …/versions/{versionId}/anchor` |
| Generate certificate | `GET …/versions/{versionId}/certificate` |

Missing, expired (5 min) or another user's token → `401 STEP_UP_REQUIRED`. A step-up token is reusable within its 5 minutes; the UI asks again for every action anyway.

All four WebAuthn routes and `verify-pin` require the session token. Challenges travel in a signed, single-use `challenge_token` (2 min) instead of server memory.

| Route | Body | Returns |
|---|---|---|
| `POST /api/auth/webauthn/register/options` | — | `{ options, challenge_token }` (platform authenticator, user verification required) |
| `POST /api/auth/webauthn/register/verify` | `{ response, challenge_token, pin }` | `{ verified, step_up_token }`. The PIN is required so a stolen session can't enrol an attacker's authenticator. |
| `POST /api/auth/webauthn/authenticate/options` | — | `{ options, challenge_token }`, or `404 NO_CREDENTIAL` if the user has none yet |
| `POST /api/auth/webauthn/authenticate/verify` | `{ response, challenge_token }` | `{ verified, step_up_token }`; the credential must belong to the session user; the signature counter is stored |
| `POST /api/auth/verify-pin` | `{ pin }` | `{ verified, step_up_token }`. Fallback for browsers without WebAuthn. `401` wrong PIN, `429` after 5 failures / 15 min (shared with register/verify) |

`step_up_token` is also returned in an `X-StepUp-Token` response header. RP ID/origin default to the request's `Host`; override with `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`.

---

## 1. Upload — `POST /api/v1/evidence/upload`

`multipart/form-data`. Binary PNG pages travel as file parts (base64-in-JSON would add ~33% overhead for no benefit); everything else is one JSON part.

**Parts:**
- `metadata` (JSON, see below)
- `page_0`, `page_1`, ... `page_{N-1}` — one `image/png` file part per page, N = `metadata.page_count`. Field name index must match `pages[].page_index`.

**`metadata` schema:**
```json
{
  "case_id": "ckcase123",
  "document_id": null,
  "title": "FIR - Case 2026/1123",
  "doc_type": "FIR",
  "source_type": "SCANNED",
  "grid_size": 20,
  "page_count": 5,
  "client_hash": "3f9a...e21c",
  "merkle_root": "238b...cb2b",
  "tiles": [
    { "tile_index": 0, "page_index": 0, "row": 0, "col": 0, "hash": "a1b2...c3d4" }
  ],
  "pages": [
    { "page_index": 0, "width_px": 1190, "height_px": 1684 }
  ]
}
```
- `document_id`: omit/`null` for a brand-new document (requires `case_id`, `title`, `doc_type`, `source_type`); provide an existing `Document.id` to upload a new version of an existing document (`case_id`/`title`/`doc_type`/`source_type` ignored if present, since those belong to `Document`, not `DocumentVersion`).
- `tiles`: length must equal `page_count × grid_size²`, i.e. the full flat `DocumentHashResult.tiles` array from crypto-core, field-for-field (`index`→`tile_index`, `pageIndex`→`page_index`, `hashHex`→`hash`).
- `pages`: `DocumentHashResult.pages`, i.e. `[{pageIndex, widthPx, heightPx}]` → `[{page_index, width_px, height_px}]`. (`pagePngBytes` isn't repeated here — that's the binary `page_N` parts.)

**Server behavior (see the rule box above):** decodes each `page_N` PNG, re-tiles at `grid_size`, re-hashes every tile from raw pixel bytes, rebuilds the Merkle tree, recomputes `client_hash` from the length-prefixed PNG concatenation. Compares both against the submitted `metadata.client_hash`/`metadata.merkle_root`. `metadata.tiles[]` is used only to produce a precise error (which `tile_index` mismatched) on failure — the `Tile` rows actually persisted come from the server's own recomputation.

**Response `201 Created`:**
```json
{
  "document_id": "ckdoc456",
  "document_version_id": "ckver789",
  "version_no": 1,
  "status": "READY",
  "anchor_status": "PENDING",
  "grid_size": 20,
  "merkle_root": "238b...cb2b",
  "client_hash": "3f9a...e21c",
  "storage_uri": "s3://digivault-evidence/ckdoc456/v1/",
  "created_at": "2026-09-15T10:22:31.000Z"
}
```
`merkle_root`/`client_hash` in the response are the server-recomputed values (will equal the submitted ones, or the request would have been rejected).

`status` is `READY` once pages, tiles and hashes are stored. Anchoring then starts automatically in the background (endpoint 4), so `anchor_status` is always `PENDING` here; poll endpoint 4 or the version read route for the outcome. An anchor failure never changes the upload's result or the version's `status`.

**Response `409 Conflict`** (hash mismatch):
```json
{
  "error": "HASH_MISMATCH",
  "message": "Server-recomputed merkle_root does not match submitted value.",
  "mismatched_tile_indices": [47]
}
```

---

## 2. Redaction suggestions — `GET /api/v1/documents/{documentId}/versions/{versionId}/redaction-suggestions`

Fetches AI/OCR-targeting output queued after upload (`docs/02` steps 10-11). **Suggestion-only — nothing in this response is, or ever becomes, an input to any hash.**

`Tile` rows store `pageIndex`/`row`/`col` directly (alongside `tileIndex`/`tileHash`), so this endpoint reads them straight from the row rather than deriving them — they're kept consistent with `tile_index` at write time using the same formula crypto-core uses (`tile_index = page_index × grid_size² + row × grid_size + col`).

**Response `200 OK`:**
```json
{
  "document_version_id": "ckver789",
  "status": "READY",
  "suggestions": [
    {
      "id": "ckflag001",
      "tile_id": "cktile047",
      "tile_index": 47,
      "page_index": 0,
      "row": 2,
      "col": 7,
      "entity_type": "victim_name",
      "confidence_score": 0.93,
      "source": "indicner",
      "masked": false
    }
  ]
}
```
- `status`: `PENDING` (ai-service job not finished — `suggestions: []`), `READY`, or `FAILED` (`ai-service` error/timeout — `suggestions: []`; per CLAUDE.md rule 2 this **never** blocks the document itself, which is already `READY` from step 1 regardless).
- `source`: `"text_layer" | "bhashini_ocr" | "indicner"`, matching `RedactionFlag.source`.
- `entity_type`/`confidence_score`/`masked` map directly to `RedactionFlag` columns.

---

## 3. Confirm redactions — `POST /api/v1/documents/{documentId}/versions/{versionId}/redactions/confirm`

Human-in-the-loop finalization (`docs/02` step 12-13) — nothing redacts silently.

**Requires `X-StepUp-Token`** (section 0).

**Request:**
```json
{
  "confirmed_tile_indices": [12, 47, 203]
}
```
The confirming officer is taken from the session, never from the body.
`confirmed_tile_indices` may include tiles that were never in the AI suggestions list (officer can redact more than AI flagged) — the server does not require every confirmed tile to have a matching `RedactionFlag`.

**Server behavior:** this is the second place rule 4 applies, called out explicitly since it's easy to assume "redaction is just a UI toggle" and skip it. The server does **not** trust any client-submitted root for the redacted version:
1. Loads the current version's original page PNGs from storage.
2. For each `page_index` touched by `confirmed_tile_indices`, draws an opaque black rectangle over each confirmed tile's pixel region (derived from `tile_index`/`grid_size`, same formula as endpoint 2) and re-exports the page as PNG — lossless, still PNG-only.
3. Re-tiles and re-hashes the **redacted** pixels (same raw-pixel algorithm), builds a new Merkle tree, computes the new `merkle_root` entirely server-side.
4. Sets `RedactionFlag.masked = true` for flags matching confirmed tiles; creates a flag with `source: "officer_manual"` for confirmed tiles that had no prior suggestion.
5. Inserts a new `DocumentVersion` row: `version_no = previous + 1`, `previous_hash = <previous version's chain_hash>`, `chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)` — `version_no` as its ASCII decimal string, `timestamp` as the new version's ISO-8601 UTC creation timestamp, all four fields concatenated in that order before hashing. Including `version_no` and `timestamp` (not just `previous_hash`/`merkle_root`) makes the chain resistant to reordering and gives external auditors a cross-check point against the audit log and the anchor timestamp.

**Response `201 Created`:**
```json
{
  "document_version_id": "ckver790",
  "version_no": 2,
  "previous_hash": "9c11...aa02",
  "chain_hash": "7de4...f110",
  "merkle_root": "51aa...9902",
  "status": "READY",
  "anchor_status": "PENDING",
  "redacted_tile_count": 3
}
```
The new version is marked `is_redacted: true` and `READY` only after its pages, tiles and flags are all written; only such versions can be served by share links (section 7). It is then auto-anchored like an upload.

---

## 4. Anchor — automatic, with `POST /api/v1/documents/{documentId}/versions/{versionId}/anchor` as retry

Dual anchor per CLAUDE.md rule 3: the merkle root is written to MinIO, then to `EvidenceAnchor.sol` on Polygon Amoy. **Every version is anchored automatically**: upload (endpoint 1) and confirm-redactions (endpoint 3) start it in the background once their DB writes succeed, and respond without waiting. Each attempt is one `AnchorLog` row that moves `PENDING → ANCHORED | FAILED` (with `errorMessage`); failed attempts stay as history and are audited as `ANCHOR_FAILED`. This runs in-process, so it assumes one long-running Node server; a serverless deployment would need a job queue.

**`POST` — manual retry.** Roles: `INVESTIGATING_OFFICER`, `ADMIN`. **Requires `X-StepUp-Token`.** Runs synchronously. If the version already has an `ANCHORED` row it returns that row without sending a transaction (the contract refuses to overwrite a root anyway).

**`200`:**
```json
{
  "anchor_log_id": "ckanchor02",
  "document_version_id": "ckver790",
  "status": "ANCHORED",
  "chain_root_hash": "51aa...9902",
  "object_lock_uri": "s3://digivault-evidence/ckdoc456/v2/merkle-root.json",
  "polygon_tx_hash": "0x7f3c...",
  "anchored_at": "2026-09-15T10:24:02.000Z"
}
```
**`502`:** `{ "status": "FAILED", "reason": "<error>", "anchor_log_id": …, "object_lock_uri": …|null, "polygon_tx_hash": null }`.

**`GET` — poll** (all roles): the latest `AnchorLog` row for the version, with `status: PENDING | ANCHORED | FAILED` and `error_message`. `404` if no attempt exists yet. The version read route (`GET …/versions/{versionId}`) embeds the same object as `anchor`, plus `is_redacted`.

---

## 5. Verify — the standalone proof contract (`apps/web/src/app/verify`)

The portal is public, stateless, and makes **zero calls to DigiVault's backend** (CLAUDE.md rule 5) — so this section isn't a backend endpoint, it's the JSON file contract between "whatever produced an anchored, possibly-redacted version" and the portal. A version's owner downloads/exports this file alongside the version's page PNG(s); the portal accepts both dropped in together.

**`verification-proof.json` schema:**
```json
{
  "digivault_proof_version": 1,
  "document_version_id": "ckver790",
  "grid_size": 20,
  "page_count": 5,
  "merkle_root": "51aa...9902",
  "pages": [
    { "page_index": 0, "width_px": 1190, "height_px": 1684, "png_sha256": "c4e1...09ab" }
  ],
  "tiles": [
    { "tile_index": 0, "hash": "a1b2...c3d4" }
  ],
  "anchor": {
    "polygon_chain_id": 80002,
    "contract_address": "0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b",
    "polygon_tx_hash": "0x7f3c...",
    "anchored_at": "2026-09-15T10:24:02.000Z"
  }
}
```
- `tiles[]` is the full server-recomputed tile hash array (same shape as upload's `metadata.tiles`, minus `page_index`/`row`/`col` — derivable from `tile_index`/`grid_size` if the portal wants to highlight a specific mismatched region). Redundant with what the portal recomputes from the PNGs itself, but keeping it lets the portal report *which* tile failed rather than just "mismatch" — relevant when this is used as evidence in a legal proceeding.
- `document_version_id` is hashed client-side by the portal itself (`keccak256(utf8Bytes(document_version_id))`) to get the `bytes32` key `EvidenceAnchor.sol.getAnchor()` expects — not precomputed into this file, so the portal's on-chain lookup has no unverified precomputed value to blindly trust.

**Portal algorithm** (all client-side, per `docs/02`'s diagram, restated against this exact shape):
- **A.** Decode each provided page PNG; re-tile at `proof.grid_size`; re-hash every tile from raw pixel bytes (identical algorithm to crypto-core — see `docs/03`).
- **B.** Build a Merkle tree from the recomputed tile hashes; compute `recomputed_root`.
- **C.** Cross-check each recomputed tile hash against `proof.tiles[]` by `tile_index` (for granular "tile 47 doesn't match" reporting) and check `recomputed_root === proof.merkle_root`.
- **D.** Compute `keccak256(utf8Bytes(proof.document_version_id))` and call `getAnchor()` on the **official** `EvidenceAnchor.sol`. The portal hardcodes the contract (`0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b`), chain ID (`80002`) and deployer (`0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`). `proof.anchor.contract_address` is **never** used for the lookup (F-02: a forged proof could otherwise point at the forger's own contract).
- **E.** Result states:
  - **Invalid — untrusted** (distinct red state): the proof names another chain or contract; the RPC endpoint doesn't report chain 80002; or the on-chain `anchoredBy` isn't the deployer.
  - **Verified** (shows "Verified against official DigiVault contract"): `recomputed_root === proof.merkle_root === on_chain_merkle_root`.
  - **Mismatch**: anything else, naming which check failed.

When the contract is redeployed, update those constants in `apps/web/src/app/verify/page.tsx` together with `packages/contracts/deployments/amoy.json`.

---

## 6. Certificate, proof and page downloads

All under `/api/v1/documents/{documentId}/versions/{versionId}/`, all roles, each audited (section 8):

| Route | Returns | Notes |
|---|---|---|
| `GET certificate` | pre-filled, unsigned BSA §63 PDF | **Requires `X-StepUp-Token`** |
| `GET proof` | `verification-proof.json` (section 5) | `409 NOT_ANCHORED` until the version has an `ANCHORED` row |
| `GET pages/{pageIndex}` | the page PNG | |

---

## 7. Consent-based sharing

- `POST /api/v1/documents/{documentId}/shares` (`INVESTIGATING_OFFICER`, `ADMIN`) — `{ recipientLabel, expiresAt, maxViews }` → `201 { shareId, token, shareUrl, … }`. **`403 NO_REDACTED_VERSION` — "No redacted version available for sharing"** until the document has a redacted version.
- `GET /api/v1/documents/{documentId}/shares` — `{ shares: [...], sharedVersion: { id, versionNo } | null }`; `sharedVersion` is what recipients would receive.
- `DELETE /api/v1/documents/{documentId}/shares/{shareId}` — revoke.
- `GET /api/v1/shares/{token}` and the `/shares/{token}` page — **no session**, the token is the credential. They check revoked (`410`), expired (`410`) and view limit (`410`), and count one view.
- `GET /api/v1/shares/{token}/download` — **no session**, same checks, not counted as a view. Returns one PDF of the page PNGs.

**Which version a share serves (F-03):** the newest version with `is_redacted = true` and `status = READY`. The original upload is never served, even when it is the only anchored version. If none exists: `403 NO_REDACTED_VERSION`.

---

## 8. Audit trail

Every write goes through `writeAuditLog` (`apps/web/src/lib/audit.ts`), which never throws: a failed audit write is `console.error`ed and the audited action continues. `AuditLog` is insert-only for the app's DB role. Columns: `actorId`, `action`, `targetId`, `targetType`, `targetMeta` (JSON), `sourceIp`, `timestamp`.

`action` is a string column; the allowed values are the `AuditAction` union in `audit.ts`:

| Action | Written by | `targetMeta` |
|---|---|---|
| `CREATE_CASE` | cases POST | — |
| `UPLOAD_DOCUMENT_VERSION` | upload | — |
| `CONFIRM_REDACTIONS` / `CONFIRM_REDACTIONS_DETAIL` | confirm | detail: prior version, `redactedTileIndices`, `tilesByPage` |
| `ANCHOR_INITIATED` / `ANCHOR_COMPLETE` / `ANCHOR_FAILED` | `lib/anchor.ts` | `documentVersionId`; tx hash; `stage` + `error` |
| `DOWNLOAD_CERTIFICATE` | certificate | `versionNo`, `anchored` |
| `DOWNLOAD_PROOF` | proof | `versionNo`, `anchorLogId`, `pageCount` |
| `VIEW_DOCUMENT_VERSION` | pages/{pageIndex} | `pageIndex`, `versionNo` |
| `SHARE_CREATED` / `SHARE_REVOKED` | shares | — |
| `SHARE_LINK_ACCESSED` / `SHARE_LINK_DOWNLOADED` | share view / download | `accessedBy: "share_recipient"`, `recipientLabel`, `versionId`, … |
| `WEBAUTHN_REGISTERED` | webauthn register/verify | — |

Share recipients have no account, but `actorId` is a required FK to `User`. So share-link rows are attributed to the officer who created the share, with `accessedBy: "share_recipient"`. `DOWNLOAD_PAGE` is defined but not currently written.

`sourceIp` comes from `X-Forwarded-For`. With `DIGIVAULT_TRUST_PROXY=true` (a proxy you control rewrites the header) the first hop is used; otherwise the last. Without a trusted proxy the value is client-controlled and should be treated as indicative only.

---

## Open items surfaced while writing this spec (flagged, not resolved here)

- ~~`chain_hash` formula~~ — resolved: `chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)`, per project decision (see endpoint 3).
- ~~The anchor flow's async/poll shape~~ — resolved: anchoring is automatic and runs in the background after upload/confirm; the UI polls (endpoint 4). A job queue would be needed for serverless or multi-instance deployments.
- Step-up via the PIN fallback is always accepted, so step-up is only as strong as the PIN — open decision whether to restrict it to users with no registered authenticator.
- If an anchor transaction lands but the server never sees the receipt, the row is `FAILED` and a retry is rejected on-chain ("already anchored"). Open: check `getAnchor()` before retrying and mark such rows `ANCHORED`.
- Redaction confirm (endpoint 3) requires the server to redraw PNG pages with masked regions — Node has no DOM `<canvas>`, so the backend will need a headless canvas library (e.g. `@napi-rs/canvas` or `sharp`) as a new dependency. Not a spec problem, but a step-4 backend decision this doc's contract assumes is solvable.
