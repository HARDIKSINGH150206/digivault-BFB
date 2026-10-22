"""Regression tests for the engine fixes found by the Phase 6 measurement (ADR-033)."""

import unittest

from PIL import Image, ImageDraw

from app.real_suggestions import WordBox, _compiled_patterns, _flatten_background, _propagate_names, _run_regex, _span_to_grids


def names(text: str) -> list[str]:
    return [m.group(1) for etype, pat, _ in _compiled_patterns if etype == "victim_name"
            for m in pat.finditer(text) if m.lastindex]


def types(text: str) -> set[str]:
    return {d.entity_type for d in _run_regex(text, [], 1000, 1000, 20, "text_layer")}


class TileMappingTest(unittest.TestCase):
    def test_uses_the_hashing_tile_split(self):
        # 1190x1684 at 20x20: tiles are ceil(1190/20)=60 by ceil(1684/20)=85 px.
        # A proportional y/1684*20 would put y=1600 in row 19; the hashed tile is row 18.
        box = WordBox("x", left=1150, top=1600, width=30, height=10, conf=0.9)  # rows 1530-1614
        self.assertEqual(_span_to_grids(0, 1, "x", [box], 1190, 1684, 20), [(18, 19)])

    def test_box_ending_on_a_tile_edge_stays_in_its_tile(self):
        box = WordBox("x", left=0, top=0, width=60, height=85, conf=0.9)
        self.assertEqual(_span_to_grids(0, 1, "x", [box], 1190, 1684, 20), [(0, 0)])


class PatternTest(unittest.TestCase):
    def test_phone_formats(self):
        for phone in ("9876543210", "98765 43210", "+91 98765 43210", "+91-98765-43210", "098765 43210"):
            self.assertIn("phone", types(f"Mobile: {phone}"), phone)

    def test_english_name_labels(self):
        for label in ("Complainant:", "Name of complainant:", "Name of accused:", "Husband's name:",
                      "Father's name:", "Informant:", "Suspect:"):
            self.assertIn("Vikram Choudhary", names(f"{label} Vikram Choudhary"), label)

    def test_english_capture_stops_at_lower_case(self):
        self.assertIn("Sunita Devi", names("the complainant Sunita Devi stated that"))
        self.assertNotIn("Sunita Devi stated", names("the complainant Sunita Devi stated that"))

    def test_hindi_name_after_ka_naam(self):
        found = names("शिकायतकर्ता का नाम: नेहा गुप्ता")
        self.assertIn("नेहा गुप्ता", found)
        self.assertFalse(any(n.startswith("का") for n in found))

    def test_hindi_nukta_forms(self):
        for victim in ("पीड़िता", "पीड़िता"):  # precomposed U+095C, and ड + nukta
            self.assertIn("मीना कुमारी", names(f"{victim}: मीना कुमारी"))

    def test_kannada_genitive_label_and_zwnj(self):
        found = names("ಆರೋಪಿಯ ಹೆಸರು: ಮಹೇಶ್‌ ನಾಯಕ್‌")
        self.assertTrue(any("ನಾಯಕ್" in n and "ಮಹೇಶ್" in n for n in found), found)

    def test_kannada_address_keeps_pin(self):
        text = "ವಾಸ: ಮನೆ ನಂ. 14, ಗಾಂಧಿ ನಗರ, ಬೆಂಗಳೂರು - 560009"
        caps = [m.group(1) for etype, pat, _ in _compiled_patterns if etype == "address"
                for m in pat.finditer(text) if m.lastindex]
        self.assertTrue(any("ಬೆಂಗಳೂರು" in c for c in caps), caps)


class PropagationTest(unittest.TestCase):
    def test_unlabelled_repeat_is_flagged(self):
        text = "Complainant: Sunita Devi\nOn the night Sunita Devi called the police"
        hits = _propagate_names(text, [], 1000, 1000, 20, "text_layer")
        # Fallback grid (no word boxes): one cell per occurrence, two occurrences.
        self.assertEqual(len({(d.row, d.col) for d in hits}), 2)

    def test_short_single_word_capture_is_not_propagated(self):
        self.assertEqual(_propagate_names("Victim: Ram\nRam Ram", [], 1000, 1000, 20, "text_layer"), [])


class FlattenTest(unittest.TestCase):
    def test_stain_goes_white_ink_stays_dark(self):
        img = Image.new("L", (600, 600), 235)
        d = ImageDraw.Draw(img)
        d.ellipse((150, 150, 450, 450), fill=150)  # stain
        d.rectangle((290, 290, 310, 296), fill=20)  # ink inside the stain
        out = _flatten_background(img)
        self.assertGreater(out.getpixel((200, 300)), 220)
        self.assertLess(out.getpixel((300, 293)), 80)
        self.assertEqual(out.size, img.size)


if __name__ == "__main__":
    unittest.main()
