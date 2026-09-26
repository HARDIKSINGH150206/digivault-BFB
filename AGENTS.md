# CLAUDE.md — DigiVault Project Memory

You are working on **DigiVault**, a secure evidence document system built for the Smart India Hackathon (NCRB, Women Safety Division). Read `docs/01-problem-and-novelty.md` and `docs/02-architecture-and-dataflow.md` before writing any code — they explain *why* the rules below exist, not just what they are.

## Absolute rules — never violate these

1. **Lossless PNG only.** Never JPEG or any lossy format for canvas exports or tile storage. Use `canvas.toDataURL("image/png")` or PNG byte buffers, everywhere, without exception.
2. **AI/OCR output never touches the hash.** Bhashini/IndicNER/regex output only suggests which tiles to redact. The Merkle root is computed from raw tile pixel hashes, always. OCR failure must never break the cryptographic proof.
3. **Dual anchor, every version.** Root hash written to MinIO (Object Lock) AND the Polygon Amoy `EvidenceAnchor.sol` contract.
4. **Client hashes first, server re-verifies.** Never trust a client-submitted hash without independently recomputing it server-side.
5. **The Court Verification Portal (`apps/web/src/app/verify`) is public and stateless.** No auth middleware on this route, ever. No database query in its verification logic — it checks against MinIO/Polygon directly.
6. **Grid size defaults to 20×20 per page.** Do not change this without running the proof-of-concept check described in `docs/03-crypto-and-merkle-spec.md` first.

## Git and GitHub — read this carefully

**You do not have permission to push to GitHub, create branches on a remote, open pull requests, or run any `gh` CLI command, under any circumstance.** All GitHub actions are performed by the human developer only. This is enforced at the permissions level (see `.claude/settings.json`) — if a denied command is blocked, do not attempt a workaround (no `curl` to the GitHub API, no alternate git remote, nothing). Local git operations (`git init`, `git add`, `git commit`, `git status`, `git log`, `git diff`) inside the working directory are fine.

## After every work session

Before ending a session or handing back control, produce a short **audit report** covering:
- Every file created or modified, with a one-line description of the change
- Any deviation from the docs in `docs/` — and why
- What was tested vs. what's untested
- What's left to do next
- Any blocker or open question that needs a human decision

Keep this report concise — a scannable list, not prose. The developer will review it before the next session starts.

## Build order (solo developer, ~24 hour window)

1. **Crypto-core proof-of-concept first** (`packages/crypto-core`) — PDF.js → canvas → PNG → WebCrypto hash → grid split → Merkle tree, tested in-browser for memory/performance issues. This determines whether 20×20 or a different grid size ships. Do this before anything else — it's the highest-risk, most novel part of the whole system.
2. **Lock the API contract** (`docs/04-api-spec.md`) — write it if it doesn't exist yet, based on the data flow in `docs/02-architecture-and-dataflow.md`.
3. **`EvidenceAnchor.sol`** — small, isolated, deploy to Polygon Amoy testnet.
4. **Backend** (`apps/web` API routes + Prisma) — against the locked contract.
5. **AI service** (`apps/ai-service`) — can be stubbed/mocked early, real Bhashini/IndicNER integration can come after the core loop works.
6. **Frontend** — dashboard UI, redaction confirmation flow, Court Verification Portal UI.
7. **Integration pass** — the full live-demo sequence in `docs/05-demo-golden-path.md`, end to end, on one real messy test document.

Do not skip step 1 or reorder it behind backend work — the core cryptographic loop working end-to-end is worth more to the pitch than a fully-built backend with an unvalidated core assumption.
