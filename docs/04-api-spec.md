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
  "proof_version": 2,
  "grid_size": 20,
  "page_count": 5,
  "client_hash": "3f9a...e21c",
  "merkle_root": "238b...cb2b",
  "commitment": "c07e...41aa",
  "salts": ["5d0f...91c2"],
  "tiles": [
    { "tile_index": 0, "page_index": 0, "row": 0, "col": 0, "hash": "a1b2...c3d4" }
  ],
  "pages": [
    { "page_index": 0, "width_px": 1190, "height_px": 1684 }
  ]
}
```
- `document_id`: omit/`null` for a brand-new document (requires `case_id`, `title`, `doc_type`, `source_type`); provide an existing `Document.id` to upload a new version of an existing document (`case_id`/`title`/`doc_type`/`source_type` ignored if present, since those belong to `Document`, not `DocumentVersion`).
- `proof_version`: must be `2` (docs/03 §v2). Anything else → `400` (ADR-021: no new v1 versions).
- `client_hash` = `fileHash`, `merkle_root` = the document root `R`, `commitment` = `C = H(0x03 ‖ fileHash ‖ R)` — all from `hashDocumentV2()` in crypto-core.
- `salts`: one 32-byte lowercase-hex salt per tile, global tile order, generated in the browser with the CSPRNG (ADR-018). Wrong count, bad hex or any repeated salt → `400`. Stored encrypted (`VersionSaltSet`) in the same transaction as the version; never returned by this endpoint.
- `tiles`: length must equal `page_count × grid_size²`, i.e. the full flat `tiles` array from `hashDocumentV2()`, field-for-field (`index`→`tile_index`, `pageIndex`→`page_index`, `hashHex`→`hash`, the salted leaf).
- `pages`: `DocumentHashResult.pages`, i.e. `[{pageIndex, widthPx, heightPx}]` → `[{page_index, width_px, height_px}]`. (`pagePngBytes` isn't repeated here — that's the binary `page_N` parts.)

**Server behavior (see the rule box above):** decodes each `page_N` PNG, re-tiles at `grid_size`, recomputes every salted leaf from raw pixel bytes and the submitted salts, rebuilds the page roots and `R`, recomputes `client_hash` from the length-prefixed PNG concatenation, then `C`. All three must equal the submitted `client_hash`, `merkle_root` and `commitment`. `metadata.tiles[]` is used only to produce a precise error (which `tile_index` mismatched) on failure — the `Tile` rows actually persisted come from the server's own recomputation. If `SALT_ENCRYPTION_KEY` is not configured the endpoint returns `503 SERVER_MISCONFIGURED` before doing any work.

**Response `201 Created`:**
```json
{
  "document_id": "ckdoc456",
  "document_version_id": "ckver789",
  "version_no": 1,
  "status": "READY",
  "anchor_status": "PENDING",
  "grid_size": 20,
  "proof_version": 2,
  "merkle_root": "238b...cb2b",
  "commitment": "c07e...41aa",
  "client_hash": "3f9a...e21c",
  "storage_uri": "s3://digivault-evidence/ckdoc456/v1/",
  "created_at": "2026-09-15T10:22:31.000Z"
}
```
`merkle_root`/`commitment`/`client_hash` in the response are the server-recomputed values (will equal the submitted ones, or the request would have been rejected).

`status` is `READY` once pages, tiles and hashes are stored. Anchoring then starts automatically in the background (endpoint 4), so `anchor_status` is always `PENDING` here; poll endpoint 4 or the version read route for the outcome. An anchor failure never changes the upload's result or the version's `status`.

**Response `409 Conflict`** (hash mismatch):
```json
{
  "error": "HASH_MISMATCH",
  "message": "Server-recomputed client_hash/merkle_root/commitment does not match submitted values.",
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
- `source`: `"text_layer" | "bhashini_ocr" | "indicner" | "gazetteer"`, matching `RedactionFlag.source`. `gazetteer` = a name already confirmed in another document of the same case (ADR-034).
- Name hashes (`RedactionFlag.nameHashes`) are not returned by this endpoint; they never leave the server except to the AI service.
- `entity_type`/`confidence_score`/`masked` map directly to `RedactionFlag` columns.

---

### AI service request (internal, web app → `apps/ai-service`)

`POST {AI_SERVICE_URL}/v1/redaction-suggestions` with `document_version_id`, `grid_size`, `pages[]` (`page_index`, `width_px`, `height_px`, `png_base64`) and, when `GAZETTEER_KEY` is set, `gazetteer: { case_key, name_hashes[] }`: the case's derived key (base64, 32 bytes; `422` otherwise) and the keyed hashes already in its gazetteer. Each returned suggestion may carry `name_hashes[]`: keyed hashes of the names on that tile, stored as `RedactionFlag.nameHashes`. No name text crosses this boundary in either direction (ADR-034).

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
3. Generates **fresh** salts for the new version (never the prior version's — a masked tile's original salt must not reach anyone holding the redacted version's proof, ADR-018), re-tiles and re-hashes the **redacted** pixels with them (v2, docs/03), and computes the new `R` and `C` entirely server-side. The redacted version is always v2, even when the prior version is legacy v1. Its salts are stored in the same transaction as the version.
4. Sets `RedactionFlag.masked = true` for flags matching confirmed tiles; creates a flag with `source: "officer_manual"` for confirmed tiles that had no prior suggestion.
   Then adds the name hashes on the confirmed tiles to the case gazetteer (`CaseGazetteerEntry`, ADR-034). Skipped when `GAZETTEER_KEY` is unset; a failure here never fails the confirm.
5. Inserts a new `DocumentVersion` row: `version_no = previous + 1`, `previous_hash = <previous version's chain_hash>`, `chain_hash = H(0x06 ‖ prev ‖ C ‖ u32 version_no ‖ u64 timestamp_ms)` (docs/03 §v2; fixed-width fields). Including `version_no` and `timestamp` makes the chain resistant to reordering and gives external auditors a cross-check point against the audit log and the anchor timestamp. Legacy v1 versions keep their original chain hash, `SHA256(previous_hash + merkle_root + version_no + timestamp)` over the unseparated ASCII strings.

**Response `201 Created`:**
```json
{
  "document_version_id": "ckver790",
  "version_no": 2,
  "previous_hash": "9c11...aa02",
  "chain_hash": "7de4...f110",
  "proof_version": 2,
  "merkle_root": "51aa...9902",
  "commitment": "9e02...7b1d",
  "status": "READY",
  "anchor_status": "PENDING",
  "redacted_tile_count": 3
}
```
The new version is marked `is_redacted: true` and `READY` only after its pages, tiles and flags are all written; only such versions can be served by share links (section 7). It is then auto-anchored like an upload.

---

## 4. Anchor — automatic, with `POST /api/v1/documents/{documentId}/versions/{versionId}/anchor` as retry

Dual anchor per CLAUDE.md rule 3: the anchored value — the commitment `C` for v2, the merkle root for legacy v1 (`lib/proof-v2.ts: anchoredValue`) — is written to MinIO, then to `EvidenceAnchorV2.sol` on Polygon Amoy (`anchor(keccak256(versionId), value, auditSeq, auditHead)`, ADR-028). The tx also carries the newest audit-chain entry (`seq`, `entryHash`) when its seq is above the head already on chain; otherwise seq 0 is sent and no head is recorded, so a document anchor never fails over the audit head. `AnchorLog.contractAddress` records the contract written to and `AnchorLog.auditSeq` the head carried (null if none). Anchors written before contract v2 stay on the v1 contract (`AnchorLog.contractAddress` backfilled to it); a retry checks both contracts before sending. For v2 the MinIO record (`<doc>/v<n>/merkle-root.json`) holds `proof_version`, `commitment`, `document_root`, `client_hash`, `chain_hash` and `version_no`. **Every version is anchored automatically**: upload (endpoint 1) and confirm-redactions (endpoint 3) start it in the background once their DB writes succeed, and respond without waiting. Each attempt is one `AnchorLog` row that moves `PENDING → ANCHORED | FAILED` (with `errorMessage`); failed attempts stay as history and are audited as `ANCHOR_FAILED`. This runs in-process, so it assumes one long-running Node server; a serverless deployment would need a job queue.

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

**`GET` — poll** (all roles): the latest `AnchorLog` row for the version, with `status: PENDING | ANCHORED | FAILED` and `error_message`. `404` if no attempt exists yet. The version read route (`GET …/versions/{versionId}`) embeds the same object as `anchor` (with `contract_address`), plus `is_redacted`, `proof_version`, `merkle_root` (`R` for v2), and `commitment` (the anchored value: `C` for v2, equal to `merkle_root` for v1).

---

## 5. Verify — the standalone proof contract (`apps/web/src/app/verify`)

The portal is public, stateless, and makes **zero calls to DigiVault's backend** (CLAUDE.md rule 5) — so this section isn't a backend endpoint, it's the JSON file contract between "whatever produced an anchored, possibly-redacted version" and the portal. A version's owner downloads/exports this file alongside the version's page PNG(s); the portal accepts both dropped in together.

**`verification-proof.json` schema, v2** (every version created since Phase 1):
```json
{
  "digivault_proof_version": 2,
  "document_version_id": "ckver790",
  "is_redacted": true,
  "grid_size": 20,
  "page_count": 5,
  "file_hash": "3f9a...e21c",
  "document_root": "51aa...9902",
  "commitment": "9e02...7b1d",
  "pages": [
    { "page_index": 0, "width_px": 1190, "height_px": 1684, "png_sha256": "c4e1...09ab", "page_root": "77d0...a3f1" }
  ],
  "tiles": [
    { "tile_index": 0, "leaf": "a1b2...c3d4", "salt": "5d0f...91c2" }
  ],
  "anchor": {
    "polygon_chain_id": 80002,
    "contract_address": "0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b",
    "polygon_tx_hash": "0x7f3c...",
    "anchored_at": "2026-10-19T10:24:02.000Z"
  }
}
```
- `tiles[].salt`: this version's own salts, every tile (selected through `revealableSalts`). The proof goes only to whoever is given the version's pages. A redacted version's salts are its own fresh ones, so no masked tile's original salt is ever in a proof (redaction proofs, section 6, reveal the original's *unmasked* salts only).
- Before serving a v2 proof, the route rebuilds `R` from the stored leaves, `fileHash` from the stored PNGs and `C` from both, and returns `409 INTEGRITY_ERROR` if any differs from the recorded value or the salt set is missing.
- The portal recomputes everything from the PNGs and the salts; `leaf`, `page_root`, `png_sha256`, `document_root` and `file_hash` only let it say where a mismatch is. PNGs are placed by `png_sha256`, so file names don't matter.

**`verification-proof.json` schema, v1 (legacy, read-only):**
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
- **D.** Compute `keccak256(utf8Bytes(proof.document_version_id))` and call `getAnchor()` on the official contract named by `proof.anchor.contract_address`, which must be one of the two the portal hardcodes (ADR-028): **EvidenceAnchorV2** `0x01e7e6f83f55873E906465d3447cB43434D4ee67` (every anchor since Phase 2; trusted when its `isTrusted(docId)` is true — written by an allow-listed account not revoked as of the anchor time) or the legacy **EvidenceAnchor v1** `0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b` (read-only; trusted only when `anchoredBy` is `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`). Chain ID `80002` is hardcoded too. Any other contract address is refused, never looked up (F-02: a forged proof could otherwise point at the forger's own contract).
- **E.** Result states:
  - **Invalid — untrusted** (distinct red state): the proof names another chain or contract; the RPC endpoint doesn't report chain 80002; on v2, `isTrusted()` is false (anchorer revoked); on v1, `anchoredBy` isn't the v1 account.
  - **Verified** (shows "Verified against official DigiVault contract"): `recomputed_root === proof.merkle_root === on_chain_merkle_root`.
  - **Mismatch**: anything else, naming which check failed.

When a contract is redeployed, update those constants in `apps/web/src/app/verify/page.tsx` together with `packages/contracts/deployments/amoy-v2.json` (or `amoy.json` for v1).

**Redaction proofs (ADR-029):** a dropped file with `format: "digivault-redaction-proof/1"` is checked per docs/03 §Redaction proofs: the redacted PNGs must rebuild both the original version's and the redacted version's commitments, and both must match their anchors on the official contracts. The result names every changed tile or masked tile that shows content; on success it shows, per page, "N of 400 tiles are byte-identical to the original anchored on <date> · M masked · nothing else changed", with the masked areas outlined.

**Proof versions (ADR-021):** `2` is current — the portal recomputes `C` (docs/03 §v2) and requires `recomputed C === proof.commitment === on-chain value`, labelled "v2 (salted tiles)". `1` is verified on a read-only legacy path (steps A–E above) and labelled "Legacy v1 proof (unsalted)". Any other version is refused.

**Certificate link (ADR-022):** `/verify?v=<document_version_id>&c=<commitment hex>&tx=<polygon tx hash>`, built from `PUBLIC_BASE_URL` and returned as `public_verify_url` by `GET .../versions/{versionId}` once anchored. The portal checks, against the chain only: tx `tx` succeeded and was sent to one of the two official contracts; on that contract `getAnchor(keccak256(v))` holds `c` and the anchor is trusted (rules in step D); and the tx emitted that contract's anchor event for `(keccak256(v), c)` — `DocumentAnchored` on v2, `RootAnchored` on v1. It reports "commitment anchored", never "document verified". If a proof file is also dropped, its `document_version_id` must equal `v`.

**Public proof file (ADR-022):** for salted (v2+) versions only, a redaction-safe subset of this schema — `digivault_proof_version`, `public: true`, `document_version_id`, `commitment`, `grid_size`, `page_count`, `is_redacted`, `anchor`, `verify_url`; no `pages`, no `tiles`, no salts — is published write-once to `<MINIO_PUBLIC_URL>/digivault-public-proofs/proofs/<document_version_id>.json`.

---

## 6. Certificate, proof and page downloads

All under `/api/v1/documents/{documentId}/versions/{versionId}/`, all roles, each audited (section 8):

| Route | Returns | Notes |
|---|---|---|
| `GET certificate` | pre-filled, unsigned BSA §63 PDF (`lib/certificate.ts`): case reference, title, anchored value, fileHash, tx, block number and time (read from the chain; falls back to the recorded time), contract, MinIO URI, blank Part A (officer) and Part B (expert) signature blocks | **Requires `X-StepUp-Token`**. Uses the latest `ANCHORED` attempt only. Once anchored, a QR encodes `public_verify_url` with the statement that scanning proves only that the commitment is anchored. |
| `GET proof` | `verification-proof.json` (section 5) | `409 NOT_ANCHORED` until the version has an `ANCHORED` row |
| `GET pages/{pageIndex}` | the page PNG | |
| `GET redaction-proof` | `redaction-proof.json` (docs/03 §Redaction proofs) | Redacted versions only (`400 NOT_REDACTED` otherwise). `409 NOT_ANCHORED` until both this version and its original are anchored; `409 LEGACY_ORIGINAL` when the original is a v1-format version; `409 INTEGRITY_ERROR` if the proof would not verify against the stored pages (it is self-checked before serving). Audited as `DOWNLOAD_REDACTION_PROOF`. Contains the original's salts for unmasked tiles only. |

---

## 7. Consent-based sharing

- `POST /api/v1/documents/{documentId}/shares` (`INVESTIGATING_OFFICER`, `ADMIN`) — `{ recipientLabel, expiresAt, maxViews }` → `201 { shareId, token, shareUrl, … }`. **`403 NO_REDACTED_VERSION` — "No redacted version available for sharing"** until the document has a redacted version.
- `GET /api/v1/documents/{documentId}/shares` — `{ shares: [...], sharedVersion: { id, versionNo } | null }`; `sharedVersion` is what recipients would receive.
- `DELETE /api/v1/documents/{documentId}/shares/{shareId}` — revoke.
- `GET /api/v1/shares/{token}` and the `/shares/{token}` page — **no session**, the token is the credential. They check revoked (`410`), expired (`410`) and view limit (`410`), and count one view.
- `GET /api/v1/shares/{token}/download` — **no session**, same checks, not counted as a view. Returns one PDF of the page PNGs. The PDF re-encodes the pages, so it can't be verified.
- `GET /api/v1/shares/{token}/redaction-proof` — **no session**, same checks, not counted as a view. The same `redaction-proof.json` as the officer route (section 6), for the version the share serves; same `409` errors. Audited as `SHARE_LINK_REDACTION_PROOF_DOWNLOADED`.
- `GET /api/v1/shares/{token}/pages/{pageIndex}` — **no session**, same checks, not counted as a view. One lossless page PNG of the version the share serves (`404` for a page it doesn't have). With the redaction proof, this is what `/verify` needs. Audited as `SHARE_LINK_PAGE_DOWNLOADED`.

The `/shares/{token}` page has a "Download verification files" button that fetches the redaction proof and every page PNG. The original version is still never served: the proof carries only its leaves and its salts for unmasked tiles (docs/03 §Redaction proofs).

**Which version a share serves (F-03):** the newest version with `is_redacted = true` and `status = READY`. The original upload is never served, even when it is the only anchored version. If none exists: `403 NO_REDACTED_VERSION`.

---

## 7a. Cases and the BNSS s.193(2) deadline

Case management is outside the evidence lifecycle above, but the deadline fields are part of the contract (docs/07 Phase 7, ADR-032).

| Route | Roles | Notes |
|---|---|---|
| `GET /api/v1/cases`, `GET /api/v1/cases/{caseId}` | all | Each case includes `fir_registered_at` (ISO or null), `offence_sections` (string[]) and `bnss_deadline`. |
| `POST /api/v1/cases` | POLICE_OFFICER, INVESTIGATING_OFFICER, ADMIN | Optional `fir_registered_at` (`YYYY-MM-DD` = midnight India time, or ISO; not in the future) and `offence_sections` (list, or text like `"BNS 64, 74; POCSO 4"`: a bare number takes the act before it; at most 20, each ≤ 60 chars). `400 BAD_REQUEST` otherwise. |
| `PATCH /api/v1/cases/{caseId}` | same | Sets either or both fields (`null` clears the date). Audited as `UPDATE_CASE_DEADLINE_FIELDS` with old and new values. |

`bnss_deadline` is `null` unless the case has a registration date, at least one covered section (BNS 64–68, 70, 71; POCSO 4, 6, 8, 10; sub-sections like `BNS 64(1)` count) and is not `CLOSED`. Otherwise:

```json
{ "covered_sections": ["BNS 64"], "registered_on": "2026-08-30", "due_on": "2026-10-29",
  "day": 50, "days_left": 10, "level": "amber", "label": "Day 50 of 60" }
```

Days are calendar days in India time, excluding the registration day. `due_on` is the earlier of +60 days and +2 calendar months. `level`: `on_track`, `amber` from day 45, `red` from day 55, `overdue` from the due date (label `Due today`, then `Overdue by N days`).

## 8. Audit trail

Every write goes through `writeAuditLog` (`apps/web/src/lib/audit.ts`), which never throws: a failed audit write is `console.error`ed and the audited action continues. `AuditLog` is insert-only for the app's DB role. Columns: `actorId`, `action`, `targetId`, `targetType`, `targetMeta` (JSON), `sourceIp`, `timestamp`.

`action` is a string column; the allowed values are the `AuditAction` union in `audit.ts`:

| Action | Written by | `targetMeta` |
|---|---|---|
| `CREATE_CASE` | cases POST | `firRegisteredAt`, `offenceSections` |
| `UPDATE_CASE_DEADLINE_FIELDS` | cases PATCH | `before` / `after`: `firRegisteredAt`, `offenceSections` |
| `UPLOAD_DOCUMENT_VERSION` | upload | — |
| `CONFIRM_REDACTIONS` / `CONFIRM_REDACTIONS_DETAIL` | confirm | detail: prior version, `redactedTileIndices`, `tilesByPage`, `gazetteerNamesAdded` (a count, never names or hashes) |
| `ANCHOR_INITIATED` / `ANCHOR_COMPLETE` / `ANCHOR_FAILED` | `lib/anchor.ts` | `documentVersionId`; tx hash; `stage` + `error` |
| `DOWNLOAD_CERTIFICATE` | certificate | `versionNo`, `anchored`, `blockRead` |
| `DOWNLOAD_PROOF` | proof | `versionNo`, `anchorLogId`, `pageCount` |
| `VIEW_DOCUMENT_VERSION` | pages/{pageIndex} | `pageIndex`, `versionNo` |
| `SHARE_CREATED` / `SHARE_REVOKED` | shares | — |
| `SHARE_LINK_ACCESSED` / `SHARE_LINK_DOWNLOADED` | share view / download | `accessedBy: "share_recipient"`, `recipientLabel`, `versionId`, … |
| `SHARE_LINK_REDACTION_PROOF_DOWNLOADED` / `SHARE_LINK_PAGE_DOWNLOADED` | share redaction proof / page PNG | as above, plus `originalVersionId` + `maskedTileCount` / `pageIndex` |
| `DOWNLOAD_REDACTION_PROOF` | redaction-proof | `versionNo`, `originalVersionId`, `maskedTileCount`, `pageCount` |
| `WEBAUTHN_REGISTERED` | webauthn register/verify | — |
| `AUDIT_HEAD_ANCHOR_REQUESTED` | admin audit anchor | — (written before anchoring, so the anchored head includes it) |

Share recipients have no account, but `actorId` is a required FK to `User`. So share-link rows are attributed to the officer who created the share, with `accessedBy: "share_recipient"`. `DOWNLOAD_PAGE` is defined but not currently written.

**Anchoring (docs/07 Phase 4, ADR-030).** The head `(seq, entryHash)` is anchored on `EvidenceAnchorV2` with every document anchor and on its own every `AUDIT_ANCHOR_INTERVAL_HOURS` (default 6; skipped when nothing is new; `AuditHeadAnchor` rows; copy at `audit-heads/seq-<n>.json` in the Object-Locked anchor bucket). Standalone anchors are not audited, so a quiet log stays fully anchored.

- `GET /api/v1/admin/audit` (`ADMIN`) — verifies the whole chain and compares it with the anchored heads: `{ chain: { ok, checked, head_seq, head_hash } | { ok: false, checked, bad_seq, reason }, anchored: { seq, head, anchored_at, tx_hash, block_number } | null, anchored_matches, unanchored_entries, rewritten_range: { from, to } | null, chain_read_error, interval_hours, recent_attempts }`. Shown at `/dashboard/audit`.
- `POST /api/v1/admin/audit/anchor` (`ADMIN`, **requires `X-StepUp-Token`**) — anchors the head now. `200 { status: "ANCHORED", seq, entry_hash, tx_hash, block_number, object_lock_uri }` or `200 { status: "SKIPPED", reason }`; `502 { status: "FAILED", reason }`, including when the chain doesn't verify or the database disagrees with the anchored head (nothing is sent).

`sourceIp` comes from `X-Forwarded-For`. With `DIGIVAULT_TRUST_PROXY=true` (a proxy you control rewrites the header) the first hop is used; otherwise the last. Without a trusted proxy the value is client-controlled and should be treated as indicative only.

---

## Open items surfaced while writing this spec (flagged, not resolved here)

- ~~`chain_hash` formula~~ — resolved: `chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)`, per project decision (see endpoint 3).
- ~~The anchor flow's async/poll shape~~ — resolved: anchoring is automatic and runs in the background after upload/confirm; the UI polls (endpoint 4). A job queue would be needed for serverless or multi-instance deployments.
- Step-up via the PIN fallback is always accepted, so step-up is only as strong as the PIN — open decision whether to restrict it to users with no registered authenticator.
- ~~Anchor tx lands but the server never sees the receipt~~ — resolved (docs/07 P0.8, ADR-025): the tx hash is recorded when sent, and every anchor attempt checks `getAnchor()` first; a matching on-chain root with a successful recorded tx is marked `ANCHORED` without a new send.
- Redaction confirm (endpoint 3) requires the server to redraw PNG pages with masked regions — Node has no DOM `<canvas>`, so the backend will need a headless canvas library (e.g. `@napi-rs/canvas` or `sharp`) as a new dependency. Not a spec problem, but a step-4 backend decision this doc's contract assumes is solvable.
