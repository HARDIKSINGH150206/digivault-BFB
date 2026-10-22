# DigiVault — Product Requirements Document

| | |
|---|---|
| **Product** | DigiVault — tamper-evident, redaction-aware case document system |
| **Sponsor context** | Smart India Hackathon · NCRB, Women Safety Division |
| **Status** | v1 (hackathon MVP) shipped · v2 in planning (`docs/07-v2-build-plan.md`) |
| **Related** | `docs/01` (problem & novelty), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/04` (API) |

---

## 1. Problem

Investigating Officers, court officials, forensic labs and administrators handling sexual-offence and other sensitive cases manage FIRs, charge sheets, witness statements and forensic reports as ordinary editable files:

- **No tamper evidence.** A file changed after seizure looks identical to the original.
- **Victim identity leaks** through shared or printed copies — an offence under **BNS 2023 s.72**.
- **No trustworthy audit trail.** An insider with legitimate access can alter records undetected.
- **Admissibility friction.** **BSA 2023 s.63** requires a certificate for electronic evidence; today it is separate paperwork, disconnected from any technical proof of integrity.

## 2. Product vision

A compliance and integrity layer that sits alongside CCTNS/ICJS (never replacing it) and lets anyone — including a court with no account — independently verify that a document, or a redacted copy of it, is exactly what was recorded, without trusting DigiVault's servers or staff.

### The defensible claim (from `docs/01`)

No reviewed system combines, for this domain:
1. Redaction that a third party can verify cryptographically.
2. Tamper evidence that does not depend on OCR succeeding.
3. An audit trail that resists a corrupt administrator with full database access.
4. A legal certificate that references the cryptographic proof directly.

## 3. Users and roles

| Role | Needs | Key permissions |
|---|---|---|
| **Police Officer** | Register cases and upload documents quickly | Create case, upload, confirm redactions |
| **Investigating Officer (IO)** | Manage the case file, share safely, meet deadlines | All of the above + share links, anchor retry |
| **Court Official** | Trust what they receive; verify it independently | Read-only; download verification bundles and s.63 certificate |
| **Forensic Lab** | Access originals with full provenance | Read every version incl. original, hash chain, anchor record |
| **NCRB Admin** | Oversight, audit, compliance | Everything; audit-log review (v2) |
| **Public verifier** (defence counsel, judge, journalist) | Check a document without an account | `/verify` only — no login, no backend call |

## 4. Goals and non-goals

### Goals
- G1 — Any change to stored page content after upload is detectable by a third party.
- G2 — Victim-identifying content never leaves the system unredacted.
- G3 — A redacted copy is provably derived from the original, with nothing else changed (v2).
- G4 — Audit-log tampering by an insider is detectable (v2).
- G5 — Court-ready s.63 certificate tied to the on-chain proof.

### Non-goals (explicitly out of scope — `docs/01`)
- Replacing or intercepting CCTNS/ICJS.
- Aadhaar login / eSign in production (needs UIDAI accreditation).
- Permissioned blockchain (Hyperledger) — single custodian, no consensus problem.
- National crime-pattern dashboards.
- Software self-certification of evidence — a human always signs.

## 5. Functional requirements

Status: ✅ shipped (v1) · 🔜 planned (v2 phase) · 🗺 roadmap

### 5.1 Identity and access
| ID | Requirement | Status |
|---|---|---|
| FR-1 | Login with Service Number + 6-digit PIN (bcrypt), lockout after 5 failures / 15 min | ✅ |
| FR-2 | Five roles enforced on every API route | ✅ |
| FR-3 | WebAuthn biometric step-up (5-min token) for redaction confirm, anchor retry, certificate; PIN fallback | ✅ |
| FR-4 | Officer signs the commitment with their WebAuthn key at upload | 🔜 stretch |

### 5.2 Evidence ingestion and integrity
| ID | Requirement | Status |
|---|---|---|
| FR-10 | Browser renders PDF pages to lossless PNG, tiles 20×20, hashes raw pixels, builds Merkle root | ✅ |
| FR-11 | Server independently recomputes and rejects mismatches (`409 HASH_MISMATCH`) | ✅ |
| FR-12 | Per-version hash chain | ✅ |
| FR-13 | Domain-separated RFC 6962 Merkle tree, per-page roots, salted leaves, commitment `C` | ✅ Phase 1 |
| FR-14 | Tile hashes retained per version (not overwritten by later versions) | 🔜 Phase 0 |

### 5.3 Anchoring
| ID | Requirement | Status |
|---|---|---|
| FR-20 | Background dual anchor: MinIO + Polygon Amoy; failure never blocks upload; retry after step-up | ✅ (MinIO Object Lock not enforced yet) |
| FR-21 | MinIO Object Lock in Compliance mode actually enforced | 🔜 Phase 0 |
| FR-22 | Contract v2: two-step ownership, anchorer allow-list, audit heads | ✅ Phase 2 |
| FR-23 | Fee cap and "already landed" reconciliation on retry | 🔜 Phase 0 |

### 5.4 Redaction
| ID | Requirement | Status |
|---|---|---|
| FR-30 | AI service suggests tiles (OCR + NER + regex; English, Hindi, Kannada); never touches hashes | ✅ |
| FR-31 | Human confirmation required; server masks tiles and creates a new anchored version | ✅ |
| FR-32 | Redaction proof: verifier proves redacted copy matches the original anchor except declared masked tiles | ✅ Phase 3 (officer download and share-link recipients) |
| FR-33 | Case gazetteer: confirmed names auto-flagged across a case's documents | ✅ Phase 6 (ADR-034; keyed hashes, no names stored) |
| FR-34 | Measured recall/precision per entity type and language | ✅ Phase 6 (docs/08) |
| FR-35 | Face/signature detection; cross-case pseudonyms; two-person unmasking | 🗺 |

### 5.5 Sharing, audit, verification, legal
| ID | Requirement | Status |
|---|---|---|
| FR-40 | Share links (expiry, view cap, revoke) serve only the newest redacted version | ✅ |
| FR-41 | Insert-only `AuditLog` for the app DB role | ✅ |
| FR-42 | Audit log hash chain with sequence numbers | ✅ Phase 0 |
| FR-43 | Audit head anchored with every document anchor + every 6 h; admin verification page | ✅ |
| FR-50 | Public `/verify`: no login, no backend call, hardcoded trusted contract | ✅ |
| FR-51 | `/verify` handles v1 legacy proofs and v2 proofs | 🔜 Phase 0/1 |
| FR-52 | Pre-filled, unsigned BSA s.63 certificate | ✅ |
| FR-53 | Certificate carries commitment, tx, block time + QR to `/verify` | ✅ |
| FR-60 | BNSS s.193(2) two-month countdown for covered BNS/POCSO sections | ✅ |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Integrity** | Lossless PNG only; AI output never on the hash path; client hashes, server re-verifies (CLAUDE.md rules 1, 2, 4) |
| **Performance** | 15-page, ~300 dpi document hashed client-side in < 3 s (PoC: 1.97 s, 6,000 tiles — `docs/03`) |
| **Availability** | Upload succeeds when the AI service or Polygon is down; anchoring retries later |
| **Privacy** | Masked tile content not recoverable from any proof (salted leaves, v2); no PII on chain |
| **Portability** | Verification reproduces identical roots in Chromium, Firefox, WebKit (v2 Phase 8) |
| **Cost** | Testnet anchoring ≤ ~0.003 POL per anchor with a hard fee cap |
| **Accessibility** | Verification result understandable by a non-technical court official |

## 7. Success metrics

- Live demo: one-pixel tamper → exactly one red tile; redacted copy verifies against the original anchor; edited audit row flagged.
- Redaction recall published per entity type and language; 100% on case-gazetteer names.
- Zero `/verify` calls to `/api/*` (checked by Playwright network assertions).
- Identical roots across three browser engines.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Lost salts make anchored roots unverifiable | Salts stored encrypted in Postgres, insert-only (ADR-018); back up the database and `SALT_ENCRYPTION_KEY` |
| OCR misses a victim identifier (legal violation) | Fail-closed review, gazetteer, published recall, human confirmation |
| Anchoring key compromise | Contract v2 owner rotation + anchorer revocation; HSM on roadmap |
| Browser rendering differences | Verification works from stored PNGs, never re-renders PDFs; cross-engine tests |
| Overclaiming legal effect | Certificate is unsigned and says so; QR result wording distinguishes "anchored" from "file verified" |
| Testnet unavailability during demo | Pre-anchored demo documents; RPC fallback (`polygon-amoy.drpc.org`) |

## 9. Release plan

- **v1 (done):** core loop — upload, server re-verify, chain, anchor, redaction, sharing, audit, `/verify`, certificate.
- **v2 (7-day build):** Phases 0–8 in `docs/07-v2-build-plan.md`.
- **Roadmap:** RFC 3161 TSA timestamps, HSM keys, encryption at rest, CCTNS/ICJS adapter, multi-instance deployment, mobile app.
