import webview
import os
import sys
import uuid
import traceback
import shutil
import re

def safe_filename(name: str, default="Export") -> str:
    if not name: return default
    name = str(name).strip()
    name = re.sub(r'[\\/:*?"<>|]+', '_', name)
    name = name.replace('..', '_')
    return name[:100] or default

from backend.hwp_converter import get_hwp_converter
from backend.pdf_processor import PdfProcessor
from backend.file_manager import get_file_manager

class Api:
    def __init__(self):
        self.window = None
        self.fm = get_file_manager()
        self.converter = get_hwp_converter()

    def upload_files(self):
        if not self.window: return []
        
        file_types = ('Document Files (*.pdf;*.hwp;*.hwpx)', 'All files (*.*)')
        files = self.window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types
        )
        if not files: return []

        return self.process_files(files)

    def upload_dropped_file_bytes(self, filename, base64_data):
        import base64
        temp_dir = self.fm.get_temp_path("dropped_files")
        os.makedirs(temp_dir, exist_ok=True)
        
        safe_name = safe_filename(os.path.basename(filename), "dropped_file")
        file_path = os.path.join(temp_dir, safe_name)
        
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(base64_data))
            
        return self.process_files([file_path])
        
    def process_files(self, files):
        results = []
        for file_path in files:
            ext = os.path.splitext(file_path)[1].lower()
            pdf_path = file_path
            
            try:
                if ext in ['.hwp', '.hwpx']:
                    self.log(f"Converting {file_path}...")
                    temp_pdf_name = f"{uuid.uuid4()}.pdf"
                    pdf_path = self.fm.get_temp_path(temp_pdf_name)
                    self.converter.convert_to_pdf(file_path, pdf_path)
                    
                thumbnails = PdfProcessor.extract_thumbnails(pdf_path, dpi=72)
                
                results.append({
                    "original_path": file_path,
                    "pdf_path": pdf_path,
                    "filename": os.path.basename(file_path),
                    "thumbnails": thumbnails
                })
            except Exception as e:
                self.log(f"Error processing {file_path}: {traceback.format_exc()}")
                import base64
                error_msg = f"오류 발생 ({os.path.basename(file_path)}):\\n{str(e)}"
                b64_msg = base64.b64encode(error_msg.encode('utf-8')).decode('utf-8')
                self.window.evaluate_js(f"alert(decodeURIComponent(escape(window.atob('{b64_msg}'))))")

        return results

    def choose_save_path(self, default_filename: str):
        """Ask user where to save, with default filename."""
        if not self.window: return None
        
        ext = os.path.splitext(default_filename)[1].lower()
        if ext == '.zip':
            file_types = ('ZIP Archive (*.zip)', 'All files (*.*)')
        else:
            file_types = ('PDF Document (*.pdf)', 'All files (*.*)')
            
        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG, 
            save_filename=default_filename,
            file_types=file_types
        )
        return result[0] if result else None

    def export_original(self, original_path, save_path):
        """Copies the pure original file to the save path."""
        try:
            shutil.copy2(original_path, save_path)
            self.window.evaluate_js(f"alert('성공적으로 저장되었습니다:\\n{save_path}')")
            return True
        except Exception as e:
            self.log(f"Original Export Error: {traceback.format_exc()}")
            self.window.evaluate_js(f"alert('저장 실패:\\n{str(e)}')")
            return False

    def export_data(self, export_type: str, save_path: str, payload: dict):
        """
        export_type: 'single_pdf', 'single_zip'
        payload contains generation instructions.
        """
        if export_type not in ('single_pdf', 'single_zip'):
            self.log(f"Blocked invalid export_type: {export_type}")
            return False

        # Validate rotation in payload
        if isinstance(payload, dict) and 'pages' in payload:
            for p in payload['pages']:
                if p.get('rotation') not in (0, 90, 180, 270): p['rotation'] = 0
        elif isinstance(payload, list):
            for item in payload:
                if 'data' in item and 'pages' in item['data']:
                    for p in item['data']['pages']:
                        if p.get('rotation') not in (0, 90, 180, 270): p['rotation'] = 0

        try:
            temp_dir = self.fm.get_temp_path(f"export_{uuid.uuid4().hex[:8]}")
            os.makedirs(temp_dir, exist_ok=True)
            
            if export_type == 'single_pdf':
                # payload is a single group dict
                PdfProcessor.merge_and_export(payload, temp_dir)
                safe_name = safe_filename(payload.get('group_name', 'Export'))
                generated_pdf = os.path.join(temp_dir, f"{safe_name}.pdf")
                shutil.copy2(generated_pdf, save_path)
                
            elif export_type == 'single_zip':
                # payload is a list of items to zip
                files_to_zip = []
                for item in payload:
                    if item.get('type') == 'pdf':
                        safe_grp_name = safe_filename(item['data'].get('group_name', 'Export'))
                        item['data']['group_name'] = safe_grp_name
                        pdf_path = PdfProcessor.merge_and_export(item['data'], temp_dir)
                        files_to_zip.append(pdf_path)
                    elif item.get('type') == 'zip':
                        safe_sub_name = safe_filename(item.get('name', 'Folder'))
                        sub_dir = os.path.join(temp_dir, safe_sub_name)
                        os.makedirs(sub_dir, exist_ok=True)
                        sub_pdfs = []
                        for sub_pdf_data in item['data']:
                            sub_pdf_data['group_name'] = safe_filename(sub_pdf_data.get('group_name', 'Export'))
                            sp = PdfProcessor.merge_and_export(sub_pdf_data, sub_dir)
                            sub_pdfs.append(sp)
                        sub_zip_path = os.path.join(temp_dir, f"{safe_sub_name}.zip")
                        self.fm.create_zip_archive(sub_pdfs, sub_zip_path)
                        files_to_zip.append(sub_zip_path)
                
                # Create final zip at save_path
                self.fm.create_zip_archive(files_to_zip, save_path)
                
            self.window.evaluate_js(f"alert('성공적으로 저장되었습니다:\\n{save_path}')")
            return True
            
        except Exception as e:
            self.log(f"Export Error: {traceback.format_exc()}")
            self.window.evaluate_js(f"alert('내보내기 실패:\\n{str(e)}')")
            return False

    def cleanup(self):
        self.fm.cleanup()
        self.converter.quit()

    def log(self, message):
        print(f"[Backend] {message}")

if __name__ == '__main__':
    api = Api()
    frontend_path = os.path.join(os.path.dirname(__file__), 'frontend', 'index.html')
    
    window = webview.create_window(
        'Public Binder (Page Lab)', 
        url=frontend_path, js_api=api,
        width=1400, height=900, min_size=(1024, 768)
    )
    api.window = window
    
    try:
        webview.start(debug=False)
    finally:
        api.cleanup()
