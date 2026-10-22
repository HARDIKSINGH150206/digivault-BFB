import random
import unittest

from app.real_suggestions import AADHAAR_INVALID_CONF, AADHAAR_VALID_CONF, _run_regex
from app.verhoeff import is_plausible_aadhaar, verhoeff_check_digit, verhoeff_valid


def _aadhaar(rng: random.Random) -> str:
    body = str(rng.randint(2, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(10))
    return body + verhoeff_check_digit(body)


class VerhoeffTest(unittest.TestCase):
    def test_published_vectors(self):
        # Wikipedia "Verhoeff algorithm": 236 -> 3, 12345 -> 1.
        self.assertEqual(verhoeff_check_digit("236"), "3")
        self.assertEqual(verhoeff_check_digit("12345"), "1")
        self.assertTrue(verhoeff_valid("2363"))
        self.assertTrue(verhoeff_valid("123451"))
        self.assertFalse(verhoeff_valid("2364"))

    def test_catches_every_single_digit_error_and_adjacent_swap(self):
        rng = random.Random(7)
        for _ in range(200):
            n = _aadhaar(rng)
            self.assertTrue(is_plausible_aadhaar(n))
            i = rng.randrange(12)
            wrong = n[:i] + str((int(n[i]) + rng.randint(1, 9)) % 10) + n[i + 1 :]
            self.assertFalse(verhoeff_valid(wrong))
            j = rng.randrange(11)
            if n[j] != n[j + 1]:
                swapped = n[:j] + n[j + 1] + n[j] + n[j + 2 :]
                self.assertFalse(verhoeff_valid(swapped))

    def test_aadhaar_rules(self):
        body = "12345678901"
        self.assertFalse(is_plausible_aadhaar(body + verhoeff_check_digit(body)))  # starts with 1
        self.assertFalse(is_plausible_aadhaar("2363"))  # too short
        n = _aadhaar(random.Random(1))
        self.assertTrue(is_plausible_aadhaar(f"{n[:4]} {n[4:8]}-{n[8:]}"))
        kannada = n.translate(str.maketrans("0123456789", "೦೧೨೩೪೫೬೭೮೯"))
        self.assertTrue(is_plausible_aadhaar(kannada))

    def test_regex_confidence_follows_checksum(self):
        n = _aadhaar(random.Random(3))
        bad = n[:-1] + str((int(n[-1]) + 1) % 10)
        for number, expected in ((n, AADHAAR_VALID_CONF), (bad, AADHAAR_INVALID_CONF)):
            text = f"Aadhaar: {number[:4]} {number[4:8]} {number[8:]}"
            hits = [d for d in _run_regex(text, [], 1000, 1000, 20, "text_layer") if d.entity_type == "aadhaar"]
            self.assertTrue(hits)
            self.assertEqual({d.confidence for d in hits}, {expected})


if __name__ == "__main__":
    unittest.main()
