# DigiVault — Decision Log

Architecture Decision Records, newest last. Each has a status:
**Accepted** (in force) · **Proposed** (needs a human decision) · **Superseded by ADR-xxx**.

To add one: copy the template at the bottom, take the next number, never renumber or delete — supersede instead.

---

## ADR-001 — Lossless PNG only
**Status:** Accepted (CLAUDE.md rule 1)
**Context:** Hashes are computed from pixels; lossy encoders produce different bytes and pixels across runs and implementations.
**Decision:** Every canvas export and stored page is PNG. No JPEG anywhere on the evidence path.
**Consequences:** Larger storage. Scans that were JPEG at the source are fine — they are rasterized once and frozen as PNG.

## ADR-002 — Hash raw RGBA tile pixels, not per-tile PNGs
**Status:** Accepted
**Context:** Two PNG encoders can emit different bytes for identical pixels.
**Decision:** Tile leaves are hashed from decoded raw RGBA bytes. Only page-level PNGs are stored.
**Consequences:** Any verifier that decodes the stored PNG reproduces the same leaves, regardless of browser or library (`docs/03`).

## ADR-003 — 20×20 tile grid per page
**Status:** Accepted (CLAUDE.md rule 6)
**Context:** Grid size trades redaction granularity against tile count and time.
**Decision:** 20×20, validated by the browser PoC: 15 pages at ~300 dpi, 6,000 tiles, 1.97 s, all correctness checks passing.
**Consequences:** Changing it requires re-running the PoC in `packages/crypto-core/poc`.

## ADR-004 — AI/OCR output never touches the hash
**Status:** Accepted (CLAUDE.md rule 2)
**Decision:** The AI service only suggests tiles. No code path from `apps/ai-service` into hashing or Merkle code.
**Consequences:** OCR failure degrades redaction suggestions, never integrity. Uploads succeed when the AI service is down.

## ADR-005 — Client hashes first, server re-verifies
**Status:** Accepted (CLAUDE.md rule 4)
**Decision:** The browser computes all hashes; the server decodes the received PNGs with `sharp` and recomputes everything with crypto-core; mismatch → `409`. Redaction roots are computed server-side only.
**Consequences:** A tampered client can't get a false root accepted. Server CPU cost per upload.

## ADR-006 — Public chain (Polygon Amoy), not a permissioned ledger
**Status:** Accepted
**Context:** NCRB is a single custodian; the threat is that custodian (or an insider) rewriting history.
**Decision:** Anchor to a public chain anyone can read. No Hyperledger.
**Consequences:** Testnet for the hackathon; tx costs and RPC availability matter; no PII ever on chain.

## ADR-007 — Dual anchor: MinIO Object Lock + Polygon
**Status:** Accepted, implemented (CLAUDE.md rule 3)
**Decision:** Every version's root goes to MinIO under Object Lock (Compliance) and to `EvidenceAnchor.sol`.
**Consequences:** Since v2 P0.2, anchor records go to a separate bucket (`MINIO_ANCHOR_BUCKET`, default `digivault-anchors`) created with Object Lock, because locking can't be added to the existing evidence bucket. `putObjectLocked` reads the retention back and fails the anchor if it isn't COMPLIANCE. Records written before P0.2 (`digivault-evidence/.../merkle-root.json`) are not locked.

## ADR-008 — Stateless public verifier with hardcoded trust anchors
**Status:** Accepted (CLAUDE.md rule 5; review finding F-02)
**Decision:** `/verify` has no auth, makes no `/api/*` call and no DB query. Contract address, chain ID and anchoring account are hardcoded; proof-supplied values are only compared, never used for lookup.
**Consequences:** Contract redeploys require updating the portal constants together with `deployments/`.

## ADR-009 — Redaction creates a new version; shares serve only redacted versions
**Status:** Accepted (review finding F-03)
**Decision:** Confirming redactions produces a new hash-chained, anchored version. Share links serve the newest `READY` redacted version; never the original.
**Consequences:** No redacted version → sharing refused (`403 NO_REDACTED_VERSION`).

## ADR-010 — Insert-only audit log via a restricted DB role
**Status:** Accepted
**Decision:** App connects as `digivault_app`, with `UPDATE`/`DELETE` revoked on `AuditLog`. Migrations use the owner role.
**Consequences:** The owner role can still rewrite the log — addressed by ADR-020.

## ADR-011 — Service Number + PIN with WebAuthn step-up; no Aadhaar
**Status:** Accepted
**Decision:** bcrypt PIN login with lockout; 5-minute step-up tokens via WebAuthn (PIN fallback) for sensitive actions. Aadhaar login is out of scope (needs UIDAI accreditation).
**Consequences:** PIN fallback weakens step-up to PIN strength — open item in `docs/04`.

## ADR-012 — Background anchoring that never fails the upload
**Status:** Accepted
**Decision:** Anchoring runs after the version is stored; each attempt is an `AnchorLog` row; on-chain sends are serialized in-process (single signer, nonce safety).
**Consequences:** Upload latency independent of the chain. Single-instance only until a job queue exists.

## ADR-013 — One signing key, read from `packages/contracts/.env`
**Status:** Accepted (interim)
**Decision:** The web app reads `DEPLOYER_PRIVATE_KEY` from the contracts package rather than duplicating it.
**Consequences:** Key on disk. Mitigated by ADR-019 (rotation/revocation); HSM is roadmap.

## ADR-014 — Tiles stored per document
**Status:** Superseded by ADR-024
**Decision:** `Tile` belongs to `Document`; `replaceDocumentTiles` replaces rows on each new version.
**Consequences:** Older versions' tile breakdown is lost from the DB (still recomputable from MinIO PNGs).

## ADR-015 — Pre-filled, unsigned BSA s.63 certificate
**Status:** Accepted
**Decision:** DigiVault generates the certificate with the cryptographic values filled in; a human signs. Software never self-certifies.

---

## v2 decisions (see `docs/07-v2-build-plan.md`)

## ADR-016 — RFC 6962 domain-separated Merkle tree with per-page roots
**Status:** Accepted for v2
**Context:** The v1 `merkletreejs` tree has no leaf/inner-node domain separation, so a proof can present an inner node as a leaf (`docs/03`). (It carries odd nodes up unchanged; it does not duplicate them.)
**Decision:** Leaf prefix `0x00`, node prefix `0x01`, odd node carried up; per-page roots; `R = H(0x02 ‖ pageCount ‖ MTH(pageRoots))`; anchored commitment `C = H(0x03 ‖ fileHash ‖ R)`. Fixed-width big-endian integers. In-repo implementation replaces `merkletreejs`.
**Consequences:** Every root changes; v1 data handled per ADR-021.

## ADR-017 — Salted leaves instead of zero-knowledge proofs for masked tiles
**Status:** Accepted for v2
**Context:** An unsalted tile hash of a rendered name can be brute-forced by rendering candidate names.
**Decision:** Each leaf includes a 32-byte random salt. Masked tiles' salts are never revealed; their leaves are given in the redaction proof.
**Consequences:** Standard hiding commitment, cheap to verify in a browser. ZK moves to future work. Salts become evidence that must be preserved (ADR-018).

## ADR-018 — Salt generation and custody
**Status:** **Proposed — needs decision before Phase 1**
**Options:**
- **A (recommended):** browser generates salts (CSPRNG), sends them with the upload; server recomputes leaves with them (keeps rule 4). Salts stored AES-256-GCM-encrypted in Postgres **and** as an Object-Locked MinIO object per version.
- **B:** `salt_k = HMAC(serverKey, versionId ‖ k)`. No storage, but the browser can't compute leaves before upload — breaks "client hashes first"; key loss = all proofs lost.
**Consequences of A:** Encryption key management needed; salt object must be backed up with the PNGs.

## ADR-019 — Contract v2: rotatable ownership, anchorer allow-list, audit heads
**Status:** Accepted for v2
**Decision:** Two-step ownership transfer; owner-managed anchorer set; `anchor(docId, commitment, auditSeq, auditHead)` write-once; `anchorAuditHead(seq, head)` with strictly increasing `seq`. v1 contract kept as read-only legacy.

## ADR-020 — Hash-chained, periodically anchored audit log
**Status:** Accepted for v2 — chain implemented (P0.4); anchoring is Phase 4
**Decision:** `AuditLog` gains `seq`, `prevHash`, `entryHash`; writes serialized with a Postgres advisory lock. Encoding in `apps/web/src/lib/audit-chain.ts`; independent verifier `pnpm audit:verify`. Rows written before the migration stay unchained (`seq` NULL); the chain starts at seq 1 with a zero `prevHash`. Head anchored with each document anchor and every 6 h (also to MinIO Object Lock).
**Consequences:** Insider edits detectable, except within the window since the last anchored head (≤ 6 h) — documented, not hidden.

## ADR-021 — Proof format versioning and v1 legacy data
**Status:** **Proposed — needs decision before Phase 1**
**Options:** (a) verifier keeps a v1 code path against the legacy contract (recommended — existing anchors stay verifiable); (b) declare v1 demo data disposable and drop v1 verification.

## ADR-022 — Proof publication for the certificate QR
**Status:** **Proposed — needs decision before Phase 5**
**Context:** `/verify?version=<id>` would need the app backend to look up the proof, violating rule 5.
**Options:** (a) proof JSON written as a public, Object-Locked MinIO object; QR carries its URL (recommended); (b) QR encodes version ID + commitment directly (no file fetch, but can't show tile detail).
**Consequences:** UI must distinguish "commitment anchored" (QR alone) from "file verified" (pages dropped).

## ADR-023 — Redacted artifact is a PNG bundle at the original render scale
**Status:** Accepted for v2
**Decision:** Redacted copies are lossless page PNGs at exactly the original render scale (currently 2.0), masked tiles filled with a fixed `maskColor`. The verifier never re-renders a PDF.
**Consequences:** A PDF wrapper may be produced for convenience, but verification reads the PNGs.

## ADR-024 — Tiles stored per version
**Status:** Accepted, implemented (P0.3; supersedes ADR-014)
**Decision:** `Tile.documentVersionId`; tile rows are never deleted when a new version is created. The migration attached existing rows to each document's current version. Superseded versions from before the migration get their tiles rebuilt from their MinIO page PNGs on first use, and only if the rebuilt root equals the stored `merkleRoot` (`lib/tiles-repo.ts: getVersionTiles`).
**Consequences:** Fixes a v1 bug: the proof for a superseded version used to contain the current version's tiles.

## ADR-025 — Anchoring fee caps and on-chain reconciliation
**Status:** Accepted, implemented (P0.8)
**Context:** RPC fee suggestions reached 500 gwei (0.05 POL pre-flight for a 0.003 POL tx), and an anchor whose receipt was lost could never be marked ANCHORED (retry reverts: "already anchored").
**Decision:** Fees are the RPC suggestion clamped to `ANCHOR_MAX_FEE_GWEI` / `ANCHOR_MAX_PRIORITY_FEE_GWEI`; receipts time out after `ANCHOR_CONFIRM_TIMEOUT_MS`. The tx hash is stored (`AnchorLog.submittedTxHash`) as soon as it is sent. Before sending, `getAnchor()` is checked: a matching root plus a successful recorded tx → new ANCHORED row, no gas spent; a different root → FAILED, never re-sent. JSON-RPC batching is off (free Amoy RPCs reject batches > 3).

---

## Template

```
## ADR-0xx — Title
**Status:** Proposed | Accepted | Superseded by ADR-0yy
**Context:** what forces the decision
**Decision:** what we do
**Consequences:** what gets easier, harder, or is left open
```
