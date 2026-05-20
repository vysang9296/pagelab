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
from backend.local_nav import LocalNav
from backend.virtual_fs import VirtualFS
from backend.search_engine import get_search_engine

class Api:
    def __init__(self):
        self._window = None
        self._fm = get_file_manager()
        self._converter = None  # Lazy Initialization to prevent 50% freeze on startup
        self._search_engine = get_search_engine()

    # ---- FolderLab Bridge Methods ----
    def choose_dir(self):
        """Opens a directory picker dialog for changing local explorer root or real staging root."""
        if not self._window: return None
        self.log("Opening directory picker dialog...")
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        return result[0] if result else None

    def get_local_tree(self, root_path=None):
        self.log(f"Fetching local tree for {root_path or 'default Documents'}")
        
        if not root_path or not os.path.exists(root_path):
            root_path = os.path.expanduser('~/Documents')
            if not os.path.exists(root_path):
                root_path = os.path.expanduser('~')
                if not os.path.exists(root_path):
                    root_path = os.path.abspath('.')

        try:
            tree = LocalNav.get_local_tree(root_path)
            return { "root_path": root_path, "status": "success", "tree": tree }
        except Exception as e:
            self.log(f"Scan error: {e}")
            return { "root_path": root_path, "status": "error" }

    def get_full_tree_recursive(self, target_path):
        """Recursively scans a directory and returns flat groups of files."""
        if not os.path.exists(target_path) or not os.path.isdir(target_path):
            return {"status": "error", "groups": []}
            
        groups = []
        base_name = os.path.basename(target_path)
        
        group_count = 0
        file_count = 0
        MAX_GROUPS = 500
        MAX_FILES = 5000
        truncated = False
        
        for root, dirs, files in os.walk(target_path):
            if any(d.startswith('.') for d in root.split(os.sep)): continue
            if group_count >= MAX_GROUPS or file_count >= MAX_FILES:
                truncated = True
                break
            
            rel_path = os.path.relpath(root, target_path)
            group_name = base_name if rel_path == '.' else f"{base_name}/{rel_path.replace(os.sep, '/')}"
            
            group_files = []
            for file in files:
                if file.startswith('.'): continue
                if file_count >= MAX_FILES:
                    truncated = True
                    break
                group_files.append({
                    "name": file,
                    "path": os.path.join(root, file)
                })
                file_count += 1
                
            if group_files or rel_path == '.':
                groups.append({
                    "name": group_name,
                    "files": group_files
                })
                group_count += 1
                
        return {"status": "success", "groups": groups, "truncated": truncated}

    def fl_index_current_folder(self, folder_path):
        """Explicit on-demand indexing triggered by user button."""
        if not folder_path or not os.path.exists(folder_path): return False
        self.log(f"Starting explicit on-demand indexing for: {folder_path}")
        
        def _progress(count, filename):
            if self._window:
                import json
                safe_name = json.dumps(filename)
                self._window.evaluate_js(f"flUpdateIndexStatus({count}, {safe_name})")

        def _bg():
            try:
                count, was_cancelled, truncated = self._search_engine.index_target_folder(folder_path, progress_callback=_progress)
                self.log(f"On-demand indexing finished. Indexed {count} docs. Cancelled: {was_cancelled}")
                if self._window:
                    cancel_str = "true" if was_cancelled else "false"
                    trunc_str = "true" if truncated else "false"
                    self._window.evaluate_js(f"flCompleteIndexStatus({count}, {cancel_str}, {trunc_str})")
            except Exception as e:
                self.log(f"On-demand indexing error: {e}")
                if self._window:
                    self._window.evaluate_js("flErrorIndexStatus()")
                
        import threading
        t = threading.Thread(target=_bg, daemon=True)
        t.start()
        return True

    def fl_cancel_index(self):
        self.log("Cancelling document indexing...")
        self._search_engine.cancel_indexing()
        return True

    def fl_is_trigram_supported(self):
        return self._search_engine.get_trigram_status()

    def search_documents(self, query):

        self.log(f"Searching documents for query: {query}")
        try:
            results = self._search_engine.search(query)
            self.log(f"Found {len(results)} matches.")
            return results
        except Exception as e:
            self.log(f"Search API Error: {e}")
            return []

    def export_virtual_folder(self, virtual_folders):
        if not self._window: return False
        self.log("Exporting virtual folders...")
        
        save_path = self.choose_save_path("가상폴더_패키징.zip")
        if not save_path: return False

        try:
            success = VirtualFS.export_virtual_tree(virtual_folders, save_path, export_mode='zip')
            if success:
                self._window.evaluate_js(f"alert('가상 폴더 패키징이 성공적으로 완료되었습니다:\\n{save_path}')")
                return True
        except Exception as e:
            self.log(f"Virtual Export Error: {traceback.format_exc()}")
            self._window.evaluate_js(f"alert('가상 폴더 내보내기 실패:\\n{str(e)}')")
            return False

    # ---- Real-time Local Staging API ----
    def fl_real_mkdir(self, parent_dir, folder_name):
        """Creates an actual directory inside parent_dir."""
        try:
            new_dir = os.path.join(parent_dir, folder_name)
            os.makedirs(new_dir, exist_ok=True)
            self.log(f"Created real directory: {new_dir}")
            return True
        except Exception as e:
            self.log(f"Real mkdir error: {e}")
            self._window.evaluate_js(f"alert('폴더 생성 실패:\\n{str(e)}')")
            return False

    def fl_real_copy(self, src_path, dest_dir):
        """Copies an actual file from src_path to dest_dir."""
        try:
            if not os.path.exists(src_path) or not os.path.exists(dest_dir):
                return False
            dest_path = os.path.join(dest_dir, os.path.basename(src_path))
            
            base, ext = os.path.splitext(dest_path)
            counter = 1
            while os.path.exists(dest_path):
                dest_path = f"{base}({counter}){ext}"
                counter += 1

            shutil.copy2(src_path, dest_path)
            self.log(f"Copied real file: {src_path} -> {dest_path}")
            return True
        except Exception as e:
            self.log(f"Real copy error: {e}")
            self._window.evaluate_js(f"alert('파일 복사 실패:\\n{str(e)}')")
            return False

    def fl_transfer_items(self, items, dest_dir, mode='copy'):
        """
        Transfers multiple selected items (list of dicts with 'path', 'isDir') to dest_dir.
        mode can be 'copy' or 'move'.
        """
        if not dest_dir or not os.path.exists(dest_dir):
            self._window.evaluate_js("alert('타겟 폴더가 연결되어 있지 않거나 존재하지 않습니다.')")
            return False

        success_count = 0
        try:
            for item in items:
                src_path = item.get('path')
                is_dir = item.get('isDir', False)
                if not src_path or not os.path.exists(src_path): continue
                
                dest_path = os.path.join(dest_dir, os.path.basename(src_path))
                
                # Handle duplicate name
                if os.path.exists(dest_path):
                    base, ext = os.path.splitext(dest_path)
                    counter = 1
                    while os.path.exists(dest_path):
                        dest_path = f"{base}({counter}){ext}"
                        counter += 1

                if is_dir:
                    if mode == 'copy':
                        shutil.copytree(src_path, dest_path)
                    elif mode == 'move':
                        shutil.move(src_path, dest_path)
                else:
                    if mode == 'copy':
                        shutil.copy2(src_path, dest_path)
                    elif mode == 'move':
                        shutil.move(src_path, dest_path)
                success_count += 1

            self.log(f"Transferred {success_count} items ({mode}) to {dest_dir}")
            return True
        except Exception as e:
            self.log(f"Transfer error: {e}")
            self._window.evaluate_js(f"alert('전송 중 오류 발생:\\n{str(e)}')")
            return False

    def fl_open_file(self, file_path):
        """Opens a file immediately with the default Windows application."""
        try:
            if not os.path.exists(file_path): return False
            self.log(f"Opening file in OS: {file_path}")
            os.startfile(file_path)
            return True
        except Exception as e:
            self.log(f"Open file error: {e}")
            self._window.evaluate_js(f"alert('파일 실행 실패:\\n{str(e)}')")
            return False

    def fl_open_folder_in_explorer(self, file_path):
        """Opens the folder containing the file in Windows Explorer."""
        try:
            if not os.path.exists(file_path): return False
            folder = os.path.dirname(file_path) if os.path.isfile(file_path) else file_path
            self.log(f"Opening folder in OS: {folder}")
            os.startfile(folder)
            return True
        except Exception as e:
            self.log(f"Open folder error: {e}")
            self._window.evaluate_js(f"alert('폴더 열기 실패:\\n{str(e)}')")
            return False

    def fl_commit_real_staging(self, dest_root, staging_tree):
        """
        Commits simulated staging tree structure to actual dest_root.
        staging_tree is a list of simulated folder nodes, each containing 'name' and 'children' (files).
        """
        if not dest_root or not os.path.exists(dest_root):
            self._window.evaluate_js("alert('타겟 폴더가 연결되어 있지 않거나 존재하지 않습니다.')")
            return False

        self.log(f"Committing real staging tree to: {dest_root}")
        success_count = 0
        try:
            for folder_node in staging_tree:
                folder_name = folder_node.get('name', '새 폴더')
                target_dir = os.path.join(dest_root, folder_name)
                os.makedirs(target_dir, exist_ok=True)
                self.log(f"[Commit] Created/Verified dir: {target_dir}")

                for child in folder_node.get('children', []):
                    src_path = child.get('path')
                    if not src_path or not os.path.exists(src_path): continue
                    
                    dest_path = os.path.join(target_dir, os.path.basename(src_path))
                    
                    # Handle duplicate
                    if os.path.exists(dest_path):
                        base, ext = os.path.splitext(dest_path)
                        counter = 1
                        while os.path.exists(dest_path):
                            dest_path = f"{base}({counter}){ext}"
                            counter += 1

                    if os.path.isdir(src_path):
                        if os.path.exists(dest_path):
                            shutil.copytree(src_path, dest_path, dirs_exist_ok=True, symlinks=True)
                        else:
                            shutil.copytree(src_path, dest_path, symlinks=True)
                    else:
                        shutil.copy2(src_path, dest_path)
                    success_count += 1
                    self.log(f"[Commit] Copied: {src_path} -> {dest_path}")

            self.log(f"Successfully committed {success_count} files to {dest_root}")
            self._window.evaluate_js(f"alert('최종 커밋 성공!\\n{success_count}개의 파일이 실제 디렉토리에 동기화되었습니다.')")
            return True
        except Exception as e:
            self.log(f"Commit error: {traceback.format_exc()}")
            self._window.evaluate_js(f"alert('최종 커밋 중 오류 발생:\\n{str(e)}')")
            return False

    def fl_real_delete(self, target_path):
        """Deletes an actual file or empty directory."""
        try:
            if not os.path.exists(target_path): return False
            if os.path.isdir(target_path):
                os.rmdir(target_path)
            else:
                os.remove(target_path)
            self.log(f"Deleted real item: {target_path}")
            return True
        except Exception as e:
            self.log(f"Real delete error: {e}")
            self._window.evaluate_js(f"alert('삭제 실패 (폴더가 비어있는지 확인하세요):\\n{str(e)}')")
            return False

    def fl_copy_items_real(self, src_paths, dest_dir):
        """Copies multiple items to a target directory immediately."""
        import shutil
        if not os.path.exists(dest_dir): return False
        
        success_count = 0
        try:
            for src in src_paths:
                if not os.path.exists(src): continue
                dest_path = os.path.join(dest_dir, os.path.basename(src))
                
                if os.path.exists(dest_path):
                    base, ext = os.path.splitext(dest_path)
                    counter = 1
                    while os.path.exists(dest_path):
                        dest_path = f"{base}({counter}){ext}"
                        counter += 1

                if os.path.isdir(src):
                    shutil.copytree(src, dest_path, dirs_exist_ok=True, symlinks=True)
                else:
                    shutil.copy2(src, dest_path)
                success_count += 1
                self.log(f"[RealCopy] Copied {src} to {dest_path}")
            return True
        except Exception as e:
            self.log(f"[RealCopy] Error: {e}")
            self._window.evaluate_js(f"alert('복사 중 오류 발생:\\n{str(e)}')")
            return False

    def fl_real_delete_multi(self, target_paths):
        """Deletes multiple actual files/directories."""
        success_count = 0
        try:
            for p in target_paths:
                if not os.path.exists(p): continue
                if os.path.isdir(p):
                    shutil.rmtree(p)
                else:
                    os.remove(p)
                success_count += 1
            self.log(f"Deleted {success_count} items multi.")
            return True
        except Exception as e:
            self.log(f"Multi delete error: {e}")
            self._window.evaluate_js(f"alert('단체 삭제 실패:\\n{str(e)}')")
            return False




    # ---- PageLab Bridge Methods (Existing) ----
    def upload_files(self):
        if not self._window: return []
        
        file_types = ('Document Files (*.pdf;*.hwp;*.hwpx)', 'All files (*.*)')
        files = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types
        )
        if not files: return []

        return self.process_files(files)

    def upload_dropped_file_bytes(self, filename, base64_data):
        import base64
        temp_dir = self._fm.get_temp_path("dropped_files")
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
                    if not self._converter:
                        self._converter = get_hwp_converter()
                    temp_pdf_name = f"{uuid.uuid4()}.pdf"
                    pdf_path = self._fm.get_temp_path(temp_pdf_name)
                    self._converter.convert_to_pdf(file_path, pdf_path)
                    
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
                self._window.evaluate_js(f"alert(decodeURIComponent(escape(window.atob('{b64_msg}'))))")

        return results

    def choose_save_path(self, default_filename: str):
        """Ask user where to save, with default filename."""
        if not self._window: return None
        
        ext = os.path.splitext(default_filename)[1].lower()
        if ext == '.zip':
            file_types = ('ZIP Archive (*.zip)', 'All files (*.*)')
        else:
            file_types = ('PDF Document (*.pdf)', 'All files (*.*)')
            
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG, 
            save_filename=default_filename,
            file_types=file_types
        )
        return result[0] if result else None

    def export_original(self, original_path, save_path):
        """Copies the pure original file to the save path."""
        try:
            shutil.copy2(original_path, save_path)
            self._window.evaluate_js(f"alert('성공적으로 저장되었습니다:\\n{save_path}')")
            return True
        except Exception as e:
            self.log(f"Original Export Error: {traceback.format_exc()}")
            self._window.evaluate_js(f"alert('저장 실패:\\n{str(e)}')")
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
            temp_dir = self._fm.get_temp_path(f"export_{uuid.uuid4().hex[:8]}")
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
                        self._fm.create_zip_archive(sub_pdfs, sub_zip_path)
                        files_to_zip.append(sub_zip_path)
                
                # Create final zip at save_path
                self._fm.create_zip_archive(files_to_zip, save_path)
                
            self._window.evaluate_js(f"alert('성공적으로 저장되었습니다:\\n{save_path}')")
            return True
            
        except Exception as e:
            self.log(f"Export Error: {traceback.format_exc()}")
            self._window.evaluate_js(f"alert('내보내기 실패:\\n{str(e)}')")
            return False

    def cleanup(self):
        self._fm.cleanup()
        if self._converter:
            self._converter.quit()


    def log(self, message):
        print(f"[Backend] {message}")

if __name__ == '__main__':
    api = Api()
    frontend_path = os.path.join(os.path.dirname(__file__), 'frontend', 'index.html')
    
    window = webview.create_window(
        'Public Binder (Page Lab / Folder Lab)', 
        url=frontend_path, js_api=api,
        width=1400, height=900, min_size=(1024, 768)
    )
    api._window = window
    
    try:
        webview.start(debug=False)
    finally:
        api.cleanup()

