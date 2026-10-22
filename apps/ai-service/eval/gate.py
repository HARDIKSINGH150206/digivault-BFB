"""
Regression gate for redaction quality (docs/08). Compares the summaries that
eval.run wrote for both test sets with the committed eval/baseline.json, per
set, language and form:

  recall            (identifiers fully covered)       must not drop at all
  partial recall    (identifiers at least partly flagged) must not drop at all
  gazetteer recall  (unlabelled names, later document) must not drop at all
  precision                                            may drop by at most 2 points

    .venv/bin/python -m eval.gate             # exit 1 on any regression
    .venv/bin/python -m eval.gate --update    # accept the current numbers as the new baseline

Run `pnpm eval:redaction` first (it generates both sets and scores them).
Only update the baseline for a change that improves things or is a
deliberate, documented trade-off.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .generate import OUT

BASELINE = Path(__file__).parent / "baseline.json"
SETS = {"tuning": OUT, "holdout": OUT / "holdout"}
PRECISION_SLACK = 2.0  # percentage points


def _pct(pair: list[int] | None) -> float | None:
    if not pair or pair[1] == 0:
        return None
    return 100.0 * pair[0] / pair[1]


def current() -> dict:
    out = {}
    for name, root in SETS.items():
        results = json.loads((root / "results.json").read_text())
        if "summary" not in results:
            sys.exit(f"{root}/results.json has no summary; re-run eval.run")
        out[name] = {"seed": results["manifest_seed"], "summary": results["summary"]}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true")
    args = ap.parse_args()

    now = current()
    if args.update:
        BASELINE.write_text(json.dumps(now, indent=1, sort_keys=True) + "\n")
        print(f"baseline updated: {BASELINE}")
        return

    base = json.loads(BASELINE.read_text())
    failures = []
    print("| Set | Language/form | Recall | Partial recall | Gazetteer recall | Precision |")
    print("|---|---|---|---|---|---|")
    for name, cur in now.items():
        ref = base[name]
        if cur["seed"] != ref["seed"]:
            failures.append(f"{name}: test set seed {cur['seed']} != baseline {ref['seed']}")
        for key, c in cur["summary"].items():
            r = ref["summary"][key]
            cells = []
            for metric, slack in (("recall", 0.0), ("partial_recall", 0.0), ("gazetteer_recall", 0.0), ("precision", PRECISION_SLACK)):
                cv, rv = _pct(c.get(metric)), _pct(r.get(metric))
                if cv is None or rv is None:
                    cells.append("—")
                    continue
                ok = cv >= rv - slack - 1e-9
                cells.append(f"{rv:.1f} → {cv:.1f}{'' if ok else ' ✗'}")
                if not ok:
                    failures.append(f"{name} {key} {metric}: {rv:.1f}% → {cv:.1f}% (allowed drop {slack:g})")
            print(f"| {name} | {key} | " + " | ".join(cells) + " |")
    if failures:
        print("\nFAIL:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print("\nPASS: no recall drop, precision within 2 points")


if __name__ == "__main__":
    main()
