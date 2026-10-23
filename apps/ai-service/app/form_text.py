"""
What the NER model (spaCy, English) is allowed to read (Phase 6 precision).

The printed parts of an FIR form — its title, field labels, running header
and footer — are never identifiers, but the English model tags them as
places and organisations ("FIRST INFORMATION REPORT", a footer's agency
name), and it tags Hindi and Kannada text as places at random. The regex
patterns and the gazetteer still read everything; only the NER input is
blanked here.

Blanking replaces characters with spaces, so every character offset still
maps to the same OCR word box.
"""

from __future__ import annotations

import re

# Running header and footer: lines in the top or bottom band of the page.
MARGIN_BAND = 0.06

# Form titles (case-insensitive). Hindi and Kannada titles are covered by the
# script rule below; listed for the record.
FORM_TITLES = [
    r"first\s+information\s+report", r"\bF\.?\s?I\.?\s?R\.?\b", r"under\s+section\s+\d+\s+\S+",
    r"police\s+station\s+diary", r"general\s+diary", r"case\s+diary",
    r"प्रथम\s+सूचना\s+रिपोर्ट", r"ಪ್ರಥಮ\s+ಮಾಹಿತಿ\s+ವರದಿ",
]

# A field label is the text before a colon at the start of a line, when it
# is short and reads like a label. The name after it stays visible to NER.
_LABEL_HINT = re.compile(
    r"\b(?:name|complainant|informant|victim|accused|suspect|witness|father|mother|husband|wife|guardian|"
    r"mobile|mob|phone|contact|tel|aadhaar|uid|address|residing|date|age|aged|police|station|p\.s|fir|case|no|"
    r"sections?|occupation|nationality|religion|caste|sex|gender|place|district|state)\b",
    re.IGNORECASE,
)
_LABEL_PREFIX = re.compile(r"^[ \t]*([^\n:]{1,40}?)[ \t]*:", re.MULTILINE)
# Labels written without a colon.
_BARE_LABELS = re.compile(r"\b(?:[SDWRC]/[Oo]|Mob\.|Aged|Residing\s+at|son\s+of|daughter\s+of|wife\s+of)\b", re.IGNORECASE)
_TITLES = re.compile("|".join(f"(?:{t})" for t in FORM_TITLES), re.IGNORECASE)
_NON_LATIN = re.compile(r"[^\x00-ɏ -⁯]")  # anything outside Latin, Latin-1/Extended and punctuation


def _blank(chars: list[str], start: int, end: int) -> None:
    for i in range(start, end):
        if chars[i] != "\n":
            chars[i] = " "


def ner_input(text: str, line_spans: list[tuple[int, int, float, float]], page_height: int) -> str:
    """`text` with form text blanked. `line_spans` = (start, end, top, bottom)
    of each OCR line in `text`, in pixels."""
    chars = list(text)
    for start, end, top, bottom in line_spans:
        if top < MARGIN_BAND * page_height or bottom > (1 - MARGIN_BAND) * page_height:
            _blank(chars, start, end)
    for m in _TITLES.finditer(text):
        _blank(chars, m.start(), m.end())
    for m in _LABEL_PREFIX.finditer(text):
        label = m.group(1)
        if len(label.split()) <= 4 and _LABEL_HINT.search(label):
            _blank(chars, m.start(), m.end())
    for m in _BARE_LABELS.finditer(text):
        _blank(chars, m.start(), m.end())
    for m in _NON_LATIN.finditer(text):
        _blank(chars, m.start(), m.end())
    return "".join(chars)


# Address context: an address label or a 6-digit PIN code on the line.
ADDRESS_CONTEXT = re.compile(
    r"(?:\baddress\b|\bR/o\b|residing\s+at|\bP\.?S\.?\b|\bvillage\b|\bdistrict\b|\bdist\.|\bteh(?:sil)?\b|\bpin\b|"
    r"(?<!\d)[1-9]\d{5}(?!\d)|"
    r"पता|निवास|ग्राम|जिला|तहसील|थाना|ವಿಳಾಸ|ವಾಸ|ಗ್ರಾಮ|ಜಿಲ್ಲೆ|ತಾಲ್ಲೂಕು|ಠಾಣೆ)",
    re.IGNORECASE,
)


def line_spans_of(text: str, word_boxes) -> list[tuple[int, int, float, float]]:
    """(start, end, top, bottom) per line of `text`, which _ocr_page builds as
    the words of each OCR line joined by spaces and lines joined by newlines,
    in word_boxes order."""
    spans: list[tuple[int, int, float, float]] = []
    offset = 0
    line_start, top, bottom = 0, None, None
    for box in word_boxes:
        end = offset + len(box.text)
        t, b = box.top, box.top + box.height
        top = t if top is None else min(top, t)
        bottom = b if bottom is None else max(bottom, b)
        sep = text[end] if end < len(text) else "\n"
        if sep == "\n":
            spans.append((line_start, end, top, bottom))
            line_start, top, bottom = end + 1, None, None
        offset = end + 1
    return spans
