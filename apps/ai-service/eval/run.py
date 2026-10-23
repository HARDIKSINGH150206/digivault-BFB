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
import hashlib
import hmac
import json
import time
from collections import defaultdict
from pathlib import Path

from app.gazetteer import name_key
from app.real_suggestions import generate_suggestions
from app.schemas import GazetteerInput, PageInput, Suggestion

from . import generate
from .fixtures import PARALLEL_NAMES, PARALLEL_NAMES_HOLDOUT
from .generate import GOLD_TYPES

LANG_NAMES = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
CUTOFFS = (0.0, 0.7, 0.8, 0.9)


def _suggest(page: dict, root: Path, gazetteer: GazetteerInput | None = None) -> list[Suggestion]:
    png = (root / page["path"]).read_bytes()
    req = PageInput(page_index=0, width_px=page["width"], height_px=page["height"],
                    png_base64=base64.b64encode(png).decode())
    return generate_suggestions("eval", page["grid"], [req], gazetteer)


def _flags(page: dict, root: Path) -> dict[int, float]:
    """tile index -> highest confidence the engine gave it."""
    out: dict[int, float] = {}
    for s in _suggest(page, root):
        t = s.row * page["grid"] + s.col
        out[t] = max(out.get(t, 0.0), s.confidence_score)
    return out


def _case_key(doc_id: str) -> bytes:
    """Stands in for the web app's per-case key (ADR-034): one case per document."""
    return hmac.new(b"eval-master-key", b"digivault/gazetteer/v1/case|" + doc_id.encode(), hashlib.sha256).digest()


def gazetteer_section(manifest: dict, root: Path) -> tuple[list[str], dict]:
    """Each FIR's follow-up statement names the same people with no labels.
    Recall on it without the gazetteer, and with one holding the names an
    officer would have confirmed on the FIR: name suggestions there whose
    tiles cover a gold name (the engine's own hashes, not the gold text)."""
    firs = {(p["doc_id"], p["form"]): p for p in manifest["pages"]}
    stats = defaultdict(lambda: [0, 0, 0, 0])  # (lang, form) -> [names, caught without, caught with, gazetteer size]
    for fu in manifest.get("followups", []):
        fir = firs[(fu["doc_id"], fu["form"])]
        key = _case_key(fu["doc_id"])
        gold_name_tiles = {t for e in fir["entities"] if e["type"] == "name" for t in e["tiles"]}
        known = {h for s in _suggest(fir, root, GazetteerInput(case_key=base64.b64encode(key).decode()))
                 if s.row * fir["grid"] + s.col in gold_name_tiles for h in s.name_hashes}
        without = {s.row * fu["grid"] + s.col for s in _suggest(fu, root)}
        with_g = {s.row * fu["grid"] + s.col for s in _suggest(
            fu, root, GazetteerInput(case_key=base64.b64encode(key).decode(), name_hashes=sorted(known)))}
        row = stats[(fu["lang"], fu["form"])]
        row[3] += len(known)
        for e in fu["entities"]:
            row[0] += 1
            row[1] += set(e["tiles"]) <= without
            row[2] += set(e["tiles"]) <= with_g
    lines = ["", "### Case gazetteer: names in a follow-up statement, never labelled", "",
             "| Language | Form | Without gazetteer | With gazetteer | Name hashes confirmed on the FIRs |", "|---|---|---|---|---|"]
    for lang in ("en", "hi", "kn"):
        for form in ("clean", "scanned"):
            n, wo, w, g = stats[(lang, form)]
            lines.append(f"| {LANG_NAMES[lang]} | {form} | {_pct(wo, n)} | **{_pct(w, n)}** | {g} |")
    return lines, stats


def cross_script_lines() -> list[str]:
    lines = ["", "### Gazetteer key agrees across scripts (same person, Latin / Devanagari / Kannada)", "",
             "| List | All three | Latin = Devanagari | Latin = Kannada | Devanagari = Kannada |", "|---|---|---|---|---|"]
    for label, names in (("tuning (rules written against it)", PARALLEL_NAMES), ("held-out (measured once)", PARALLEL_NAMES_HOLDOUT)):
        keys = [tuple(name_key(x) if x else None for x in row) for row in names]
        n = len(keys)
        lines.append(f"| {label} | {_pct(sum(a == b == c for a, b, c in keys), n)} | {_pct(sum(a == b for a, b, _ in keys), n)} "
                     f"| {_pct(sum(a == c for a, _, c in keys), n)} | {_pct(sum(b == c for _, b, c in keys), n)} |")
    return lines


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
    # Printed form text (title, footer, field labels): tiles it touches that
    # hold no identifier or ignore span. Any flag there is a false positive.
    on_form = defaultdict(lambda: {"title_footer": [0, 0], "labels": [0, 0]})
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
        content = gold_tiles | ignore_tiles
        for kind, types in (("title_footer", ("title", "footer")), ("labels", ("label",))):
            only = {t for e in page.get("form_text", []) if e["type"] in types for t in e["tiles"]} - content
            on_form[key][kind][0] += len(only & flags.keys())
            on_form[key][kind][1] += len(only)

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
    lines += ["", "### Boxes on printed form text (tiles with no identifier on them)", "",
              "| Language | Form | Title and footer tiles flagged | Field-label tiles flagged |", "|---|---|---|---|"]
    for k in combos:
        lines.append(f"| {LANG_NAMES[k[0]]} | {k[1]} | {_pct(*on_form[k]['title_footer'])} | {_pct(*on_form[k]['labels'])} |")
    gaz_lines, gaz = gazetteer_section(manifest, args.set)
    lines += gaz_lines + cross_script_lines()
    print("\n".join(lines))

    # What eval.gate compares against the committed baseline.
    summary = {}
    for k in combos:
        total = [sum(by_type[(*k, t)][0] for t in GOLD_TYPES), sum(by_type[(*k, t)][1] for t in GOLD_TYPES)]
        partial = sum(by_type[(*k, t)][2] for t in GOLD_TYPES)
        summary["|".join(k)] = {"recall": [total[1], total[0]], "partial_recall": [partial, total[0]], "precision": prec[k],
                                "gazetteer_recall": [gaz[k][2], gaz[k][0]] if k in gaz else None,
                                "title_footer_flagged": on_form[k]["title_footer"], "label_flagged": on_form[k]["labels"]}

    args.json.write_text(json.dumps({
        "manifest_seed": manifest["seed"],
        "summary": summary,
        "by_type": {"|".join(k): v for k, v in by_type.items()},
        "leaks": {"|".join(k): v for k, v in leaks.items()},
        "precision": {"|".join(k): v for k, v in prec.items()},
        "by_cutoff": {str(c): {"|".join(k): v for k, v in d.items()} for c, d in by_cutoff.items()},
        "missed": missed,
    }, ensure_ascii=False, indent=1))
    print(f"\nPer-identifier misses: {args.json}")


if __name__ == "__main__":
    main()
