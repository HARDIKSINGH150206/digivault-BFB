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
**Status:** Accepted (2026-10-18) — option A; storage implemented in Phase 0, generation/use in Phase 1 (2026-10-19)
**Options considered:** A — random salts, stored encrypted; B — `salt_k = HMAC(serverKey, versionId ‖ k)` (no storage, but breaks "client hashes first" and key loss loses every proof).
**Decision:** A random 32-byte salt per tile, stored per version as one AES-256-GCM blob in the `VersionSaltSet` table (associated data `<versionId>|<tileCount>`; key `SALT_ENCRYPTION_KEY` / `SALT_ENCRYPTION_KEY_ID`). The app role can INSERT/SELECT only. Masked-tile salts never leave the server: `lib/tile-salts.ts: revealableSalts()` is the only selector for outgoing salts.
**Who generates them (Phase 1):** for an upload, the **browser** (WebCrypto CSPRNG), so the client still hashes first and the server re-verifies with the same salts (rule 4); the server refuses salts that are malformed or not all distinct. For a redacted version, the **server**, which computes that version anyway — and always fresh salts, never the prior version's, so a masked tile's original salt cannot reach a holder of the redacted version's proof. A version and its salt set are written in one transaction, and uploads/redactions return `503` if the key is not configured.
**Consequences:** The salt key must be backed up like the anchoring key — losing it makes salted commitments unverifiable. Salts live only in Postgres (decision); a MinIO Object-Lock copy was considered and not adopted, so database backups must include `VersionSaltSet`.

## ADR-019 — Contract v2: rotatable ownership, anchorer allow-list, audit heads
**Status:** Accepted, implemented and deployed (Phase 2, 2026-10-19; details in ADR-028)
**Decision:** Two-step ownership transfer; owner-managed anchorer set; `anchor(docId, commitment, auditSeq, auditHead)` write-once; `anchorAuditHead(seq, head)` with strictly increasing `seq`. v1 contract kept as read-only legacy.

## ADR-020 — Hash-chained, periodically anchored audit log
**Status:** Accepted for v2 — chain implemented (P0.4); anchoring is Phase 4
**Decision:** `AuditLog` gains `seq`, `prevHash`, `entryHash`; writes serialized with a Postgres advisory lock. Encoding in `apps/web/src/lib/audit-chain.ts`; independent verifier `pnpm audit:verify`. Rows written before the migration stay unchained (`seq` NULL); the chain starts at seq 1 with a zero `prevHash`. Head anchored with each document anchor and every 6 h (also to MinIO Object Lock).
**Consequences:** Insider edits detectable, except within the window since the last anchored head (≤ 6 h) — documented, not hidden.

## ADR-021 — Proof format versioning and v1 legacy data
**Status:** Accepted (2026-10-18), implemented; v2 live since Phase 1 (2026-10-19)
**Decision:** `/verify` keeps a read-only v1 path for existing anchors, labelled **"Legacy v1 proof (unsalted)"**; any other `digivault_proof_version` is refused until its verifier exists. No new v1 proofs: from Phase 1, new versions are salted and their proofs are v2. Until Phase 1 lands every version is still v1, so the authenticated proof download keeps serving v1 bundles (it would otherwise break the working court-bundle flow); no *public* v1 proofs are published.
**Phase 1:** the upload API refuses anything but `proof_version: 2`; redactions always produce v2 versions (even of a v1 original); the proof route serves v2 for v2 versions and v1 for legacy ones; `/verify` accepts both and labels each.

## ADR-022 — Proof publication for the certificate QR
**Status:** Accepted (2026-10-18), implemented (QR image on the certificate is Phase 5)
**Context:** `/verify?version=<id>` would need the app backend to look up the proof, violating rule 5.
**Decision:** Both, combined:
- The QR URL embeds everything the chain check needs: `<PUBLIC_BASE_URL>/verify?v=<versionId>&c=<commitment>&tx=<txHash>` (`lib/public-proof.ts: publicVerifyUrl`; exposed as `public_verify_url` on the version API). `/verify` checks `getAnchor(keccak256(v)) == c`, the anchorer, and that tx `tx` succeeded, was sent to the official contract and emitted `RootAnchored(v, c)` — chain only, no MinIO, no backend. `PUBLIC_BASE_URL` makes it work on a LAN IP or tunnel.
- A redaction-safe public proof (`lib/public-proof.ts: buildPublicProof`; its anchored value is under `commitment`, renamed from `merkle_root` in Phase 1 before any was published) is published write-once to the Object-Locked `digivault-public-proofs` bucket (anonymous GET on `proofs/*` only, no listing). It holds only opaque IDs and hashes — no case/FIR numbers, titles, names, tile hashes, page hashes or salts. Published only for salted versions (ADR-021).
- "Salted IDs" was interpreted as: the only identifier is the random cuid version ID (not derived from case data), and any tile leaves are salted.
**Consequences:** The UI says plainly that the QR check proves the certificate's commitment is anchored, and that verifying a document needs its pages; a link and a proof file for different versions are refused together.

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
**Decision:** Fees are the RPC suggestion clamped to `ANCHOR_MAX_FEE_GWEI` / `ANCHOR_MAX_PRIORITY_FEE_GWEI`; receipts time out after `ANCHOR_CONFIRM_TIMEOUT_MS`. The tx hash is stored (`AnchorLog.submittedTxHash`) as soon as it is sent. Before sending, `getAnchor()` is checked: a matching root plus a successful recorded tx → new ANCHORED row, no gas spent; a different root → FAILED, never re-sent. JSON-RPC batching is off (free Amoy RPCs reject batches > 3). Defaults: 100 gwei max fee, **30 gwei** priority (≈0.003 POL per anchor). RPCs: `AMOY_RPC_URL`, then `AMOY_RPC_FALLBACK_URLS` (default `https://rpc-amoy.polygon.technology`); failover only on transport errors and never after a tx was broadcast. Receipt-timeout path tested on a local Hardhat chain with mining paused (`pnpm --filter @digivault/web test:chain`).

## ADR-026 — Pre-chain audit rows committed by an anchored genesis entry
**Status:** Accepted (2026-10-18), done
**Context:** 261 `AuditLog` rows predate the hash chain (`seq` NULL) and were not covered by it.
**Decision:** `scripts/audit-legacy-genesis.mjs` computes `SHA256(0x05 ‖ u32 count ‖ rows…)` over those rows (ordered by timestamp, id; field encoding in `scripts/lib/audit-chain-ref.mjs`), dual-anchors it — MinIO `digivault-anchors/audit/legacy-genesis.json` (Object Lock) and `EvidenceAnchor.anchorRoot(keccak256("digivault:audit-legacy-genesis:v1"), digest)` — and appends one chained entry `AUDIT_LEGACY_GENESIS` recording digest, count, tx and MinIO URI. `pnpm audit:verify` recomputes the digest; `--onchain` also checks Polygon.
**Consequences:** It is appended at seq 58, not seq 1: the chain already had 57 entries, and renumbering them would itself be audit-log tampering. Done once on this database: tx `0x70855cde7a12d1f250d6fe0442cfc2dd7defb5cb4f234c6d28365a3b100b9e63`, block 50517435. A fresh database has no pre-chain rows and needs no genesis entry.

## ADR-027 — v2 commitment: what is anchored and where it is stored
**Status:** Accepted (2026-10-19), implemented (Phase 1)
**Context:** v2 anchors `C = H(0x03 ‖ fileHash ‖ R)` (docs/03 §v2) instead of a Merkle root, while legacy v1 versions keep anchoring their root. Every route that writes, compares or displays the anchored value must pick the right one.
**Decision:** `DocumentVersion.proofVersion` (default 1) and `commitment` (nullable; a CHECK constraint requires it when `proofVersion = 2`). For v2, `merkleRoot` holds `R` — it stays a Merkle root, as its name says — and `commitment` holds `C`. `lib/proof-v2.ts: anchoredValue()` is the single rule (`C` for v2, `merkleRoot` for v1) used by anchoring, reconciliation, the MinIO record, the public proof, the certificate link, the certificate PDF and the share page. Until contract v2 (Phase 2), `C` is written to the v1 contract's `anchorRoot(bytes32, bytes32)`, which stores any 32-byte value; the proof format, not the contract, says what the value means.
**Consequences:** `C` binds the exact PNG files as well as the pixels, so a re-encoded page with identical pixels does not verify; the portal says so specifically rather than "mismatch". An RFC 6962 inclusion path does not authenticate tree size by itself, so verifiers take the size from the grid (`grid²` per page, `pageCount` hashed into `R`) and always recompute leaves from pixels — tested in `packages/crypto-core/test/dv2.test.ts`.

## ADR-028 — EvidenceAnchorV2: deployment, revocation semantics, two trusted contracts
**Status:** Accepted (2026-10-19), implemented (Phase 2)
**Context:** ADR-019 fixed the interface. Three things it left open: what removing a compromised anchorer means for anchors it already wrote; how the app carries audit heads without risking document anchors; and how the verifier handles anchors on two contracts.
**Decision:**
- Deployed to Amoy at `0x01e7e6f83f55873E906465d3447cB43434D4ee67` (tx `0x14a5115c2afd8246ca73598101a4b52ae2e1f4ca7023a286ccc509809fc948de`, block 50527642; record `packages/contracts/deployments/amoy-v2.json`). Owner and first anchorer: the project wallet `0x30F5…2873`.
- Two ways to take a key off the allow-list. `removeAnchorer` *retires* it (planned rotation): its anchors stay trusted. `revokeAnchorer(account, compromisedSince)` is for a stolen key: anchors by it with timestamp ≥ `compromisedSince` stop being trusted (`isTrusted`, `verify`), earlier ones stay trusted, the time can only be moved earlier, and the account can never be re-added. Without the split, a routine rotation would invalidate every past proof.
- Writes revert with named custom errors; the app decodes them (ethers doesn't for gas-estimation reverts).
- The app sends `anchor(docId, C, seq, head)` with the newest audit entry only if its seq is above `latestAuditHead()` (the contract requires a strictly rising seq); otherwise seq 0. Sends are serialized, and the head is read right before sending.
- The verifier hardcodes both contracts. v2: trust = `isTrusted()`. v1 (legacy, read-only): trust = `anchoredBy` is the v1 account. Proof files say which contract (`anchor.contract_address`, from `AnchorLog.contractAddress`); certificate links are resolved by the tx's `to`.
**Consequences:** Key rotation needs no redeploy. Phase 1's v2-format test versions stay anchored on v1 and still verify. The v1 contract is never written again by the app (the one-off audit legacy-genesis anchor, ADR-026, stays on v1). Revocation is owner-only, so the owner key is the remaining single point of trust (HSM on the roadmap). Deploy cost 0.025 POL; a document anchor with an audit head ≈ 90k gas (≈0.0027 POL at 30 gwei).

## ADR-029 — Redaction proofs: format, original version, masked set
**Status:** Accepted (2026-10-19), implemented (Phase 3)
**Context:** docs/07 Phase 3 sketched the file and the verifier algorithm. Left open: which version a redacted copy is proved against when redactions are chained, how a changed tile is named, how the masking is done so unmasked pixels survive exactly, and what happens for a v1 original.
**Decision:**
- Proved against the nearest earlier unredacted version; the masked set is the union of `RedactionFlag.masked` over every redaction step since then.
- Each page carries all of the original's leaves (`originalLeaves`) instead of the plan's `maskedLeaves`: masked entries are inputs, unmasked ones are hints that let the portal name a changed tile. The redacted version's own salts are included too, so one file verifies both anchors.
- `redactPagePng` fills masked tiles in the raw RGBA and re-encodes, instead of compositing an SVG, so unmasked pixels are copied bit-for-bit and the mask is exactly `[0, 0, 0, 255]`.
- The server runs the same check as the portal on every proof before serving it.
- v1 originals are refused (`LEGACY_ORIGINAL`): their leaves are unsalted.
**Consequences:** A recipient needs only the redacted PNGs and `redaction-proof.json`. A re-encoded copy fails (the redacted version's own commitment binds the PNG bytes). Redacted versions created before this change used SVG compositing; they verify if their pages were fully opaque, which pdf.js renders are. Share links serve the redaction proof and the redacted page PNGs as well as the PDF (docs/04 §7); the PDF alone can't be verified.

---

## ADR-030 — Audit-log anchoring: schedule, records, refusal, verification
**Status:** Accepted (2026-10-19), implemented (Phase 4); live Amoy run pending POL
**Context:** docs/07 Phase 4: anchor the audit head every 6 h on its own, skipped when nothing is new; keep a MinIO copy; a check and an admin view. Left open: where the schedule runs, how a standalone anchor is recorded without making the next run never skip, what to do when the database disagrees with the chain, and how a full rewrite (all hashes recomputed) is located.
**Decision:**
- The schedule runs inside the Next.js server (`src/instrumentation.ts`, `lib/audit-anchor.ts`), every `AUDIT_ANCHOR_INTERVAL_HOURS` (default 6, `0` = off), first run one interval after start. It shares the document-anchor send queue, and reads both heads inside it.
- Standalone anchors are recorded in a new `AuditHeadAnchor` table (PENDING → ANCHORED/FAILED; `DELETE` revoked for the app role), not in the audit log: an audit row per anchor would always leave a newer, unanchored head. A manual anchor by an admin *is* audited (`AUDIT_HEAD_ANCHOR_REQUESTED`) before it runs, so the head it anchors includes the request.
- The MinIO copy is `audit-heads/seq-<n>.json` in the Object-Locked anchor bucket.
- Anchoring is refused when the database chain doesn't verify, or when its entry at the seq on chain differs from the anchored head — otherwise it would vouch for a rewritten log.
- Checks compare the database with every head anchored: `latestAuditHead()` plus the `AuditHeadAnchored` event of every recorded tx (standalone and carried by document anchors). An edited row is named by the chain check; a rewrite is located between the last matching anchored head and the first mismatching one.
**Consequences:** Entries after the last anchored head (at most one interval, or until the next document anchor) can still be rewritten undetected — documented in docs/ARCHITECTURE §8. A rewrite can only be located to the span between two anchored heads. The schedule assumes one long-running Node server (like background document anchoring). About 4 standalone anchors a day at ~0.003 POL when there is activity.

---

## Template

```
## ADR-0xx — Title
**Status:** Proposed | Accepted | Superseded by ADR-0yy
**Context:** what forces the decision
**Decision:** what we do
**Consequences:** what gets easier, harder, or is left open
```
