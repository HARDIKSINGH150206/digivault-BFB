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
apps/web/scripts/     smoke-test.mjs, e2e-part1..3.mjs (Playwright)
apps/web/prisma/      seed-demo.ts (realistic demo data through the real pipeline)
apps/ai-service/      FastAPI redaction-suggestion service
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
- `apps/web/.env.local` — `DATABASE_URL` for the **`digivault_app`** role (never the owner role), `AUTH_SESSION_SECRET` (random), `AMOY_RPC_URL`, `AI_SERVICE_URL=http://localhost:8001`, MinIO credentials.
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
| Deploy contract to Amoy | `pnpm --filter @digivault/contracts deploy:amoy` |
| API smoke test | `cd apps/web && node scripts/smoke-test.mjs` |
| UI e2e (login, case, upload) | `cd apps/web && node scripts/e2e-part1.mjs` |
| UI e2e (step-up, redaction, cert, share) | `cd apps/web && node scripts/e2e-part2.mjs` |
| UI e2e (`/verify` against real Amoy anchor) | `cd apps/web && node scripts/e2e-part3.mjs` |
| Unit tests | `pnpm test` — **added in v2 P0.7**, does not exist yet |

The smoke and e2e scripts need the web app running (and the AI service for parts 2–3).

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
- After a redeploy, update together: the deployment JSON, `apps/web/src/lib/contract-address.ts` consumers, the hardcoded constants in `apps/web/src/app/verify/page.tsx`, and the README.
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
| Anchor `FAILED` but tx is on Polygonscan | Known open item (`docs/04`); fixed by v2 P0.8. Retry will revert with "already anchored". |
| Permission errors writing `AuditLog` updates | Expected — `digivault_app` is insert-only on that table. |
| OCR ignores Kannada | Install `tesseract-ocr-kan`; the service logs a warning naming missing language packs on its first OCR call. |
