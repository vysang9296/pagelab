import os
import time
import fitz

class CropEngine:
    def crop_pdf_page(self, pdf_path: str, page_idx: int, x: float, y: float, w: float, h: float, vault_attachments_dir: str) -> str:
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
            
        os.makedirs(vault_attachments_dir, exist_ok=True)
        out_filename = f"notelab_crop_{int(time.time())}.png"
        out_path = os.path.join(vault_attachments_dir, out_filename)
        
        with fitz.open(pdf_path) as doc:
            if page_idx < 0 or page_idx >= len(doc):
                raise IndexError("Page index out of range")
            page = doc.load_page(page_idx)
            
            # Already mapped to fitz top-left coordinate system
            rect = fitz.Rect(x, y, x + w, y + h)
            pix = page.get_pixmap(clip=rect, dpi=150)
            pix.save(out_path)
            
        return out_filename
