import os
import hashlib
import unicodedata
import re
import subprocess
from typing import Optional, Dict

class Diagnostics:
    @staticmethod
    def run_preflight_checks(exe_path: str) -> Dict[str, bool]:
        abs_exe = os.path.abspath(exe_path)
        kordoc_ok = False
        ocr_ok = False
        
        # 1. kordoc binary check
        if os.path.exists(abs_exe):
            try:
                # cp949 encoding crash prevention
                res = subprocess.run([abs_exe, "--version"], capture_output=True, text=True, encoding="utf-8")
                kordoc_ok = (res.returncode == 0)
            except Exception:
                pass
                
        # 2. WinRT OCR Korean language pack check
        try:
            import winrt.windows.media.ocr as ocr
            lang = ocr.Language("ko")
            ocr_ok = ocr.OcrEngine.is_language_supported(lang)
        except Exception:
            pass
            
        return {"kordoc": kordoc_ok, "ocr_korean": ocr_ok}

class TextRefiner:
    def refine(self, text: str) -> str:
        if not text: return ""
        # Normalize to NFC to compose Hangul jamo elements
        text = unicodedata.normalize('NFC', text)
        lines = text.split('\n')
        refined_lines = []
        for i, line in enumerate(lines):
            line_str = line.strip()
            if not line_str:
                refined_lines.append("")
                continue
            
            # If line does not end with sentence ending marks, replace the linebreak with a space
            if i < len(lines) - 1 and not re.search(r'[.!?\)\}\]\"\']$', line_str):
                refined_lines.append(line_str + " ")
            else:
                refined_lines.append(line_str + "\n")
        
        refined_text = "".join(refined_lines)
        # Collapse multiple spaces into single space
        return re.sub(r' +', ' ', refined_text).strip()

class PdfCacheManager:
    def __init__(self, cache_dir: str = "backend/cache"):
        self.cache_dir = os.path.abspath(cache_dir)
        os.makedirs(self.cache_dir, exist_ok=True)

    def get_file_hash(self, file_path: str) -> str:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        mtime = os.path.getmtime(file_path)
        size = os.path.getsize(file_path)
        base = f"{file_path}_{size}_{mtime}"
        return hashlib.md5(base.encode('utf-8')).hexdigest()

    def get_cached_pdf(self, file_path: str) -> Optional[str]:
        h = self.get_file_hash(file_path)
        cached_path = os.path.join(self.cache_dir, f"{h}.pdf")
        if os.path.exists(cached_path):
            return cached_path
        return None

    def cache_pdf(self, file_path: str, pdf_path: str):
        h = self.get_file_hash(file_path)
        dest_path = os.path.join(self.cache_dir, f"{h}.pdf")
        import shutil
        shutil.copy2(pdf_path, dest_path)
