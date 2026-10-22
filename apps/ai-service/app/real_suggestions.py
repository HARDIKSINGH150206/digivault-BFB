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
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Optional

from .form_text import ADDRESS_CONTEXT, line_spans_of, ner_input
from .gazetteer import name_hash
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
    # OCR also splits a number at random ("84613 51 619"): one space or dash
    # allowed between any two digits.
    ("phone", r"(?<!\d)(?:\+91[\s\-]?|0)?[6-9](?:[ \-]?\d){9}(?!\d)", 0.97),
    ("phone", r"(?:\+91|0)[-\s]?\d{2,5}[-\s]?\d{6,8}", 0.95),
    ("aadhaar", r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b", 0.88),
    ("address", r"\b[1-9]\d{5}\b", 0.72),
    # Number and age patterns capture the value only: the printed label
    # ("FIR No.", "Age:") is form text, not something to mask.
    ("case_number", r"\bFIR\s*No\.?\s*(\d+[\s/]\d{4})\b", 0.99),
    ("case_number", r"\bCase\s*No\.?\s*([\w/\-]+)", 0.91),
    ("case_number", r"\bCr\.?\s*No\.?\s*(\d+[\s/]\d{4})\b", 0.95),
    ("email", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", 0.99),
    ("dob", r"\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b", 0.65),
    ("age", r"\baged?\s*:?\s*(\d{1,3}\s*(?:years?|yrs?)?)\b", 0.82),
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
     0.92),  # a labelled address has context: green (Phase 6 precision)
]

HI_PATTERNS = [
    ("phone", r"(?:मोबाइल|दूरभाष|फ़ोन|फोन)\s*:?\s*([6-9]\d{9})", 0.97),
    ("aadhaar", r"(?:आधार(?:\s*संख्या)?)\s*:?\s*(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})", 0.95),
    ("age", r"(?:आयु|उम्र)\s*:?\s*(\d{1,3}\s*(?:वर्ष|साल)?)", 0.88),
    # "का नाम" (name of) may sit between the role and the colon; ड़ is matched
    # precomposed (U+095C) or as ड + nukta, as OCR emits either.
    ("victim_name",
     r"(?:पी(?:ड़|ड़|ड)िता?|शिकायतकर्ता|सूचनाकर्ता|आरोपी|अभियुक्त|साक्षी|गवाह)(?:\s*(?:का|की|के)\s*नाम)?\s*:?\s*" + _NAME_HI,
     0.91),
    ("victim_name",
     r"(?:पुत्री|पुत्र|पिता|माता|पत्नी|पति)(?:\s*(?:का|की|के)\s*नाम)?\s*:?\s*(?:श्रीमती|श्री|कु\.?)?\s*" + _NAME_HI,
     0.89),
    # To the end of the line, whatever OCR put in it: scan noise can turn a
    # Devanagari sign into another script mid-address (मकान ತೆ. 14).
    ("address", r"(?:निवासी|निवास|पता|मकान\s*नं\.?|ग्राम|जिला|थाना)\s*:?\s*([^\n]+)", 0.92),
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
    ("age", r"ವಯಸ್ಸು\s*:?\s*(\d{1,3}\s*(?:ವರ್ಷ)?)", 0.88),
    # Genitive forms ("ಆರೋಪಿಯ ಹೆಸರು:" = accused's name) as well as the bare role.
    ("victim_name",
     # -ರಾದ: "ದೂರುದಾರರಾದ ಕಾವ್ಯ ರೆಡ್ಡಿ" (the complainant, Kavya Reddy).
     r"(?:ಸಂತ್ರಸ್ತೆ(?:ಯ)?|ದೂರುದಾರ(?:ರಾದ|ರು|ರ)?|ಆರೋಪಿ(?:ಯಾದ|ಯ)?|ಸಾಕ್ಷಿ(?:ಯಾದ|ಯ)?)\u200c?(?:\s*ಹೆಸರು)?\s*:?\s*" + _NAME_KN,
     0.91),
    ("victim_name",
     r"(?:ತಂದೆ(?:ಯ)?|ತಾಯಿ(?:ಯ)?|ಪತಿ(?:ಯ)?|ಪತ್ನಿ(?:ಯ)?|ಮಗಳು|ಮಗ)(?:\s*ಹೆಸರು)?\s*:?\s*(?:ಶ್ರೀಮತಿ|ಶ್ರೀ|ಕು\.?)?\s*" + _NAME_KN,
     0.89),
    # Up to 9 address-like tokens; a ':' ends it, so the next "label: value"
    # on the same OCR line (e.g. ದಿನಾಂಕ: …) keeps its own entity type.
    ("address", r"(?:ವಿಳಾಸ|ವಾಸ|ಗ್ರಾಮ|ಜಿಲ್ಲೆ|ಠಾಣೆ)\s*:?\s*([ಀ-೿\u200c\d\-/#.,()]+(?:[ \t]+[ಀ-೿\u200c\d\-/#.,()]+){0,8})", 0.92),
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

BOX_PAD = 0.15  # of the word's height, on every side
BOX_RIGHT_REACH = 0.8  # of the word's height, rightwards only, up to the next word

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
    for i, box in enumerate(word_boxes):
        word_end = offset + len(box.text)
        if offset < char_end and word_end > char_start:
            # Every tile the box overlaps, padded: Tesseract's box can stop
            # short of stacked Kannada/Devanagari signs and descenders, and a
            # sliver of a name in an unmasked tile still leaks (Phase 6).
            pad = max(2, int(box.height * BOX_PAD))
            # Its box can also end most of a digit short of the ink on the
            # right (13617 boxed to 348 px, inked to 366): widen rightwards by
            # up to 0.8 x the text height, never into the next word.
            right = box.left + max(box.width, 1) - 1 + max(pad, int(max(box.height, 1) * BOX_RIGHT_REACH))
            if word_end < len(full_text) and full_text[word_end] == " " and i + 1 < len(word_boxes):
                right = min(right, max(word_boxes[i + 1].left - 1, box.left + box.width - 1 + pad))
            col_lo = max(box.left - pad, 0) // tile_w
            col_hi = right // tile_w
            row_lo = (box.top - pad) // tile_h
            row_hi = (box.top + max(box.height, 1) - 1 + pad) // tile_h
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
    # Keyed hashes of the names this tile covers (ADR-034); only for names,
    # and only when the request carried a case key. A tile is taller than a
    # text line, so it can cover two names.
    name_hashes: tuple[str, ...] = ()

def _hash_name(case_key: Optional[bytes], etype: str, text: str) -> tuple[str, ...]:
    h = name_hash(case_key, text) if case_key and etype == "victim_name" else None
    return (h,) if h else ()

# An address from NER is green (>= 0.9) only with context on its line or the
# next: an address label, a PIN code, or another place. Otherwise amber.
NER_ADDRESS_NO_CONTEXT_MAX = 0.85
_PLACE_LABELS = {"GPE", "LOC"}

def _run_spacy(text, word_boxes, page_width, page_height, grid_size, source, case_key=None):
    if not text.strip():
        return []
    nlp = _get_nlp()
    # Form text (title, labels, header/footer) and non-Latin script are
    # blanked for the English model; offsets are unchanged (form_text.py).
    ner_text = ner_input(text, line_spans_of(text, word_boxes), page_height)[:100_000]
    doc = nlp(ner_text)
    line_of = lambda pos: text.count("\n", 0, pos)
    context_lines = {line_of(m.start()) for m in ADDRESS_CONTEXT.finditer(text)}
    places_per_line: dict[int, int] = {}
    for ent in doc.ents:
        if ent.label_ in _PLACE_LABELS:
            places_per_line[line_of(ent.start_char)] = places_per_line.get(line_of(ent.start_char), 0) + 1
    detections = []
    for ent in doc.ents:
        etype = SPACY_LABEL_MAP.get(ent.label_)
        if etype is None:
            continue
        scores = [t.prob for t in ent if t.prob != 0.0]
        raw_conf = (sum(scores) / len(scores)) if scores else 0.70
        confidence = max(0.55, min(0.95, abs(raw_conf) / 15.0 + 0.60))
        if etype == "address":
            line = line_of(ent.start_char)
            own = 1 if ent.label_ in _PLACE_LABELS else 0
            nearby = {line, line + 1} & context_lines or places_per_line.get(line, 0) - own > 0
            if not nearby:
                confidence = min(confidence, NER_ADDRESS_NO_CONTEXT_MAX)
        nh = _hash_name(case_key, etype, ent.text)
        # Only the entity's visible parts: spaCy can stretch an entity over a
        # run of blanked form text ("17/07/2026" + the blanked Kannada after
        # it), which must never be boxed through it.
        for part in re.finditer(r"\S+", ner_text[ent.start_char:ent.end_char]):
            start, end = ent.start_char + part.start(), ent.start_char + part.end()
            for grid in _span_to_grids(start, end, text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type=etype, confidence=round(confidence, 3), source=source, row=grid[0], col=grid[1], name_hashes=nh))
    return detections

# Aadhaar matches are scored by checksum (ADR-033): a valid one is near
# certain; an invalid one is kept, lower, since OCR may have misread a digit.
AADHAAR_VALID_CONF = 0.98
AADHAAR_INVALID_CONF = 0.60

def _run_regex(text, word_boxes, page_width, page_height, grid_size, source, case_key=None):
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
            nh = _hash_name(case_key, etype, text[start:end])
            for grid in _span_to_grids(start, end, text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type=etype, confidence=round(conf, 3), source=source, row=grid[0], col=grid[1], name_hashes=nh))
    return detections

PROPAGATED_NAME_CONF = 0.85

def _propagate_names(text, word_boxes, page_width, page_height, grid_size, source, case_key=None):
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
            words = m.group(1).split()
            # A fragment starting with a vowel sign is a word ending the
            # pattern cut, never a name's first word (ದೂರುದಾರರ|ಾದ).
            while words and unicodedata.category(words[0][0]) in ("Mn", "Mc"):
                words = words[1:]
            tokens = tuple(t.strip("\u200c") for t in words[:2])
            if len(tokens) == 2 or (tokens and len(tokens[0]) >= 4):
                names.add(tokens)
    detections = []
    for tokens in names:
        needle = re.compile(r"‌?\s+".join(re.escape(t) for t in tokens) + "‌?")
        nh = _hash_name(case_key, "victim_name", " ".join(tokens))
        for m in needle.finditer(text):
            for grid in _span_to_grids(m.start(), m.end(), text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type="victim_name", confidence=PROPAGATED_NAME_CONF, source=source, row=grid[0], col=grid[1], name_hashes=nh))
    return detections

GAZETTEER_CONF = 0.95

def _match_gazetteer(text, word_boxes, page_width, page_height, grid_size, case_key, known):
    """Flags every one- and two-word run whose keyed hash is in the case
    gazetteer: names an officer already confirmed in another document of the
    case, wherever and however they appear here (ADR-034)."""
    if not case_key or not known or not word_boxes:
        return []
    starts, offset = [], 0
    for box in word_boxes:  # same offsets _span_to_grids assumes
        starts.append(offset)
        offset += len(box.text) + 1
    detections = []
    for i in range(len(word_boxes)):
        for n in (2, 1):
            if i + n > len(word_boxes):
                continue
            words = " ".join(b.text for b in word_boxes[i:i + n])
            nh = name_hash(case_key, words)
            if nh in known:
                end = starts[i + n - 1] + len(word_boxes[i + n - 1].text)
                for grid in _span_to_grids(starts[i], end, text, word_boxes, page_width, page_height, grid_size):
                    detections.append(Detection(entity_type="victim_name", confidence=GAZETTEER_CONF, source="gazetteer", row=grid[0], col=grid[1], name_hashes=(nh,)))
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
            winner, loser = (d, existing) if d_pri > e_pri or (d_pri == e_pri and d.confidence > existing.confidence) else (existing, d)
            # The tile keeps every name hash found on it, even when a phone
            # number or another name wins its entity type, so confirming it
            # adds all of them to the case gazetteer.
            merged = tuple(sorted(set(winner.name_hashes) | set(loser.name_hashes)))
            if merged != winner.name_hashes:
                winner = Detection(**{**winner.__dict__, "name_hashes": merged})
            best[key] = winner
    return list(best.values())

from .schemas import GazetteerInput, PageInput, Suggestion

def _visual_order(word_boxes: list[WordBox]) -> tuple[str, list[WordBox]]:
    """The page's words regrouped into rows by vertical position, left to right.
    Tesseract can read a label column and a value column as separate blocks
    ("गवाह:" then "निवासी", the name two lines later); in visual order the
    label is followed by its value again. Same text layout as _ocr_page."""
    if not word_boxes:
        return "", []
    heights = sorted(b.height for b in word_boxes)
    tol = 0.6 * heights[len(heights) // 2]
    rows: list[list[WordBox]] = []
    for box in sorted(word_boxes, key=lambda b: b.top + b.height / 2):
        centre = box.top + box.height / 2
        if rows and abs(centre - rows[-1][0].top - rows[-1][0].height / 2) <= tol:
            rows[-1].append(box)
        else:
            rows.append([box])
    ordered = [sorted(row, key=lambda b: b.left) for row in rows]
    return "\n".join(" ".join(b.text for b in row) for row in ordered), [b for row in ordered for b in row]

def _page_suggestions(grid_size: int, page: PageInput, case_key: Optional[bytes] = None, known: frozenset = frozenset()) -> list[Suggestion]:
    try:
        png_bytes = base64.b64decode(page.png_base64)
        full_text, word_boxes = _ocr_page(png_bytes)
        source = "text_layer"   # tesseract OCR result, reusing allowed schema value
        args = (full_text, word_boxes, page.width_px, page.height_px, grid_size)
        visual_text, visual_boxes = _visual_order(word_boxes)
        vargs = (visual_text, visual_boxes, page.width_px, page.height_px, grid_size)
        hits = (_run_spacy(*args, source, case_key) + _run_regex(*args, "text_layer", case_key)
                + _propagate_names(*args, "text_layer", case_key) + _match_gazetteer(*args, case_key, known)
                # Label patterns again in visual order, for forms OCR read as columns.
                + _run_regex(*vargs, "text_layer", case_key) + _propagate_names(*vargs, "text_layer", case_key))
        return [
            Suggestion(page_index=page.page_index, row=d.row, col=d.col, entity_type=d.entity_type,
                       confidence_score=d.confidence, source=d.source, name_hashes=list(d.name_hashes))
            for d in _deduplicate(hits)
        ]
    except Exception as exc:
        logger.error("page %d failed: %s", page.page_index, exc, exc_info=True)
        return []

def generate_suggestions(document_version_id: str, grid_size: int, pages: list[PageInput],
                         gazetteer: Optional[GazetteerInput] = None) -> list[Suggestion]:
    if not pages:
        return []
    case_key = base64.b64decode(gazetteer.case_key) if gazetteer else None
    known = frozenset(gazetteer.name_hashes) if gazetteer else frozenset()
    with ThreadPoolExecutor(max_workers=min(len(pages), _MAX_OCR_WORKERS)) as pool:
        per_page = list(pool.map(lambda page: _page_suggestions(grid_size, page, case_key, known), pages))
    return [s for page_suggestions in per_page for s in page_suggestions]
