"""
Builds the redaction recall test set (docs/07 Phase 6): synthetic one-page
FIRs in English, Hindi and Kannada, each in two forms:

  clean    rendered straight to PNG, as the browser renders a native PDF
  scanned  the same page rotated, blurred, unevenly lit, noised, coffee
           stained and passed through JPEG, then saved as PNG

The JPEG step only imitates a phone or scanner photo before upload; what is
saved and evaluated is PNG, as on the evidence path (CLAUDE.md rule 1).

Every identifier is drawn as its own run, so its exact ink box is known.
Gold labels are the 20x20 tiles those boxes touch, using the same tile
split as the hashing code (tile size = ceil(page / grid)). Dates, FIR
numbers, station names and ages are "ignore" spans: flagging them is
neither a hit nor a false positive.

    .venv/bin/python -m eval.generate [--docs-per-language 10] [--seed 2026]

Writes eval/out/pages/*.png and eval/out/manifest.json (gitignored).
Held-out set: --seed 77 --font serif --out eval/out/holdout
"""

from __future__ import annotations

import argparse
import io
import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.verhoeff import verhoeff_check_digit

from .fixtures import ADDRESSES, FOOTER, FOLLOWUP, LABELS, NAMES, NARRATIVE, STATIONS, TITLE

OUT = Path(__file__).parent / "out"
GRID = 20
PAGE_W, PAGE_H = 1190, 1684  # A4 at the web app's PDF.js scale 2.0
MARGIN = 80
BODY_PX, TITLE_PX, FOOTER_PX = 24, 34, 16
LINE_GAP = 1.85

FONT_DIR = Path("/usr/share/fonts/truetype/noto")
FONT_FAMILIES = {
    "sans": {"latin": "NotoSans-Regular.ttf", "deva": "NotoSansDevanagari-Regular.ttf", "knda": "NotoSansKannada-Regular.ttf"},
    # Held-out check: a typeface the engine was not tuned on.
    "serif": {"latin": "NotoSerif-Regular.ttf", "deva": "NotoSerifDevanagari-Regular.ttf", "knda": "NotoSerifKannada-Regular.ttf"},
}
FONTS = {k: FONT_DIR / v for k, v in FONT_FAMILIES["sans"].items()}
GOLD_TYPES = ("name", "phone", "aadhaar", "address")


def _script(ch: str) -> str:
    o = ord(ch)
    if 0x0900 <= o <= 0x097F:
        return "deva"
    if 0x0C80 <= o <= 0x0CFF:
        return "knda"
    return "latin"


@dataclass
class Span:
    text: str
    label: str | None = None  # one of GOLD_TYPES, "ignore", or None


@dataclass
class Entity:
    type: str
    text: str
    boxes: list[tuple[float, float, float, float]] = field(default_factory=list)


# --- Synthetic values -------------------------------------------------------

def _phone(rng: random.Random) -> str:
    digits = str(rng.randint(6, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(9))
    style = rng.choice(["plain", "plain", "split", "country"])
    if style == "split":
        return f"{digits[:5]} {digits[5:]}"
    if style == "country":
        return f"+91 {digits[:5]} {digits[5:]}"
    return digits


def _aadhaar(rng: random.Random) -> str:
    body = str(rng.randint(2, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(10))
    n = body + verhoeff_check_digit(body)
    return f"{n[:4]} {n[4:8]} {n[8:]}"


def _address(lang: str, rng: random.Random) -> str:
    house, area, city, pin = rng.choice(ADDRESSES[lang])
    return f"{house}, {area}, {city} - {pin}"


def _fill(template: str, values: dict[str, tuple[str, str | None]]) -> list[Span]:
    spans: list[Span] = []
    rest = template
    while "{" in rest:
        before, _, after = rest.partition("{")
        key, _, rest = after.partition("}")
        if before:
            spans.append(Span(before))
        value, kind = values[key]
        spans.append(Span(value, kind))
    if rest:
        spans.append(Span(rest))
    return spans


def build_document(lang: str, rng: random.Random, number: int) -> tuple[list[list[Span]], dict]:
    L = {k: rng.choice(v) for k, v in LABELS[lang].items()}
    female, male = NAMES[lang]["female"], NAMES[lang]["male"]
    victim = rng.choice(female)
    relative, accused, witness = rng.sample(male, 3)
    station = rng.choice(STATIONS[lang])
    date = f"{rng.randint(1, 28):02d}/{rng.randint(1, 9):02d}/2026"
    age = str(rng.randint(14, 45))
    victim_phone, accused_phone = _phone(rng), _phone(rng)

    def field_line(label: str, value: str, kind: str | None) -> list[Span]:
        return [Span(label + " ", "label"), Span(value, kind)]

    lines = [
        [Span(TITLE[lang], "title")],
        [Span(L["fir"] + " ", "label"), Span(f"{number:04d}/2026", "ignore"), Span("    " + L["date"] + " ", "label"), Span(date, "ignore")],
        field_line(L["station"], station, "ignore"),
        [],
        field_line(L["complainant"], victim, "name"),
        field_line(L["relative"], relative, "name"),
        field_line(L["age"], age, "ignore"),
        field_line(L["phone"], victim_phone, "phone"),
        field_line(L["aadhaar"], _aadhaar(rng), "aadhaar"),
        field_line(L["address"], _address(lang, rng), "address"),
        field_line(L["accused"], accused, "name"),
        field_line(L["witness"], witness, "name"),
        [],
    ]
    values = {"victim": (victim, "name"), "accused": (accused, "name"), "phone": (accused_phone, "phone"),
              "place": (station, None), "date": (date, "ignore")}
    for template in NARRATIVE[lang]:
        lines.append(_fill(template, values))
    return lines, {"victim": victim, "accused": accused, "witness": witness, "date": date}


def build_followup(lang: str, people: dict) -> list[list[Span]]:
    """A later statement in the same case: the same people, never labelled."""
    values = {"victim": (people["victim"], "name"), "accused": (people["accused"], "name"),
              "witness": (people["witness"], "name"), "date": (people["date"], "ignore")}
    return [[Span(TITLE[lang], "title")], []] + [_fill(t, values) for t in FOLLOWUP[lang]]


# --- Rendering --------------------------------------------------------------

_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _font(script: str, px: int) -> ImageFont.FreeTypeFont:
    key = (script, px)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(FONTS[script]), px, layout_engine=ImageFont.Layout.RAQM)
    return _font_cache[key]


def _runs(text: str) -> list[tuple[str, str]]:
    """Splits text into same-script runs; spaces and punctuation join the run they follow."""
    runs: list[list[str]] = []
    for ch in text:
        s = _script(ch)
        if runs and (s == "latin" and not ch.isalnum() or s == runs[-1][0]):
            runs[-1][1] += ch
        else:
            runs.append([s, ch])
    return [(s, t) for s, t in runs]


def _word_ink_boxes(x: float, y: float, text: str, font) -> list[tuple[int, int, int, int]]:
    """Ink box of each space-separated word, from the pixels actually drawn.
    Font metric boxes include side bearings and run a few pixels past the
    ink, and one box round a whole name claims empty tiles under a descender."""
    boxes = []
    pos = 0
    for word in text.split(" "):
        if any(ch.isalnum() for ch in word):  # a lone "-" or "," reveals nothing
            mask = Image.new("L", (PAGE_W, PAGE_H), 0)
            ImageDraw.Draw(mask).text((x + font.getlength(text[:pos]), y), word, font=font, fill=255)
            bbox = mask.point(lambda v: 255 if v >= 64 else 0).getbbox()  # ignore faint antialiasing
            if bbox:
                boxes.append(bbox)
        pos += len(word) + 1
    return boxes


FORM_KINDS = ("title", "label", "footer")  # printed form text: never an identifier, never worth masking


def render(lines: list[list[Span]]) -> tuple[Image.Image, list[Entity], list[Entity], list[Entity]]:
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)
    gold: list[Entity] = []
    ignore: list[Entity] = []
    form: list[Entity] = []
    y = MARGIN
    for i, line in enumerate(lines):
        px = TITLE_PX if i == 0 else BODY_PX
        x = MARGIN if i else (PAGE_W - sum(_font(s, px).getlength(t) for sp in line for s, t in _runs(sp.text))) / 2
        for span in line:
            boxes = []
            for script, text in _runs(span.text):
                font = _font(script, px)
                if span.label:
                    boxes += _word_ink_boxes(x, y, text, font)
                draw.text((x, y), text, font=font, fill=(20, 20, 20))
                x += font.getlength(text)
            if span.label and boxes:
                bucket = gold if span.label in GOLD_TYPES else form if span.label in FORM_KINDS else ignore
                bucket.append(Entity(span.label, span.text, boxes))
        if x > PAGE_W - MARGIN / 2:
            raise ValueError(f"line {i} overflows the page ({x:.0f}px): {''.join(s.text for s in line)}")
        y += px * LINE_GAP if line else BODY_PX
    form.append(Entity("footer", FOOTER, _word_ink_boxes(MARGIN, PAGE_H - MARGIN, FOOTER, _font("latin", FOOTER_PX))))
    draw.text((MARGIN, PAGE_H - MARGIN), FOOTER, font=_font("latin", FOOTER_PX), fill=(90, 90, 90))
    return img, gold, ignore, form


# --- Scan simulation --------------------------------------------------------

def _rotate_box(box, angle_deg, cx, cy):
    t = math.radians(angle_deg)
    pts = [(box[0], box[1]), (box[2], box[1]), (box[0], box[3]), (box[2], box[3])]
    out = [(cx + (x - cx) * math.cos(t) + (y - cy) * math.sin(t),
            cy - (x - cx) * math.sin(t) + (y - cy) * math.cos(t)) for x, y in pts]
    return (min(p[0] for p in out), min(p[1] for p in out), max(p[0] for p in out), max(p[1] for p in out))


def scan(img: Image.Image, entities: list[Entity], rng: random.Random) -> tuple[Image.Image, list[Entity], dict]:
    angle = rng.choice([-1, 1]) * rng.uniform(0.8, 2.5)
    out = img.rotate(angle, resample=Image.BICUBIC, fillcolor="white")
    out = out.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 0.9)))

    a = np.asarray(out, dtype=np.float32)
    h, w = a.shape[:2]
    nprng = np.random.default_rng(rng.randrange(2**32))
    # Yellowed paper and uneven lighting from one side.
    a = a * np.array([0.96, 0.93, 0.85]) + 6
    a *= np.linspace(rng.uniform(0.85, 0.95), 1.0, w)[None, :, None]
    # Coffee stain: a filled ellipse with a darker rim, multiplied in.
    sx, sy = rng.uniform(0.15, 0.85) * w, rng.uniform(0.2, 0.8) * h
    rx, ry = rng.uniform(80, 160), rng.uniform(70, 140)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - sx) / rx) ** 2 + ((yy - sy) / ry) ** 2)
    stain = np.where(d < 1, 0.18, 0) + np.where(np.abs(d - 1) < 0.06, 0.22, 0)
    a *= 1 - stain[..., None] * np.array([0.35, 0.6, 0.9])
    a += nprng.normal(0, 9, a.shape)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    quality = rng.randint(40, 60)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=quality)
    out = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")

    moved = [Entity(e.type, e.text, [_rotate_box(b, angle, PAGE_W / 2, PAGE_H / 2) for b in e.boxes]) for e in entities]
    return out, moved, {"angle_deg": round(angle, 2), "jpeg_quality": quality, "stain_center": [round(sx), round(sy)]}


# --- Gold tiles ---------------------------------------------------------------

def tiles_for(box, width: int, height: int, grid: int = GRID) -> list[int]:
    tw, th = math.ceil(width / grid), math.ceil(height / grid)
    c0, c1 = int(max(box[0], 0) // tw), int((min(box[2], width) - 1) // tw)
    r0, r1 = int(max(box[1], 0) // th), int((min(box[3], height) - 1) // th)
    return sorted({r * grid + c for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)})


def _entity_json(e: Entity) -> dict:
    return {"type": e.type, "text": e.text, "boxes": [[round(v, 1) for v in b] for b in e.boxes],
            "tiles": sorted({t for b in e.boxes for t in tiles_for(b, PAGE_W, PAGE_H)})}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs-per-language", type=int, default=10)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--font", choices=sorted(FONT_FAMILIES), default="sans")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    FONTS.update({k: FONT_DIR / v for k, v in FONT_FAMILIES[args.font].items()})
    out_dir = args.out

    rng = random.Random(args.seed)
    # Follow-up pages draw from their own stream, so adding them left the
    # FIR pages (and the numbers published for them) unchanged.
    followup_rng = random.Random(args.seed + 1)
    (out_dir / "pages").mkdir(parents=True, exist_ok=True)
    pages, followups = [], []

    def save(kind: str, doc_id: str, lang: str, form: str, image, g, ig, fm, extra, into: list) -> None:
        path = out_dir / "pages" / f"{doc_id}-{kind}{form}.png"
        image.save(path, "PNG")
        into.append({"doc_id": doc_id, "lang": lang, "form": form, "path": str(path.relative_to(out_dir)),
                     "width": PAGE_W, "height": PAGE_H, "grid": GRID, **extra,
                     "entities": [_entity_json(e) for e in g], "ignore": [_entity_json(e) for e in ig],
                     "form_text": [_entity_json(e) for e in fm]})

    for lang in ("en", "hi", "kn"):
        for n in range(1, args.docs_per_language + 1):
            doc_id = f"{lang}-{n:02d}"
            lines, people = build_document(lang, rng, n)
            for kind, page_lines, page_rng, into in (("", lines, rng, pages), ("followup-", build_followup(lang, people), followup_rng, followups)):
                img, gold, ignore, form = render(page_lines)
                scanned, s_all, meta = scan(img, gold + ignore + form, page_rng)
                s_gold, s_ignore, s_form = s_all[: len(gold)], s_all[len(gold):len(gold) + len(ignore)], s_all[len(gold) + len(ignore):]
                save(kind, doc_id, lang, "clean", img, gold, ignore, form, {}, into)
                save(kind, doc_id, lang, "scanned", scanned, s_gold, s_ignore, s_form, meta, into)
    manifest = {"seed": args.seed, "font": args.font, "docs_per_language": args.docs_per_language,
                "pages": pages, "followups": followups}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"wrote {len(pages)} pages ({args.docs_per_language} documents x 3 languages x 2 forms) to {out_dir}")


if __name__ == "__main__":
    main()
