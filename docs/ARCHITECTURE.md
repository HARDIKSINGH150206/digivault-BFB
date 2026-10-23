# DigiVault — Architecture

Whole-system view: components, data flows, data model, trust boundaries, and known gaps. Detailed specs live elsewhere:
- Crypto construction → `docs/03-crypto-and-merkle-spec.md`
- REST contract and proof file → `docs/04-api-spec.md`
- Original dataflow diagram → `docs/02-architecture-and-dataflow.md`
- Why things are the way they are → `docs/DECISIONS.md`
- Planned changes → `docs/07-v2-build-plan.md`

Sections marked **(v2)** describe planned state; everything else is current code.

---

## 1. System context

```
                    ┌──────────────────────── Officer's browser ────────────────────────┐
                    │ Next.js pages  +  packages/crypto-core                            │
                    │ PDF.js → PNG pages → 20×20 salted leaves → RFC 6962 → commitment C│
                    └───────────────┬───────────────────────────────────────────────────┘
                                    │ REST, Bearer session token (+ X-StepUp-Token)
                                    ▼
┌──────────────── apps/web (Next.js 14 API routes, Node runtime) ────────────────┐   HTTP   ┌── apps/ai-service ──┐
│ auth · RBAC · step-up · server re-hash (sharp + crypto-core) · hash chain      │ ───────► │ FastAPI             │
│ redaction masking · background anchoring · audit log · shares · proofs · cert  │ ◄─────── │ Tesseract + spaCy + │
└──────┬───────────────────────┬──────────────────────────────┬──────────────────┘  tiles   │ regex. Suggestions  │
       │ Prisma                │ S3 API                       │ ethers v6 (signer)          │ only, no hashes     │
       ▼                       ▼                              ▼                             └─────────────────────┘
  PostgreSQL 17           MinIO                       Polygon Amoy (80002)
  cases, versions,        page PNGs,                  EvidenceAnchor.sol
  tiles, flags, shares,   merkle-root.json            0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b
  AuditLog (insert-only)  per anchor                          ▲
                                                              │ public JSON-RPC (read only)
                                        ┌─────────────────────┴───────────────────────┐
                                        │ /verify — Court Verification Portal          │
                                        │ public, stateless, no /api/* call, no DB     │
                                        └──────────────────────────────────────────────┘
```

## 2. Components

| Component | Path | Responsibility |
|---|---|---|
| **crypto-core** | `packages/crypto-core/src` | `render.ts` PDF.js → PNG; `tiles.ts` raw RGBA tile hashing; `hash.ts` SHA-256 + length-prefixed concat; `merkle.ts` tree; `pipeline.ts` end-to-end. Shared by browser, server and `/verify`. |
| **Web app – UI** | `apps/web/src/app` | Landing, login, dashboard (`_workspace/`), case, upload, version view, share recipient page, `/verify`. |
| **Web app – API** | `apps/web/src/app/api` | `auth/*` (login, PIN, WebAuthn) and `v1/*` (cases, documents, versions, upload, redaction, anchor, proof, certificate, pages, shares). |
| **Server libs** | `apps/web/src/lib` | `server-hash.ts` re-verification + masking; `anchor.ts`/`polygon.ts` dual anchor; `storage.ts` MinIO; `audit.ts`; `rbac.ts`/`auth.ts`/`step-up.ts`/`webauthn.ts`/`pin.ts`; `rate-limit.ts`; `chain-hash.ts`; repos. |
| **AI service** | `apps/ai-service/app` | `POST /v1/redaction-suggestions`: OCR (eng/hin/kan) + NER + regex → tile suggestions with confidence. |
| **Contract** | `packages/contracts` | `EvidenceAnchor.sol`: owner-only, write-once `anchorRoot`, public `getAnchor`. |
| **Database** | `prisma/` | Schema + migrations, incl. `digivault_app` role with UPDATE/DELETE revoked on `AuditLog`. |

## 3. Key flows

### 3.1 Upload (CLAUDE.md rule 4)
1. Browser renders each page (scale 2.0) to lossless PNG, generates one random salt per tile, computes `clientHash`, salted leaves, page roots, document root `R` and commitment `C` (proof format v2, `docs/03`).
2. `POST /api/v1/evidence/upload` with PNGs + metadata + salts.
3. Server decodes PNGs with `sharp`, recomputes every leaf, `R` and `C` with the submitted salts; any mismatch → `409 HASH_MISMATCH`.
4. Stores PNGs in MinIO; version, encrypted salts (one transaction) and tiles in Postgres; computes `chainHash`; writes audit row.
5. Queues background anchoring; returns immediately.

### 3.2 Redaction (rule 2)
1. AI service receives page PNGs, returns tile suggestions (`RedactionFlag`, source + confidence).
2. Officer selects tiles and confirms after step-up.
3. Server masks tiles in its own copy of the PNGs, recomputes root server-side (never from client), stores a new version (`isRedacted = true`), anchors it.

### 3.3 Anchoring (rule 3)
- `anchorVersion` first checks `getAnchor()` and reconciles an anchor that already landed (ADR-025), then writes `merkle-root.json` to the Object-Locked anchor bucket, then calls `anchorRoot(keccak256(versionId), root)` with capped fees, recording the tx hash as soon as it is sent.
- On-chain sends are serialized through one in-process queue (single signer, nonce safety).
- Each attempt is an `AnchorLog` row: `PENDING → ANCHORED | FAILED`. Never throws into the caller.

### 3.4 Public verification (rule 5)
- Verifier drops page PNGs + `verification-proof.json`.
- Portal re-tiles and re-hashes in the browser, compares to the proof, then reads `getAnchor()` from the **hardcoded** contract/chain/anchorer. Proof-supplied contract addresses are never used for lookup.
- Outcomes: Verified · Mismatch (naming the failing tile) · Invalid–untrusted. v1 proofs are labelled "Legacy v1 proof (unsalted)"; unknown proof versions are refused (ADR-021).
- Certificate link mode `/verify?v=&c=&tx=` (ADR-022): chain-only check that the commitment is anchored for that version by that tx — explicitly not a file check. RPC: the configured default, then `rpc-amoy.polygon.technology`.

### 3.5 Sharing
- IO creates a share (expiry, max views). Token is the credential; recipient needs no account.
- Serves only the newest `READY` redacted version; otherwise `403 NO_REDACTED_VERSION`.

### 3.6 (v2) Redaction proof, audit anchoring, certificate QR
Redaction proofs (Phase 3, done; docs/03 §Redaction proofs): the verifier proves a redacted copy against the *original* commitment using revealed salts for unmasked tiles and given salted leaves for masked tiles. Audit anchoring (Phase 4, done; ADR-030): audit-chain heads ride along with each document anchor and are anchored on their own every 6 h, with an admin view at `/dashboard/audit`. Certificate QR (Phase 5, done): the s.63 PDF carries a QR for the chain-only link `/verify?v=&c=&tx=` (ADR-022), and states that scanning proves only that the commitment is anchored; verifying the file needs its pages and proof file.

## 4. Data model (Prisma)

```
User ─┬─< Case ─< Document ─< DocumentVersion ─< AnchorLog
      │                  │
      │                  ├─< Tile ─< RedactionFlag        (Tile also belongs to its DocumentVersion — ADR-024)
      │                  └─< DocumentShare
      ├─< WebAuthnCredential
      └─< AuditLog                                         (insert-only for digivault_app)
```

Key fields: `DocumentVersion.{proofVersion, merkleRoot (R for v2), commitment (C, v2 only), clientHash, previousHash, chainHash, gridSize, isRedacted, status}`; `Tile.{documentVersionId, tileIndex, pageIndex, row, col, tileHash}`; `RedactionFlag.{entityType, confidenceScore, source, masked, reviewedBy}`; `AuditLog.{seq, prevHash, entryHash}`; `AnchorLog.{status, polygonTxHash, submittedTxHash, objectLockUri}`; `Case.{firRegisteredAt, offenceSections}`.

`VersionSaltSet.{documentVersionId, tileCount, keyId, iv, ciphertext, authTag}` — encrypted per-tile salts, insert-only for the app role (ADR-018), one per v2 version.

## 5. Trust boundaries

| Boundary | Trusted for | Not trusted for |
|---|---|---|
| Officer's browser | Producing pages and a first hash | The hash itself — server recomputes |
| AI service | Suggestions | Anything on the hash path; never final without human confirm |
| App server / DB | Workflow, access control | Being the source of truth for integrity — the chain anchor is |
| DB owner / admin | Operations | Not modifying evidence undetected (anchors); audit log (v2 chain + anchoring) |
| Polygon Amoy | Timestamped, append-only record of commitments | Storing any content or PII (it stores none) |
| Proof files | Carrying data to the verifier | Telling the verifier which contract/chain to trust |

## 6. Threat model (summary)

The paper's Table 2 was not available when this table was extended (Phase 8); the rows below cover the same adversaries plus those the v2 phases added. ✅ = defended in current code; ⚠️ = partial, with the limit stated.

| Adversary | Attack | Defence | Status |
|---|---|---|---|
| External attacker | Alter a stored page in MinIO | Recomputed root ≠ on-chain anchor | ✅ |
| Corrupt officer | Upload a doctored file and claim it's original | Anchored at upload time; chain shows any later version | ✅ (detects later change, not pre-upload forgery) |
| Corrupt admin with DB access | Rewrite tile hashes / roots in Postgres | Anchors on chain; `/verify` never reads DB | ✅ |
| Corrupt admin with DB owner role | Edit, delete or rewrite audit rows | Audit hash chain (P0.4) + heads anchored with every document anchor and every 6 h (Phase 4, ADR-030); `pnpm audit:verify --onchain` and `/dashboard/audit` | ✅ up to the last anchored head |
| Malicious proof author | Point verifier at their own contract | Contract/chain/anchorer hardcoded (F-02) | ✅ |
| Proof forger | Second-preimage via inner-node-as-leaf / duplicated leaf | RFC 6962 domain separation, no duplication; size fixed by the grid (ADR-027) | ✅ v2 (Phase 1); v1 legacy read-only |
| Curious recipient of redacted copy | Brute-force masked tile content from its hash | Per-tile 32-byte salts; redacted versions get fresh salts | ✅ salts (Phase 1), redaction proofs withhold masked tiles' salts (Phase 3) |
| Redactor | Show fabricated content inside a "masked" tile | Verifier checks masked tiles are solid mask colour | ✅ Phase 3 |
| Share-link holder | Get the unredacted original | Shares serve only redacted versions (F-03) | ✅ |
| Signing-key thief | Anchor forged commitments | Contract v2: revoke the key from the compromise time (its later anchors become untrusted in `/verify`), two-step owner rotation (ADR-028); HSM roadmap | ✅ Phase 2 (owner key remains a single point of trust) |
| AI redaction miss | A victim's name or phone survives in a shared copy (BNS s.72) | Suggestions are never final: an officer reviews every page and can mask any tile; shares serve only redacted versions | ⚠️ depends on the reviewer; recall not yet measured (Phase 6) |
| Stolen session token | Confirm a redaction, anchor or download a certificate as the officer | Those routes need a step-up token: 5 min, bound to the same user (`lib/step-up.ts`) | ⚠️ PIN fallback always accepted (§8) |
| Leaked share link | Wider access to the shared copy | Token expiry and view limit; redacted versions only; every download audited | ✅ |
| Officer moving the FIR date | Hide a missed BNSS s.193(2) deadline | Date and sections are changed only through an audited `PATCH` with old and new values (ADR-032) | ✅ detected in the audit log, not prevented |
| Hostile or broken RPC endpoint | Tell `/verify` a commitment is (or isn't) anchored | Portal checks the chain ID and the hardcoded contract; configured RPC, then a public fallback | ⚠️ the portal trusts the RPC's answer; a second independent RPC would remove that |
| Insider deleting evidence pages from MinIO | Make a document unverifiable | Anchors survive, so a missing or altered page is detected; anchor records are Object-Locked | ⚠️ detected, not prevented: the page bucket itself is not locked; backups out of scope |

## 7. Deployment

- **Local / demo:** `docker-compose.yml` runs Postgres 17 (`127.0.0.1:5434`) and MinIO (`9000`, console `9001`); web app via `next dev` on `:3000`; AI service via uvicorn on `:8001`. See `docs/DEVELOPMENT.md`.
- **Chain:** Polygon Amoy testnet, chainId 80002. `EvidenceAnchorV2` `0x01e7e6f83f55873E906465d3447cB43434D4ee67` (current); `EvidenceAnchor` v1 `0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b` (legacy, read-only).
- **Single-instance assumptions:** rate limiters, used-WebAuthn-challenge set and anchor queue are in process memory. Multi-instance needs Redis + a job queue.

## 8. Known gaps (current code)

| Gap | Impact | Fix |
|---|---|---|
| Anchor records written before P0.2 are in the unlocked evidence bucket | Only newer anchors are WORM-protected in MinIO | — (on-chain anchor still covers them) |
| Audit entries after the last anchored head | A DB owner can rewrite them consistently until the next anchor (≤ 6 h, or the next document anchor) | Documented limit (ADR-030) |
| 261 audit rows predate the chain (`seq` NULL) | Covered by the anchored `AUDIT_LEGACY_GENESIS` digest (ADR-026), not by per-row links | done |
| v1 `chainHash` concatenates fields without separators | Theoretical input ambiguity, legacy versions only | done for new versions (v2 chain hash, Phase 1) |
| v1 Merkle tree has no leaf/inner-node domain separation | Proof-forgery ambiguity, legacy versions only (`docs/03`) | done for new versions (v2, Phase 1) |
| Anchor signing key read from `packages/contracts/.env` | Key on disk | Contract v2 rotation; HSM roadmap |
| PIN fallback always accepted for step-up | Step-up only as strong as the PIN | Open (`docs/04`) |
