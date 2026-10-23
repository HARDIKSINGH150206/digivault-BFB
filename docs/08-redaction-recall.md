# 08 — Redaction Recall Measurement

How often the AI suggestions cover every victim identifier on a page, and how many suggestions are wasted, measured on **synthetic typed FIRs** (docs/07 Phase 6). Real numbers from `pnpm eval:redaction`, run 2026-10-22. Decisions: ADR-033 (engine), ADR-034 (case gazetteer), ADR-035 (precision and the gate).

**Why recall first:** a missed identifier in a shared copy can be a BNS s.72 violation; an extra masked tile only costs readability. Suggestions are never final either way: an officer reviews every page (rule 2). Precision still matters: a reviewer wading through boxes on the form's own title and labels is a reviewer more likely to miss the real one.

## Headline

Share of identifiers with **every** tile they touch flagged — before Phase 6 (engine on `dev` at `9d5888d`) and now:

| Language | Form | Tuning set: before → now | Held-out set: before → now |
|---|---|---|---|
| English | clean | 88% → **98%** | 94% → **100%** |
| English | scanned | 79% → **97%** | 80% → **99%** |
| Hindi | clean | 72% → **100%** | 79% → **100%** |
| Hindi | scanned | 69% → **100%** | 77% → **100%** |
| Kannada | clean | 76% → **99%** | 75% → **98%** |
| Kannada | scanned | 60% → **99%** | 74% → **98%** |

Every identifier on every page in both sets has at least one tile flagged (partial recall 100%), so the reviewer is always pointed at it.

Documents where at least one identifier is not fully covered (leak rate), and tile precision:

| Language | Form | Leak: tuning / held-out | Precision before the precision pass → now (tuning / held-out) |
|---|---|---|---|
| English | clean | 2 / 0 of 10 | 68 → **77%** / 71 → **79%** |
| English | scanned | 2 / 1 of 10 | 74 → **82%** / 74 → **83%** |
| Hindi | clean | 0 / 0 of 10 | 58 → **75%** / 63 → **88%** |
| Hindi | scanned | 0 / 0 of 10 | 67 → **84%** / 66 → **84%** |
| Kannada | clean | 1 / 2 of 10 | 51 → **67%** / 58 → **77%** |
| Kannada | scanned | 1 / 2 of 10 | 57 → **73%** / 60 → **72%** |

Boxes on the printed form itself (FIR pages; share of tiles that hold only form text):

| Language | Form | Title and footer: before → now (tuning / held-out) | Field labels: before → now |
|---|---|---|---|
| English | clean | 15% → **0%** / 14% → **2%** | 53% → 17% / 52% → 6% |
| English | scanned | 12% → **1%** / 15% → **1%** | 56% → 8% / 47% → 10% |
| Hindi | clean | 15% → **0%** / 15% → **0%** | 24% → 9% / 11% → 5% |
| Hindi | scanned | 15% → **0%** / 14% → **1%** | 17% → 3% / 25% → 7% |
| Kannada | clean | 23% → **0%** / 23% → **0%** | 18% → 20% / 21% → 14% |
| Kannada | scanned | 25% → **1%** / 19% → **3%** | 41% → 19% / 39% → 33% |

The few title/footer tiles left are a date on the line under the title reaching up one tile row. Remaining label flags are mostly Kannada labels sharing a line with their value.

Names in a later document of the same case, written with no label at all (case gazetteer, ADR-034):

| Language | Form | Tuning: without → with gazetteer | Held-out: without → with |
|---|---|---|---|
| English | clean | 88% → **100%** | 92% → **100%** |
| English | scanned | 88% → **100%** | 90% → **98%** |
| Hindi | clean | 0% → **100%** | 0% → **100%** |
| Hindi | scanned | 0% → **100%** | 2% → **100%** |
| Kannada | clean | 50% → **100%** | 40% → **100%** |
| Kannada | scanned | 35% → **100%** | 40% → **98%** |

"Without" fell for Hindi (30–40% → 0–2%) in the precision pass: the English NER model used to tag random Hindi words as people and places and sometimes hit a name by luck. It no longer reads Hindi or Kannada (ADR-035). With the gazetteer the result is unchanged.

## Test set

- 10 one-page FIRs per language (English, Hindi, Kannada), each as **clean** (rendered straight to PNG, like a native PDF in the browser) and **scanned** (rotated 0.8–2.5°, blurred, yellowed, unevenly lit, noised, coffee-stained, JPEG quality 40–60, then saved as PNG). 60 pages per set.
- Page size 1190 × 1684 (A4 at the app's PDF.js scale 2.0), 24 px body text, 20 × 20 grid.
- Per FIR: complainant, a relative, accused and witness names; the complainant's phone, Aadhaar (Verhoeff-valid) and address; a narrative that repeats the victim's and accused's names without labels and gives the accused's phone. 12 identifiers per English FIR and 11 per Hindi or Kannada one (names counted per occurrence).
- Per FIR, a **follow-up statement** in the same case naming the victim, witness and accused (twice) with no role labels, for the gazetteer measurement. 60 more pages per set.
- Every page also records where its printed form text is (title, field labels, footer), for the form-text table above.
- Label wording varies per document ("Complainant:", "Name of complainant:", "Victim:", "Informant:"; "शिकायतकर्ता का नाम:", "पीड़िता:"; "ಆರೋಪಿಯ ಹೆಸರು:", …), and phones appear as `9876543210`, `98765 43210` and `+91 98765 43210`.
- **Tuning set:** seed 2026, Noto Sans. Engine changes were made while looking at its misses.
- **Held-out set:** seed 77, Noto Serif: different people, numbers, addresses, stain positions, rotations and typeface. Run only after each change was final — **except** during the precision pass, when the gate flagged two regressions that only showed on it (a Hindi witness name, a Kannada narrative name) and their causes were found by looking at those pages. It is no longer fully unseen.
- All people and records are fictional; every page says so in its footer.

## Scoring

- Gold: the 20 × 20 tiles touched by each word's actual ink (pixels drawn, not font metrics), using the hashing code's tile split (`ceil(page / 20)`). Punctuation-only words (a lone "-") are left out.
- **Caught** = every gold tile of the identifier is flagged, by any entity type. A name with one unmasked tile still leaks, so partial coverage counts as a miss.
- **Partial** = at least one of its tiles is flagged.
- **Precision** = flagged tiles that cover an identifier ÷ flagged tiles, leaving out tiles that only cover dates, FIR numbers, station names or ages (reasonable to flag, but not victim identifiers). Tiles holding only form text count as false positives.
- **Gazetteer:** the FIR is run with the case's key; the hashes on suggestions that cover a gold name stand for what an officer would confirm (the engine's own output, not the gold text). The follow-up is then run without and with those hashes.

## The gate

`pnpm eval:redaction && pnpm eval:gate` compares both sets with `apps/ai-service/eval/baseline.json`, per set, language and form. It fails if **recall, partial recall or gazetteer recall drops at all**, or if **precision drops by more than 2 points**. `.github/workflows/redaction-quality.yml` runs it on every pull request touching `apps/ai-service`, in `ubuntu:26.04` (the Tesseract 5.5.0 the baseline was measured with) with Python packages pinned in `requirements-eval.lock`. After a deliberate improvement, `python -m eval.gate --update` makes the current numbers the new baseline.

## Results by identifier type (now)

Tuning set (seed 2026, sans):

| Language | Form | Name | Phone | Aadhaar | Address | All | Precision |
|---|---|---|---|---|---|---|---|
| English | clean | 96% (77/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **98% (117/120)** | 77% |
| English | scanned | 95% (76/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **97% (116/120)** | 82% |
| Hindi | clean | 100% (70/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (110/110)** | 75% |
| Hindi | scanned | 100% (70/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (110/110)** | 84% |
| Kannada | clean | 99% (69/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **99% (109/110)** | 67% |
| Kannada | scanned | 99% (69/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **99% (109/110)** | 73% |

Held-out set (seed 77, serif):

| Language | Form | Name | Phone | Aadhaar | Address | All | Precision |
|---|---|---|---|---|---|---|---|
| English | clean | 100% (80/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (120/120)** | 79% |
| English | scanned | 99% (79/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **99% (119/120)** | 83% |
| Hindi | clean | 100% (70/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (110/110)** | 88% |
| Hindi | scanned | 100% (70/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (110/110)** | 84% |
| Kannada | clean | 100% (70/70) | 100% (20/20) | 100% (10/10) | 80% (8/10) | **98% (108/110)** | 77% |
| Kannada | scanned | 99% (69/70) | 100% (20/20) | 100% (10/10) | 90% (9/10) | **98% (108/110)** | 72% |

## Confidence bands

The review screen shows each suggestion as **high confidence** (≥ 0.9, green, solid outline) or **check** (below 0.9, amber, dashed outline), in words as well as colour. Nothing is pre-selected. An address found only by the NER model is green only with context on its line or the next (an address label, a PIN code or another place); otherwise it stays amber (≤ 0.85). A labelled address is green (0.92).

Recall if only suggestions at or above a confidence were used (held-out set, now):

| Language | Form | all | ≥ 0.7 | ≥ 0.8 | ≥ 0.9 (green only) |
|---|---|---|---|---|---|
| English | clean | 100% | 100% | 100% | 98% |
| English | scanned | 99% | 99% | 99% | 98% |
| Hindi | clean | 100% | 100% | 100% | 86% |
| Hindi | scanned | 100% | 100% | 100% | 84% |
| Kannada | clean | 98% | 98% | 98% | 81% |
| Kannada | scanned | 98% | 98% | 98% | 82% |

Green alone misses 14–19% of Hindi and Kannada identifiers: amber means "look at this", not "probably wrong". If pre-selection is ever added, pre-select both bands.

## Gazetteer across scripts

The gazetteer key puts a name written in Latin, Devanagari and Kannada on one spelling (ADR-034). Same person, three scripts, key identical:

| List | All three | Latin = Devanagari | Latin = Kannada | Devanagari = Kannada |
|---|---|---|---|---|
| 28 names the rules were written against | 100% | 100% | 100% | 100% |
| 20 other names, measured once after the rules were final | **85%** (17/20) | 85% | 85% | 95% |

Held-out misses: Nair / नायर, Begum / बेगम, Krishna / कृष्ण. Within one script the match is exact. The follow-up measurements above use the same script as the FIR.

## End-to-end check in the app

`apps/web/scripts/e2e-redaction-boxes.mjs` uploads one synthetic FIR per language through the real UI (web app + AI service + Amoy anchoring), checks the boxes drawn on the page, confirms every suggestion with PIN step-up, then uploads the case's follow-up statement. Final run 2026-10-22 (clean pages en-04, hi-02, kn-03), with the configured `GAZETTEER_KEY`:

| | English | Hindi | Kannada |
|---|---|---|---|
| Boxes drawn on the FIR, each exactly on a suggested tile | 63 ✓ | 45 ✓ | 68 ✓ |
| Boxes on the title or footer (FIR / follow-up) | 0 / 0 | 0 / 0 | 0 / 0 |
| FIR identifiers fully covered | 12/12 | 11/11 | 11/11 |
| Follow-up names fully covered | 4/4 | 4/4 | 4/4 |
| Follow-up suggestions from the gazetteer | 4 | 10 | 4 |

## What the measurement found, and what changed

| Finding | Effect | Change |
|---|---|---|
| Suggestions mapped pixels to tiles as `x / width × 20`; the hashing code uses `ceil(width / 20)`-pixel tiles | Toward the right and bottom of a page, suggestions landed on the tile next to the identifier | Same split as `crypto-core/tiles.ts` |
| Tesseract's word box stops short of stacked Kannada signs, descenders, and sometimes most of a final digit | A sliver of an identifier left in an unmasked tile | Boxes padded by 15% of their height, and widened rightwards by up to 0.8 × the height, never into the next word |
| Coffee stain or uneven lighting | Tesseract dropped whole blocks of lines | Background flattened before OCR (page ÷ blurred page); pixels don't move |
| Phones split 5+5, with +91, or split at random by OCR ("84613 51 619") | Not detected | One pattern: 10 digits from 6–9, a space or dash allowed between any two |
| "Name of accused:", "Husband's name:", "शिकायतकर्ता का नाम:", "ಆರೋಪಿಯ ಹೆಸರು:", "ದೂರುದಾರರಾದ" | Name not captured, or "का नाम" captured as the name | Label patterns allow these forms |
| Tesseract's zero-width non-joiner after a Kannada virama (ಮಹೇಶ್‌) | Name capture stopped after the first word | Joiner allowed inside names |
| OCR read a label column and a value column as separate blocks | "गवाह:" followed by "निवासी", the name two lines later | Label patterns also run on the words regrouped into visual rows |
| The victim's name repeated in the narrative with no label | Missed entirely | A name captured once is flagged everywhere on the page |
| A name in a later document of the case, unlabelled | Missed in Hindi and Kannada | Case gazetteer of keyed name hashes (ADR-034) |
| A tile is ~2 text lines tall, so two names can share it | Only one name's hash survived on the tile | Tiles carry a list of name hashes |
| The English NER model read the title, labels, footer, and Hindi/Kannada text | 13–25% of title/footer tiles boxed, Kannada title as "Address" | NER sees only Latin body text; form text blanked (ADR-035) |
| NER entities stretched over blanked text | A date boxed across the line under the title | Only an entity's visible parts are mapped to tiles |
| "Age: 34", "FIR No. 0001/2026" matched label and value | The printed label boxed | Those patterns capture the value only |
| Hindi scan noise put another script's glyph inside an address | Address capture stopped early | A labelled Hindi address runs to the end of the line |
| Aadhaar matches | All scored 0.88 | Verhoeff-valid 0.98; invalid kept at 0.60 (may be an OCR misread) |

## Limits — read before quoting these numbers

- **Synthetic typed FIRs.** No handwriting, no carbon copies, no multi-column forms beyond label/value pairs, no stamps or signatures over text. Real scans will score lower.
- **Same label vocabulary in both sets.** The held-out set changes people, numbers, typeface and noise, but uses the same label wordings. A station that writes "प्रार्थी:" will not be matched by a label pattern (name propagation or the gazetteer may still catch it).
- **The held-out set was looked at once** during the precision pass (above).
- **The gazetteer only knows confirmed names.** The first document in a case gets no help from it.
- **Hindi and Kannada names depend on label patterns, propagation and the gazetteer only**; no NER model reads those scripts now. A bare name in a first document, with no label anywhere, is not found.
- 10 documents per language per set: one more or less caught identifier moves a per-type cell by up to 10 points.
- Tamil and Telugu are not measured; there is no OCR or pattern support for them yet (docs/07).

## Not done yet

- Not tried on a real scanned FIR (Phase 8 messy scan).
- The CI workflow has not run on GitHub yet; its environment may move the numbers slightly from this machine's.

## Reproduce

```bash
pnpm eval:redaction && pnpm eval:gate      # both sets, all tables, then the gate (~6 min)
cd apps/ai-service && .venv/bin/python -m unittest discover -s tests -t .
cd apps/web && node scripts/e2e-redaction-boxes.mjs   # needs both services, GAZETTEER_KEY, ~0.028 POL
```

Per-identifier misses: `apps/ai-service/eval/out/results.json` and `eval/out/holdout/results.json` (gitignored).
