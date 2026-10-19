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
                    │ PDF.js → PNG pages → 20×20 tiles → SHA-256 leaves → Merkle root   │
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
1. Browser renders each page (scale 2.0) to lossless PNG, computes `clientHash`, tile hashes and Merkle root.
2. `POST /api/v1/evidence/upload` with PNGs + metadata.
3. Server decodes PNGs with `sharp`, recomputes every tile hash and the root; any mismatch → `409 HASH_MISMATCH`.
4. Stores PNGs in MinIO, version + tiles in Postgres, computes `chainHash`, writes audit row.
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
See `docs/07` Phases 3–5. Summary: the verifier proves a redacted copy against the *original* commitment using revealed salts for unmasked tiles and given salted leaves for masked tiles; audit-chain heads ride along with each anchor and every 6 h; the certificate QR points at a public Object-Locked proof object in MinIO.

## 4. Data model (Prisma)

```
User ─┬─< Case ─< Document ─< DocumentVersion ─< AnchorLog
      │                  │
      │                  ├─< Tile ─< RedactionFlag        (Tile also belongs to its DocumentVersion — ADR-024)
      │                  └─< DocumentShare
      ├─< WebAuthnCredential
      └─< AuditLog                                         (insert-only for digivault_app)
```

Key fields: `DocumentVersion.{merkleRoot, clientHash, previousHash, chainHash, gridSize, isRedacted, status}`; `Tile.{documentVersionId, tileIndex, pageIndex, row, col, tileHash}`; `RedactionFlag.{entityType, confidenceScore, source, masked, reviewedBy}`; `AuditLog.{seq, prevHash, entryHash}`; `AnchorLog.{status, polygonTxHash, submittedTxHash, objectLockUri}`; `Case.{firRegisteredAt, offenceSections}`.

`VersionSaltSet.{documentVersionId, tileCount, keyId, iv, ciphertext, authTag}` — encrypted per-tile salts, insert-only for the app role (ADR-018; populated from Phase 1).

**(v2) still to add:** `DocumentVersion.commitment` (Phase 1).

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

| Adversary | Attack | Defence | Status |
|---|---|---|---|
| External attacker | Alter a stored page in MinIO | Recomputed root ≠ on-chain anchor | ✅ |
| Corrupt officer | Upload a doctored file and claim it's original | Anchored at upload time; chain shows any later version | ✅ (detects later change, not pre-upload forgery) |
| Corrupt admin with DB access | Rewrite tile hashes / roots in Postgres | Anchors on chain; `/verify` never reads DB | ✅ |
| Corrupt admin with DB owner role | Edit or delete audit rows | Audit hash chain (✅ P0.4) + anchored heads (🔜 Phase 4) | partial |
| Malicious proof author | Point verifier at their own contract | Contract/chain/anchorer hardcoded (F-02) | ✅ |
| Proof forger | Second-preimage via inner-node-as-leaf / duplicated leaf | RFC 6962 domain separation, no duplication | 🔜 v2 Phase 1 |
| Curious recipient of redacted copy | Brute-force masked tile content from its hash | Per-tile 32-byte salts | 🔜 v2 Phase 1 |
| Redactor | Show fabricated content inside a "masked" tile | Verifier checks masked tiles are solid mask colour | 🔜 v2 Phase 3 |
| Share-link holder | Get the unredacted original | Shares serve only redacted versions (F-03) | ✅ |
| Signing-key thief | Anchor forged commitments | Contract v2 anchorer revocation, owner rotation; HSM roadmap | 🔜 v2 Phase 2 |

## 7. Deployment

- **Local / demo:** `docker-compose.yml` runs Postgres 17 (`127.0.0.1:5434`) and MinIO (`9000`, console `9001`); web app via `next dev` on `:3000`; AI service via uvicorn on `:8001`. See `docs/DEVELOPMENT.md`.
- **Chain:** Polygon Amoy testnet, chainId 80002.
- **Single-instance assumptions:** rate limiters, used-WebAuthn-challenge set and anchor queue are in process memory. Multi-instance needs Redis + a job queue.

## 8. Known gaps (current code)

| Gap | Impact | Fix |
|---|---|---|
| Anchor records written before P0.2 are in the unlocked evidence bucket | Only newer anchors are WORM-protected in MinIO | — (on-chain anchor still covers them) |
| Audit chain not yet anchored externally | DB owner can rewrite the whole chain consistently | v2 Phase 4 |
| 261 audit rows predate the chain (`seq` NULL) | Covered by the anchored `AUDIT_LEGACY_GENESIS` digest (ADR-026), not by per-row links | done |
| `chainHash` concatenates fields without separators | Theoretical input ambiguity | v2 Phase 1 |
| Merkle tree has no leaf/inner-node domain separation | Proof-forgery ambiguity (`docs/03`) | v2 Phase 1 |
| Anchor signing key read from `packages/contracts/.env` | Key on disk | Contract v2 rotation; HSM roadmap |
| PIN fallback always accepted for step-up | Step-up only as strong as the PIN | Open (`docs/04`) |
