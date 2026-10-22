"""
Real NER-based redaction engine for DigiVault.
Supports English + Hindi (Devanagari) + Kannada documents. Kannada OCR
needs the tesseract-ocr-kan language pack; without it pages are OCR'd as
eng+hin and only script-independent patterns (digits, Latin) match.
"""

from __future__ import annotations
import base64
import io
import logging
import math
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Optional

from .verhoeff import is_plausible_aadhaar

logger = logging.getLogger(__name__)

_spacy_nlp = None
_spacy_lock = threading.Lock()
_tesseract_available: Optional[bool] = None
_ocr_lang_cache: Optional[str] = None

# Requested only if installed, so a missing optional pack (kan) degrades
# to the old eng+hin behaviour instead of failing every page.
_OCR_LANG_PREFERENCE = ("eng", "hin", "kan")

# Pages are OCR'd concurrently: tesseract runs as a subprocess, so threads
# overlap real work. Sequential OCR of a multi-page upload can exceed the
# web app's 15s ai-service timeout, which drops every suggestion.
_MAX_OCR_WORKERS = min(4, os.cpu_count() or 1)

def _get_nlp():
    global _spacy_nlp
    with _spacy_lock:
        if _spacy_nlp is None:
            import spacy
            try:
                _spacy_nlp = spacy.load("en_core_web_sm")
            except OSError:
                from spacy.cli import download
                download("en_core_web_sm")
                _spacy_nlp = spacy.load("en_core_web_sm")
    return _spacy_nlp

def _ocr_lang() -> str:
    global _ocr_lang_cache
    if _ocr_lang_cache is None:
        import pytesseract
        try:
            installed = set(pytesseract.get_languages(config=""))
        except Exception:
            installed = {"eng", "hin"}
        langs = [lang for lang in _OCR_LANG_PREFERENCE if lang in installed] or ["eng"]
        missing = [lang for lang in _OCR_LANG_PREFERENCE if lang not in installed]
        if missing:
            logger.warning("tesseract language packs missing: %s (OCR uses %s)", missing, "+".join(langs))
        _ocr_lang_cache = "+".join(langs)
    return _ocr_lang_cache

def _tesseract_ok() -> bool:
    global _tesseract_available
    if _tesseract_available is None:
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            _tesseract_available = True
        except Exception:
            _tesseract_available = False
    return _tesseract_available

# Name captures are case-sensitive inside otherwise case-insensitive
# patterns, so a capture stops at the first lower-case word after the name.
_NAME_EN = r"((?-i:[A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+){0,3}))"
# Devanagari and Kannada names; U+200C is the zero-width non-joiner Tesseract
# puts after a word-final virama (ಮಹೇಶ್‌), which would otherwise end the name.
_NAME_HI = r"([ऀ-ॿ\u200c]+(?:[ \t]+[ऀ-ॿ\u200c]+){0,2})"
_NAME_KN = r"([ಀ-೿\u200c]+(?:[ \t]+[ಀ-೿\u200c]+){0,2})"

EN_PATTERNS = [
    # Mobile: 10 digits from 6-9, optionally +91/0 and split 5+5 ("98765 43210").
    ("phone", r"(?<!\d)(?:\+91[\s\-]?|0)?[6-9]\d{4}[\s\-]?\d{5}(?!\d)", 0.97),
    ("phone", r"(?:\+91|0)[-\s]?\d{2,5}[-\s]?\d{6,8}", 0.95),
    ("aadhaar", r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b", 0.88),
    ("address", r"\b[1-9]\d{5}\b", 0.72),
    ("case_number", r"\bFIR\s*No\.?\s*\d+[\s/]\d{4}\b", 0.99),
    ("case_number", r"\bCase\s*No\.?\s*[\w/\-]+", 0.91),
    ("case_number", r"\bCr\.?\s*No\.?\s*\d+[\s/]\d{4}\b", 0.95),
    ("email", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", 0.99),
    ("dob", r"\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b", 0.65),
    ("age", r"\baged?\s*:?\s*\d{1,3}\s*(?:years?|yrs?)?\b", 0.82),
    ("vehicle_reg", r"\b[A-Z]{2}[\s\-]?\d{2}[\s\-]?[A-Z]{1,3}[\s\-]?\d{4}\b", 0.90),
    ("victim_name", r"(?:S/[Oo]|D/[Oo]|W/[Oo]|son of|daughter of|wife of)\s+" + _NAME_EN, 0.93),
    ("victim_name",
     r"(?:Complainant|Victim|Accused|Suspect|Witness|Informant)(?:'s)?(?:\s+name)?\s*:\s*" + _NAME_EN, 0.91),
    ("victim_name",
     r"Name\s+of\s+(?:the\s+)?(?:complainant|victim|accused|suspect|witness|informant)\s*:\s*" + _NAME_EN, 0.91),
    ("victim_name", r"(?:Father|Mother|Husband|Wife|Guardian)(?:'s)?\s+name\s*:\s*" + _NAME_EN, 0.91),
    # Unlabelled narrative mentions: "the complainant Sunita Devi stated".
    ("victim_name", r"\b(?:complainant|victim|accused|suspect|witness|informant)\s+" + _NAME_EN, 0.85),
    ("pan", r"\b[A-Z]{5}\d{4}[A-Z]\b", 0.96),
    ("passport", r"\b[A-Z]\d{7}\b", 0.85),
    ("address",
     r"(?:Address|address|residing at|r/o|R/O|Police Station|P\.S\.)\s*:?\s*([^\n]+)",
     0.80),
]

HI_PATTERNS = [
    ("phone", r"(?:मोबाइल|दूरभाष|फ़ोन|फोन)\s*:?\s*([6-9]\d{9})", 0.97),
    ("aadhaar", r"(?:आधार(?:\s*संख्या)?)\s*:?\s*(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})", 0.95),
    ("age", r"(?:आयु|उम्र)\s*:?\s*\d{1,3}\s*(?:वर्ष|साल)?", 0.88),
    # "का नाम" (name of) may sit between the role and the colon; ड़ is matched
    # precomposed (U+095C) or as ड + nukta, as OCR emits either.
    ("victim_name",
     r"(?:पी(?:ड़|ड़|ड)िता?|शिकायतकर्ता|सूचनाकर्ता|आरोपी|अभियुक्त|साक्षी|गवाह)(?:\s*(?:का|की|के)\s*नाम)?\s*:?\s*" + _NAME_HI,
     0.91),
    ("victim_name",
     r"(?:पुत्री|पुत्र|पिता|माता|पत्नी|पति)(?:\s*(?:का|की|के)\s*नाम)?\s*:?\s*(?:श्रीमती|श्री|कु\.?)?\s*" + _NAME_HI,
     0.89),
    ("address", r"(?:निवासी|निवास|पता|मकान\s*नं\.?|ग्राम|जिला|थाना)\s*:?\s*([ऀ-ॿ\w\s,\-\.]+?)(?:\n|$)", 0.78),
    ("case_number", r"(?:मु\.?अ\.?सं\.?|प्रकरण\s*क्र\.?|अपराध\s*क्रमांक)\s*:?\s*([\d/\-]+)", 0.97),
    ("dob", r"(?:जन्म\s*तिथि|दिनांक)\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", 0.90),
    ("phone", r"[०-९]{10}", 0.85),
]

# Kannada block is U+0C80–U+0CFF; explicit ranges because re's \w skips
# Kannada vowel signs. Kannada digits (೦-೯) are matched separately below.
# Tesseract emits a zero-width non-joiner after a word-final virama
# (ಮೊಬೈಲ್‌, ಆಧಾರ್‌), so keywords ending in ್ allow one.
KN_PATTERNS = [
    ("phone", r"(?:ಮೊಬೈಲ್|ದೂರವಾಣಿ|ಫೋನ್)\u200c?\s*(?:ಸಂಖ್ಯೆ)?\s*:?\s*([6-9]\d{9})", 0.97),
    ("aadhaar", r"ಆಧಾರ್\u200c?\s*(?:ಸಂಖ್ಯೆ)?\s*:?\s*(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})", 0.95),
    ("age", r"ವಯಸ್ಸು\s*:?\s*\d{1,3}\s*(?:ವರ್ಷ)?", 0.88),
    # Genitive forms ("ಆರೋಪಿಯ ಹೆಸರು:" = accused's name) as well as the bare role.
    ("victim_name",
     r"(?:ಸಂತ್ರಸ್ತೆ(?:ಯ)?|ದೂರುದಾರ(?:ರು|ರ)?|ಆರೋಪಿ(?:ಯ)?|ಸಾಕ್ಷಿ(?:ಯ)?)\u200c?(?:\s*ಹೆಸರು)?\s*:?\s*" + _NAME_KN,
     0.91),
    ("victim_name",
     r"(?:ತಂದೆ(?:ಯ)?|ತಾಯಿ(?:ಯ)?|ಪತಿ(?:ಯ)?|ಪತ್ನಿ(?:ಯ)?|ಮಗಳು|ಮಗ)(?:\s*ಹೆಸರು)?\s*:?\s*(?:ಶ್ರೀಮತಿ|ಶ್ರೀ|ಕು\.?)?\s*" + _NAME_KN,
     0.89),
    # Up to 9 address-like tokens; a ':' ends it, so the next "label: value"
    # on the same OCR line (e.g. ದಿನಾಂಕ: …) keeps its own entity type.
    ("address", r"(?:ವಿಳಾಸ|ವಾಸ|ಗ್ರಾಮ|ಜಿಲ್ಲೆ|ಠಾಣೆ)\s*:?\s*([ಀ-೿\u200c\d\-/#.,()]+(?:[ \t]+[ಀ-೿\u200c\d\-/#.,()]+){0,8})", 0.78),
    ("case_number", r"(?:ಪ್ರಕರಣ\s*ಸಂಖ್ಯೆ|ಅಪರಾಧ\s*ಸಂಖ್ಯೆ)\s*:?\s*([\d/\-]+)", 0.97),
    ("dob", r"(?:ಜನ್ಮ\s*ದಿನಾಂಕ|ದಿನಾಂಕ)\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", 0.90),
    ("phone", r"[೦-೯]{10}", 0.85),
    ("aadhaar", r"[೦-೯]{4}[\s\-]?[೦-೯]{4}[\s\-]?[೦-೯]{4}", 0.85),
]

ALL_PATTERNS = EN_PATTERNS + HI_PATTERNS + KN_PATTERNS
_compiled_patterns = [
    (etype, re.compile(pat, re.IGNORECASE | re.UNICODE), conf)
    for etype, pat, conf in ALL_PATTERNS
]

SPACY_LABEL_MAP = {
    "PERSON": "victim_name",
    "GPE": "address",
    "LOC": "address",
    "ORG": "address",
    "FAC": "address",
    "CARDINAL": None,
    "DATE": "dob",
}

@dataclass
class WordBox:
    text: str
    left: int
    top: int
    width: int
    height: int
    conf: float

def _flatten_background(image):
    """Grey page divided by a heavily blurred copy of itself: stains, yellowed
    paper and uneven lighting go to white, ink stays dark. Without it
    Tesseract drops whole blocks of lines under a coffee stain (Phase 6).
    Only the OCR input changes; no pixel moves, so word boxes still map to
    the hashed tiles."""
    import numpy as np
    from PIL import ImageFilter

    gray = image.convert("L")
    background = gray.filter(ImageFilter.GaussianBlur(radius=max(gray.size) // 60 or 1))
    g = np.asarray(gray, dtype=np.float32)
    b = np.maximum(np.asarray(background, dtype=np.float32), 1.0)
    from PIL import Image
    return Image.fromarray(np.clip(g / b * 255.0, 0, 255).astype(np.uint8))

def _ocr_page(png_bytes: bytes) -> tuple[str, list[WordBox]]:
    if not _tesseract_ok():
        return "", []
    from PIL import Image
    import pytesseract

    image = _flatten_background(Image.open(io.BytesIO(png_bytes)))
    data = pytesseract.image_to_data(
        image, lang=_ocr_lang(),
        output_type=pytesseract.Output.DICT,
        config="--psm 3 --oem 3",
    )

    boxes: list[WordBox] = []
    lines: dict[tuple, list[str]] = {}   # (block, par, line) → words

    for i, word in enumerate(data["text"]):
        word = word.strip()
        if not word:
            continue
        conf = float(data["conf"][i])
        if conf < 0:
            continue
        boxes.append(WordBox(
            text=word,
            left=data["left"][i], top=data["top"][i],
            width=data["width"][i], height=data["height"][i],
            conf=conf / 100.0,
        ))
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)

    full_text = "\n".join(" ".join(words) for words in lines.values())
    return full_text, boxes

def _span_to_grids(
    char_start: int,
    char_end: int,
    full_text: str,
    word_boxes: list[WordBox],
    page_width: int,
    page_height: int,
    grid_size: int,
) -> list[tuple[int, int]]:
    results = []
    seen: set[tuple[int, int]] = set()
    # Same split as the hashing code (crypto-core tiles.ts): ceil-sized tiles,
    # the last row/column narrower. A proportional x/width*grid drifts up to
    # a whole tile off toward the right and bottom edges.
    tile_w = max(1, math.ceil(page_width / grid_size))
    tile_h = max(1, math.ceil(page_height / grid_size))
    offset = 0
    for box in word_boxes:
        word_end = offset + len(box.text)
        if offset < char_end and word_end > char_start:
            # Every tile the box overlaps — left edge to right edge, top to bottom
            col_lo = box.left // tile_w
            col_hi = (box.left + max(box.width, 1) - 1) // tile_w
            row_lo = box.top // tile_h
            row_hi = (box.top + max(box.height, 1) - 1) // tile_h
            col_lo = max(0, min(col_lo, grid_size - 1))
            col_hi = max(0, min(col_hi, grid_size - 1))
            row_lo = max(0, min(row_lo, grid_size - 1))
            row_hi = max(0, min(row_hi, grid_size - 1))
            for r in range(row_lo, row_hi + 1):
                for c in range(col_lo, col_hi + 1):
                    if (r, c) not in seen:
                        seen.add((r, c))
                        results.append((r, c))
        offset = word_end + 1
    return results or [_text_to_grid_fallback(char_start, full_text, grid_size)]

def _text_to_grid_fallback(match_start, full_text, grid_size):
    ratio = match_start / max(len(full_text), 1)
    return min(int(ratio * grid_size), grid_size - 1), grid_size // 2

@dataclass
class Detection:
    entity_type: str
    confidence: float
    source: str
    row: int
    col: int

def _run_spacy(text, word_boxes, page_width, page_height, grid_size, source):
    if not text.strip():
        return []
    nlp = _get_nlp()
    doc = nlp(text[:100_000])
    detections = []
    for ent in doc.ents:
        etype = SPACY_LABEL_MAP.get(ent.label_)
        if etype is None:
            continue
        scores = [t.prob for t in ent if t.prob != 0.0]
        raw_conf = (sum(scores) / len(scores)) if scores else 0.70
        confidence = max(0.55, min(0.95, abs(raw_conf) / 15.0 + 0.60))
        for grid in _span_to_grids(ent.start_char, ent.end_char, text, word_boxes, page_width, page_height, grid_size):
            detections.append(Detection(entity_type=etype, confidence=round(confidence, 3), source=source, row=grid[0], col=grid[1]))
    return detections

# Aadhaar matches are scored by checksum (ADR-033): a valid one is near
# certain; an invalid one is kept, lower, since OCR may have misread a digit.
AADHAAR_VALID_CONF = 0.98
AADHAAR_INVALID_CONF = 0.60

def _run_regex(text, word_boxes, page_width, page_height, grid_size, source):
    if not text.strip():
        return []
    detections = []
    for etype, pattern, base_conf in _compiled_patterns:
        for m in pattern.finditer(text):
            start = m.start(1) if m.lastindex else m.start()
            end = m.end(1) if m.lastindex else m.end()
            conf = base_conf
            if etype == "aadhaar":
                conf = AADHAAR_VALID_CONF if is_plausible_aadhaar(text[start:end]) else AADHAAR_INVALID_CONF
            for grid in _span_to_grids(start, end, text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type=etype, confidence=round(conf, 3), source=source, row=grid[0], col=grid[1]))
    return detections

PROPAGATED_NAME_CONF = 0.85

def _propagate_names(text, word_boxes, page_width, page_height, grid_size, source):
    """A name found once by a labelled pattern is flagged wherever else it
    appears on the page: FIR narratives repeat the victim's name with no
    label in front of it (Phase 6 measurement)."""
    if not text.strip():
        return []
    names: set[tuple[str, ...]] = set()
    for etype, pattern, _ in _compiled_patterns:
        if etype != "victim_name":
            continue
        for m in pattern.finditer(text):
            if not m.lastindex:
                continue
            tokens = tuple(t.strip("‌") for t in m.group(1).split()[:2])
            if len(tokens) == 2 or (tokens and len(tokens[0]) >= 4):
                names.add(tokens)
    detections = []
    for tokens in names:
        needle = re.compile(r"‌?\s+".join(re.escape(t) for t in tokens) + "‌?")
        for m in needle.finditer(text):
            for grid in _span_to_grids(m.start(), m.end(), text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type="victim_name", confidence=PROPAGATED_NAME_CONF, source=source, row=grid[0], col=grid[1]))
    return detections

# Priority order — more specific wins over generic
_ETYPE_PRIORITY = {
    "aadhaar": 10, "pan": 10, "passport": 10, "case_number": 10,
    "phone": 9, "email": 9, "vehicle_reg": 9,
    "victim_name": 8,
    "age": 7,
    "address": 6,   # PIN code should beat a spaCy DATE guess
    "dob": 5,
}

def _deduplicate(detections: list[Detection]) -> list[Detection]:
    best: dict[tuple[int, int], Detection] = {}
    for d in detections:
        key = (d.row, d.col)
        if key not in best:
            best[key] = d
        else:
            existing = best[key]
            d_pri = _ETYPE_PRIORITY.get(d.entity_type, 0)
            e_pri = _ETYPE_PRIORITY.get(existing.entity_type, 0)
            if d_pri > e_pri or (d_pri == e_pri and d.confidence > existing.confidence):
                best[key] = d
    return list(best.values())

from .schemas import PageInput, Suggestion

def _page_suggestions(grid_size: int, page: PageInput) -> list[Suggestion]:
    try:
        png_bytes = base64.b64decode(page.png_base64)
        full_text, word_boxes = _ocr_page(png_bytes)
        source = "text_layer"   # tesseract OCR result, reusing allowed schema value
        spacy_hits = _run_spacy(full_text, word_boxes, page.width_px, page.height_px, grid_size, source)
        regex_hits = _run_regex(full_text, word_boxes, page.width_px, page.height_px, grid_size, "text_layer")
        name_hits = _propagate_names(full_text, word_boxes, page.width_px, page.height_px, grid_size, "text_layer")
        return [
            Suggestion(page_index=page.page_index, row=d.row, col=d.col, entity_type=d.entity_type, confidence_score=d.confidence, source=d.source)
            for d in _deduplicate(spacy_hits + regex_hits + name_hits)
        ]
    except Exception as exc:
        logger.error("page %d failed: %s", page.page_index, exc, exc_info=True)
        return []

def generate_suggestions(document_version_id: str, grid_size: int, pages: list[PageInput]) -> list[Suggestion]:
    if not pages:
        return []
    with ThreadPoolExecutor(max_workers=min(len(pages), _MAX_OCR_WORKERS)) as pool:
        per_page = list(pool.map(lambda page: _page_suggestions(grid_size, page), pages))
    return [s for page_suggestions in per_page for s in page_suggestions]
