import unittest
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.refiner_cache import TextRefiner, PdfCacheManager, Diagnostics

class TestRefinerCache(unittest.TestCase):
    def test_text_refiner(self):
        refiner = TextRefiner()
        # Test NFC normalization (Korean jamo division replacement)
        broken_text = "한글" # Jamo separated H-a-n-g-u-l (NFD)
        normalized = refiner.refine(broken_text)
        self.assertEqual(normalized, "한글") # NFC normalized
        
        # Test line breaking replacement (remove linebreaks between sentence components)
        raw_text = "이 문장은 끝이\n나지 않았습니다. 그리고\n끝났습니다."
        refined = refiner.refine(raw_text)
        self.assertEqual(refined, "이 문장은 끝이 나지 않았습니다. 그리고 끝났습니다.")
        
    def test_cache_manager(self):
        cache = PdfCacheManager(cache_dir="tests/dummy_cache")
        dummy_file = "tests/dummy.hwp"
        with open(dummy_file, "w") as f:
            f.write("hello")
        try:
            hash_key = cache.get_file_hash(dummy_file)
            self.assertTrue(len(hash_key) > 0)
            
            # Test cached path retrieval
            cached_path = cache.get_cached_pdf(dummy_file)
            self.assertIsNone(cached_path)
            
            # Cache PDF
            dummy_pdf = "tests/dummy.pdf"
            with open(dummy_pdf, "w") as f:
                f.write("dummy pdf content")
            
            cache.cache_pdf(dummy_file, dummy_pdf)
            cached_path = cache.get_cached_pdf(dummy_file)
            self.assertIsNotNone(cached_path)
            self.assertTrue(os.path.exists(cached_path))
            
            if os.path.exists(dummy_pdf):
                os.remove(dummy_pdf)
        finally:
            if os.path.exists(dummy_file):
                os.remove(dummy_file)
            if os.path.exists("tests/dummy_cache"):
                import shutil
                shutil.rmtree("tests/dummy_cache")

if __name__ == '__main__':
    unittest.main()
