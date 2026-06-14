import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.ocr_engine import WindowsOCREngine

class TestOcrEngine(unittest.TestCase):
    @patch('backend.ocr_engine.WindowsOCREngine.ocr_from_image')
    def test_ocr_success(self, mock_ocr):
        mock_ocr.return_value = {"success": True, "error_code": "", "text": "인식된 한글 텍스트"}
        engine = WindowsOCREngine()
        res = engine.ocr_from_image("dummy_image.png")
        self.assertTrue(res["success"])
        self.assertEqual(res["text"], "인식된 한글 텍스트")

    @patch('backend.ocr_engine.WindowsOCREngine.ocr_from_image')
    def test_api_ocr_image(self, mock_ocr):
        mock_ocr.return_value = {"success": True, "error_code": "", "text": "API 인식 텍스트"}
        from main import Api
        api = Api()
        res = api.notelab_ocr_image("dummy_image.png")
        self.assertTrue(res["success"])
        self.assertEqual(res["text"], "API 인식 텍스트")

if __name__ == '__main__':
    unittest.main()
