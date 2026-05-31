import unittest
import os
import time
import sqlite3
from backend.search_engine import SearchEngine
from backend.file_manager import get_file_manager

class TestSearchWatchdog(unittest.TestCase):
    def setUp(self):
        self.engine = SearchEngine()
        self.fm = get_file_manager()
        
        # Prepare directory to watch
        self.watch_dir = self.fm.get_temp_path("watch_test_folder_" + os.urandom(2).hex())
        os.makedirs(self.watch_dir, exist_ok=True)
        
        # Clean DB first
        with self.engine.lock:
            with sqlite3.connect(self.engine.db_path) as conn:
                conn.cursor().execute("DELETE FROM documents")
                conn.commit()

    def tearDown(self):
        try:
            self.engine.stop_watchdog()
        except:
            pass

    def test_realtime_indexing(self):
        # Start watchdog on the folder
        success = self.engine.start_watchdog(self.watch_dir)
        self.assertTrue(success)
        time.sleep(0.5) # Wait for thread initialization
        
        # 1. Create file
        test_file = os.path.join(self.watch_dir, "event_doc.txt")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("FTS5 Real-time content matches perfectly.")
            
        # Wait for filesystem and thread execution (max 1.5s)
        time.sleep(1.2)
        
        res = self.engine.search("FTS5")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["title"], "event_doc.txt")
        
        # 2. Modify file
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("FTS5 Modified content matches perfectly.")
        time.sleep(1.2)
        
        res = self.engine.search("Modified")
        self.assertEqual(len(res), 1)
        
        # 3. Delete file
        os.remove(test_file)
        time.sleep(1.2)
        
        res = self.engine.search("FTS5")
        self.assertEqual(len(res), 0)

if __name__ == "__main__":
    unittest.main()
