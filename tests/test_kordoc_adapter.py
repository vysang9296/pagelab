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

if __name__ == '__main__':
    unittest.main()
