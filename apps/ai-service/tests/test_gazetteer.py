"""Case gazetteer (ADR-034): normalisation, keyed hashing, matching."""

import base64
import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.gazetteer import name_hash, name_key, normalise_word
from app.main import app
from app.real_suggestions import Detection, WordBox, _deduplicate, _match_gazetteer, _run_regex

VECTORS = json.loads((Path(__file__).parent / "gazetteer_vectors.json").read_text())
KEYS = {c["case_id"]: base64.b64decode(c["case_key_b64"]) for c in VECTORS["cases"]}


class HashTest(unittest.TestCase):
    def test_vectors(self):
        for n in VECTORS["names"]:
            self.assertEqual(name_key(n["text"]), n["name_key"])
            for case_id, expected in n["name_hash"].items():
                self.assertEqual(name_hash(KEYS[case_id], n["text"]), expected)

    def test_same_name_in_two_cases_gives_different_hashes(self):
        for text in ("Kavita Singh", "कविता सिंह", "ಕವಿತಾ ಸಿಂಗ್"):
            a, b = name_hash(KEYS["case-A"], text), name_hash(KEYS["case-B"], text)
            self.assertIsNotNone(a)
            self.assertNotEqual(a, b)

    def test_hash_does_not_contain_the_name(self):
        h = name_hash(KEYS["case-A"], "Kavita Singh")
        self.assertRegex(h, r"^[0-9a-f]{64}$")


class NormaliseTest(unittest.TestCase):
    def test_case_and_joiners(self):
        self.assertEqual(name_key("KAVITA singh"), name_key("Kavita Singh"))
        self.assertEqual(name_key("ಮಹೇಶ್‌ ನಾಯಕ್‌"), name_key("ಮಹೇಶ್ ನಾಯಕ್"))
        self.assertEqual(name_key("ಮಹೇಶ್‍ ನಾಯಕ್"), name_key("ಮಹೇಶ್ ನಾಯಕ್"))

    def test_same_name_across_scripts(self):
        for latin, deva, knda in [("Kavita Singh", "कविता सिंह", "ಕವಿತಾ ಸಿಂಗ್"),
                                  ("Sunita Devi", "सुनीता देवी", "ಸುನೀತಾ ದೇವಿ"),
                                  ("Imran Khan", "इमरान खान", "ಇಮ್ರಾನ್ ಖಾನ್"),
                                  ("Mahesh Nayak", "महेश नायक", "ಮಹೇಶ್ ನಾಯಕ್")]:
            self.assertEqual({name_key(latin), name_key(deva), name_key(knda)}, {name_key(latin)}, latin)

    def test_nukta_forms_agree(self):
        self.assertEqual(normalise_word("पीड़िता"), normalise_word("पीड़िता"))

    def test_punctuation_is_ignored(self):
        self.assertEqual(name_key("Kavita Singh,"), name_key("Kavita Singh"))
        self.assertEqual(name_key("कविता सिंह।"), name_key("कविता सिंह"))

    def test_short_single_names_are_not_keys(self):
        self.assertIsNone(name_key("Ram"))
        self.assertIsNone(name_key(""))


def _boxes(words):
    out, x = [], 10
    for w in words:
        out.append(WordBox(w, left=x, top=100, width=50, height=20, conf=0.9))
        x += 60
    return out


class MatchTest(unittest.TestCase):
    def test_known_name_is_flagged_in_another_script(self):
        known = frozenset({name_hash(KEYS["case-A"], "Kavita Singh")})
        words = ["बाद", "में", "कविता", "सिंह", "थाने", "आईं"]
        hits = _match_gazetteer(" ".join(words), _boxes(words), 1000, 1000, 20, KEYS["case-A"], known)
        cols = sorted({d.col for d in hits})
        # कविता at x=130..179, सिंह at x=190..239: tiles of 50 px -> columns 2..4.
        self.assertEqual(cols, [2, 3, 4])
        self.assertTrue(all(d.source == "gazetteer" and d.entity_type == "victim_name" for d in hits))

    def test_other_case_key_does_not_match(self):
        known = frozenset({name_hash(KEYS["case-A"], "Kavita Singh")})
        words = ["Kavita", "Singh", "came"]
        self.assertEqual(_match_gazetteer(" ".join(words), _boxes(words), 1000, 1000, 20, KEYS["case-B"], known), [])

    def test_regex_names_carry_hash_only_with_a_key(self):
        text = "Complainant: Kavita Singh"
        with_key = [d for d in _run_regex(text, [], 1000, 1000, 20, "text_layer", KEYS["case-A"]) if d.entity_type == "victim_name"]
        without = [d for d in _run_regex(text, [], 1000, 1000, 20, "text_layer") if d.entity_type == "victim_name"]
        self.assertEqual({d.name_hashes for d in with_key}, {(name_hash(KEYS["case-A"], "Kavita Singh"),)})
        self.assertEqual({d.name_hashes for d in without}, {()})

    def test_dedupe_keeps_every_name_hash_on_a_tile(self):
        # One tile spanning two lines: the accused's name above, the witness's below.
        a = Detection("victim_name", 0.91, "text_layer", 1, 1, name_hashes=("aa" * 32,))
        b = Detection("victim_name", 0.91, "text_layer", 1, 1, name_hashes=("bb" * 32,))
        c = Detection("phone", 0.97, "text_layer", 1, 1)
        (kept,) = _deduplicate([a, b, c])
        self.assertEqual(kept.entity_type, "phone")
        self.assertEqual(set(kept.name_hashes), {"aa" * 32, "bb" * 32})


class ApiTest(unittest.TestCase):
    def test_bad_case_key_is_refused(self):
        body = {"document_version_id": "x", "grid_size": 20, "pages": [],
                "gazetteer": {"case_key": base64.b64encode(b"short").decode(), "name_hashes": []}}
        self.assertEqual(TestClient(app).post("/v1/redaction-suggestions", json=body).status_code, 422)


if __name__ == "__main__":
    unittest.main()
