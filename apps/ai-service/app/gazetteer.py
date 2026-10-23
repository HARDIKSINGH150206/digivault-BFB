"""
Case gazetteer matching (docs/07 Phase 6, ADR-034).

The web app keeps, per case, keyed hashes of names an officer has confirmed
for redaction: HMAC-SHA256(case_key, "digivault/gazetteer/v1/name|" + key),
where `key` is the normalised name below and `case_key` is derived from
GAZETTEER_KEY and the case id by the web app. This service only ever sees
one case's key, during one request, and never stores anything.

Normalisation puts the same name in Latin, Devanagari and Kannada script on
one spelling where it can: Kannada is mapped onto Devanagari (the two
Unicode blocks are laid out alike), Devanagari is romanised, and every
script then goes through the same Latin spelling rules. It is a heuristic:
"Kavita Singh" / "कविता सिंह" / "ಕವಿತಾ ಸಿಂಗ್" agree, "Mohammed" / "मोहम्मद" do
not (e vs a); the measured rate is in docs/08. Same-script matches are exact.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata

HASH_PREFIX = b"digivault/gazetteer/v1/name|"

_ZW = dict.fromkeys(map(ord, "‌‍"), None)

# Kannada U+0C80..U+0CFF -> Devanagari U+0900..U+097F (same layout).
_KN_OFFSET = 0x0C80 - 0x0900

_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ऱ": "r", "ऴ": "l",
    # Precomposed nukta letters.
    # ड़ is "d" here, as names spell it (गौड़ा = Gowda, हेगड़े = Hegde).
    "क़": "k", "ख़": "kh", "ग़": "g", "ज़": "j", "ड़": "d", "ढ़": "dh", "फ़": "ph", "य़": "y",
}
_NUKTA_FORMS = {"क": "क़", "ख": "ख़", "ग": "ग़", "ज": "ज़", "ड": "ड़", "ढ": "ढ़", "फ": "फ़", "य": "य़"}
_VOWELS = {
    "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ऋ": "ri", "ए": "e", "ऐ": "ai",
    "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e", "ऎ": "e", "ऒ": "o",
}
_MATRAS = {
    "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai",
    "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e", "ॆ": "e", "ॊ": "o",
}
_NASAL = {"ं": "n", "ँ": "n", "ः": "h"}
_VIRAMA, _NUKTA = "्", "़"

# One set of spelling rules for every script, applied in order.
_LATIN_RULES = [
    (r"x", "ks"), (r"q", "k"), (r"z", "j"), (r"ck", "k"), (r"w", "v"), (r"ph", "f"),
    (r"aa", "a"), (r"ee", "i"), (r"oo", "u"), (r"ou", "au"), (r"ov(?=[^aeiou]|$)", "au"),  # gowda = gauda
    (r"ao$", "av"),                # Rao = राव
    (r"ah$", "a"),                 # Farah = ಫರಾ
    (r"ey$", "e"),                 # Pandey = पांडे
    (r"(?:ngh|nh|ng)$", "n"),      # Singh / सिंह (sinh) / ಸಿಂಗ್ (sing)
    (r"([bcdgjkprst])h", r"\1"),   # aspirates: bh -> b, sh -> s, th -> t
    (r"([a-z])\1+", r"\1"),        # doubled letters: reddi -> redi
    (r"y$", "i"),
    # Every "a" or "e" between two consonants goes, in every script. Hindi
    # drops some inherent vowels when spoken (इमरान = imran, not imaran), and
    # Latin spellings keep, drop or write them as "e" freely (Choudhary /
    # चौधरी, Verma / वर्मा, Mohammed / मोहम्मद); removing all of them agrees.
    (r"(?<=[b-df-hj-np-tv-z])[ae](?=[b-df-hj-np-tv-z])", ""),
]


def _is_devanagari(ch: str) -> bool:
    return "ऀ" <= ch <= "ॿ"


def _romanise(word: str, drop_final_schwa: bool) -> str:
    out: list[str] = []
    inherent = False
    prev = ""
    for i, ch in enumerate(word):
        if ch == _NUKTA and prev in _NUKTA_FORMS and inherent:
            out[-1] = _CONSONANTS[_NUKTA_FORMS[prev]]
            continue
        if ch in _CONSONANTS:
            if inherent:
                out.append("a")
            out.append(_CONSONANTS[ch])
            inherent = True
        elif ch in _MATRAS:
            out.append(_MATRAS[ch])
            inherent = False
        elif ch == _VIRAMA:
            inherent = False
        else:
            if inherent:
                out.append("a")
            inherent = False
            if ch == "ं" and i == len(word) - 1:
                out.append("m")  # word-final anusvara is said "m": ಸಲೀಂ = Salim
            else:
                out.append(_VOWELS.get(ch) or _NASAL.get(ch) or ch)
        prev = ch
    if inherent and not drop_final_schwa:
        out.append("a")
    return "".join(out)


def normalise_word(word: str) -> str:
    word = unicodedata.normalize("NFC", word).translate(_ZW)
    # Punctuation (। , .), symbols and digits first: a danda after सिंह would
    # otherwise end the word on a consonant and keep its inherent vowel.
    word = "".join(c for c in word if unicodedata.category(c)[0] not in "PSNZ")
    kannada = any("ಀ" <= ch <= "೿" for ch in word)
    if kannada:
        word = "".join(chr(ord(ch) - _KN_OFFSET) if "ಀ" <= ch <= "೿" else ch for ch in word)
    if any(_is_devanagari(ch) for ch in word):
        # Hindi drops a word-final inherent vowel (राम = ram); Kannada says it (ರಾಮ = rama).
        word = _romanise(word, drop_final_schwa=not kannada)
    word = "".join(c for c in unicodedata.normalize("NFKD", word) if not unicodedata.combining(c)).lower()
    word = re.sub(r"[^a-z]", "", word)
    for pattern, repl in _LATIN_RULES:
        word = re.sub(pattern, repl, word)
    return word


def name_key(text: str) -> str | None:
    """The normalised form a name is stored and matched under: its first two
    words, or a single word of at least 4 letters. Shorter keys (a lone
    "Ram") would match too much unrelated text."""
    words = [w for w in (normalise_word(t) for t in text.split()) if w]
    if len(words) >= 2:
        return " ".join(words[:2])
    if words and len(words[0]) >= 4:
        return words[0]
    return None


def name_hash(case_key: bytes, text: str) -> str | None:
    key = name_key(text)
    if key is None:
        return None
    return hmac.new(case_key, HASH_PREFIX + key.encode("ascii"), hashlib.sha256).hexdigest()
