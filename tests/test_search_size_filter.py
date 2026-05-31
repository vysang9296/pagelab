import unittest
import os
import sqlite3
from backend.search_engine import SearchEngine
from backend.file_manager import get_file_manager

class TestSearchSizeFilter(unittest.TestCase):
    def setUp(self):
        self.engine = SearchEngine()
        self.fm = get_file_manager()
        
        # Create fake document files of different sizes
        self.small_file = self.fm.get_temp_path("small_doc.txt")
        self.large_file = self.fm.get_temp_path("large_doc.txt")
        
        with open(self.small_file, "w", encoding="utf-8") as f:
            f.write("Secret Keyword: Antigravity is a secret code. Small content.")
            
        with open(self.large_file, "wb") as f:
            # 12MB file to trigger 10MB filter
            f.write(b"Secret Keyword: Antigravity is a secret code. " + b"0" * (12 * 1024 * 1024))
            
        # Force inject into DB for matching
        with self.engine.lock:
            with sqlite3.connect(self.engine.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM documents")
                cursor.execute("INSERT INTO documents (path, title, content) VALUES (?, ?, ?)", 
                               (self.small_file, "small_doc.txt", "Secret Keyword: Antigravity is a secret code. Small content."))
                cursor.execute("INSERT INTO documents (path, title, content) VALUES (?, ?, ?)", 
                               (self.large_file, "large_doc.txt", "Secret Keyword: Antigravity is a secret code."))
                conn.commit()

    def test_size_filters(self):
        # Test all sizes (should return 2 matches)
        res_all = self.engine.search("Antigravity", size_filter="all")
        self.assertEqual(len(res_all), 2)
        
        # Test under 10MB
        res_under = self.engine.search("Antigravity", size_filter="under_10m")
        self.assertEqual(len(res_under), 1)
        self.assertEqual(res_under[0]["title"], "small_doc.txt")
        
        # Test over 10MB (10MB ~ 50MB)
        res_over = self.engine.search("Antigravity", size_filter="10m_to_50m")
        self.assertEqual(len(res_over), 1)
        self.assertEqual(res_over[0]["title"], "large_doc.txt")

if __name__ == "__main__":
    unittest.main()
