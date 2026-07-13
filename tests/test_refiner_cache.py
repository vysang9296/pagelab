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

    def test_notelab_save_markdown_with_attachments(self):
        from main import Api
        api = Api()
        
        # Create a dummy attachment file in the source directory
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        src_dir = os.path.join(base_dir, "frontend", "attachments")
        os.makedirs(src_dir, exist_ok=True)
        dummy_crop = os.path.join(src_dir, "test_crop.png")
        with open(dummy_crop, "w") as f:
            f.write("dummy-image-data")
            
        # Target save path
        temp_save_path = os.path.join(base_dir, "tests", "notes", "test_note.md")
        content_with_image = "# Note\n\n![crop](attachments/test_crop.png)\n"
        
        try:
            res = api.notelab_save_markdown(temp_save_path, content_with_image)
            self.assertTrue(res["success"])
            self.assertTrue(os.path.exists(temp_save_path))
            self.assertIn("path", res)
            
            # Verify that attachments/test_crop.png was copied to target note folder
            copied_crop = os.path.join(base_dir, "tests", "notes", "attachments", "test_crop.png")
            self.assertTrue(os.path.exists(copied_crop))
        finally:
            if os.path.exists(dummy_crop):
                os.remove(dummy_crop)
            if os.path.exists(temp_save_path):
                os.remove(temp_save_path)
            copied_crop_path = os.path.join(base_dir, "tests", "notes", "attachments", "test_crop.png")
            if os.path.exists(copied_crop_path):
                os.remove(copied_crop_path)
            copied_dir = os.path.join(base_dir, "tests", "notes", "attachments")
            if os.path.exists(copied_dir):
                os.rmdir(copied_dir)
            notes_dir = os.path.join(base_dir, "tests", "notes")
            if os.path.exists(notes_dir):
                os.rmdir(notes_dir)

    def test_notelab_load_markdown(self):
        from main import Api
        api = Api()
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        temp_md = os.path.join(base_dir, "tests", "notes_load_test.md")
        body = "# 불러오기 테스트\n\n본문입니다.\n"
        try:
            with open(temp_md, "w", encoding="utf-8") as f:
                f.write(body)
            res = api.notelab_load_markdown(temp_md)
            self.assertTrue(res["success"])
            self.assertIn("불러오기 테스트", res["content"])
            self.assertTrue(
                res["path"].endswith("notes_load_test.md") or "notes_load_test.md" in res["path"]
            )
        finally:
            if os.path.exists(temp_md):
                os.remove(temp_md)

if __name__ == '__main__':
    unittest.main()
