"""
Real NER-based redaction engine for DigiVault.
Supports English + Hindi (Devanagari) documents.
"""

from __future__ import annotations
import base64
import io
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_spacy_nlp = None
_tesseract_available: Optional[bool] = None

def _get_nlp():
    global _spacy_nlp
    if _spacy_nlp is None:
        import spacy
        try:
            _spacy_nlp = spacy.load("en_core_web_sm")
        except OSError:
            from spacy.cli import download
            download("en_core_web_sm")
            _spacy_nlp = spacy.load("en_core_web_sm")
    return _spacy_nlp

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

EN_PATTERNS = [
    ("phone", r"\b[6-9]\d{9}\b", 0.97),
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
    ("victim_name",
     r"(?:S/[Oo]|D/[Oo]|W/[Oo]|son of|daughter of|wife of)\s+([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+){0,3})",
     0.93),
    ("victim_name",
     r"(?:Complainant|Victim|Accused|Suspect|Witness)\s*:\s*([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+){0,3})",
     0.91),
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
    ("victim_name",
     r"(?:पीड़िता?|शिकायतकर्ता|आरोपी|साक्षी|गवाह)\s*:?\s*([ऀ-ॿ]+(?:[ \t]+[ऀ-ॿ]+){0,3})",
     0.91),
    ("victim_name",
     r"(?:पुत्री|पुत्र|पिता|पत्नी|पति)\s*:?\s*(?:श्रीमती|श्री|कु\.?)?\s*([ऀ-ॿ]+(?:[ \t]+[ऀ-ॿ]+){0,2})",
     0.89),
    ("address", r"(?:निवास|पता|मकान\s*नं\.?|ग्राम|जिला|थाना)\s*:?\s*([ऀ-ॿ\w\s,\-\.]+?)(?:\n|$)", 0.78),
    ("case_number", r"(?:मु\.?अ\.?सं\.?|प्रकरण\s*क्र\.?|अपराध\s*क्रमांक)\s*:?\s*([\d/\-]+)", 0.97),
    ("dob", r"(?:जन्म\s*तिथि|दिनांक)\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", 0.90),
    ("phone", r"[०-९]{10}", 0.85),
]

ALL_PATTERNS = EN_PATTERNS + HI_PATTERNS
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

def _ocr_page(png_bytes: bytes) -> tuple[str, list[WordBox]]:
    if not _tesseract_ok():
        return "", []
    from PIL import Image
    import pytesseract

    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    data = pytesseract.image_to_data(
        image, lang="eng+hin",
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
    offset = 0
    for box in word_boxes:
        word_end = offset + len(box.text)
        if offset < char_end and word_end > char_start:
            # Every tile the box overlaps — left edge to right edge, top to bottom
            col_lo = int(box.left / max(page_width, 1) * grid_size)
            col_hi = int((box.left + box.width) / max(page_width, 1) * grid_size)
            row_lo = int(box.top / max(page_height, 1) * grid_size)
            row_hi = int((box.top + box.height) / max(page_height, 1) * grid_size)
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

def _run_regex(text, word_boxes, page_width, page_height, grid_size, source):
    if not text.strip():
        return []
    detections = []
    for etype, pattern, base_conf in _compiled_patterns:
        for m in pattern.finditer(text):
            start = m.start(1) if m.lastindex else m.start()
            end = m.end(1) if m.lastindex else m.end()
            for grid in _span_to_grids(start, end, text, word_boxes, page_width, page_height, grid_size):
                detections.append(Detection(entity_type=etype, confidence=round(base_conf, 3), source=source, row=grid[0], col=grid[1]))
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

def generate_suggestions(document_version_id: str, grid_size: int, pages: list[PageInput]) -> list[Suggestion]:
    all_suggestions = []
    for page in pages:
        try:
            png_bytes = base64.b64decode(page.png_base64)
            full_text, word_boxes = _ocr_page(png_bytes)
            source = "text_layer"   # tesseract OCR result, reusing allowed schema value
            spacy_hits = _run_spacy(full_text, word_boxes, page.width_px, page.height_px, grid_size, source)
            regex_hits = _run_regex(full_text, word_boxes, page.width_px, page.height_px, grid_size, "text_layer")
            for d in _deduplicate(spacy_hits + regex_hits):
                all_suggestions.append(Suggestion(page_index=page.page_index, row=d.row, col=d.col, entity_type=d.entity_type, confidence_score=d.confidence, source=d.source))
        except Exception as exc:
            logger.error("page %d failed: %s", page.page_index, exc, exc_info=True)
    return all_suggestions
