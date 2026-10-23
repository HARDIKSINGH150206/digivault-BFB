# DigiVault — Development Guide

How to set up, run, test and change the project. Read `CLAUDE.md` first — its six absolute rules apply to every change.

---

## 1. Prerequisites

- Node.js ≥ 20 and pnpm
- Docker (Postgres + MinIO)
- Python 3 with `venv`; Tesseract OCR with English, Hindi and Kannada data:
  `sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-kan`
- For anchoring only: an Amoy RPC URL and the private key of the `EvidenceAnchor` owner, funded with test POL

## 2. Repository layout

```
apps/web/             Next.js 14 app: UI, API routes, server re-hash, anchoring, /verify
apps/web/scripts/     smoke-test.mjs, e2e-part1..3.mjs, e2e-certificate.mjs, e2e-deadlines.mjs (Playwright), seed-deadline-cases.mjs
apps/web/prisma/      seed-demo.ts (realistic demo data through the real pipeline)
apps/ai-service/      FastAPI redaction-suggestion service; eval/ (recall test set + scorer), tests/
packages/crypto-core/ PDF→PNG, tile hashing, Merkle (shared by browser, server, /verify)
packages/crypto-core/poc/  in-browser grid-size proof of concept
packages/contracts/   EvidenceAnchor.sol, Hardhat, deployments/amoy.json
prisma/               schema.prisma, migrations, seed-for-testing.mjs
docs/                 specs, PRD, architecture, decisions, plans
```

## 3. First-time setup

```bash
docker compose up -d                 # Postgres :5434, MinIO :9000 (console :9001)
pnpm install

cp .env.example .env                                  # owner/migration DB URL
cp apps/web/.env.example apps/web/.env.local          # runtime config
cp packages/contracts/.env.example packages/contracts/.env
```

Fill in:
- `apps/web/.env.local` — `DATABASE_URL` for the **`digivault_app`** role (never the owner role), `AUTH_SESSION_SECRET` (random), `AMOY_RPC_URL`, `AI_SERVICE_URL=http://localhost:8001`, MinIO credentials. `PUBLIC_BASE_URL` (certificate QR links; use a LAN IP or tunnel for phone demos). `SALT_ENCRYPTION_KEY` (`openssl rand -base64 32`) — required from Phase 1. `GAZETTEER_KEY` (another `openssl rand -base64 32`, never the salt key) — optional; turns on the case gazetteer (ADR-034). Back it up like the salt key. Optional: `AMOY_RPC_FALLBACK_URLS`, `MINIO_ANCHOR_BUCKET` / `MINIO_ANCHOR_RETENTION_DAYS`, `MINIO_PUBLIC_PROOF_BUCKET` / `MINIO_PUBLIC_URL`, and the `ANCHOR_*` fee caps — see `apps/web/.env.example`.
- `packages/contracts/.env` — `AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY`. The web app reads the signing key from here. **Never commit it.**

Database:
```bash
pnpm exec prisma migrate deploy
docker exec digivault-postgres psql -U digivault -d digivault \
  -c "ALTER ROLE digivault_app PASSWORD '<password from apps/web/.env.local>'"
node prisma/seed-for-testing.mjs     # one user per role + a test case (idempotent)
```

AI service:
```bash
cd apps/ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m spacy download en_core_web_sm
.venv/bin/uvicorn app.main:app --port 8001
```

Web app:
```bash
pnpm --filter @digivault/web dev     # http://localhost:3000
```

Demo data (web app must be running; goes through the real upload pipeline):
```bash
cd apps/web && node --experimental-strip-types prisma/seed-demo.ts
```

## 4. Everyday commands

| Task | Command |
|---|---|
| Run web app | `pnpm --filter @digivault/web dev` |
| Type-check web | `pnpm --filter @digivault/web typecheck` |
| Type-check crypto-core | `pnpm --filter @digivault/crypto-core typecheck` |
| Grid-size PoC (headless Chromium) | `pnpm --filter @digivault/crypto-core poc` |
| Compile contract | `pnpm --filter @digivault/contracts compile` |
| Contract tests (Hardhat in-process chain) | `pnpm --filter @digivault/contracts test` (also part of `pnpm test`) |
| Deploy EvidenceAnchorV2 to Amoy (already done; refuses to overwrite `amoy-v2.json` without `FORCE_REDEPLOY=1`) | `pnpm --filter @digivault/contracts deploy:amoy-v2` |
| Deploy the legacy v1 contract (don't — kept for reference) | `pnpm --filter @digivault/contracts deploy:amoy` |
| API smoke test | `cd apps/web && node scripts/smoke-test.mjs` |
| UI e2e (login, case, upload) | `cd apps/web && node scripts/e2e-part1.mjs` |
| UI e2e (step-up, redaction, cert, share) | `cd apps/web && node scripts/e2e-part2.mjs` |
| UI e2e (`/verify` against real Amoy anchor, incl. redaction proofs) | `cd apps/web && node scripts/e2e-part3.mjs` |
| BNSS deadline demo cases / UI check (no gas) | `cd apps/web && node scripts/seed-deadline-cases.mjs` / `node scripts/e2e-deadlines.mjs` |
| Certificate QR on a phone-sized browser (existing anchor, no gas) | `cd apps/web && CERT_DOCUMENT_ID=… CERT_VERSION_ID=… node scripts/e2e-certificate.mjs` |
| Unit tests (Vitest, crypto-core + web) | `pnpm test` |
| AI service unit tests | `cd apps/ai-service && .venv/bin/python -m unittest discover -s tests -t .` |
| Redaction boxes + gazetteer in the real UI (both services, `GAZETTEER_KEY` set, test set generated; ~0.028 POL) | `cd apps/web && node scripts/e2e-redaction-boxes.mjs` |
| Demo golden path, scripted rehearsal (docs/05; both services, seeds run; ~0.008 POL) | `cd apps/web && node scripts/golden-path.mjs` (`GOLDEN_PDF=…` for another file) |
| Same hashes in Chromium, Firefox and WebKit (vectors + a golden-path run's files; no gas; WebKit needs `libevent-2.1-7t64` and `libmanette-0.2-0` on Ubuntu) | `cd apps/web && node scripts/e2e-three-browsers.mjs [files-dir]` (`E2E_ENGINES=chromium,firefox` for a subset) |
| Regenerate the demo's messy scan | `cd apps/ai-service && .venv/bin/python -m eval.messy` |
| Redaction recall + gazetteer (both test sets, ~6 min, no services needed) | `pnpm eval:redaction` — results in `docs/08`; misses in `apps/ai-service/eval/out/**/results.json` |
| Redaction quality gate (after `eval:redaction`; also in CI) | `pnpm eval:gate` — fails if recall drops at all or precision by > 2 points; `cd apps/ai-service && .venv/bin/python -m eval.gate --update` only for a deliberate improvement |
| Regenerate proof-format v2 test vectors | `node packages/crypto-core/reference/gen-vectors.mjs` — only when the spec in `docs/03` §v2 deliberately changes; the vectors pin it |
| Verify the audit-log hash chain | `pnpm audit:verify` (exit 1 names the first broken `seq`); add `--onchain` to also check every anchored audit head and the legacy-rows anchor on Polygon (a rewrite with recomputed hashes is located between two anchored heads) |
| Anchor the audit head now | `/dashboard/audit` as ADMIN → "Anchor audit head now" (step-up; one Amoy tx). The server also does it every `AUDIT_ANCHOR_INTERVAL_HOURS` (default 6, `0` = off) |
| Anchoring timeout/failover + audit-head test (local chain) | terminal 1: `pnpm --filter @digivault/contracts exec hardhat node`; terminal 2: `pnpm --filter @digivault/web test:chain` |
| Public-proof bucket test (local MinIO) | `cd apps/web && MINIO_INTEGRATION=1 pnpm exec vitest run src/lib/storage.minio.test.ts` |
| Commit pre-chain audit rows (one-off, already done on the dev DB) | `node apps/web/scripts/audit-legacy-genesis.mjs [--dry-run]` — sends one Amoy tx |

The smoke and e2e scripts need the web app running (and the AI service for parts 2–3). Each anchors versions on Amoy (smoke: 2, part 1: 1, parts 2–3: 2 each; ≈0.0031 POL per document anchor, 0.0015 per standalone audit-head anchor).

## 5. Database changes

- Schema lives at the repo root: `prisma/schema.prisma`.
- `prisma migrate dev` fails in non-interactive shells. Use:
  ```bash
  mkdir prisma/migrations/<timestamp>_<name>
  pnpm exec prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > prisma/migrations/<timestamp>_<name>/migration.sql
  pnpm exec prisma migrate deploy
  ```
- Migrations run as the owner role. Any new table the app writes to needs explicit grants for `digivault_app`; anything append-only (like `AuditLog`) should have `UPDATE`/`DELETE` revoked in the same migration.

## 6. Contract changes

- Source: `packages/contracts/contracts/`. Deployment records: `packages/contracts/deployments/*.json`.
- Two contracts (ADR-028): `EvidenceAnchorV2` (`deployments/amoy-v2.json`) receives every anchor; `EvidenceAnchor` v1 (`deployments/amoy.json`) is legacy and read-only. `lib/contract-address.ts` reads both.
- After a redeploy, update together: the deployment JSON, the hardcoded constants in `apps/web/src/app/verify/page.tsx` (`CONTRACT_V2`, `LEGACY_V1_*`), the README and `docs/04` §5.
- Key rotation needs no redeploy: `addAnchorer(new)`, then `removeAnchorer(old)` (retire). For a stolen key use `revokeAnchorer(old, compromisedSince)`, which also distrusts its anchors from that time.
- Cap gas fees in anchoring code; check the wallet balance before demos.

## 7. Rules when changing code

- **Integrity path** (`packages/crypto-core`, `lib/server-hash.ts`, upload/confirm/proof routes, `/verify`): any change to hashing must change browser, server and verifier together, with test vectors (`docs/03`).
- **`/verify`**: no auth, no `fetch` to `/api/*`, no DB. Trusted contract/chain constants only.
- **AI service**: output is suggestions only; never import it into hashing code.
- **PNG only**: never JPEG on the evidence path.
- **Audit**: every sensitive read/write goes through `writeAuditLog`.
- Specs first: when behaviour in `docs/03` or `docs/04` changes, update the doc in the same branch; record non-obvious choices in `docs/DECISIONS.md`.

## 8. Git workflow

- Base branch: `dev`. Feature branches: `feature/<name>`; v2 phases: `v2/phase-<n>-<name>`.
- Claude Code may commit locally only. **Pushing, remote branches, PRs and `gh` are done by the developer** (enforced in `.claude/settings.json`).
- Commit messages: `type(scope): summary` (e.g. `feat(web): …`, `fix(crypto-core): …`).
- Every Claude session ends with the audit report described in `CLAUDE.md`.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Anchoring fails with `ENOTFOUND rpc-amoy.polygon.technology` | Use `https://polygon-amoy.drpc.org`: `AMOY_RPC_URL=https://polygon-amoy.drpc.org pnpm --filter @digivault/web dev`. drpc occasionally returns transient "code 19" errors — retry. |
| `docker compose` can't pull `minio/minio` | Compose already uses the `quay.io/minio/minio` mirror. |
| PDF rendering fails / worker 404 | `predev`/`prebuild` copy `pdf.worker.min.mjs` into `public/`; run `node scripts/copy-pdf-worker.mjs` in `apps/web`. |
| WebAuthn step-up fails | Must be a secure context: `http://localhost` or HTTPS. Set `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` when behind a proxy. |
| Anchor `FAILED` but tx is on Polygonscan | Retry the anchor: it detects the on-chain anchor and marks it ANCHORED without sending a new tx (ADR-025). Attempts from before P0.8 have no recorded tx hash and stay FAILED with an explanatory message. |
| Anchoring fails with "Batch of more than 3 requests" | Free RPC plan limit; batching is disabled in `lib/polygon.ts` — make sure nothing else constructs a batching `JsonRpcProvider`. |
| Anchoring fails at the `minio` stage: "does not have Object Lock enabled" | `MINIO_ANCHOR_BUCKET` points at a bucket created without locking. Use a new bucket name; the app creates it with locking. |
| Permission errors writing `AuditLog` updates | Expected — `digivault_app` is insert-only on that table. |
| Upload or redaction returns `503 SERVER_MISCONFIGURED` | `SALT_ENCRYPTION_KEY` is missing or not 32 bytes of base64 in `apps/web/.env.local` (`openssl rand -base64 32`). Restart the dev server after adding it. Never change it once salted versions exist — back it up. |
| OCR ignores Kannada | Install `tesseract-ocr-kan`; the service logs a warning naming missing language packs on its first OCR call. |
