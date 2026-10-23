"""
The demo's "messy scan" (docs/05, docs/07 Phase 8): one synthetic English
FIR, degraded harder than the test set's scans — 3.2° skew, a fold crease, a
coffee stain over the text block, heavy noise, uneven light — and stored as a
JPEG inside an A4 PDF, the way phone scanner apps produce them. The browser
renders it to PNG on upload (CLAUDE.md rule 1 applies from there on).

Writes apps/web/public/sample-firs/messy-fir.pdf and messy-fir.gold.json
(identifier tiles, for measuring), and prints how much of it the engine
covers.

    .venv/bin/python -m eval.messy
"""

from __future__ import annotations

import base64
import io
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from app.real_suggestions import generate_suggestions
from app.schemas import PageInput

from .generate import GRID, PAGE_H, PAGE_W, _entity_json, _rotate_box, build_document, render

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "sample-firs"
ANGLE = 3.2
JPEG_QUALITY = 28


def degrade(img: Image.Image, entities, seed: int = 4242):
    rng = np.random.default_rng(seed)
    out = img.rotate(ANGLE, resample=Image.BICUBIC, fillcolor=(236, 230, 214)).filter(ImageFilter.GaussianBlur(1.0))
    a = np.asarray(out, dtype=np.float32)
    h, w = a.shape[:2]
    a = a * np.array([0.95, 0.91, 0.82]) + 4
    # Light from the top left, a shadow toward the bottom right.
    yy, xx = np.mgrid[0:h, 0:w]
    a *= (1.0 - 0.18 * (xx / w) * (yy / h))[..., None]
    # Coffee stain across the identifier block, with a darker rim.
    for (cx, cy, rx, ry, strength) in ((0.42 * w, 0.30 * h, 170, 120, 0.22), (0.75 * w, 0.62 * h, 90, 80, 0.15)):
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        stain = np.where(d < 1, strength, 0) + np.where(np.abs(d - 1) < 0.05, strength + 0.12, 0)
        a *= 1 - stain[..., None] * np.array([0.35, 0.6, 0.9])
    # A fold crease: a thin dark line with a lighter edge.
    y0 = int(0.47 * h)
    a[y0:y0 + 2] *= 0.72
    a[y0 + 2:y0 + 5] = np.minimum(a[y0 + 2:y0 + 5] * 1.06, 255)
    a += rng.normal(0, 14, a.shape)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=JPEG_QUALITY)
    jpeg = buf.getvalue()
    moved = [type(e)(e.type, e.text, [_rotate_box(b, ANGLE, PAGE_W / 2, PAGE_H / 2) for b in e.boxes]) for e in entities]
    return jpeg, moved


def main() -> None:
    lines, _people = build_document("en", random.Random(8), 1)
    img, gold, _ignore, _form = render(lines)
    jpeg, gold = degrade(img, gold)

    OUT.mkdir(parents=True, exist_ok=True)
    # A4 at 144 dpi: PDF.js at scale 2.0 renders it back at 1190 x 1684.
    Image.open(io.BytesIO(jpeg)).save(OUT / "messy-fir.pdf", "PDF", resolution=144.0)
    entities = [_entity_json(e) for e in gold]
    (OUT / "messy-fir.gold.json").write_text(json.dumps(
        {"note": "Synthetic, fictional. Tiles at 1190x1684, 20x20, for scripts that measure coverage.",
         "angle_deg": ANGLE, "jpeg_quality": JPEG_QUALITY, "entities": entities}, ensure_ascii=False, indent=1))

    # What the engine makes of it (on the JPEG as decoded; the app sees PDF.js's render of it).
    png = io.BytesIO()
    Image.open(io.BytesIO(jpeg)).convert("RGB").save(png, "PNG")
    req = PageInput(page_index=0, width_px=PAGE_W, height_px=PAGE_H, png_base64=base64.b64encode(png.getvalue()).decode())
    flagged = {s.row * GRID + s.col for s in generate_suggestions("messy", GRID, [req])}
    caught = [e for e in entities if set(e["tiles"]) <= flagged]
    partial = [e for e in entities if set(e["tiles"]) & flagged]
    print(f"wrote {OUT / 'messy-fir.pdf'} ({len(jpeg) // 1024} KB JPEG page)")
    print(f"identifiers fully covered {len(caught)}/{len(entities)}, at least partly {len(partial)}/{len(entities)}")
    for e in entities:
        if e not in caught:
            print(f"  not fully covered: {e['type']} {e['text']!r}, {len(set(e['tiles']) - flagged)} of {len(e['tiles'])} tiles missed")


if __name__ == "__main__":
    main()
