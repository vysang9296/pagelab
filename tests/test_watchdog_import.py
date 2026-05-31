import unittest

class TestWatchdogImport(unittest.TestCase):
    def test_imports(self):
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Watchdog import failed: {e}")

if __name__ == "__main__":
    unittest.main()
