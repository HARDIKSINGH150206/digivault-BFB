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
  "status": "PROCESSING",
  "grid_size": 20,
  "merkle_root": "238b...cb2b",
  "client_hash": "3f9a...e21c",
  "storage_uri": "s3://digivault-evidence/ckdoc456/v1/",
  "created_at": "2026-09-15T10:22:31.000Z"
}
```
`merkle_root`/`client_hash` in the response are the server-recomputed values (will equal the submitted ones, or the request would have been rejected).

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

**Request:**
```json
{
  "confirmed_tile_indices": [12, 47, 203],
  "confirmed_by": "ckuser001"
}
```
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
  "status": "PROCESSING",
  "redacted_tile_count": 3
}
```

---

## 4. Anchor — `POST /api/v1/documents/{documentId}/versions/{versionId}/anchor`

Dual anchor per CLAUDE.md rule 3. **Chosen as async + poll, not synchronous**: the MinIO Object Lock write is fast and happens inline, but a Polygon Amoy transaction needs block confirmation that isn't guaranteed to land inside a normal HTTP timeout — blocking the officer's flow on that would be bad UX for no correctness benefit (the on-chain call is queued as a background job either way). This is a judgment call, not something specified upstream — flag if you'd rather do a webhook/websocket push instead of poll.

**Request:** `{}` (path already identifies the version).

**Response `202 Accepted`:**
```json
{
  "anchor_log_id": "ckanchor01",
  "document_version_id": "ckver790",
  "status": "PENDING",
  "object_lock_uri": "s3://digivault-evidence-locked/ckdoc456/v2/merkle-root.json",
  "polygon_tx_hash": null
}
```

**Poll — `GET /api/v1/documents/{documentId}/versions/{versionId}/anchor`:**
```json
{
  "anchor_log_id": "ckanchor01",
  "document_version_id": "ckver790",
  "status": "COMPLETE",
  "chain_root_hash": "51aa...9902",
  "object_lock_uri": "s3://digivault-evidence-locked/ckdoc456/v2/merkle-root.json",
  "polygon_tx_hash": "0x7f3c...",
  "anchored_at": "2026-09-15T10:24:02.000Z"
}
```
`status`: `PENDING | COMPLETE | FAILED` (`FAILED` adds a `"reason"` string — e.g. RPC timeout; MinIO half of the anchor, having already succeeded synchronously, is unaffected and retried independently for the Polygon half). Maps directly onto `AnchorLog` (`chainRootHash`, `objectLockUri`, `polygonTxHash`, `anchoredAt`).

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
    "contract_address": "0x0000000000000000000000000000000000000000",
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
- **D.** Compute `keccak256(utf8Bytes(proof.document_version_id))`, call `getAnchor()` on `EvidenceAnchor.sol` at `proof.anchor.contract_address` via a public Polygon Amoy RPC endpoint, and compare the on-chain `merkleRoot` against `proof.merkle_root` / `recomputed_root`.
- **E.** "Verified" only if all three agree: `recomputed_root === proof.merkle_root === on_chain_merkle_root`. Any disagreement → "Mismatch", naming which check failed.

---

## Open items surfaced while writing this spec (flagged, not resolved here)

- ~~`chain_hash` formula~~ — resolved: `chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)`, per project decision (see endpoint 3).
- The anchor flow's async/poll shape (endpoint 4) is a judgment call, not sourced from the docs — flag if you want push-based (webhook/websocket) instead.
- Redaction confirm (endpoint 3) requires the server to redraw PNG pages with masked regions — Node has no DOM `<canvas>`, so the backend will need a headless canvas library (e.g. `@napi-rs/canvas` or `sharp`) as a new dependency. Not a spec problem, but a step-4 backend decision this doc's contract assumes is solvable.
