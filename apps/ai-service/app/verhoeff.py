"""
Verhoeff checksum, used by UIDAI for the last digit of an Aadhaar number.
A 12-digit match that passes is almost certainly an Aadhaar number; one
that fails may still be one misread by OCR, so callers lower its
confidence instead of dropping it (fail-closed, ADR-033).
"""

_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
# Row k is the base permutation applied k times; built, not typed, so a
# typo can't silently weaken the check.
_P1 = (1, 5, 7, 6, 2, 8, 3, 0, 9, 4)
_P = [tuple(range(10))]
for _ in range(7):
    _P.append(tuple(_P1[x] for x in _P[-1]))
_P = tuple(_P)
_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)

# Kannada and Devanagari digits, so OCR output in either script is checked too.
_DIGITS = str.maketrans("೦೧೨೩೪೫೬೭೮೯०१२३४५६७८९", "01234567890123456789")


def _digits(number: str) -> str:
    return "".join(ch for ch in number.translate(_DIGITS) if ch.isdigit())


def verhoeff_valid(number: str) -> bool:
    digits = _digits(number)
    if not digits:
        return False
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(number: str) -> str:
    """The digit to append to `number` so the result passes verhoeff_valid."""
    c = 0
    for i, ch in enumerate(reversed(_digits(number))):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(_INV[c])


def is_plausible_aadhaar(number: str) -> bool:
    """12 digits, not starting with 0 or 1 (UIDAI), valid checksum."""
    digits = _digits(number)
    return len(digits) == 12 and digits[0] not in "01" and verhoeff_valid(digits)
