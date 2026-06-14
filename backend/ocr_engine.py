import os
import asyncio
from typing import Dict, Any

class WindowsOCREngine:
    def ocr_from_image(self, image_path: str) -> Dict[str, Any]:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
            
        # Create a new event loop to avoid multithreading conflicts in pywebview (Edge WebView2 threads)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            import winrt.windows.media.ocr as ocr
            import winrt.windows.graphics.imaging as imaging
            import winrt.windows.storage.streams as streams
            from winrt.windows.storage import StorageFile
            
            async def run_ocr():
                # Open the file
                storage_file = await StorageFile.get_file_from_path_async(os.path.abspath(image_path))
                stream = await storage_file.open_async(1) # Read mode
                
                # Decode image
                decoder = await imaging.BitmapDecoder.create_async(stream)
                bitmap = await decoder.get_software_bitmap_async()
                
                # Check for Korean language pack support
                lang = ocr.Language("ko")
                if not ocr.OcrEngine.is_language_supported(lang):
                    return {"success": False, "error_code": "ko-language-pack-missing", "text": ""}
                    
                # Create OCR Engine
                engine = ocr.OcrEngine.try_create_from_language(lang)
                if not engine:
                    return {"success": False, "error_code": "init-failed", "text": ""}
                    
                # Perform OCR
                result = await engine.recognize_async(bitmap)
                return {"success": True, "error_code": "", "text": result.text}
                
            return loop.run_until_complete(run_ocr())
            
        except ImportError:
            return {"success": False, "error_code": "winrt-module-missing", "text": ""}
        except Exception as e:
            return {"success": False, "error_code": "processing-failed", "text": str(e)}
        finally:
            loop.close()
