# 03 — Crypto & Merkle Spec

This documents the exact hashing/Merkle construction implemented in `packages/crypto-core`, and records the grid-size proof-of-concept result required by `CLAUDE.md` rule 6 before that default can be changed.

## Pipeline (maps to `docs/02` steps 2–6)

1. **Render**: PDF.js renders each page to a canvas at a given scale (`render.ts`).
2. **Page PNG**: canvas exported via `toBlob`/`convertToBlob` as `image/png` — lossless, never JPEG (CLAUDE.md rule 1). This is the only byte format ever stored or transmitted for a page.
3. **client_hash**: `SHA-256` (WebCrypto, async) over the **length-prefixed concatenation** of every page's PNG bytes, in page order (`hash.ts: lengthPrefixedConcat`). Length-prefixing prevents a byte shifted across a page boundary from producing a collision.
4. **Tile hashing**: each page canvas is split into `gridSize × gridSize` tiles. Each tile is hashed from its **raw RGBA pixel bytes** (`ctx.getImageData`), *not* a re-encoded per-tile PNG (`tiles.ts`).
   - **Why raw pixels, not per-tile PNG**: the page-level PNG is lossless, so any decoder reproduces bit-identical pixels — but a second, independent PNG encoder (e.g. a different browser's `toBlob` implementation) re-compressing a small crop is not guaranteed to produce byte-identical PNG output even for identical pixels. Hashing raw pixel bytes keeps tile hashes portable: the Court Verification Portal decodes the stored page PNG and re-tiles/re-hashes from the decoded pixels, with no dependency on which encoder produced the original PNG.
5. **Merkle tree**: one tree per document version, built over **all tiles from all pages**, ordered page-major then row-major (`tileIndex = pageIndex × gridSize² + row × gridSize + col`). Library: `merkletreejs`, `sortPairs: false` (order-preserving, not sorted-pair — required since tile order is semantically meaningful for redaction targeting).
   - **Hash implementation split**: leaf hashes (client_hash, tile hashes) use real WebCrypto `crypto.subtle.digest` (async). Internal node combination inside `merkletreejs` uses `js-sha256` (sync, pure JS) because WebCrypto has no synchronous browser API and `merkletreejs` requires a sync hash function. Both are plain SHA-256 — different implementations, identical algorithm and output for identical input. Anyone reimplementing verification independently only needs "SHA-256", not a specific library.
   - **Odd leaf-count duplication**: `merkletreejs` duplicates the last node at any level with an odd count (standard behavior, same family as Bitcoin's original Merkle tree). Not hardened against the classic same-tree duplicate-leaf ambiguity beyond what `merkletreejs` does by default. Acceptable for this threat model (single trusted anchoring custodian, not an adversarial multi-party protocol) but worth revisiting if third-party proof forgery becomes a concern.
6. **AI/OCR never touches any of the above** — confirmed by construction: `pipeline.ts: hashDocument()`'s only input is raw PDF bytes; there is no code path from `apps/ai-service` output into `hash.ts`, `tiles.ts`, or `merkle.ts`.

## Grid size proof-of-concept — result

Ran in an actual headless-Chromium browser context (Playwright), not mocked canvas, per `packages/crypto-core/poc/`. Synthetic "messy" multi-page test PDFs (dense text, table grid, rotated stamp, scattered stain-like dots) since no real sample scan exists in the repo yet.

| Run | Pages | Scale (≈DPI) | Tiles | Total pipeline time | Peak heap (Chrome `performance.memory`) |
|---|---|---|---|---|---|
| Light | 5 | 2.0 (~144dpi) | 2,000 | 264ms | 10.5MB |
| Stress | 15 | 4.17 (~300dpi, realistic scan) | 6,000 | 1,969ms | 10.5MB |

Correctness checks, both runs, all passed:
- **Determinism** — identical input produces identical `merkleRoot`/`clientHash` every time.
- **PNG round-trip** — decoding a page's stored PNG back into a fresh canvas and re-tiling/re-hashing from *only* the decoded pixels reproduces the exact original `merkleRoot`. This is the load-bearing assumption behind the entire Court Verification Portal (`docs/02` step B) — it holds.
- **Tamper detection** — mutating 6×6px of real rendered pixels inside one tile changes exactly that tile's hash, leaves every other tile's hash byte-identical, and changes the document's `merkleRoot`.
- **Proof verification** — a Merkle proof for an untampered tile verifies against the original root, and the same proof correctly fails against the post-tamper root.

Caveat: the peak-heap figures were identical across both runs, which is suspicious — likely Chrome's `performance.memory.usedJSHeapSize` quantization/bucketing (a privacy mitigation) rather than a real reading, even with `--enable-precise-memory-info`. Treat memory numbers as indicative, not precise. The more reliable signal is that neither run crashed, hung, or showed any responsiveness degradation at 6,000 tiles and scan-realistic resolution.

**Decision: 20×20 stays.** Sub-2-second full-pipeline processing for a 15-page document at ~300dpi, no memory pressure observed, and every correctness test passing is well within what's needed for an interactive upload flow. No reason found to change it.

## Not tested by this POC (flagging for later, not blocking)

- A real scanner-produced image (skew, JPEG-source artifacts baked into a scanned PDF, non-uniform lighting) — only synthetic PDFs so far. Use a real messy document for the step-7 integration pass.
- Non-Chromium engines (Firefox/WebKit) for the officer-side pipeline or the verify portal.
- Adversarial Merkle proof forgery attempts against the odd-leaf-duplication behavior noted above.
