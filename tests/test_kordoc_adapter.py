import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.kordoc_adapter import KordocParserAdapter

class TestKordocAdapter(unittest.TestCase):
    @patch('subprocess.run')
    @patch('os.path.exists')
    def test_parse_to_markdown_success(self, mock_exists, mock_run):
        mock_exists.return_value = True
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_res.stdout = '{"markdown": "# Test MD\\nHello world", "metadata": {}}'
        mock_run.return_value = mock_res
        
        adapter = KordocParserAdapter("backend/bin/kordoc.exe")
        result = adapter.parse_to_markdown("dummy.hwpx")
        
        self.assertTrue(result["success"])
        self.assertEqual(result["markdown"], "# Test MD\nHello world")
        mock_run.assert_called_once()
        
    @patch('shutil.copy2')
    @patch('subprocess.run')
    @patch('os.path.exists')
    def test_patch_document_success(self, mock_exists, mock_run, mock_copy):
        mock_exists.side_effect = lambda p: True
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_run.return_value = mock_res
        
        # Mock open to write temp md
        with patch('builtins.open', unittest.mock.mock_open()):
            adapter = KordocParserAdapter("backend/bin/kordoc.exe")
            success = adapter.patch_document("dummy.hwpx", "# edited md", "out.hwpx")
            
            self.assertTrue(success)
            mock_copy.assert_called_with("dummy.hwpx", "dummy.hwpx.bak")
            mock_run.assert_called_once()

    @patch('subprocess.run')
    @patch('os.path.exists')
    def test_compare_documents_success(self, mock_exists, mock_run):
        mock_exists.side_effect = lambda p: True
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_res.stdout = "### 신구대조표\n변경 내용..."
        mock_run.return_value = mock_res
        
        adapter = KordocParserAdapter("backend/bin/kordoc.exe")
        diff_md = adapter.compare_documents("old.hwpx", "new.hwpx")
        self.assertIn("신구대조표", diff_md)
        mock_run.assert_called_once()

    @patch('backend.kordoc_adapter.KordocParserAdapter.parse_to_markdown')
    @patch('os.path.getsize')
    @patch('os.path.getmtime')
    @patch('os.path.exists')
    def test_api_parse_to_markdown(self, mock_exists, mock_getmtime, mock_getsize, mock_parse):
        mock_exists.return_value = True
        mock_getmtime.return_value = 12345.0
        mock_getsize.return_value = 1000
        mock_parse.return_value = {"markdown": "# Hello", "metadata": {}, "success": True}
        from main import Api
        api = Api()
        res = api.notelab_parse_to_markdown("dummy.hwpx")
        self.assertTrue(res["success"])
        self.assertEqual(res["markdown"], "# Hello")

    @patch('backend.kordoc_adapter.KordocParserAdapter.parse_to_markdown')
    def test_api_parse_to_markdown_fallback_when_kordoc_fails(self, mock_parse):
        # Simulate kordoc returning success=False
        mock_parse.return_value = {"markdown": "", "metadata": {}, "success": False}
        
        from main import Api
        api = Api()
        
        # Create a dummy txt file for parsing fallback
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dummy_file = os.path.join(base_dir, "tests", "dummy_fallback.txt")
        with open(dummy_file, "w", encoding="utf-8") as f:
            f.write("이것은 대체 파서 테스트 본문입니다. 줄바꿈이 일어납니다.")
            
        try:
            res = api.notelab_parse_to_markdown(dummy_file)
            self.assertTrue(res["success"])
            self.assertIn("대체 파서 테스트", res["markdown"])
            self.assertIn("metadata", res)
            self.assertTrue(res["metadata"].get("fallback", False))
        finally:
            if os.path.exists(dummy_file):
                os.remove(dummy_file)

    def test_api_parse_multiple_to_markdown(self):
        from main import Api
        api = Api()
        import fitz
        
        # Create dummy PDF files
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dummy1 = os.path.join(base_dir, "tests", "dummy_m1.pdf")
        dummy2 = os.path.join(base_dir, "tests", "dummy_m2.pdf")
        
        doc1 = fitz.open()
        doc1.new_page()
        doc1.save(dummy1)
        doc1.close()
        
        doc2 = fitz.open()
        doc2.new_page()
        doc2.save(dummy2)
        doc2.close()
            
        res = None
        try:
            res = api.notelab_parse_multiple_to_markdown([dummy1, dummy2])
            self.assertTrue(res["success"])
            self.assertIn("dummy_m1.pdf", res["markdown"])
            self.assertIn("dummy_m2.pdf", res["markdown"])
            self.assertTrue(os.path.exists(res["pdf_path"]))
        finally:
            if os.path.exists(dummy1):
                os.remove(dummy1)
            if os.path.exists(dummy2):
                os.remove(dummy2)
            if res and res.get("success") and os.path.exists(res["pdf_path"]):
                os.remove(res["pdf_path"])

    def test_api_get_pdf_base64(self):
        from main import Api
        api = Api()
        import fitz
        
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dummy = os.path.join(base_dir, "tests", "dummy_base64.pdf")
        
        doc = fitz.open()
        doc.new_page()
        doc.save(dummy)
        doc.close()
        
        try:
            res = api.notelab_get_pdf_base64(dummy)
            self.assertTrue(res["success"])
            self.assertTrue(len(res["base64"]) > 0)
            
            # Non-existent file
            res_fail = api.notelab_get_pdf_base64("non_existent_file.pdf")
            self.assertFalse(res_fail["success"])
        finally:
            if os.path.exists(dummy):
                os.remove(dummy)

if __name__ == '__main__':
    unittest.main()

