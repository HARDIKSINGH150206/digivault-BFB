# DigiVault

Tamper-evident case document management for the NCRB Women Safety Division: every document version is hashed, hash-chained and anchored on a public blockchain, and victim-identifying content is redacted before a document leaves the system.

## Problem Statement

- Digital evidence in Indian law enforcement is commonly held as ordinary editable files (scanned PDFs, images, office documents) with no built-in tamper detection.
- A case file altered after seizure is indistinguishable from the original: nothing records what the document looked like when it entered the system.
- Victim identity leaks through shared and exported documents. Disclosure of the identity of a victim of certain offences is an offence under Bharatiya Nyaya Sanhita, 2023, s.72.
- Without an audit trail, tampering by an insider with legitimate access cannot be detected or attributed after the fact.
- The NCRB Women Safety Division handles sexual-offence and other sensitive cases where both evidentiary integrity and victim anonymity are legal requirements.

## Solution Overview

DigiVault fingerprints every page of every document version at upload: pages are rendered to lossless PNG, split into a 20x20 grid of tiles per page, and each tile's raw pixels are hashed into a SHA-256 Merkle tree. The browser computes the root, the server independently recomputes it from the received pages before accepting the upload, and each version's root is linked to the previous version by a hash chain and anchored on the Polygon Amoy blockchain, so any later change to a stored page is detectable by anyone holding the page images. Redaction is performed by the server only after an officer confirms AI-suggested tiles, and produces a new, separately hashed and anchored version; share links can only ever serve such a redacted version. Every sensitive read and write is recorded in an audit table that the application's database role cannot update or delete. A public verification page lets a court or defence counsel check a document against the on-chain record without an account and without contacting DigiVault's servers.

## Target Audience

The system defines five roles (`POLICE_OFFICER`, `INVESTIGATING_OFFICER`, `COURT_OFFICIAL`, `FORENSIC_LAB`, `ADMIN`), enforced on every API route.

- **Investigating Officers (IO):** create cases, upload documents, confirm redactions, retry anchoring, and create and revoke consent-based share links. Police Officers can create cases, upload and confirm redactions, but cannot manage share links or retry anchoring.
- **Court Officials:** read-only access to cases and document versions; download verification bundles (proof file and page images) and the pre-filled Bharatiya Sakshya Adhiniyam s.63 certificate.
- **NCRB Administrators:** every action available to the other roles. Audit logs are currently reviewed directly in the database; there is no user-management or audit-review screen yet.
- **Forensic Analysts (`FORENSIC_LAB`):** read-only access to every stored version of a document, including the original upload, with its hash chain and anchor record.

## Architecture

```
                         Browser
   Next.js pages; packages/crypto-core renders PDF pages to PNG,
   hashes 20x20 tiles per page and builds the Merkle root client-side
                            |
                            | REST (Bearer session token)
                            v
   apps/web (Next.js 14, API routes) ---- HTTP ----> apps/ai-service (FastAPI)
     - re-verifies every hash server-side              OCR + NER, returns tile
       with packages/crypto-core                       suggestions only; never
     - hash chain, redaction, audit log                reads or writes hashes
     - background anchoring
        |                 |                   |
        v                 v                   v
   PostgreSQL         MinIO              Polygon Amoy (chainId 80002)
   (Prisma):          page PNGs,         EvidenceAnchor.sol
   cases, versions,   merkle-root.json   0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b
   tiles, AuditLog    per anchor               ^
                                               | public JSON-RPC read, no backend call
                                   /verify (Court Verification Portal)
```

## How It Works

1. **Login.** An officer signs in with a Service Number (format `UP/2021/4821`) and a 6-digit PIN. PINs are stored as bcrypt hashes; five failed attempts per IP or per service number trigger a 15-minute lockout. A successful login returns an HMAC-signed session token.
2. **Upload.** In the browser, each PDF page is rendered to lossless PNG and split into a 20x20 tile grid; each tile's raw pixels are hashed with SHA-256 and combined into a Merkle root. The server recomputes every tile hash and the root from the PNGs it received and rejects the upload on any mismatch (`409 HASH_MISMATCH`). Accepted versions are stored as `READY` with a `chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)`.
3. **Anchoring.** Each new version is anchored automatically, in the background, as soon as it is stored: the Merkle root is written to MinIO and then to `EvidenceAnchor.sol` on Polygon Amoy. The version page shows the anchor moving from `PENDING` to `ANCHORED` or `FAILED`; a failed anchor never invalidates the upload, and can be retried after a biometric step-up.
4. **Redaction.** The AI service runs OCR and named-entity recognition on the page images and suggests tiles containing victim names, phone numbers, Aadhaar numbers, addresses and similar identifiers. The suggestions never touch any hash. An officer selects tiles and confirms them after a WebAuthn biometric step-up (PIN fallback where the browser lacks WebAuthn); the server then masks those tiles, recomputes the Merkle root, and stores the result as a new hash-chained, automatically anchored version.
5. **Audit and sharing.** Uploads, redaction confirmations (with the exact tiles masked), anchor attempts, page views, proof and certificate downloads, share creation, share access and share downloads are written to `AuditLog`, which the application's database role can insert into but not update or delete. Share links serve only the latest redacted version; if none exists, sharing is refused (`403`).

## Key Security Properties

- **Cryptographic hash chain with on-chain anchor.** Each `DocumentVersion` stores a Merkle root over SHA-256 hashes of its tiles' raw pixels, a hash of the page PNGs, and a chain hash linking it to the previous version. The root is anchored in `EvidenceAnchor.sol`, which accepts writes only from its owner and refuses to overwrite an existing anchor, so modifying a stored page after upload, including by an insider with database or storage access, is detectable against the public record. This makes insider tampering with evidence content cryptographically detectable; it does not prevent it.
- **Insert-only audit trail.** The application connects to PostgreSQL as `digivault_app`, which has `UPDATE` and `DELETE` revoked on `AuditLog` (migration `20260915165833_audit_log_insert_only`); the application exposes no update or delete path for it. Entries therefore cannot be altered or removed through the application or its database credentials; the database owner role used for migrations still can.
- **Biometric step-up.** Confirming redactions, retrying an anchor and generating a certificate each require a 5-minute step-up token, bound to the logged-in user, obtained through WebAuthn (fingerprint / Face ID) or, where the browser does not support WebAuthn, by re-entering the PIN. Registering a biometric credential itself requires the PIN.
- **Redaction with human confirmation.** The FastAPI service detects likely victim identifiers (Tesseract OCR in English and Hindi, spaCy NER, English and Devanagari regular expressions) and only suggests tiles. The server masks confirmed tiles and stores the result as a separate version; share links never serve the unredacted original.
- **Role-based access.** Five roles, checked in every API route against an HMAC-signed session token. Database-level enforcement applies to the audit log only.
- **Public, independent verification.** `/verify` requires no account and makes no call to DigiVault's backend. A verifier supplies the page PNGs and the `verification-proof.json` from a verification bundle; the page recomputes the Merkle root in the browser and compares it with the anchor read directly from Polygon Amoy. The contract address, chain ID and anchoring account are fixed in the page, so a proof file pointing at any other contract or chain is reported as invalid.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Backend | Next.js API Routes (REST) |
| AI Service | FastAPI (Python), Tesseract OCR (English + Hindi), spaCy `en_core_web_sm`, regular expressions |
| Database | PostgreSQL 17, Prisma ORM |
| File Storage | MinIO (S3-compatible) |
| Cryptography | `packages/crypto-core`: PDF.js page rendering, per-tile SHA-256, Merkle trees (merkletreejs) |
| Blockchain | Solidity (`EvidenceAnchor.sol`), Hardhat, ethers v6, Polygon Amoy (chainId 80002) |
| Auth | Service Number + PIN (bcrypt), HMAC-signed session tokens, WebAuthn step-up (SimpleWebAuthn) |
| Package Manager | pnpm (workspace monorepo) |

## Monorepo Structure

```
digivault-BFB/
├── apps/
│   ├── web/                Next.js app: UI, REST API routes, hash re-verification,
│   │                       redaction, anchoring, audit log, /verify portal
│   │   └── scripts/        Playwright end-to-end scripts and an API smoke test
│   └── ai-service/         FastAPI service returning redaction tile suggestions
├── packages/
│   ├── crypto-core/        Browser/Node library: PDF to PNG, tile hashing, Merkle tree
│   └── contracts/          EvidenceAnchor.sol, Hardhat config, Amoy deployment record
├── prisma/                 schema.prisma, migrations, test seed script
├── docs/                   Problem statement, architecture, crypto spec, API spec
└── docker-compose.yml      PostgreSQL and MinIO for local development
```

## Scalability

- The API routes keep no per-request session state in memory, but three pieces of state are currently process-local: the login and PIN rate limiters, the used-WebAuthn-challenge set, and background anchoring. Running more than one instance behind a load balancer requires moving these to shared storage (for example Redis) and anchoring to a job queue.
- MinIO supports distributed mode for multi-node storage; the application uses it through the standard S3 client and would not change.
- Anchoring runs in the background (`PENDING` to `ANCHORED`), so upload latency does not depend on Polygon block times or RPC congestion.
- Prisma pools PostgreSQL connections; read replicas can be added without schema changes.
- The AI service is a separate, stateless HTTP service and can be deployed and scaled independently; its failure never blocks an upload.

## Compliance and Legal

- **Bharatiya Nyaya Sanhita, 2023, s.72 (victim identity):** documents leave DigiVault only through share links, and share links serve only an officer-confirmed redacted version.
- **Chain of custody:** the audit log, the per-version hash chain and the on-chain anchor together document who handled a document and whether its content has changed. For admissibility of electronic records, DigiVault generates a pre-filled Bharatiya Sakshya Adhiniyam, 2023, s.63 certificate referencing these values; the certificate is unsigned and has no legal effect until signed by the responsible person.
- **Role model:** the five roles reflect the actors described in the NCRB Women Safety Division problem statement (see `docs/01-problem-and-novelty.md`).

## Getting Started (Development)

### Prerequisites

- Node.js 20 or later, pnpm
- Docker (for PostgreSQL and MinIO)
- Python 3 with `venv`, and Tesseract OCR with English and Hindi data (`sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin`)
- An Amoy RPC endpoint and the private key of the `EvidenceAnchor` owner account, funded with Amoy test POL (only needed for anchoring)

### 1. Services and dependencies

```bash
docker compose up -d        # PostgreSQL on :5434, MinIO on :9000 (console :9001)
pnpm install
```

### 2. Environment

```bash
cp .env.example .env                                    # migration/owner database URL
cp apps/web/.env.example apps/web/.env.local            # runtime config for the web app
cp packages/contracts/.env.example packages/contracts/.env
```

- `apps/web/.env.local`: set `DATABASE_URL` to the `digivault_app` role with a password of your choice, `AUTH_SESSION_SECRET` to a random string, `AMOY_RPC_URL` (for example `https://polygon-amoy.drpc.org`) and `AI_SERVICE_URL=http://localhost:8001`.
- `packages/contracts/.env`: set `AMOY_RPC_URL` and `DEPLOYER_PRIVATE_KEY`. The web app reads the signing key from this file; anchoring only succeeds with the key of the deployed contract's owner.

### 3. Database

```bash
pnpm exec prisma migrate deploy
docker exec digivault-postgres psql -U digivault -d digivault \
  -c "ALTER ROLE digivault_app PASSWORD '<password from apps/web/.env.local>'"
node prisma/seed-for-testing.mjs
```

The seed script is idempotent and creates one user per role plus a test case:

| Role | Service Number | PIN |
|---|---|---|
| Police Officer | `UP/2021/4821` | `112233` |
| Investigating Officer | `DL/2019/3301` | `223344` |
| Court Official | `MH/2020/5512` | `334455` |
| Forensic Lab | `KA/2022/7891` | `445566` |
| Admin | `NCRB/2018/0001` | `556677` |

### 4. AI service

```bash
cd apps/ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m spacy download en_core_web_sm
.venv/bin/uvicorn app.main:app --port 8001
```

### 5. Web app

```bash
pnpm --filter @digivault/web dev     # http://localhost:3000
```

WebAuthn requires a secure context: use `http://localhost` or HTTPS.

### Tests

With the web app (and, for parts 2 and 3, the AI service) running:

```bash
cd apps/web
node scripts/smoke-test.mjs       # API: hashing, tamper detection, RBAC, step-up, sharing
node scripts/e2e-part1.mjs        # UI: login, case creation, upload
node scripts/e2e-part2.mjs        # UI: biometric step-up, redaction, certificate, sharing
node scripts/e2e-part3.mjs        # UI + /verify against a real Amoy anchor
```

## Smart Contract

- Network: Polygon Amoy (testnet, chainId 80002)
- Contract: `0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b`
- Explorer: https://amoy.polygonscan.com/address/0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b
- Deployed block: 48603680
- Owner (only account allowed to anchor): `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`
- Source: `packages/contracts/contracts/EvidenceAnchor.sol`; deployment record: `packages/contracts/deployments/amoy.json`

## Roadmap

Current status: hackathon MVP. Known gaps before production use:

- [ ] HSM-backed key management (the anchoring key is currently read from an environment file)
- [ ] Encryption at rest (page images are currently stored unencrypted in MinIO)
- [ ] MinIO Object Lock (WORM) on anchor records (not currently configured)
- [ ] Audit-log review and user-management screens for administrators
- [ ] Shared rate-limit, challenge and job-queue storage for multi-instance deployment
- [ ] Mobile app for field officers
- [ ] Integration with CCTNS (Crime and Criminal Tracking Network & Systems)
- [ ] Multi-jurisdictional deployment with tenant isolation
