# 03 — Crypto & Merkle Spec

This documents the exact hashing/Merkle construction implemented in `packages/crypto-core`, and records the grid-size proof-of-concept result required by `CLAUDE.md` rule 6 before that default can be changed.

Two proof formats exist. **v2** (below) is used for every version created since Phase 1 (2026-10-19). **v1** (the "Pipeline" section after it) is legacy: existing v1 versions stay verifiable read-only, but no new v1 versions are created (ADR-021). A version's format is `DocumentVersion.proofVersion`.

## Proof format v2 — salted leaves, RFC 6962 trees, commitment C

Implemented once in `packages/crypto-core/src/dv2.ts` and `src/merkle-v2.ts`, and run by the browser (upload), the server (re-verification, rule 4) and the Court Verification Portal. An independent reference in plain `node:crypto` (`packages/crypto-core/reference/dv2-ref.mjs`, bottom-up tree) generates the test vectors (`test/vectors.json`) and is used by the smoke test and demo seed, so the two implementations check each other.

All integers are unsigned big-endian, fixed width. `‖` is concatenation. `H` is SHA-256.

| Value | Definition |
|---|---|
| tile rects | `tileW = ceil(width / grid)`, `tileH = ceil(height / grid)`; tile `(row, col)` starts at `(col·tileW, row·tileH)`; `w`, `h` are clipped at the page edge and clamped to `0` (the last row/column can be zero-area). Same grid as v1. |
| `k` | `row · grid + col` — the tile's index **within its page** |
| salt | 32 random bytes per tile (ADR-018) |
| leaf | `H(0x00 ‖ salt ‖ "DV2" ‖ u32 page ‖ u32 k ‖ u32 w ‖ u32 h ‖ rgba)`, `rgba` = the tile's raw pixels, row-major, `w·h·4` bytes |
| inner node | `H(0x01 ‖ left ‖ right)` |
| `MTH(D)` | RFC 6962: one item → itself; `n > 1` → `node(MTH(D[0:k]), MTH(D[k:n]))`, `k` = largest power of two `< n`. An odd node is carried up, never duplicated. |
| page root | `MTH(the page's grid² leaves in k order)` |
| document root `R` | `H(0x02 ‖ u32 pageCount ‖ MTH(pageRoots))` |
| `fileHash` | the client hash: `H(‖ u32 len ‖ png)` over every page PNG in page order (unchanged from v1) |
| **commitment `C`** | `H(0x03 ‖ fileHash ‖ R)` — **the value anchored** on Polygon and in MinIO |
| version chain hash | `H(0x06 ‖ prev ‖ C ‖ u32 versionNo ‖ u64 timestampMs)`, `prev` = `0x00` for version 1, else `0x01 ‖ prevChainHash[32]` |

Domain-separation bytes across DigiVault: `0x00` leaf, `0x01` inner node, `0x02` document root, `0x03` commitment, `0x04` audit entry, `0x05` audit legacy digest, `0x06` version chain hash.

**Where the parts live.** `DocumentVersion.merkleRoot` = `R`, `.commitment` = `C`, `.clientHash` = `fileHash`, `.proofVersion` = 2 (a CHECK constraint requires `commitment` on v2 rows). `Tile.tileHash` = the salted leaf. Salts: one AES-256-GCM blob per version in `VersionSaltSet`, written in the same transaction as the version.

**Salts.** On upload the **browser** generates the salts (WebCrypto CSPRNG), hashes first and sends them with the pages; the server recomputes `R` and `C` with them and refuses the upload unless all three of `client_hash`, `merkle_root` (`R`) and `commitment` match, and unless the salts are 32-byte hex and all distinct. A redacted version is computed by the **server**, which generates **fresh** salts for it — never the prior version's, so a masked tile's original salt cannot leak through the redacted version's proof.

**Why salts.** Without them, a leaf over a low-entropy tile (blank margin, a stamp, a short number) can be confirmed by guessing its pixels. With a per-tile salt, a leaf reveals nothing about a tile whose salt is withheld — the basis for redaction proofs (below), where masked tiles' original salts never leave the server.

**Why `C` binds `fileHash`.** `R` alone proves the pixels; `C` also proves the exact PNG files. The portal reports the difference: identical pixels in re-encoded PNGs give "the page pixels match, but the image files are not the originals".

**Inclusion proofs** (`merkle-v2.ts`: `inclusionPath`, `rootFromInclusionPath` per RFC 9162 §2.1.3.2). An RFC 6962 path does **not** authenticate the tree size on its own (sizes with the same tree shape accept the same path), so a verifier never takes the size from a proof: it is always `grid²` per page and `pageCount` is hashed into `R`. Leaves are always recomputed from pixels and salt as `H(0x00 ‖ …)`, never accepted as input, so an inner node cannot be passed off as a leaf.

**Verification (`apps/web/src/app/verify/proof-v2.ts`).** The portal places each supplied PNG at the page whose `png_sha256` it matches (falling back to natural filename order if any file matches none), decodes it without colour conversion or premultiplication, recomputes every leaf with the proof's salts, then the page roots, `R`, `fileHash` and `C`. **VERIFIED** requires the recomputed `C` to equal both the proof's `commitment` and `getAnchor(keccak256(versionId))` on the official contract. The proof's own leaves and page roots are only used to say where a mismatch is (page, row, column).

**Tests.** `packages/crypto-core/test/dv2.test.ts`: the eight RFC 6962 / Certificate Transparency reference roots; vectors for 14 tree sizes and 4 documents (uneven, zero-area, standard and multi-page) against the reference; 20-run determinism; one changed pixel changes exactly one leaf, its page root, `R` and `C`; inclusion proofs for every index at n = 1, 2, 3, 4, 5, 7, 8, 17, 399, 400, 401; rejection of a wrong index, a different-shape size, tampered/extended/truncated paths, an inner node as a leaf, a duplicated last leaf, a different page count and a proof from another page. Browser and Node byte-for-byte agreement is exercised by every real upload (the server refuses any difference) — `scripts/e2e-part1.mjs` uploads a real 2-page PDF rendered by pdf.js in Chromium.

## Redaction proofs (Phase 3, ADR-029)

Implemented once in `packages/crypto-core/src/redaction.ts` (`invalidRedactionProof`, `checkRedaction`, `redactionLocallyValid`) and run by the server (it self-checks every proof before serving it) and by the portal. An independent builder and verifier in `reference/dv2-ref.mjs` (`buildRedactionProof`, `verifyRedactionProof`) cross-check it in `test/redaction.test.ts` and in the smoke test.

**The redacted copy (ADR-023)** is the redacted version's page PNGs, at the original render scale. `redactPagePng` fills each masked tile with `maskColor` = opaque black `[0, 0, 0, 255]` directly in the decoded RGBA and re-encodes losslessly; every other pixel is copied unchanged (no compositing, which premultiplies alpha). Unmasked pages keep their original PNG bytes.

**`original`** is the nearest earlier version that is not itself redacted (normally version 1). Redactions can be chained (v1 → v2 → v3): the masked set is the union of tiles masked in every redaction step since the original. A redaction proof needs a v2 original — a v1 original's leaves are unsalted, so its masked leaves could be brute-forced; the route refuses (`409 LEGACY_ORIGINAL`).

**File** (`redaction-proof.json`):

```json
{
  "format": "digivault-redaction-proof/1",
  "gridSize": 20,
  "maskColor": [0, 0, 0, 255],
  "original": { "versionId": "", "versionNo": 1, "commitment": "", "fileHash": "", "documentRoot": "",
                "anchor": { "chainId": 80002, "contractAddress": "", "txHash": "", "anchoredAt": "" } },
  "redacted": { "...": "same fields, for the redacted version" },
  "pages": [
    { "page": 0, "width": 1190, "height": 1684, "pngSha256": "<redacted page PNG>",
      "masked": [12, 13],
      "originalLeaves": ["<400 hex: the original's leaves>"],
      "revealedSalts": [{ "k": 0, "salt": "<hex>" }],
      "redactedSalts": ["<400 hex: the redacted version's own salts>"] }
  ]
}
```

`masked` are within-page indices `k`, ascending. `revealedSalts` holds the original's salt for **every unmasked tile and no masked one** (selected by `lib/tile-salts.ts: revealableSalts`, the only selector for salts that leave the server). `originalLeaves[k]` is an input only for masked `k`; for unmasked `k` it is a hint used to name a tile that does not match, and is always recomputed.

**Verification**, per page, from the dropped PNGs (placed by `pngSha256`, else natural filename order):
1. Unmasked tile `k`: leaf = `H(0x00 ‖ revealedSalt ‖ "DV2" ‖ page ‖ k ‖ w ‖ h ‖ pixels)` from the redacted PNG — equal to the original's leaf only if the pixels are the original's.
2. Masked tile `k`: every pixel must equal `maskColor` (zero-area tiles pass trivially); its leaf is `originalLeaves[k]`, taken as given. Salted, with the salt withheld, so the hidden pixels can't be recovered from it.
3. Original page roots → `R` → `C = H(0x03 ‖ original.fileHash ‖ R)`. `original.fileHash` is taken from the proof: the original PNG bytes are not in the copy, and `C` binds it either way.
4. Redacted version's own `R` and `C` from the same PNGs with `redactedSalts` and their actual bytes.
5. **VERIFIED** requires no changed tile, no masked tile showing content, page sizes as stated, both recomputed commitments equal to the proof's, **and** both equal to their anchors read from the official contracts (the proof's contract addresses must be official ones and are never used to pick a contract that isn't).

Step 2 is what stops a "masked" tile showing fabricated content: its leaf is taken as given, so `C(original)` alone would not notice. Step 4 means a re-encoded copy (same pixels, different PNG bytes) fails, with a specific message.

**Never** ship the original's own verification proof (all its salts) together with a redacted copy; the version page offers the two downloads separately.

## Legacy v1 pipeline (maps to `docs/02` steps 2–6)

1. **Render**: PDF.js renders each page to a canvas at a given scale (`render.ts`).
2. **Page PNG**: canvas exported via `toBlob`/`convertToBlob` as `image/png` — lossless, never JPEG (CLAUDE.md rule 1). This is the only byte format ever stored or transmitted for a page.
3. **client_hash**: `SHA-256` (WebCrypto, async) over the **length-prefixed concatenation** of every page's PNG bytes, in page order (`hash.ts: lengthPrefixedConcat`). Length-prefixing prevents a byte shifted across a page boundary from producing a collision.
4. **Tile hashing**: each page canvas is split into `gridSize × gridSize` tiles. Each tile is hashed from its **raw RGBA pixel bytes** (`ctx.getImageData`), *not* a re-encoded per-tile PNG (`tiles.ts`).
   - **Why raw pixels, not per-tile PNG**: the page-level PNG is lossless, so any decoder reproduces bit-identical pixels — but a second, independent PNG encoder (e.g. a different browser's `toBlob` implementation) re-compressing a small crop is not guaranteed to produce byte-identical PNG output even for identical pixels. Hashing raw pixel bytes keeps tile hashes portable: the Court Verification Portal decodes the stored page PNG and re-tiles/re-hashes from the decoded pixels, with no dependency on which encoder produced the original PNG.
5. **Merkle tree**: one tree per document version, built over **all tiles from all pages**, ordered page-major then row-major (`tileIndex = pageIndex × gridSize² + row × gridSize + col`). Library: `merkletreejs`, `sortPairs: false` (order-preserving, not sorted-pair — required since tile order is semantically meaningful for redaction targeting).
   - **Hash implementation split**: leaf hashes (client_hash, tile hashes) use real WebCrypto `crypto.subtle.digest` (async). Internal node combination inside `merkletreejs` uses `js-sha256` (sync, pure JS) because WebCrypto has no synchronous browser API and `merkletreejs` requires a sync hash function. Both are plain SHA-256 — different implementations, identical algorithm and output for identical input. Anyone reimplementing verification independently only needs "SHA-256", not a specific library.
   - **Odd leaf-count handling**: with the options used here, `merkletreejs` carries a leftover node at an odd-length level up **unchanged** — it is not duplicated and re-hashed with itself (verified against the library by `packages/crypto-core/test/merkle-v1.test.ts` and `apps/web/scripts/smoke-test.mjs`; an earlier version of this doc said "duplicates", which was wrong). There is still no leaf/inner-node domain separation, so a proof could present an inner node as a leaf. Acceptable for this threat model (single trusted anchoring custodian, not an adversarial multi-party protocol) but worth revisiting if third-party proof forgery becomes a concern.
6. **AI/OCR never touches any of the above** — confirmed by construction: `pipeline.ts: hashDocument()` (v1) and `hashDocumentV2()` (v2) take only raw PDF bytes; there is no code path from `apps/ai-service` output into `hash.ts`, `tiles.ts`, `merkle.ts`, `merkle-v2.ts` or `dv2.ts`.

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
- Adversarial Merkle proof forgery against v1's missing leaf/node domain separation. Resolved for new versions by v2 (domain-separated RFC 6962, tested above); v1 stays read-only.
