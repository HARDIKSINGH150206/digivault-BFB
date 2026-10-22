"""
Measures redaction recall on the synthetic test set (docs/07 Phase 6) by
running the real suggestion engine (app.real_suggestions) on every page.

Scoring is per tile, because tiles are what get masked:
  caught    every tile the identifier's ink touches is flagged (any entity
            type). A name with one tile left unmasked still leaks, so this
            is the recall that matters.
  partial   at least one of its tiles is flagged
  leak rate share of documents where at least one identifier is not caught
  precision flagged tiles that cover an identifier / flagged tiles, leaving
            out tiles that only cover an "ignore" span (dates, FIR number,
            station, age), which are reasonable to flag

    .venv/bin/python -m eval.run [--json eval/out/results.json]

Run eval.generate first. Prints markdown tables.
"""

from __future__ import annotations

import argparse
import base64
import json
import time
from collections import defaultdict
from pathlib import Path

from app.real_suggestions import generate_suggestions
from app.schemas import PageInput

from . import generate
from .generate import GOLD_TYPES

LANG_NAMES = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
CUTOFFS = (0.0, 0.7, 0.8, 0.9)


def _flags(page: dict, root: Path) -> dict[int, float]:
    """tile index -> highest confidence the engine gave it."""
    png = (root / page["path"]).read_bytes()
    req = PageInput(page_index=0, width_px=page["width"], height_px=page["height"],
                    png_base64=base64.b64encode(png).decode())
    out: dict[int, float] = {}
    for s in generate_suggestions("eval", page["grid"], [req]):
        t = s.row * page["grid"] + s.col
        out[t] = max(out.get(t, 0.0), s.confidence_score)
    return out


def _pct(n: int, d: int) -> str:
    return "—" if d == 0 else f"{100 * n / d:.0f}% ({n}/{d})"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=Path, default=generate.OUT, help="directory written by eval.generate")
    ap.add_argument("--json", type=Path, help="default: <set>/results.json")
    args = ap.parse_args()
    args.json = args.json or args.set / "results.json"

    manifest = json.loads((args.set / "manifest.json").read_text())
    pages = manifest["pages"]
    started = time.time()
    per_page = []
    for i, page in enumerate(pages, 1):
        t0 = time.time()
        flags = _flags(page, args.set)
        per_page.append((page, flags))
        print(f"  [{i}/{len(pages)}] {page['doc_id']} {page['form']}: {len(flags)} tiles flagged ({time.time() - t0:.1f}s)", flush=True)

    # (lang, form, type) -> [total, caught, partial]; cutoff -> (lang, form) -> [total, caught]
    by_type = defaultdict(lambda: [0, 0, 0])
    by_cutoff = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    leaks = defaultdict(lambda: [0, 0])  # (lang, form) -> [docs, docs with a leak]
    prec = defaultdict(lambda: [0, 0])   # (lang, form) -> [flagged on identifiers, flagged excluding ignore-only]
    missed = []
    for page, flags in per_page:
        key = (page["lang"], page["form"])
        gold_tiles = {t for e in page["entities"] for t in e["tiles"]}
        ignore_tiles = {t for e in page["ignore"] for t in e["tiles"]} - gold_tiles
        leaked = False
        for e in page["entities"]:
            tiles = set(e["tiles"])
            hit = tiles & flags.keys()
            row = by_type[(*key, e["type"])]
            row[0] += 1
            row[1] += hit == tiles
            row[2] += bool(hit)
            if hit != tiles:
                leaked = True
                missed.append({"page": page["path"], "type": e["type"], "text": e["text"],
                               "tiles_missed": sorted(tiles - hit), "tiles": len(tiles)})
            for c in CUTOFFS:
                kept = {t for t, conf in flags.items() if conf >= c}
                by_cutoff[c][key][0] += 1
                by_cutoff[c][key][1] += tiles <= kept
        leaks[key][0] += 1
        leaks[key][1] += leaked
        counted = flags.keys() - ignore_tiles
        prec[key][0] += len(counted & gold_tiles)
        prec[key][1] += len(counted)

    combos = [(lang, form) for lang in ("en", "hi", "kn") for form in ("clean", "scanned")]
    lines = [f"Test set: {manifest['docs_per_language']} documents per language, seed {manifest['seed']}, "
             f"{manifest.get('font', 'sans')} font, "
             f"{len(pages)} pages; {time.time() - started:.0f}s.", ""]
    lines += ["### Recall by identifier type (caught = every tile flagged; partial = at least one)", "",
              "| Language | Form | " + " | ".join(GOLD_TYPES) + " | All |", "|---|---|" + "---|" * (len(GOLD_TYPES) + 1)]
    for lang, form in combos:
        cells = []
        tot = [0, 0, 0]
        for t in GOLD_TYPES:
            n, c, p = by_type[(lang, form, t)]
            tot = [tot[0] + n, tot[1] + c, tot[2] + p]
            cells.append(f"{_pct(c, n)}, partial {_pct(p, n).split(' ')[0]}")
        cells.append(f"**{_pct(tot[1], tot[0])}**, partial {_pct(tot[2], tot[0]).split(' ')[0]}")
        lines.append(f"| {LANG_NAMES[lang]} | {form} | " + " | ".join(cells) + " |")

    lines += ["", "### Documents with at least one identifier left visible, and tile precision", "",
              "| Language | Form | Leak rate | Precision |", "|---|---|---|---|"]
    for k in combos:
        lines.append(f"| {LANG_NAMES[k[0]]} | {k[1]} | {_pct(leaks[k][1], leaks[k][0])} | {_pct(*prec[k])} |")

    lines += ["", "### Recall (caught) if only suggestions at or above a confidence cutoff were used", "",
              "| Language | Form | " + " | ".join(f"≥ {c:.1f}" for c in CUTOFFS) + " |", "|---|---|" + "---|" * len(CUTOFFS)]
    for k in combos:
        lines.append(f"| {LANG_NAMES[k[0]]} | {k[1]} | " + " | ".join(_pct(by_cutoff[c][k][1], by_cutoff[c][k][0]).split(" ")[0] for c in CUTOFFS) + " |")
    print("\n".join(lines))

    args.json.write_text(json.dumps({
        "manifest_seed": manifest["seed"],
        "by_type": {"|".join(k): v for k, v in by_type.items()},
        "leaks": {"|".join(k): v for k, v in leaks.items()},
        "precision": {"|".join(k): v for k, v in prec.items()},
        "by_cutoff": {str(c): {"|".join(k): v for k, v in d.items()} for c, d in by_cutoff.items()},
        "missed": missed,
    }, ensure_ascii=False, indent=1))
    print(f"\nPer-identifier misses: {args.json}")


if __name__ == "__main__":
    main()
