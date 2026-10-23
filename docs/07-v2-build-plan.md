# 07 — DigiVault v2 Build Plan

Second-phase development plan. Supersedes nothing in `docs/01`–`docs/06` until each phase lands; when a phase changes a spec (`docs/03`, `docs/04`), that doc is updated in the same branch.

**Goal:** a judge watches every core claim get verified live.
- Change one pixel → exactly one tile turns red.
- Verify a redacted copy against the *original* anchor, without the hidden content leaking.
- Show the audit log anchored on chain, and an edited audit row being caught.

Decisions referenced as `ADR-0xx` are in `docs/DECISIONS.md`.

---

## Rules for the whole build

- One local branch per phase: `v2/phase-0-prereqs`, `v2/phase-1-merkle`, `v2/phase-2-contract`, … Claude Code makes changes and commits locally; the developer reviews, pushes and opens PRs. Claude never pushes or opens PRs (CLAUDE.md).
- **Nothing is anchored on Amoy until Phases 0, 1 and 2 are merged** — they change every root and the contract.
- Each phase ends with its "Done when" checks passing before the next starts.
- All six CLAUDE.md absolute rules still apply. Where v2 interacts with one, the phase says so.
- Every session ends with the CLAUDE.md audit report.

---

## Phase 0 — Pre-build fixes and decisions (Day 0)

Problems found reviewing the first draft of this plan against the code. Phases 1–5 depend on them.

**Status (2026-10-18, branch `v2/phase-0-prereqs`): Phase 0 complete.** All of P0.1–P0.8 done and tested, plus: legacy audit genesis entry anchored (ADR-026); migrations tested on a fresh database; receipt-timeout path tested on a local chain; fee priority cap 30 gwei and fallback RPC (ADR-025).
Carried into Phase 1: generate salts per tile at upload and store them (`lib/tile-salts.ts` is ready); switch the proof route to v2; use the commitment `C` in `publicVerifyUrl` / `buildPublicProof` (today: the v1 merkle root).

| # | Fix | Why | Where |
|---|---|---|---|
| P0.1 | **Decide salt generation & custody** (ADR-018). Recommended: browser generates a 32-byte CSPRNG salt per tile, sends salts with the upload, server recomputes leaves with them; salts stored AES-256-GCM-encrypted in Postgres **and** as an Object-Locked MinIO object per version. | Salts become part of the evidence: lose one and that version's anchored root can never be recomputed. Random-but-server-only salts would break rule 4 (client can't hash first). | ADR-018 |
| P0.2 | **Make MinIO Object Lock real.** Create the bucket with object locking enabled; `putObjectLocked` must set `COMPLIANCE` retention. | `storage.ts: putObjectLocked` currently does a plain `putObject` — rule 3's "Object Lock" half is not actually enforced. | `lib/storage.ts`, `docker-compose.yml`, `DEVELOPMENT.md` |
| P0.3 | **Schema migration:** `Tile.documentVersionId` (tiles per version, not per document); salt storage table; `AuditLog.seq`, `prevHash`, `entryHash`; `Case.firRegisteredAt`, `Case.offenceSections`. | `replaceDocumentTiles` deletes the original's tile rows when a redacted version is created; audit log has no chain; cases have no FIR date or sections for Phase 7. | `prisma/schema.prisma`, new migration |
| P0.4 | **Build the audit hash chain** in `writeAuditLog`: `entryHash = SHA256(0x04 ‖ seq ‖ prevHash ‖ canonical(entry))`, written under a Postgres advisory transaction lock so concurrent writes can't fork the chain. | Phase 4 anchors an "audit head" that doesn't exist today — only `DocumentVersion` is chained. | `lib/audit.ts` |
| P0.5 | **Proof format versioning** (ADR-021). Verifier dispatches on `digivault_proof_version`; v1 proofs verify against the legacy contract read-only. | v1 anchors on `0xFAf1…D1A5b` must not silently become "Mismatch" once the leaf format changes. | `verify/page.tsx` |
| P0.6 | **Proof publication for QR** (ADR-022): proof JSON for an anchored version is written as a public, Object-Locked MinIO object; the portal fetches it from MinIO, never from `/api/*`. | Rule 5 — the portal must not hit the app backend or DB. | `lib/storage.ts`, `verify/page.tsx` |
| P0.7 | **Test harness:** add Vitest to `packages/crypto-core` and `apps/web` with a `test` script; root `pnpm test`. | No unit tests exist today; Phase 1 depends on them. | `package.json`s |
| P0.8 | **Anchoring robustness:** cap `maxFeePerGas`/`maxPriorityFeePerGas`; before a retry, call `getAnchor()` and mark the row `ANCHORED` if the earlier tx actually landed. | Past anchors cost ~0.022 POL (≈7× expected); `docs/04` open item on "landed but no receipt". | `lib/polygon.ts`, `lib/anchor.ts` |

**Done when:** ADR-018, ADR-021, ADR-022 are marked Accepted; migration applies cleanly on a fresh DB; an Object-Locked write can't be deleted via `mc rm`; audit rows carry a valid chain (a script recomputes it end to end); `pnpm test` runs (even with few tests).

---

## Phase 1 — Merkle hardening and tile salts (Day 1)

**Status (2026-10-19, branch `v2/phase-1-merkle`): Phase 1 complete.** Spec in `docs/03` §v2; decisions in ADR-018 (who generates salts), ADR-021, ADR-027. Every listed unit test exists (`packages/crypto-core/test/dv2.test.ts`, vectors in `test/vectors.json` from an independent reference implementation) and passes; upload → redact → anchor → proof → `/verify` works end to end, for v2 and for legacy v1 proofs.
Deviation: v2 commitments are anchored on the existing v1 contract (rule 3 requires every version to be anchored; the v1 contract stores any 32-byte value). Test runs during Phase 1 anchored ~9 versions on Amoy.
Carried into Phase 2: anchor `C` through contract v2; the verifier then trusts both addresses (v1 legacy read-only, v2 current).

**Where:** `packages/crypto-core` **and every consumer of the leaf format**: `lib/server-hash.ts`, upload route, redaction confirm route, proof route, `verify/page.tsx`, `apps/web/prisma/seed-demo.ts`. The app must work at the end of this phase, not only at the end of Phase 3.

All integers are unsigned big-endian, fixed width (u32 unless stated). `‖` is byte concatenation. `H` is SHA-256.

- **Leaf:** `leaf_k = H(0x00 ‖ salt_k[32] ‖ "DV2" ‖ page ‖ tileIndex ‖ w ‖ h ‖ rgba_pixels)`
- **Inner node:** `node = H(0x01 ‖ left ‖ right)` — RFC 6962 `MTH`: split at the largest power of two < n; an odd node is carried up unchanged, never duplicated.
- **Page root:** `pageRoot_p = MTH(leaves of page p in row-major order)`
- **Document root:** `R = H(0x02 ‖ pageCount ‖ MTH(pageRoots))`
- **Commitment (anchored value):** `C = H(0x03 ‖ fileHash ‖ R)`, where `fileHash` is the existing `clientHash` (length-prefixed SHA-256 over page PNGs, `docs/03`).
- **Version chain hash:** re-define with length-prefixed fields (today's `chain-hash.ts` concatenates without separators).
- Replace `merkletreejs` with a small in-repo RFC 6962 implementation (~60 lines) so browser, Node and any third-party reimplementation share one spec.

**Unit tests (Vitest):**
- Same file + same salts → same `R` and `C` across 20 runs.
- Changing one pixel changes exactly one leaf, its page root, `R` and `C`.
- Inclusion proofs verify for every tile index (including n = 1, 2, 3, 399, 400, 401).
- Forgeries rejected: inner node presented as a leaf; duplicated last leaf; wrong index; wrong page count; proof from another page.
- Fixed test-vector file (`packages/crypto-core/test/vectors.json`): browser and Node must agree byte for byte.

**Done when:** all tests pass; upload → redact → proof download works end to end locally (no anchoring yet); `docs/03` documents the v2 scheme.

---

## Phase 2 — Contract v2 (Day 2)

**Status (2026-10-19, branch `v2/phase-2-contract`): Phase 2 complete.** `EvidenceAnchorV2` deployed to Amoy at `0x01e7e6f83f55873E906465d3447cB43434D4ee67` (block 50527642), 17 Hardhat tests passing, test anchors visible on Polygonscan, the app writes every new anchor to v2 and the verifier trusts v1 (legacy, read-only) and v2. Details and the open questions this phase settled: ADR-028.
Additions to the spec below: `removeAnchorer` *retires* a key (its anchors stay trusted) while `revokeAnchorer(account, compromisedSince)` distrusts its anchors from that time; `isTrusted(docId)`. Pulled forward from Phase 4: each document anchor already carries the current audit head (skipped, not reverted, when the seq isn't new). Phase 4 still owns standalone 6-hourly heads, the MinIO copy of heads and the admin view.

**Where:** `packages/contracts/contracts/EvidenceAnchorV2.sol`, new deploy script, `lib/polygon.ts`, `lib/contract-address.ts`.

- **Ownership:** two-step transfer (`proposeOwner` → `acceptOwnership`).
- **Anchorer allow-list:** owner adds/removes accounts; first anchorer is the project wallet `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`.
- **Document anchor:** `anchor(bytes32 docId, bytes32 commitment, uint64 auditSeq, bytes32 auditHead)` — write-once per `docId`; stores commitment, timestamp, anchorer; emits `DocumentAnchored` and `AuditHeadAnchored` in the same tx.
- **Standalone audit anchor:** `anchorAuditHead(uint64 seq, bytes32 head)` — `seq` must be strictly increasing.
- **Reads:** `getAnchor(docId)`, `verify(docId, commitment) → bool`, `isAnchorer(addr)`, `latestAuditHead() → (seq, head, timestamp)`.
- **Tests (Hardhat local chain):** re-anchor rejected; non-anchorer rejected; two-step ownership works and a non-proposed account can't accept; anchorer add/remove; audit `seq` must increase.
- **Deploy:** Amoy; write `deployments/amoy-v2.json`; keep `amoy.json` as legacy v1. The verifier hardcodes both addresses (v1 legacy read-only, v2 current).

**Done when:** contract deployed, a test anchor visible on Polygonscan, the app writes to v2.

---

## Phase 3 — Verifiable redactions (Days 3–4) · headline feature

**Status (2026-10-19, branch `v2/phase-3-redaction-proofs`): Phase 3 complete** for the officer download path. `GET .../redaction-proof` (self-checked before serving), `crypto-core/src/redaction.ts` shared by server and portal, and an independent reference verifier. All four "done when" checks pass in a logged-out browser against real Amoy anchors (`scripts/e2e-part3.mjs`). Share-link recipients get the same files from the share page (`GET /api/v1/shares/{token}/redaction-proof` and `.../pages/{i}`, branch `v2/share-redaction-proof`), checked in a logged-out browser. Format and choices: docs/03 §Redaction proofs, ADR-029.

**Where:** proof generator (`proof` route + new redaction-proof builder), `verify/page.tsx`.

**Redacted artifact (ADR-023):** a bundle of lossless page PNGs at **exactly the original render scale** (currently `scale = 2.0`, ≈144 dpi), masked tiles filled with a fixed mask colour. No PDF re-render in the verifier — any resampling changes pixels.

**Redaction proof file:**
```json
{
  "format": "digivault-redaction-proof/1",
  "original": { "versionId": "", "commitment": "", "fileHash": "", "txHash": "", "anchoredAt": "" },
  "redacted": { "versionId": "", "commitment": "", "txHash": "" },
  "maskColor": [0, 0, 0, 255],
  "pages": [
    { "page": 0, "tileCount": 400, "width": 0, "height": 0,
      "masked": [12, 13],
      "maskedLeaves": ["<hex>", "<hex>"],
      "revealedSalts": [{ "k": 0, "salt": "<hex>" }] }
  ]
}
```

**Verifier algorithm:**
1. Recompute leaves of every unmasked tile from the redacted PNG, with the revealed salts.
2. Check every masked tile in the PNG is solid `maskColor` — otherwise a "masked" tile could display fabricated content.
3. Take masked leaves as given (salted → infeasible to brute-force the hidden pixels).
4. Rebuild page roots → `R` → `C`; compare with the **original** anchor on chain (contract address hardcoded, never taken from the proof).
5. Separately verify the redacted version's own anchor.

**Portal shows:** "387 of 400 tiles on page 1 are byte-identical to the original anchored on <date> · 13 masked · nothing else changed", with masked regions outlined.

**Never** ship the original version's full-salt proof in the same bundle as a redacted copy.

**Done when:**
- A redacted copy verifies against the original anchor.
- Editing any unmasked pixel → fail, naming the tile.
- Changing a masked leaf in the proof → fail.
- Putting non-mask pixels inside a masked tile → fail.

---

## Phase 4 — Audit log anchoring (Day 4)

**Status (2026-10-20, branch `v2/phase-4-live-anchor`): Phase 4 complete, including the live Amoy run.** First standalone audit-head anchor on Amoy, triggered through the admin route (`POST /api/v1/admin/audit/anchor`, PIN step-up): seq 337, tx `0x47d50f33bc63255a953db33950f86c3bdfa76f41da669623940db70c623bbe9e`, block 50692857, contract v2, 50,154 gas = 0.0015 POL; MinIO copy `audit-heads/seq-337.json`. `pnpm audit:verify --onchain` then verified the log up to entry #337 against all 19 anchored heads. Earlier (2026-10-19, branch `v2/phase-4-audit-anchoring`): built and tested on a local chain. 6-hourly standalone anchor (`lib/audit-anchor.ts`, started from `src/instrumentation.ts`), `AuditHeadAnchor` records, MinIO copy, `pnpm audit:verify --onchain` checks every anchored head, admin page `/dashboard/audit` with a manual "anchor now" (step-up). Done-when check passes on a copy of the dev DB against the real Amoy heads: an edited row is named (`seq 150`); a rewrite with recomputed hashes, which the chain check alone accepts, is located (`between seq 149 and 153`). Choices: ADR-030.

- Every document anchor tx also carries the current `(auditSeq, auditHead)` at no extra tx cost.
- Standalone `anchorAuditHead` every 6 hours (≈0.012 POL/day), skipped if no new entries.
- Each anchored head also written to MinIO Object Lock (rule 3 applies to audit heads too).
- `pnpm audit:verify` and an admin page: "Audit log verified up to entry #N, anchored in block X."
- Documented limit: entries written after the last anchored head (≤ 6 h) can be rewritten by an insider with DB-owner access without detection until the next anchor.

**Done when:** an audit row edited directly in Postgres (owner role) is flagged by the check, naming the first bad `seq`.

---

## Phase 5 — Section 63 certificate (Day 5)

**Status (2026-10-19, branch `v2/phase-5-certificate`): Phase 5 complete.** `lib/certificate.ts` builds the PDF; the QR is ADR-022's chain-only link `/verify?v=&c=&tx=` (not `?proof=<MinIO URL>` as first written below — ADR-022 replaced it). `scripts/e2e-certificate.mjs` checks it on a real Amoy anchor without spending gas: the QR decoded from the PDF opens on a phone-sized logged-out browser as "Anchored"; dropping the pages and proof file turns it into "Verified". Opening the link over plain `http://<LAN IP>` exposed that browsers hide WebCrypto outside HTTPS/localhost; hashing now falls back to js-sha256 there (ADR-031). Not yet scanned with a physical phone.

- One-click PDF per version: case reference, document title, commitment, fileHash, tx hash, block time, contract address.
- QR code → `/verify?proof=<public MinIO URL of the proof JSON>` (ADR-022). The portal fetches the proof from MinIO and checks the commitment on chain.
- On screen and on the certificate, say plainly: **scanning the QR proves this certificate's commitment is anchored; verifying a file additionally requires dropping the document pages.**
- Blank signature blocks for the officer and the expert (BSA requires a human signature; software never self-certifies).

**Done when:** scanning the QR on a phone shows a green "Anchored" result; dropping the pages turns it into full "Verified".

---

## Phase 6 — Redaction recall measurement (Days 5–6)

**Status (2026-10-22, branch `v2/phase-6-recall`): measured and improved; case gazetteer open.** `pnpm eval:redaction` generates a tuning set and a held-out set (60 pages each: English, Hindi, Kannada × clean and scanned) and prints recall per type and language, leak rate, precision and recall at confidence cutoffs. Every identifier fully covered, held-out set: 74–94% before → 96–100% after (docs/08). Changes the measurement led to: tile mapping now matches the hashing split, background flattening before OCR, phone and label patterns, Kannada joiner, in-page name propagation, Verhoeff scoring (ADR-033). Case gazetteer (2026-10-22, branch `v2/phase-6-gazetteer`): keyed per-case name hashes, insert-only table, cross-script normalisation (ADR-034); unlabelled names in a follow-up document 25–92% → 98–100%. Precision pass (2026-10-22, branch `v2/phase-6-precision`, ADR-035): form text and Indic script kept out of NER, address context for green, review bands, value-only label patterns; precision 51–74% → 67–88%, title/footer boxes 13–25% → 0–3%, recall unchanged or higher; `pnpm eval:gate` and a CI workflow enforce it. Pitch slide done. Not done: a real scanned FIR.

- **Test set:** synthetic FIRs with gold labels for names, phone numbers, Aadhaar numbers, addresses. Start with **English, Hindi, Kannada** (what the AI service supports: `real_suggestions.py`). Tamil/Telugu only if OCR + NER support is added first — otherwise they measure a missing feature.
- Each FIR in two forms: native text PDF and a scanned image version (rotated, noisy, JPEG-sourced) so the OCR path is measured.
- Aadhaar detection validated with the Verhoeff checksum.
- **Case gazetteer** (new feature — doesn't exist yet): names confirmed once in a case are always flagged in that case's other documents. Target 100% on gazetteer names.
- `pnpm eval:redaction` prints recall and precision per entity type and language, plus the share of documents where at least one identifier survives.
- Tune green/amber/red thresholds for recall first.

**Done when:** results table in `docs/` and on a pitch slide — real numbers, good or bad.

---

## Phase 7 — BNSS s.193(2) deadline tracking (Day 6)

**Status (2026-10-19, branch `v2/phase-7-deadlines`): Phase 7 complete.** Rule in `lib/bnss-deadline.ts` (18 unit tests), `bnss_deadline` on every case from the API, FIR date and sections settable on create and through an audited `PATCH`, badge on both dashboards and the case page, alerts at the top of "Needs your attention" and on the case page. `scripts/seed-deadline-cases.mjs` seeds six demo cases dated from today; `scripts/e2e-deadlines.mjs` passes 14/14 — the day-50 case shows an amber badge and alerts, the non-covered and closed cases show neither. Choices (due date, day counting, closed cases): ADR-032.

- Applies only to BNS ss.64, 65, 66, 67, 68, 70, 71 and POCSO ss.4, 6, 8, 10 — not every offence against women and not all of POCSO. Driven by `Case.offenceSections`.
- Clock starts at `Case.firRegisteredAt` (date the information was recorded).
- Countdown badge; alerts at day 45 (amber), 55 (red) and 60 (overdue).

**Done when:** a seeded case at day 50 shows an amber badge and an alert; a case with a non-covered section shows no badge.

---

## Phase 8 — Demo hardening (Day 7)

**Status (2026-10-23): Phase 8 complete.** All 9 demo documents re-anchored as proof-v2 versions on contract v2 (`seed-demo.ts` upgrades any document still on v1). `scripts/golden-path.mjs` runs the docs/05 sequence end to end; two rehearsals passed 10/10 (second on the messy scan). Messy scan: `public/sample-firs/messy-fir.pdf` (`eval/messy.py`), 12/12 identifiers covered in the app. `scripts/e2e-three-browsers.mjs`: Chromium, Firefox and WebKit compute identical roots on the crypto-core vectors and verify the same real document identically (WebKit run 2026-10-23, after installing `libevent-2.1-7t64` and `libmanette-0.2-0`). Measured gas: 0.0031 POL per document anchor. Earlier (2026-10-20, branch `v2/phase-8-docs`): docs done. `docs/05-demo-golden-path.md` written (accounts, pre-demo checklist, 12-step sequence with timings, recovery table, gas per run). Threat-model table in `docs/ARCHITECTURE.md` §6 extended with six rows (AI miss, stolen session, leaked share, moved FIR date, hostile RPC, deleted pages); the paper's Table 2 was not available to reuse. Still open: three-browser Playwright check, the messy scan, re-anchoring the demo documents on v2, two rehearsals.

- Write `docs/05-demo-golden-path.md` (CLAUDE.md step 7 expects it).
- Threat-model table (adversary → attack → defence) in `docs/ARCHITECTURE.md`; reuse Table 2 from the paper.
- Playwright: verify portal in Chromium, Firefox and WebKit must produce identical roots for the test vectors and a real document.
- One deliberately messy scan: skewed, JPEG-sourced, coffee stain.
- Re-anchor all demo documents on v2; rehearse the golden path twice.

**Stretch:** officer signs `C` with their WebAuthn key at upload; single-file offline verifier HTML.

---

## POL budget for the week

| Item | Estimate |
|---|---|
| Deploy contract v2 | ~0.01–0.02 |
| ~10 demo anchors at ~0.003 | ~0.03 |
| Audit anchors, 4/day × 7 days | ~0.08 |
| **Total** | **~0.15 POL** (≈2 faucet claims) |

Fee cap in the anchoring code (P0.8) is required, not optional.

## After the build

- Paper §4.6: salted leaves replace ZK as the main confidentiality defence; ZK moves to future work.
- Gas table updated with real v2 numbers from Amoy.
- Replace local-test figures with real contract address and tx links.

## Out of scope (roadmap slide only)

- RFC 3161 timestamps from a CCA-licensed TSA
- Face and signature detection in photos
- Victim pseudonyms across a case; two-person unmasking
- Per-case encryption keys; per-recipient watermarks; CCTNS/ICJS adapter
- Aadhaar login or eSign in production; Hyperledger; national crime dashboards (`docs/01`)
