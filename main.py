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

def send_to_trash(path: str) -> bool:
    """Sends a file or folder to the Windows Recycle Bin using ctypes and SHFileOperationW."""
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", ctypes.c_ushort),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", wintypes.LPVOID),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    SHFileOperationW = ctypes.windll.shell32.SHFileOperationW
    SHFileOperationW.argtypes = [ctypes.POINTER(SHFILEOPSTRUCTW)]
    SHFileOperationW.restype = ctypes.c_int

    FO_DELETE = 3
    FOF_ALLOWUNDO = 0x0040
    FOF_NOCONFIRMATION = 0x0010
    FOF_NOERRORUI = 0x0400
    FOF_SILENT = 0x0004

    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        return False

    p_from = abs_path + "\0\0"

    fileop = SHFILEOPSTRUCTW()
    fileop.hwnd = None
    fileop.wFunc = FO_DELETE
    fileop.pFrom = p_from
    fileop.pTo = None
    fileop.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT
    fileop.fAnyOperationsAborted = False
    fileop.hNameMappings = None
    fileop.lpszProgressTitle = None

    result = SHFileOperationW(ctypes.byref(fileop))
    return result == 0

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
        
        # Pre-flight checks
        try:
            from backend.refiner_cache import Diagnostics
            kordoc_exe = "backend/bin/kordoc.exe"
            diagnostics = Diagnostics.run_preflight_checks(kordoc_exe)
            if not diagnostics["kordoc"]:
                self.log("[Diagnostic] WARNING: kordoc.exe pre-flight check failed.")
            else:
                self.log("[Diagnostic] kordoc.exe pre-flight check passed.")
            
            if not diagnostics["ocr_korean"]:
                self.log("[Diagnostic] WARNING: Windows Media OCR Korean pack is missing.")
            else:
                self.log("[Diagnostic] WinRT OCR Korean pack check passed.")
        except Exception as e:
            self.log(f"[Diagnostic] Error during preflight checks: {e}")

    def evaluate_js(self, js_code):
        if self._window:
            try:
                return self._window.evaluate_js(js_code)
            except Exception as e:
                self.log(f"evaluate_js error: {e}")
        return None

    def js_alert(self, message):
        import json
        escaped = json.dumps(message)
        self.evaluate_js(f"alert({escaped})")

    def _parse_dialog_result(self, result):
        if not result:
            return None
        if isinstance(result, (list, tuple)):
            return result[0] if len(result) > 0 else None
        return result

    # ---- FolderLab Bridge Methods ----
    def choose_dir(self):
        """Opens a directory picker dialog for changing local explorer root or real staging root."""
        if not self._window: return None
        self.log("Opening directory picker dialog...")
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        return self._parse_dialog_result(result)

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

    def get_local_tree_recursive(self, target_path):
        """Recursively scans target_path and returns a nested tree structure for virtual staging."""
        if not os.path.exists(target_path):
            return {"status": "error", "message": "Path does not exist"}
        
        limit_files = 2000
        self._scanned_count = 0
        
        from backend.local_nav import format_size, format_mtime

        def _scan(path):
            if self._scanned_count >= limit_files:
                return None
            name = os.path.basename(path)
            if not name:
                name = path
                
            if os.path.isdir(path):
                node_id = f"sfolder_{uuid.uuid4().hex[:8]}"
                try:
                    stat_info = os.stat(path)
                    mtime_str = format_mtime(stat_info.st_mtime)
                except:
                    mtime_str = ""
                node = {
                    "id": node_id,
                    "name": name,
                    "isDir": True,
                    "path": path,
                    "size": "[ DIR ]",
                    "mtime": mtime_str,
                    "children": []
                }
                try:
                    for entry in os.scandir(path):
                        if entry.name.startswith('.'): continue
                        child_node = _scan(entry.path)
                        if child_node:
                            node["children"].append(child_node)
                except PermissionError:
                    pass
                return node
            else:
                self._scanned_count += 1
                try:
                    stat_info = os.stat(path)
                    size_str = format_size(stat_info.st_size)
                    mtime_str = format_mtime(stat_info.st_mtime)
                except:
                    size_str = "0 B"
                    mtime_str = ""
                
                return {
                    "id": f"sfile_{uuid.uuid4().hex[:8]}",
                    "name": name,
                    "isDir": False,
                    "path": path,
                    "size": size_str,
                    "mtime": mtime_str
                }
        
        try:
            tree = _scan(target_path)
            if tree is None:
                return {"status": "error", "message": "Failed to scan folder or too many files"}
            return {"status": "success", "tree": tree, "truncated": self._scanned_count >= limit_files}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def fl_index_current_folder(self, folder_path, silent=False):
        """Indexes folder in the background. silent=True bypasses blocking alerts but shows status."""
        if not folder_path or not os.path.exists(folder_path): return False
        self.log(f"Starting indexing for: {folder_path} (Silent: {silent})")
        
        silent_str = "true" if silent else "false"

        self.evaluate_js(f"flStartIndexStatus({silent_str})")

        def _progress(count, total, filename):
            import json
            safe_name = json.dumps(filename)
            self.evaluate_js(f"flUpdateIndexStatus({count}, {total}, {safe_name}, {silent_str})")

        def _bg():
            try:
                count, was_cancelled, truncated = self._search_engine.index_target_folder(folder_path, progress_callback=_progress)
                self.log(f"Indexing finished. Indexed {count} docs. Cancelled: {was_cancelled}")
                cancel_str = "true" if was_cancelled else "false"
                trunc_str = "true" if truncated else "false"
                self.evaluate_js(f"flCompleteIndexStatus({count}, {cancel_str}, {trunc_str}, {silent_str})")
            except Exception as e:
                self.log(f"Indexing error: {e}")
                self.evaluate_js("flErrorIndexStatus()")
                
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

    def search_documents(self, query, ext_filter='all', date_filter='all', size_filter='all'):
        self.log(f"Searching documents (Query: {query}, Ext: {ext_filter}, Date: {date_filter}, Size: {size_filter})")
        try:
            results = self._search_engine.search(query, ext_filter, date_filter, size_filter)
            self.log(f"Found {len(results)} matches after filtering.")
            return results
        except Exception as e:
            self.log(f"Search API Error: {e}")
            return []

    def fl_start_watchdog(self, folder_path):
        if not folder_path or not os.path.exists(folder_path): return False
        self.log(f"Starting real-time watchdog for: {folder_path}")
        return self._search_engine.start_watchdog(folder_path)

    def fl_stop_watchdog(self):
        self.log("Stopping real-time watchdog...")
        self._search_engine.stop_watchdog()
        return True

    def export_virtual_folder(self, virtual_folders):
        if not self._window: return False
        self.log("Exporting virtual folders...")
        
        save_path = self.choose_save_path("가상폴더_패키징.zip")
        if not save_path: return False

        try:
            success = VirtualFS.export_virtual_tree(virtual_folders, save_path, export_mode='zip')
            if success:
                self.js_alert(f"가상 폴더 패키징이 성공적으로 완료되었습니다:\n{save_path}")
                return True
        except Exception as e:
            self.log(f"Virtual Export Error: {traceback.format_exc()}")
            self.js_alert(f"가상 폴더 내보내기 실패:\n{str(e)}")
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
            self.js_alert(f"폴더 생성 실패:\n{str(e)}")
            return False

    def fl_real_rename(self, old_path, new_name):
        """Renames a real file or folder on the local disk."""
        try:
            if not os.path.exists(old_path):
                self.js_alert('대상 파일 또는 폴더가 존재하지 않습니다.')
                return False
            
            new_name = new_name.strip()
            if not new_name or any(c in new_name for c in r'\/:*?"<>|'):
                self.js_alert('올바르지 않은 이름이거나 허용되지 않는 문자가 포함되어 있습니다.')
                return False
            
            parent_dir = os.path.dirname(old_path)
            new_path = os.path.join(parent_dir, new_name)
            
            if os.path.exists(new_path):
                self.js_alert('동일한 이름의 파일 또는 폴더가 이미 존재합니다.')
                return False
            
            os.rename(old_path, new_path)
            self.log(f"Renamed real path: {old_path} -> {new_path}")
            return True
        except Exception as e:
            self.log(f"Real rename error: {e}")
            self.js_alert(f"이름 변경 실패:\n{str(e)}")
            return False


    def fl_transfer_items(self, items, dest_dir, mode='copy'):
        """
        Transfers multiple selected items (list of dicts with 'path', 'isDir') to dest_dir.
        mode can be 'copy' or 'move'.
        """
        if not dest_dir or not os.path.exists(dest_dir):
            self.js_alert('타겟 폴더가 연결되어 있지 않거나 존재하지 않습니다.')
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
            self.js_alert(f"전송 중 오류 발생:\n{str(e)}")
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
            self.js_alert(f"파일 실행 실패:\n{str(e)}")
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
            self.js_alert(f"폴더 열기 실패:\n{str(e)}")
            return False

    def fl_commit_real_staging(self, dest_root, staging_tree):
        """
        Commits simulated staging tree structure to actual dest_root.
        staging_tree is a list of simulated folder nodes, each containing 'name' and 'children' (files).
        """
        if not dest_root or not os.path.exists(dest_root):
            self.js_alert('타겟 폴더가 연결되어 있지 않거나 존재하지 않습니다.')
            return False

        self.log(f"Committing real staging tree to: {dest_root}")
        try:
            # Create a Staging_Export wrapper directory.
            # If it already exists, generate Staging_Export(1), Staging_Export(2), etc.
            base_export_name = "Staging_Export"
            export_root = os.path.join(dest_root, base_export_name)
            counter = 1
            while os.path.exists(export_root):
                export_root = os.path.join(dest_root, f"{base_export_name}({counter})")
                counter += 1
            
            success = VirtualFS.export_virtual_tree(staging_tree, export_root, export_mode='copy')
            if success:
                total_files = 0
                for root, dirs, files in os.walk(export_root):
                    total_files += len(files)
                self.log(f"Successfully committed {total_files} files to {export_root}")
                self.js_alert(f"최종 커밋 성공!\n{total_files}개의 항목이 실제 디렉토리에 동기화되었습니다.\n위치: {export_root}")
                return True
            else:
                raise RuntimeError("Staging copy failed inside VirtualFS")
        except Exception as e:
            self.log(f"Commit error: {traceback.format_exc()}")
            self.js_alert(f"최종 커밋 중 오류 발생:\n{str(e)}")
            return False

    def fl_real_delete(self, target_path):
        """Sends an actual file or directory to the Recycle Bin."""
        try:
            if not os.path.exists(target_path): return False
            if send_to_trash(target_path):
                self.log(f"Recycled real item: {target_path}")
                return True
            else:
                raise RuntimeError("Recycle operation failed.")
        except Exception as e:
            self.log(f"Real delete error: {e}")
            self.js_alert(f"삭제 실패:\n{str(e)}")
            return False

    def fl_real_delete_multi(self, target_paths):
        """Sends multiple actual files/directories to the Recycle Bin."""
        success_count = 0
        try:
            for p in target_paths:
                if not os.path.exists(p): continue
                if send_to_trash(p):
                    success_count += 1
            self.log(f"Recycled {success_count} items multi.")
            return True
        except Exception as e:
            self.log(f"Multi delete error: {e}")
            self.js_alert(f"단체 삭제 실패:\n{str(e)}")
            return False




    # ---- PageLab Bridge Methods (Existing) ----
    def upload_files(self):
        if not self._window: return []
        
        file_types = ('Supported Files (*.pdf;*.hwp;*.hwpx;*.png;*.jpg;*.jpeg)', 'All files (*.*)')
        files = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types
        )
        if not files: return []
        if isinstance(files, str):
            files = [files]

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
        from backend.refiner_cache import PdfCacheManager
        cache_manager = PdfCacheManager()
        
        for file_path in files:
            ext = os.path.splitext(file_path)[1].lower()
            pdf_path = file_path
            
            try:
                if ext in ['.hwp', '.hwpx']:
                    cached_pdf = cache_manager.get_cached_pdf(file_path)
                    if cached_pdf:
                        self.log(f"Using cached PDF for {file_path} -> {cached_pdf}")
                        pdf_path = cached_pdf
                    else:
                        self.log(f"Converting {file_path}...")
                        if not self._converter:
                            self._converter = get_hwp_converter()
                        temp_pdf_name = f"{uuid.uuid4()}.pdf"
                        temp_pdf_path = self._fm.get_temp_path(temp_pdf_name)
                        self._converter.convert_to_pdf(file_path, temp_pdf_path)
                        cache_manager.cache_pdf(file_path, temp_pdf_path)
                        pdf_path = temp_pdf_path
                elif ext in ['.png', '.jpg', '.jpeg']:
                    self.log(f"Converting image {file_path} to PDF...")
                    temp_pdf_name = f"{uuid.uuid4()}.pdf"
                    pdf_path = self._fm.get_temp_path(temp_pdf_name)
                    
                    import fitz
                    img_doc = fitz.open(file_path)
                    pdf_bytes = img_doc.convert_to_pdf()
                    img_doc.close()
                    
                    with open(pdf_path, "wb") as f_pdf:
                        f_pdf.write(pdf_bytes)
                    
                thumbnails = PdfProcessor.extract_thumbnails(pdf_path, dpi=72)
                
                results.append({
                    "original_path": file_path,
                    "pdf_path": pdf_path,
                    "filename": os.path.basename(file_path),
                    "thumbnails": thumbnails
                })
            except Exception as e:
                self.log(f"Error processing {file_path}: {traceback.format_exc()}")
                self.js_alert(f"오류 발생 ({os.path.basename(file_path)}):\n{str(e)}")

        return results

    def notelab_refine_text(self, text):
        """정제 엔진을 호출하여 줄바꿈 붕괴 및 자모 분리를 보정합니다."""
        from backend.refiner_cache import TextRefiner
        try:
            refiner = TextRefiner()
            refined = refiner.refine(text)
            return {"success": True, "refined_text": refined}
        except Exception as e:
            self.log(f"Refine error: {e}")
            return {"success": False, "error": str(e), "refined_text": text}

    def notelab_get_preflight_status(self):
        """kordoc 및 OCR 사전진단 상태를 프론트엔드로 즉시 반환합니다."""
        from backend.refiner_cache import Diagnostics
        kordoc_exe = "backend/bin/kordoc.exe"
        return Diagnostics.run_preflight_checks(kordoc_exe)

    def notelab_parse_to_markdown(self, file_path):
        """Kordoc을 사용하여 HWP/PDF 파일을 마크다운으로 파싱하고 필요시 캐시 PDF 경로를 반환합니다."""
        self.log(f"Kordoc parsing requested for {file_path}")
        from backend.refiner_cache import PdfCacheManager
        cache_manager = PdfCacheManager()
        
        pdf_path = file_path
        ext = os.path.splitext(file_path)[1].lower()
        if ext in ['.hwp', '.hwpx']:
            cached_pdf = cache_manager.get_cached_pdf(file_path)
            if cached_pdf:
                pdf_path = cached_pdf
            else:
                try:
                    if not self._converter:
                        self._converter = get_hwp_converter()
                    temp_pdf_name = f"{uuid.uuid4()}.pdf"
                    temp_pdf_path = self._fm.get_temp_path(temp_pdf_name)
                    self._converter.convert_to_pdf(file_path, temp_pdf_path)
                    cache_manager.cache_pdf(file_path, temp_pdf_path)
                    pdf_path = temp_pdf_path
                except Exception as e:
                    self.log(f"PDF conversion failed: {e}")
        elif ext in ['.png', '.jpg', '.jpeg']:
            try:
                temp_pdf_name = f"{uuid.uuid4()}.pdf"
                temp_pdf_path = self._fm.get_temp_path(temp_pdf_name)
                import fitz
                img_doc = fitz.open(file_path)
                pdf_bytes = img_doc.convert_to_pdf()
                img_doc.close()
                with open(temp_pdf_path, "wb") as f_pdf:
                    f_pdf.write(pdf_bytes)
                pdf_path = temp_pdf_path
            except Exception as e:
                self.log(f"Image conversion failed: {e}")
                
        from backend.kordoc_adapter import KordocParserAdapter
        try:
            adapter = KordocParserAdapter()
            res = adapter.parse_to_markdown(file_path)
            res["pdf_path"] = pdf_path
            
            # Catch return value indicating parsing failure to fallback
            if not res.get("success") or not res.get("markdown") or "### 오류" in res.get("markdown", ""):
                raise RuntimeError("Kordoc parser returned success=False or error block")
            return res
        except Exception as e:
            self.log(f"Kordoc parsing failed/skipped, using fallback DocumentParser: {e}")
            from backend.document_parser import DocumentParser
            from backend.refiner_cache import TextRefiner
            try:
                raw_text = DocumentParser.extract_text(file_path)
                refiner = TextRefiner()
                refined_text = refiner.refine(raw_text)
                
                filename = os.path.basename(file_path)
                fallback_markdown = f"# {filename}\n\n{refined_text}"
                return {
                    "markdown": fallback_markdown,
                    "metadata": {"fallback": True},
                    "success": True,
                    "pdf_path": pdf_path
                }
            except Exception as fallback_err:
                self.log(f"Fallback parsing error: {fallback_err}")
                return {
                    "markdown": f"### 오류\n파싱 중 에러 발생: {str(e)}\nFallback 에러: {str(fallback_err)}", 
                    "metadata": {}, 
                    "success": False, 
                    "pdf_path": pdf_path
                }

    def notelab_parse_multiple_to_markdown(self, file_paths):
        """다중 문서 파일들을 병합된 하나의 PDF와 결합된 마크다운 텍스트로 추출하여 반환합니다."""
        self.log(f"Parsing multiple files: {file_paths}")
        from backend.document_parser import DocumentParser
        from backend.refiner_cache import TextRefiner
        import uuid
        
        refiner = TextRefiner()
        markdown_parts = []
        
        # 1. Parse texts sequentially and concatenate
        for fp in file_paths:
            try:
                raw_text = DocumentParser.extract_text(fp)
                refined = refiner.refine(raw_text)
                filename = os.path.basename(fp)
                markdown_parts.append(f"# {filename}\n\n{refined}\n")
            except Exception as e:
                self.log(f"Fallback parse error for {fp} in multi-parse: {e}")
                
        merged_markdown = "\n---\n".join(markdown_parts)
        
        # 2. Merge individual file PDFs using fitz
        temp_pdfs = []
        from backend.refiner_cache import PdfCacheManager
        cache_manager = PdfCacheManager()
        
        try:
            for fp in file_paths:
                ext = os.path.splitext(fp)[1].lower()
                if ext in ['.hwp', '.hwpx']:
                    cached_pdf = cache_manager.get_cached_pdf(fp)
                    if cached_pdf:
                        temp_pdfs.append(cached_pdf)
                    else:
                        try:
                            if not self._converter:
                                self._converter = get_hwp_converter()
                            temp_pdf_name = f"{uuid.uuid4()}.pdf"
                            temp_pdf_path = self._fm.get_temp_path(temp_pdf_name)
                            self._converter.convert_to_pdf(fp, temp_pdf_path)
                            cache_manager.cache_pdf(fp, temp_pdf_path)
                            temp_pdfs.append(temp_pdf_path)
                        except Exception as hwp_e:
                            self.log(f"HWP conversion error for {fp} in multi-parse: {hwp_e}")
                elif ext == '.pdf':
                    temp_pdfs.append(fp)
                elif ext in ['.png', '.jpg', '.jpeg']:
                    try:
                        temp_pdf_name = f"{uuid.uuid4()}.pdf"
                        temp_pdf_path = self._fm.get_temp_path(temp_pdf_name)
                        import fitz
                        img_doc = fitz.open(fp)
                        pdf_bytes = img_doc.convert_to_pdf()
                        img_doc.close()
                        with open(temp_pdf_path, "wb") as f_pdf:
                            f_pdf.write(pdf_bytes)
                        temp_pdfs.append(temp_pdf_path)
                    except Exception as img_e:
                        self.log(f"Image conversion error for {fp} in multi-parse: {img_e}")
            
            # Merge PDFs using PyMuPDF (fitz)
            pdf_path = ""
            if temp_pdfs:
                import fitz
                merged_doc = fitz.open()
                for pdf in temp_pdfs:
                    with fitz.open(pdf) as sub_doc:
                        merged_doc.insert_pdf(sub_doc)
                
                merged_pdf_name = f"merged_{uuid.uuid4().hex[:8]}.pdf"
                merged_pdf_path = self._fm.get_temp_path(merged_pdf_name)
                merged_doc.save(merged_pdf_path)
                merged_doc.close()
                pdf_path = merged_pdf_path
                
            return {
                "success": True,
                "markdown": merged_markdown,
                "pdf_path": pdf_path,
                "metadata": {"merged": True}
            }
        except Exception as e:
            self.log(f"Multi-PDF merge failed: {e}")
            return {
                "success": False,
                "markdown": merged_markdown,
                "pdf_path": file_paths[0] if file_paths else "",
                "error": str(e)
            }

    def notelab_get_pdf_base64(self, pdf_path):
        """PDF 파일의 binary 데이터를 Base64 string으로 반환합니다."""
        self.log(f"Fetching PDF base64 for: {pdf_path}")
        import base64
        try:
            if not os.path.exists(pdf_path):
                return {"success": False, "error": "파일이 존재하지 않습니다."}
            with open(pdf_path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
            return {"success": True, "base64": encoded}
        except Exception as e:
            self.log(f"PDF base64 fetch error: {e}")
            return {"success": False, "error": str(e)}

    def notelab_patch_document(self, original_path, edited_markdown, output_path):
        """마크다운 편집본을 원본 HWP/HWPX 서식에 역패치하여 저장합니다."""
        self.log(f"Kordoc patch requested from {original_path} to {output_path}")
        from backend.kordoc_adapter import KordocParserAdapter
        try:
            if not original_path or not os.path.exists(original_path):
                return {"success": False, "error": "원본 HWP/HWPX 경로가 없거나 파일이 존재하지 않습니다."}
            if not output_path:
                return {"success": False, "error": "저장 경로가 지정되지 않았습니다."}
            if edited_markdown is None:
                edited_markdown = ""

            # Prevent path traversal on output basename
            out_dir = os.path.dirname(os.path.abspath(output_path))
            out_base = safe_filename(os.path.basename(output_path), "patched.hwpx")
            safe_output = os.path.join(out_dir, out_base)

            adapter = KordocParserAdapter()
            result = adapter.patch_document(original_path, edited_markdown, safe_output)
            if result.get("success"):
                self.log(f"Kordoc patch OK -> {result.get('output_path')} (bak: {result.get('backup_path')})")
            else:
                self.log(f"Kordoc patch failed: {result.get('error')}")
            return result
        except Exception as e:
            self.log(f"Kordoc patch error: {e}")
            return {"success": False, "error": str(e)}

    def notelab_choose_source_file(self):
        """Note Lab 문서 열기: PDF / HWP / HWPX / 이미지 선택."""
        if not self._window:
            return None
        file_types = (
            "문서 파일 (*.pdf;*.hwp;*.hwpx;*.png;*.jpg;*.jpeg)",
            "한글 문서 (*.hwp;*.hwpx)",
            "PDF (*.pdf)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types
        )
        return self._parse_dialog_result(result)

    def notelab_choose_hwp_file(self):
        """Note Lab 비교/패치용: HWP·HWPX만 선택."""
        if not self._window:
            return None
        file_types = (
            "한글 문서 (*.hwp;*.hwpx)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types
        )
        return self._parse_dialog_result(result)

    def notelab_choose_patch_save_path(self, default_filename: str):
        """HWPX 패치 결과 저장 경로 (파일 저장 대화상자)."""
        if not self._window:
            return None
        if not default_filename:
            default_filename = "patched.hwpx"
        # Normalize default to HWP family
        base, ext = os.path.splitext(default_filename)
        if ext.lower() not in (".hwp", ".hwpx"):
            default_filename = base + ".hwpx"
        file_types = (
            "한글 문서 (*.hwpx;*.hwp)",
            "HWPX (*.hwpx)",
            "HWP (*.hwp)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=default_filename,
            file_types=file_types,
        )
        return self._parse_dialog_result(result)

    def notelab_choose_markdown_save_path(self, default_filename: str = "note.md"):
        """노트 저장: Page/Folder Lab과 동일한 SAVE 대화상자 (파일명 지정 가능)."""
        if not self._window:
            return None
        if not default_filename:
            default_filename = "note.md"
        base, ext = os.path.splitext(default_filename)
        if ext.lower() not in (".md", ".markdown", ".txt"):
            default_filename = base + ".md"
        # 파일명 안전화 (경로 조작 방지 — 확장자는 유지)
        safe_base = safe_filename(os.path.basename(default_filename), "note.md")
        if not os.path.splitext(safe_base)[1]:
            safe_base = safe_base + ".md"
        file_types = (
            "Markdown (*.md)",
            "Text (*.txt)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=safe_base,
            file_types=file_types,
        )
        path = self._parse_dialog_result(result)
        if not path:
            return None
        # 사용자가 확장자를 빼면 .md 부여
        _, out_ext = os.path.splitext(path)
        if not out_ext:
            path = path + ".md"
        return path

    def notelab_choose_markdown_open(self):
        """기존 마크다운 노트 불러오기."""
        if not self._window:
            return None
        file_types = (
            "Markdown (*.md;*.markdown;*.txt)",
            "Markdown (*.md)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types
        )
        return self._parse_dialog_result(result)

    def notelab_load_markdown(self, file_path):
        """로컬 마크다운 파일을 읽어 에디터용 본문을 반환합니다."""
        self.log(f"Loading markdown note: {file_path}")
        try:
            if not file_path or not os.path.exists(file_path):
                return {"success": False, "error": "파일이 존재하지 않습니다.", "content": ""}
            ext = os.path.splitext(file_path)[1].lower()
            if ext not in (".md", ".markdown", ".txt", ""):
                return {
                    "success": False,
                    "error": "마크다운/텍스트 파일(.md, .txt)만 불러올 수 있습니다.",
                    "content": "",
                }
            # 과도한 파일 방지 (20MB)
            size = os.path.getsize(file_path)
            if size > 20 * 1024 * 1024:
                return {"success": False, "error": "파일이 너무 큽니다 (20MB 초과).", "content": ""}
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            return {
                "success": True,
                "content": content,
                "path": os.path.abspath(file_path),
                "filename": os.path.basename(file_path),
            }
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="cp949") as f:
                    content = f.read()
                return {
                    "success": True,
                    "content": content,
                    "path": os.path.abspath(file_path),
                    "filename": os.path.basename(file_path),
                }
            except Exception as e:
                return {"success": False, "error": f"인코딩 오류: {e}", "content": ""}
        except Exception as e:
            self.log(f"Load markdown error: {e}")
            return {"success": False, "error": str(e), "content": ""}

    def notelab_compare_documents(self, path_old, path_new):
        """두 문서의 신구대조표 마크다운을 반환합니다."""
        self.log(f"Kordoc compare requested: {path_old} vs {path_new}")
        from backend.kordoc_adapter import KordocParserAdapter
        try:
            adapter = KordocParserAdapter()
            diff_md = adapter.compare_documents(path_old, path_new)
            return {"success": True, "compare_result": diff_md}
        except Exception as e:
            self.log(f"Kordoc compare error: {e}")
            return {"success": False, "error": str(e), "compare_result": ""}

    def notelab_save_markdown(self, save_path, content):
        """마크다운 콘텐츠를 지정된 파일 경로에 로컬 저장하고 사용된 첨부 이미지를 함께 복사 이관합니다."""
        self.log(f"Saving markdown note to: {save_path}")
        import re
        import shutil
        try:
            if not save_path:
                return {"success": False, "error": "저장 경로가 없습니다."}
            # 경로 안전: 디렉터리는 유지, 파일명만 sanitize
            target_dir = os.path.dirname(os.path.abspath(save_path))
            raw_name = os.path.basename(save_path)
            safe_name = safe_filename(raw_name, "note.md")
            if not os.path.splitext(safe_name)[1]:
                safe_name = safe_name + ".md"
            save_path = os.path.join(target_dir, safe_name)

            # 1. Save the markdown content first
            os.makedirs(target_dir, exist_ok=True)
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(content if content is not None else "")
                
            # 2. Extract image relative paths (e.g. ![crop](attachments/notelab_crop_*.png))
            image_pattern = r'!\[.*?\]\((attachments[\\/][^)]+)\)'
            matches = re.findall(image_pattern, content)
            
            base_dir = os.path.dirname(os.path.abspath(__file__))
            src_attachments_root = os.path.join(base_dir, "frontend")
            
            # 3. Copy each match to the target dir
            for rel_img_path in matches:
                clean_rel_path = rel_img_path.replace('\\', '/')
                src_path = os.path.join(src_attachments_root, clean_rel_path)
                if os.path.exists(src_path):
                    dest_path = os.path.join(target_dir, clean_rel_path)
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    shutil.copy2(src_path, dest_path)
                    self.log(f"Copied attachment resource: {src_path} -> {dest_path}")
            
            return {"success": True, "path": save_path}
        except Exception as e:
            self.log(f"Save markdown error: {e}")
            return {"success": False, "error": str(e)}

    def choose_file(self):
        """파일 열기 대화상자를 노출하고 선택된 단일 파일 경로를 반환합니다.
        Note Lab 호환: PDF/HWP/HWPX/이미지 필터 적용."""
        if not self._window:
            return None
        file_types = (
            "문서 파일 (*.pdf;*.hwp;*.hwpx;*.png;*.jpg;*.jpeg)",
            "한글 문서 (*.hwp;*.hwpx)",
            "PDF (*.pdf)",
            "All files (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types
        )
        return self._parse_dialog_result(result)

    def notelab_open_system_settings(self, uri: str) -> bool:
        """Opens Windows system settings or URLs."""
        if not uri or not uri.startswith("ms-settings:"):
            return False
        try:
            self.log(f"Opening Windows settings URI: {uri}")
            os.startfile(uri)
            return True
        except Exception as e:
            self.log(f"Failed to open settings: {e}")
            return False

    def notelab_crop_pdf_page(self, pdf_path, page_idx, x, y, w, h, vault_dir):
        """PDF 페이지 영역을 크롭하여 frontend/attachments 폴더에 이미지로 저장합니다."""
        self.log(f"Crop requested: {pdf_path} page {page_idx} ({x}, {y}, {w}, {h})")
        from backend.crop_engine import CropEngine
        try:
            # Force target directory to frontend/attachments to align with webview static server
            base_dir = os.path.dirname(os.path.abspath(__file__))
            attachments_dir = os.path.join(base_dir, "frontend", "attachments")
            engine = CropEngine()
            filename = engine.crop_pdf_page(pdf_path, page_idx, x, y, w, h, attachments_dir)
            return {"success": True, "filename": filename, "relative_path": f"attachments/{filename}"}
        except Exception as e:
            self.log(f"Crop error: {e}")
            return {"success": False, "error": str(e)}

    def notelab_ocr_image(self, image_path):
        """이미지 경로를 받아 Windows Media OCR로 텍스트를 추출합니다."""
        self.log(f"OCR request for image: {image_path}")
        from backend.ocr_engine import WindowsOCREngine
        try:
            # If path is relative to attachments, resolve to absolute frontend/attachments/
            if not os.path.isabs(image_path) and image_path.startswith("attachments"):
                base_dir = os.path.dirname(os.path.abspath(__file__))
                image_path = os.path.join(base_dir, "frontend", image_path)
                
            engine = WindowsOCREngine()
            res = engine.ocr_from_image(image_path)
            return res
        except Exception as e:
            self.log(f"OCR error: {e}")
            return {"success": False, "error_code": "unhandled-exception", "text": "", "error": str(e)}

    def notelab_analyze_text(self, text, pdf_path=None, mode="structure"):
        """
        로컬 분석:
        - mode=structure (기본): 개조식·단락 줄바꿈/띄어쓰기 복원 (PDF 텍스트 힌트 선택)
        - mode=keywords: 기존 키워드·요약
        - mode=both: 구조 복원 + 키워드/요약
        """
        self.log(f"AI Analyzer requested (mode={mode})")
        from backend.ai_analyzer import DefaultLightAnalyzer
        from backend.structure_refiner import StructureRefiner, extract_pdf_text_for_structure
        try:
            mode = (mode or "structure").lower()
            result = {
                "success": True,
                "mode": mode,
                "keywords": [],
                "summary": "",
                "structured_text": None,
                "used_pdf_hint": False,
                "error": None,
            }

            if mode in ("structure", "both", "format", "restructure"):
                pdf_text = ""
                if pdf_path:
                    pdf_text = extract_pdf_text_for_structure(pdf_path)
                    result["used_pdf_hint"] = bool(pdf_text and pdf_text.strip())
                refiner = StructureRefiner()
                result["structured_text"] = refiner.format(text or "", pdf_text=pdf_text or None)

            if mode in ("keywords", "both", "summary"):
                analyzer = DefaultLightAnalyzer()
                result["keywords"] = analyzer.extract_keywords(text or "")
                result["summary"] = analyzer.summarize(text or "")

            # 기본 호환: structure only 여도 keywords 비어 있음 유지
            if mode in ("structure", "format", "restructure") and result["structured_text"] is None:
                result["structured_text"] = text or ""

            return result
        except Exception as e:
            self.log(f"AI Analyzer error: {e}")
            return {
                "success": False,
                "keywords": [],
                "summary": "",
                "structured_text": None,
                "used_pdf_hint": False,
                "error": str(e),
            }

    def choose_save_path(self, default_filename: str):
        """Ask user where to save, with default filename."""
        if not self._window: return None
        
        ext = os.path.splitext(default_filename)[1].lower()
        if ext == '.zip':
            file_types = ('ZIP Archive (*.zip)', 'All files (*.*)')
        elif ext in ('.md', '.markdown'):
            file_types = ('Markdown (*.md)', 'Text (*.txt)', 'All files (*.*)')
        elif ext in ('.hwp', '.hwpx'):
            file_types = ('한글 문서 (*.hwpx;*.hwp)', 'All files (*.*)')
        else:
            file_types = ('PDF Document (*.pdf)', 'All files (*.*)')
            
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG, 
            save_filename=default_filename,
            file_types=file_types
        )
        return self._parse_dialog_result(result)

    def export_original(self, original_path, save_path):
        """Copies the pure original file to the save path."""
        try:
            shutil.copy2(original_path, save_path)
            self.js_alert(f"성공적으로 저장되었습니다:\n{save_path}")
            return True
        except Exception as e:
            self.log(f"Original Export Error: {traceback.format_exc()}")
            self.js_alert(f"저장 실패:\n{str(e)}")
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
        def validate_rotation(p_list):
            for p in p_list:
                if isinstance(p, dict) and p.get('rotation') not in (0, 90, 180, 270):
                    p['rotation'] = 0

        if isinstance(payload, dict):
            if 'pages' in payload:
                validate_rotation(payload['pages'])
        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    if item.get('type') == 'pdf' and isinstance(item.get('data'), dict) and 'pages' in item['data']:
                        validate_rotation(item['data']['pages'])
                    elif item.get('type') == 'zip' and isinstance(item.get('data'), list):
                        for sub_pdf in item['data']:
                            if isinstance(sub_pdf, dict) and 'pages' in sub_pdf:
                                validate_rotation(sub_pdf['pages'])

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
                
            self.js_alert(f"성공적으로 저장되었습니다:\n{save_path}")
            return True
            
        except Exception as e:
            self.log(f"Export Error: {traceback.format_exc()}")
            self.js_alert(f"내보내기 실패:\n{str(e)}")
            return False

    def cleanup(self):
        self._fm.cleanup()
        try:
            self._search_engine.stop_watchdog()
        except:
            pass
        if self._converter:
            self._converter.quit()


    def log(self, message):
        print(f"[Backend] {message}")

if __name__ == '__main__':
    import tempfile
    os.environ['WEBVIEW2_USER_DATA_FOLDER'] = os.path.join(tempfile.gettempdir(), f"pb_wv2_{uuid.uuid4().hex[:8]}")
    
    api = Api()
    frontend_path = os.path.join(os.path.dirname(__file__), 'frontend', 'index.html')
    
    window = webview.create_window(
        'Public Binder (Page Lab / Folder Lab)', 
        url=frontend_path, js_api=api,
        width=1400, height=900, min_size=(1024, 768)
    )
    api._window = window
    
    try:
        webview.start(http_server=True, debug=True)
    finally:
        api.cleanup()

