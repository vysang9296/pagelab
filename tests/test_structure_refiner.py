import os
import sys
import unittest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.structure_refiner import StructureRefiner


class TestStructureRefiner(unittest.TestCase):
    def setUp(self):
        self.r = StructureRefiner()

    def test_split_inline_arabic_and_hangul_markers(self):
        raw = "추진배경은 다음과 같다.1. 현황가. 예산 나) 인력2) 일정"
        out = self.r.format(raw, preserve_markdown_blocks=False)
        self.assertIn("\n1.", out)
        self.assertIn("\n가.", out)
        # 나) 앞 줄바꿈
        self.assertRegex(out, r"\n나\)")
        self.assertRegex(out, r"\n2\)")

    def test_space_after_marker_stuck_to_body(self):
        raw = "1.추진배경\n가.세부계획"
        out = self.r.format(raw, preserve_markdown_blocks=False)
        self.assertIn("1. 추진배경", out)
        self.assertIn("가. 세부계획", out)

    def test_roman_and_chapter(self):
        raw = "서론 다음에 온다.Ⅰ 총칙제1장 목적"
        out = self.r.format(raw, preserve_markdown_blocks=False)
        self.assertIn("Ⅰ", out)
        self.assertIn("제1장", out)
        self.assertTrue("\nⅠ" in out or "\n\nⅠ" in out)

    def test_paren_styles(self):
        raw = "항목은 아래와 같다.(1) 첫번째(가) 세부"
        out = self.r.format(raw, preserve_markdown_blocks=False)
        self.assertRegex(out, r"\n\(1\)")
        self.assertRegex(out, r"\n\(가\)")

    def test_preserves_markdown_image_and_heading(self):
        raw = "# 제목\n\n본문이다.1. 항목\n\n![crop](attachments/x.png)\n"
        out = self.r.format(raw, preserve_markdown_blocks=True)
        self.assertTrue(out.startswith("# 제목") or out.lstrip().startswith("# 제목"))
        self.assertIn("![crop](attachments/x.png)", out)
        self.assertIn("\n1.", out)

    def test_pdf_hint_breaks_marker(self):
        raw = "앞문장1. 현황 분석"
        pdf = "다른줄\n1. 현황\n다음"
        out = self.r.format(raw, pdf_text=pdf, preserve_markdown_blocks=False)
        self.assertIn("\n1.", out)

    def test_api_structure_mode(self):
        from main import Api

        api = Api()
        res = api.notelab_analyze_text(
            "끝이다.1. 하나 가. 둘",
            pdf_path=None,
            mode="structure",
        )
        self.assertTrue(res["success"])
        self.assertIsNotNone(res.get("structured_text"))
        self.assertIn("\n1.", res["structured_text"])


if __name__ == "__main__":
    unittest.main()
