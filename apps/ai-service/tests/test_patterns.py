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

    def test_word_inside_a_tile_stays_in_it(self):
        box = WordBox("x", left=20, top=30, width=20, height=20, conf=0.9)
        self.assertEqual(_span_to_grids(0, 1, "x", [box], 1190, 1684, 20), [(0, 0)])

    def test_word_touching_a_tile_edge_also_takes_the_neighbour(self):
        # Box padding (15% of the word's height) covers signs Tesseract's box
        # leaves out: a word ending 1 px above row 1 also masks row 1.
        box = WordBox("x", left=20, top=64, width=20, height=20, conf=0.9)
        self.assertEqual(_span_to_grids(0, 1, "x", [box], 1190, 1684, 20), [(0, 0), (1, 0)])


class PatternTest(unittest.TestCase):
    def test_phone_formats(self):
        for phone in ("9876543210", "98765 43210", "+91 98765 43210", "+91-98765-43210", "098765 43210", "84613 51 619"):
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


class VisualOrderTest(unittest.TestCase):
    def test_label_column_and_value_column_are_rejoined(self):
        from app.real_suggestions import _visual_order
        # Tesseract order: the label column, then the value column.
        boxes = [WordBox("Witness:", 80, 574, 90, 20, 0.9), WordBox("Address:", 80, 620, 90, 20, 0.9),
                 WordBox("Vikas", 180, 567, 60, 24, 0.9), WordBox("Chauhan", 250, 568, 80, 24, 0.9),
                 WordBox("Lucknow", 180, 618, 90, 22, 0.9)]
        text, ordered = _visual_order(boxes)
        self.assertEqual(text, "Witness: Vikas Chauhan\nAddress: Lucknow")
        self.assertIn("Vikas Chauhan", names(text))
        self.assertEqual([b.text for b in ordered], ["Witness:", "Vikas", "Chauhan", "Address:", "Lucknow"])


class LabelNotMaskedTest(unittest.TestCase):
    def test_age_and_case_number_capture_the_value_only(self):
        for text, value in (("FIR No. 0001/2026", "0001/2026"), ("Age: 34", "34"), ("आयु: 34", "34"), ("ವಯಸ್ಸು: 34", "34")):
            caps = [m.group(m.lastindex or 0) for etype, pat, _ in _compiled_patterns if etype in ("age", "case_number")
                    for m in pat.finditer(text)]
            self.assertIn(value, [c.strip() for c in caps], text)
            self.assertFalse(any(len(c.strip()) > len(value) for c in caps), (text, caps))


class NerBlankingTest(unittest.TestCase):
    def test_form_text_and_indic_script_are_blanked_offsets_kept(self):
        from app.form_text import ner_input
        text = "FIRST INFORMATION REPORT\nName of complainant: Sunita Devi\n17/07/2026 ರಂದು ಹೇಳಿಕೆ\nfooter line"
        lines, pos = [], 0
        for i, line in enumerate(text.split("\n")):
            top = [50, 300, 400, 1640][i]
            lines.append((pos, pos + len(line), top, top + 20))
            pos += len(line) + 1
        out = ner_input(text, lines, 1684)
        self.assertEqual(len(out), len(text))
        self.assertEqual([l.strip() for l in out.split("\n")], ["", "Sunita Devi", "17/07/2026", ""])


class KannadaRoleSuffixTest(unittest.TestCase):
    def test_complainant_who_is_form_propagates_the_name(self):
        text = "ದೂರುದಾರರಾದ ಕಾವ್ಯ ರೆಡ್ಡಿ ಅವರು ಬಂದರು\nಕಾವ್ಯ ರೆಡ್ಡಿ ಅವರು ಮನವಿ ಮಾಡಿದರು"
        self.assertTrue(any(n.startswith("ಕಾವ್ಯ ರೆಡ್ಡಿ") for n in names(text)), names(text))
        hits = _propagate_names(text, [], 1000, 1000, 20, "text_layer")
        self.assertGreaterEqual(len({(d.row, d.col) for d in hits}), 2)
