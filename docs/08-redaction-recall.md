# 08 — Redaction Recall Measurement

How often the AI suggestions cover every victim identifier on a page, measured on synthetic FIRs (docs/07 Phase 6). Real numbers from `pnpm eval:redaction`, run 2026-10-22. Decisions behind the engine changes: ADR-033.

**Why recall first:** a missed identifier in a shared copy can be a BNS s.72 violation; an extra masked tile only costs readability. Suggestions are never final either way: an officer reviews every page (rule 2).

## Headline

Share of identifiers with **every** tile they touch flagged, before (engine on `dev` at `9d5888d`) and after this phase:

| Language | Form | Tuning set: before → after | Held-out set: before → after |
|---|---|---|---|
| English | clean | 88% → **98%** | 94% → **100%** |
| English | scanned | 79% → **93%** | 80% → **96%** |
| Hindi | clean | 72% → **100%** | 79% → **99%** |
| Hindi | scanned | 69% → **96%** | 77% → **98%** |
| Kannada | clean | 76% → **99%** | 75% → **97%** |
| Kannada | scanned | 60% → **99%** | 74% → **97%** |

Documents where at least one identifier stays visible (leak rate), same runs:

| Language | Form | Tuning: before → after | Held-out: before → after |
|---|---|---|---|
| English | clean | 80% → 20% | 40% → 0% |
| English | scanned | 90% → 50% | 90% → 40% |
| Hindi | clean | 100% → 0% | 100% → 10% |
| Hindi | scanned | 100% → 40% | 100% → 20% |
| Kannada | clean | 90% → 10% | 100% → 30% |
| Kannada | scanned | 100% → 10% | 100% → 20% |

After the changes, every identifier on every page has at least one tile flagged, except one Kannada name on one held-out clean page. So the reviewer is always pointed at it. The leak rate is the share of documents where the reviewer still has to extend a suggestion by hand.

## Test set

- 10 one-page FIRs per language (English, Hindi, Kannada), each as **clean** (rendered straight to PNG, like a native PDF in the browser) and **scanned** (rotated 0.8–2.5°, blurred, yellowed, unevenly lit, noised, coffee-stained, JPEG quality 40–60, then saved as PNG). 60 pages per set.
- Page size 1190 × 1684 (A4 at the app's PDF.js scale 2.0), 24 px body text, 20 × 20 grid.
- Per document: complainant, a relative, accused and witness names; the complainant's phone, Aadhaar (Verhoeff-valid) and address; a narrative that repeats the victim's and accused's names without labels and gives the accused's phone. 12 identifiers per English document and 11 per Hindi or Kannada one (names are counted per occurrence; the English narrative names the accused once more).
- Label wording varies per document ("Complainant:", "Name of complainant:", "Victim:", "Informant:"; "शिकायतकर्ता का नाम:", "पीड़िता:"; "ಆರೋಪಿಯ ಹೆಸರು:", …), and phones appear as `9876543210`, `98765 43210` and `+91 98765 43210`.
- **Tuning set:** seed 2026, Noto Sans. Engine changes were made while looking at its misses.
- **Held-out set:** seed 77, Noto Serif: different people, numbers, addresses, stain positions, rotations and typeface. Not looked at before the changes were final.
- All people and records are fictional; every page says so in its footer.

## Scoring

- Gold: the 20 × 20 tiles touched by each word's actual ink (pixels drawn, not font metrics), using the hashing code's tile split (`ceil(page / 20)`). Punctuation-only words (a lone "-") are left out.
- **Caught** = every gold tile of the identifier is flagged, by any entity type. A name with one unmasked tile still leaks, so partial coverage counts as a miss.
- **Partial** = at least one of its tiles is flagged.
- **Precision** = flagged tiles that cover an identifier ÷ flagged tiles, leaving out tiles that only cover dates, FIR numbers, station names or ages (reasonable to flag, but not victim identifiers).

## Results after the changes, by identifier type

Tuning set (seed 2026, sans):

| Language | Form | Name | Phone | Aadhaar | Address | All | Precision |
|---|---|---|---|---|---|---|---|
| English | clean | 96% (77/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **98% (117/120)** | 78% |
| English | scanned | 91% (73/80) | 100% (20/20) | 100% (10/10) | 90% (9/10) | **93% (112/120)** | 80% |
| Hindi | clean | 100% (70/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (110/110)** | 65% |
| Hindi | scanned | 100% (70/70) | 90% (18/20) | 100% (10/10) | 80% (8/10) | **96% (106/110)** | 72% |
| Kannada | clean | 99% (69/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **99% (109/110)** | 59% |
| Kannada | scanned | 99% (69/70) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **99% (109/110)** | 62% |

Held-out set (seed 77, serif):

| Language | Form | Name | Phone | Aadhaar | Address | All | Precision |
|---|---|---|---|---|---|---|---|
| English | clean | 100% (80/80) | 100% (20/20) | 100% (10/10) | 100% (10/10) | **100% (120/120)** | 78% |
| English | scanned | 95% (76/80) | 100% (20/20) | 100% (10/10) | 90% (9/10) | **96% (115/120)** | 79% |
| Hindi | clean | 100% (70/70) | 95% (19/20) | 100% (10/10) | 100% (10/10) | **99% (109/110)** | 68% |
| Hindi | scanned | 99% (69/70) | 100% (20/20) | 100% (10/10) | 90% (9/10) | **98% (108/110)** | 71% |
| Kannada | clean | 97% (68/70) | 100% (20/20) | 100% (10/10) | 90% (9/10) | **97% (107/110)** | 63% |
| Kannada | scanned | 99% (69/70) | 100% (20/20) | 100% (10/10) | 80% (8/10) | **97% (107/110)** | 67% |

## Confidence thresholds

Recall if only suggestions at or above a confidence were used (held-out set, after):

| Language | Form | all | ≥ 0.7 | ≥ 0.8 | ≥ 0.9 |
|---|---|---|---|---|---|
| English | clean | 100% | 100% | 100% | 90% |
| English | scanned | 96% | 96% | 96% | 88% |
| Hindi | clean | 99% | 99% | 90% | 78% |
| Hindi | scanned | 98% | 98% | 90% | 75% |
| Kannada | clean | 97% | 97% | 89% | 77% |
| Kannada | scanned | 97% | 97% | 89% | 77% |

The review screen pre-selects nothing today and shows every suggestion with its confidence. If pre-selection is added, pre-select **every** suggestion and use confidence only for colour (for example green ≥ 0.9, amber below). Any cutoff of 0.8 or more drops about 10 points of recall in Hindi and Kannada.

## What the measurement found, and what changed (ADR-033)

| Finding | Effect | Change |
|---|---|---|
| Suggestions mapped pixels to tiles as `x / width × 20`; the hashing code uses `ceil(width / 20)`-pixel tiles | Toward the right and bottom of a page, suggestions landed on the tile next to the identifier | Same split as `crypto-core/tiles.ts` |
| Coffee stain or uneven lighting | Tesseract dropped whole blocks of lines | Background flattened before OCR (page ÷ blurred page); pixels don't move |
| Phones split 5+5 or with +91 | Not detected | One mobile pattern for all three forms |
| "Name of accused:", "Husband's name:", "शिकायतकर्ता का नाम:", "ಆರೋಪಿಯ ಹೆಸರು:" | Name not captured, or "का नाम" captured as the name | Label patterns allow these forms |
| Tesseract's zero-width non-joiner after a Kannada virama (ಮಹೇಶ್‌) | Name capture stopped after the first word | Joiner allowed inside names |
| The victim's name repeated in the narrative with no label | Missed entirely | A name captured once is flagged everywhere on the page |
| Aadhaar matches | All scored 0.88 | Verhoeff-valid 0.98; invalid kept at 0.60 (may be an OCR misread) |

## Limits — read before quoting these numbers

- **Synthetic, typed pages.** No handwriting, no carbon copies, no multi-column forms, no stamps or signatures over text. Real scans will score lower.
- **Same label vocabulary in both sets.** The held-out set changes people, numbers, typeface and noise, but uses the same label wordings. A station that writes "प्रार्थी:" will not be matched by a label pattern (spaCy or name propagation may still catch it).
- **One page per document.** Names are propagated within a page, not across pages, and not across documents in a case (the case gazetteer, below).
- 10 documents per language per set: one more or less caught identifier moves a per-type cell by up to 10 points.
- Tamil and Telugu are not measured; there is no OCR or pattern support for them yet (docs/07).

## Not done yet

- **Case gazetteer** (names confirmed in one document flagged in the case's other documents): needs a decision on storing victim names; see ADR-033 "Open".
- Not tried on a real scanned FIR.

## Reproduce

```bash
pnpm eval:redaction           # generates both sets, prints both tables (~2 min)
cd apps/ai-service && .venv/bin/python -m unittest discover -s tests -t .
```

Per-identifier misses: `apps/ai-service/eval/out/results.json` and `eval/out/holdout/results.json` (gitignored).
