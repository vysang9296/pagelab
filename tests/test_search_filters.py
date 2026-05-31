import os
import sys
import time
import shutil
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.search_engine import SearchEngine

class TestSearchFilters(unittest.TestCase):
    def setUp(self):
        # Create a temp directory for files and a temp db
        self.temp_dir = tempfile.mkdtemp()
        self.temp_db_dir = tempfile.mkdtemp()
        
        # Patch the db path of SearchEngine to use our temp db file
        self.db_path = os.path.join(self.temp_db_dir, "test_search.db")
        
        # We patch get_file_manager to return a mock that gives our temp db path
        self.fm_patcher = patch('backend.search_engine.get_file_manager')
        self.mock_fm = self.fm_patcher.start()
        self.mock_fm.return_value.get_temp_path.return_value = self.db_path
        
        # Instantiate search engine (it will use the patched db path)
        self.search_engine = SearchEngine()

    def tearDown(self):
        self.fm_patcher.stop()
        # Delete search engine and force garbage collection to release SQLite lock on Windows
        if hasattr(self, 'search_engine'):
            del self.search_engine
        import gc
        gc.collect()
        time.sleep(0.1) # Give OS a moment to release file handles
        
        # Clean up files and directories
        try:
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
        except Exception as e:
            print(f"Warning: Failed to clean up temp_dir: {e}")
            
        try:
            if os.path.exists(self.temp_db_dir):
                shutil.rmtree(self.temp_db_dir)
        except Exception as e:
            print(f"Warning: Failed to clean up temp_db_dir: {e}")

    @patch('backend.document_parser.DocumentParser.extract_text')
    def test_search_filters(self, mock_extract):
        # Mock extractor to return search keyword
        mock_extract.return_value = "secret keyword data text"
        
        # Create test files
        hwp_path = os.path.join(self.temp_dir, "document.hwp")
        pdf_path = os.path.join(self.temp_dir, "report.pdf")
        xls_path = os.path.join(self.temp_dir, "sheet.xlsx")
        txt_path = os.path.join(self.temp_dir, "note.txt")
        
        for p in [hwp_path, pdf_path, xls_path, txt_path]:
            with open(p, "w", encoding="utf-8") as f:
                f.write("dummy")
        
        # Set modification times
        now = time.time()
        # 1. hwp_path: modified now (within a week)
        os.utime(hwp_path, (now, now))
        # 2. pdf_path: modified 10 days ago (within a month)
        t_10_days = now - 10 * 86400
        os.utime(pdf_path, (t_10_days, t_10_days))
        # 3. xls_path: modified 40 days ago (within a year)
        t_40_days = now - 40 * 86400
        os.utime(xls_path, (t_40_days, t_40_days))
        # 4. txt_path: modified 400 days ago (older than a year)
        t_400_days = now - 400 * 86400
        os.utime(txt_path, (t_400_days, t_400_days))
        
        # Index the temp directory
        count, cancelled, truncated = self.search_engine.index_target_folder(self.temp_dir)
        self.assertEqual(count, 4)
        
        # Test 1: No filters (ext_filter='all', date_filter='all')
        results = self.search_engine.search("keyword", ext_filter='all', date_filter='all')
        self.assertEqual(len(results), 4)
        
        # Test 2: Extension filters
        res_hwp = self.search_engine.search("keyword", ext_filter='hwp', date_filter='all')
        self.assertEqual(len(res_hwp), 1)
        self.assertEqual(os.path.basename(res_hwp[0]["path"]), "document.hwp")
        
        res_pdf = self.search_engine.search("keyword", ext_filter='pdf', date_filter='all')
        self.assertEqual(len(res_pdf), 1)
        self.assertEqual(os.path.basename(res_pdf[0]["path"]), "report.pdf")
        
        res_xls = self.search_engine.search("keyword", ext_filter='xls', date_filter='all')
        self.assertEqual(len(res_xls), 1)
        self.assertEqual(os.path.basename(res_xls[0]["path"]), "sheet.xlsx")
        
        res_etc = self.search_engine.search("keyword", ext_filter='etc', date_filter='all')
        self.assertEqual(len(res_etc), 1)
        self.assertEqual(os.path.basename(res_etc[0]["path"]), "note.txt")
        
        # Test 3: Date filters
        res_week = self.search_engine.search("keyword", ext_filter='all', date_filter='week')
        self.assertEqual(len(res_week), 1)
        self.assertEqual(os.path.basename(res_week[0]["path"]), "document.hwp")
        
        res_month = self.search_engine.search("keyword", ext_filter='all', date_filter='month')
        self.assertEqual(len(res_month), 2)
        filenames = {os.path.basename(r["path"]) for r in res_month}
        self.assertEqual(filenames, {"document.hwp", "report.pdf"})
        
        res_year = self.search_engine.search("keyword", ext_filter='all', date_filter='year')
        self.assertEqual(len(res_year), 3)
        filenames = {os.path.basename(r["path"]) for r in res_year}
        self.assertEqual(filenames, {"document.hwp", "report.pdf", "sheet.xlsx"})
        
        res_all_date = self.search_engine.search("keyword", ext_filter='all', date_filter='all')
        self.assertEqual(len(res_all_date), 4)

    @patch('backend.document_parser.DocumentParser.extract_text')
    def test_silent_indexing(self, mock_extract):
        mock_extract.return_value = "some text content"
        
        # Create a single test file
        test_file = os.path.join(self.temp_dir, "test.txt")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("dummy")

        from main import Api
        api = Api()
        # Direct api search engine to our temp db
        api._search_engine = self.search_engine
        
        # Mock window and evaluate_js
        mock_window = MagicMock()
        api._window = mock_window
        
        # Patch Thread to execute synchronously for test predictability
        with patch('threading.Thread') as mock_thread:
            def run_sync(*args, **kwargs):
                target = kwargs.get('target')
                if target:
                    target()
                return MagicMock()
            mock_thread.side_effect = run_sync
            
            # 1. Run with silent=True
            api.fl_index_current_folder(self.temp_dir, silent=True)
            calls = [c[0][0] for c in mock_window.evaluate_js.call_args_list]
            self.assertTrue(any("true" in c for c in calls))
            mock_window.reset_mock()
            
            # 2. Run with silent=False (default behavior)
            api.fl_index_current_folder(self.temp_dir, silent=False)
            calls = [c[0][0] for c in mock_window.evaluate_js.call_args_list]
            self.assertTrue(any("false" in c for c in calls))


    @patch('backend.document_parser.DocumentParser.extract_text')
    def test_short_query_search(self, mock_extract):
        # Mock extractor to return Korean text with '확률추출법'
        mock_extract.return_value = "이 방식은 확률추출법의 대표적인 예시입니다."
        
        # Create test file
        test_file = os.path.join(self.temp_dir, "prob.pdf")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("dummy")
            
        # Index folder
        count, cancelled, truncated = self.search_engine.index_target_folder(self.temp_dir)
        self.assertEqual(count, 1)
        
        # Search for 5-character word '확률추출법' -> MATCH
        res_full = self.search_engine.search("확률추출법")
        self.assertEqual(len(res_full), 1)
        self.assertIn("<mark>확률추출법</mark>", res_full[0]["snippet"])
        
        # Search for 2-character word '확률' -> LIKE fallback
        res_short_1 = self.search_engine.search("확률")
        self.assertEqual(len(res_short_1), 1)
        self.assertIn("<mark>확률</mark>추출법", res_short_1[0]["snippet"])
        
        # Search for 2-character word '추출' -> LIKE fallback
        res_short_2 = self.search_engine.search("추출")
        self.assertEqual(len(res_short_2), 1)
        self.assertIn("확률<mark>추출</mark>법", res_short_2[0]["snippet"])
        
        # Search for nonexistent short word '통계' -> no match
        res_none = self.search_engine.search("통계")
        self.assertEqual(len(res_none), 0)

if __name__ == '__main__':
    unittest.main()
