import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.crop_engine import CropEngine

class TestCropEngine(unittest.TestCase):
    @patch('os.path.exists')
    @patch('fitz.open')
    def test_crop_pdf_page(self, mock_fitz_open, mock_exists):
        mock_exists.return_value = True
        mock_doc = MagicMock()
        mock_page = MagicMock()
        mock_pix = MagicMock()
        mock_fitz_open.return_value.__enter__.return_value = mock_doc
        mock_doc.__len__.return_value = 1
        mock_doc.load_page.return_value = mock_page
        mock_page.get_pixmap.return_value = mock_pix
        
        engine = CropEngine()
        os.makedirs("tests/attachments", exist_ok=True)
        try:
            out_filename = engine.crop_pdf_page("dummy.pdf", 0, 10, 10, 100, 100, "tests/attachments")
            self.assertTrue(out_filename.endswith(".png"))
            mock_pix.save.assert_called_once()
        finally:
            if os.path.exists("tests/attachments"):
                import shutil
                shutil.rmtree("tests/attachments")

    @patch('backend.crop_engine.CropEngine.crop_pdf_page')
    def test_api_crop_pdf_page(self, mock_crop):
        mock_crop.return_value = "notelab_crop_123.png"
        from main import Api
        api = Api()
        res = api.notelab_crop_pdf_page("dummy.pdf", 0, 10, 10, 100, 100, "vault")
        self.assertTrue(res["success"])
        self.assertEqual(res["filename"], "notelab_crop_123.png")

if __name__ == '__main__':
    unittest.main()
