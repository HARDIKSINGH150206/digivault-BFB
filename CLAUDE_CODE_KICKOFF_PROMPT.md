# Claude Code kickoff prompt — DigiVault

Paste everything below this line as your first message in Claude Code, run from inside the `digivault/` project root.

---

You are starting work on DigiVault, a secure evidence document system for NCRB's Women Safety Division (Smart India Hackathon). I'm a solo developer with roughly 24 hours to reach a working, demoable prototype. Before doing anything else, read `CLAUDE.md`, `docs/01-problem-and-novelty.md`, and `docs/02-architecture-and-dataflow.md` in full.

## Ground rules for this entire project (repeating what's in CLAUDE.md — this matters)

- You do not have permission to push to GitHub, open pull requests, create remote branches, or run any `gh` CLI command. These are hard-denied in `.claude/settings.json` — if you hit a permission block on a git/gh action, do not look for a workaround (no direct API calls, no alternate remotes). Just stop and tell me. All GitHub actions are mine to perform manually.
- Never let AI/OCR output (Bhashini, IndicNER, regex) influence what gets cryptographically hashed. It only decides what to suggest redacting. This is the single most important architectural rule in this project — if you're ever unsure whether a piece of logic belongs in the "hashing" path or the "redaction-targeting" path, stop and ask me rather than guessing.
- PNG only, everywhere a canvas is involved. Never JPEG.
- Default grid size is 20×20 per page. Do not change it without running the proof-of-concept check first and telling me the result.

## What to do, in order

**1. Crypto-core proof-of-concept first.** Inside `packages/crypto-core`, build and test: PDF.js renders a page to canvas → export as PNG → WebCrypto SHA-256 hash → split into a 20×20 tile grid → build a Merkle tree with `merkletreejs` → tamper with one tile → confirm the root changes → confirm a Merkle proof still verifies for an untampered tile. Test this in an actual browser context (not just unit tests with mocked canvas), and specifically check for memory or performance problems. Report the result to me before moving on — this decides whether 20×20 stays or needs to change.

**2. Write `docs/04-api-spec.md` if it doesn't already exist.** Base it on the data flow described in `docs/02-architecture-and-dataflow.md`. At minimum, define the request/response JSON schema for: uploading a document, requesting redaction suggestions, confirming redactions, anchoring a version, and the standalone verify endpoint logic (even though verify itself should be client-side/stateless, document what it expects as input).

**3. `EvidenceAnchor.sol` deployment.** The contract is already written in `packages/contracts/contracts/EvidenceAnchor.sol`. Set up Hardhat config for Polygon Amoy testnet, write the deploy script, and deploy it. Tell me the deployed contract address and confirm it's visible on Polygonscan (Amoy) before moving on.

**4. Backend.** Build the Express (or Next.js API route) layer against the contract from step 2, using `prisma/schema.prisma` as the database source of truth. Run the initial migration. Implement the server-side hash re-verification step explicitly — never trust a client-submitted hash without recomputing it.

**5. AI service.** FastAPI service in `apps/ai-service`. It's fine to stub Bhashini/IndicNER behind a simple interface early and come back to real integration later if time is tight — the important thing is the interface contract (input: image tiles, output: redaction suggestions with confidence scores) stays stable so the rest of the system doesn't need to change when the real implementation lands.

**6. Frontend.** Next.js app: the officer-facing upload/dashboard flow, the redaction confirmation UI (human confirms before anything finalizes — never silent), and the standalone Court Verification Portal at `/verify`. The portal route must have zero auth middleware and zero database dependency — confirm this explicitly before considering it done.

**7. Integration pass.** Walk the full demo sequence end to end on one real, slightly messy test document (not a clean synthetic one): upload → hash → redact → anchor (both MinIO and Polygon) → generate BSA certificate → verify independently in the portal. This is the sequence that matters most for the pitch — prioritize it over polishing any single feature in isolation.

## After you finish each numbered step (not just at the very end)

Give me a short audit report:
- Files created/changed, one line each
- Any deviation from the docs, and why
- What's tested vs. not tested
- What's next
- Anything you're blocked on or unsure about

Keep it scannable. I'll review it before telling you to continue to the next step.

## If anything in the docs seems to conflict with what you're being asked to build

Stop and ask me rather than guessing which one wins. The docs represent decisions already made after a lot of back-and-forth — they're not a first draft.
