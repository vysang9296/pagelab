# backend/search_engine.py
import os
import sqlite3
import traceback
import threading
from backend.file_manager import get_file_manager
from backend.document_parser import DocumentParser

ALLOWED_EXTENSIONS = {'.hwp', '.hwpx', '.pdf', '.pptx', '.xlsx', '.docx', '.txt', '.md'}

class SearchEngine:
    def __init__(self):
        fm = get_file_manager()
        self.db_path = fm.get_temp_path("folderlab_search.db")
        self.lock = threading.Lock()
        self.is_indexing = False
        self.cancel_flag = False
        self.is_trigram_supported = True
        self.observer = None
        self._init_db()

    def _init_db(self):
        with self.lock:
            try:
                with sqlite3.connect(self.db_path, timeout=10.0) as conn:
                    cursor = conn.cursor()
                    try:
                        cursor.execute("""
                            CREATE VIRTUAL TABLE IF NOT EXISTS documents 
                            USING fts5(path, title, content, tokenize='trigram');
                        """)
                    except sqlite3.OperationalError:
                        self.is_trigram_supported = False
                        cursor.execute("""
                            CREATE VIRTUAL TABLE IF NOT EXISTS documents 
                            USING fts5(path, title, content, tokenize='unicode61');
                        """)
                    conn.commit()
            except Exception as e:
                print(f"[SearchEngine] DB Init Error: {e}")

    def get_trigram_status(self) -> bool:
        return self.is_trigram_supported

    def index_target_folder(self, folder_path: str, progress_callback=None) -> int:
        if not folder_path or not os.path.exists(folder_path):
            return 0

        if self.is_indexing:
            print(f"[SearchEngine] Skip indexing {folder_path} - another indexing job is running.")
            return 0

        self.is_indexing = True
        self.cancel_flag = False
        count = 0
        max_files_limit = 5000
        truncated = False

        try:
            import time
            with self.lock:
                with sqlite3.connect(self.db_path, timeout=10.0) as conn:
                    cursor = conn.cursor()
                    
                    # Pre-load all indexed paths to avoid individual SQL queries for each file (prevents O(N^2) behavior)
                    indexed_paths = set()
                    try:
                        cursor.execute("SELECT path FROM documents")
                        for row in cursor.fetchall():
                            indexed_paths.add(row[0])
                    except sqlite3.OperationalError:
                        pass

                    for root, dirs, files in os.walk(folder_path):
                        if self.cancel_flag: break
                        time.sleep(0.005) 
                        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('System Volume Information', '$Recycle.Bin', 'Windows', 'Program Files', 'Program Files (x86)')]
                        
                        for file in files:
                            if self.cancel_flag: break
                            if count >= max_files_limit:
                                truncated = True
                                break
                            if file.startswith('.'): continue
                            ext = os.path.splitext(file)[1].lower()
                            if ext in ALLOWED_EXTENSIONS:
                                file_path = os.path.join(root, file)
                                if file_path in indexed_paths:
                                    continue
                                try:
                                    content = DocumentParser.extract_text(file_path)
                                    if content:
                                        cursor.execute("""
                                            INSERT INTO documents (path, title, content) 
                                            VALUES (?, ?, ?)
                                        """, (file_path, file, content))
                                        count += 1
                                        if progress_callback:
                                            progress_callback(count, file)
                                        time.sleep(0.002)
                                except (sqlite3.OperationalError, PermissionError):
                                    continue
                        if count >= max_files_limit:
                            truncated = True
                            break
                    conn.commit()
        except Exception as e:
            print(f"[SearchEngine] Indexing Error: {traceback.format_exc()}")
        finally:
            self.is_indexing = False

        return count, self.cancel_flag, truncated

    def cancel_indexing(self):
        self.cancel_flag = True


    def search(self, query: str, ext_filter: str = 'all', date_filter: str = 'all', size_filter: str = 'all') -> list:
        """
        Executes FTS5 match query under thread lock and returns extended highlighted snippets (200 tokens).
        """
        if not query:
            return []

        # Map ext_filter to SQL LIKE filter
        ext_clause = ""
        if ext_filter == 'hwp':
            ext_clause = " AND (path LIKE '%.hwp' OR path LIKE '%.hwpx' OR path LIKE '%.docx' OR path LIKE '%.doc')"
        elif ext_filter == 'pdf':
            ext_clause = " AND path LIKE '%.pdf'"
        elif ext_filter == 'xls':
            ext_clause = " AND (path LIKE '%.xlsx' OR path LIKE '%.xls' OR path LIKE '%.xlsm')"
        elif ext_filter == 'etc':
            ext_clause = " AND (path LIKE '%.pptx' OR path LIKE '%.ppt' OR path LIKE '%.txt' OR path LIKE '%.md')"

        results = []
        with self.lock:
            try:
                with sqlite3.connect(self.db_path, timeout=10.0) as conn:
                    cursor = conn.cursor()
                    cursor.execute(f"""
                        SELECT path, title, snippet(documents, 2, '<mark>', '</mark>', '...', 200) 
                        FROM documents 
                        WHERE documents MATCH ? {ext_clause}
                        LIMIT 50;
                    """, (query,))

                    for row in cursor.fetchall():
                        results.append({
                            "path": row[0],
                            "title": row[1],
                            "snippet": row[2]
                        })
            except sqlite3.OperationalError as e:
                print(f"[SearchEngine] Search Query Error (syntax): {e}")
                try:
                    clean_query = "".join([c for c in query if c.isalnum() or c.isspace()])
                    if clean_query:
                        with sqlite3.connect(self.db_path, timeout=10.0) as conn:
                            cursor = conn.cursor()
                            cursor.execute(f"""
                                SELECT path, title, snippet(documents, 2, '<mark>', '</mark>', '...', 200) 
                                FROM documents 
                                WHERE documents MATCH ? {ext_clause}
                                LIMIT 50;
                            """, (clean_query,))
                            for row in cursor.fetchall():
                                results.append({ "path": row[0], "title": row[1], "snippet": row[2] })
                except Exception as ex:
                    print(f"Fallback search failed: {ex}")
            except Exception as e:
                print(f"[SearchEngine] Search Error: {traceback.format_exc()}")

        # Python-level date filtering
        filtered_results = results
        if date_filter and date_filter != 'all':
            import time
            cutoff = 0
            if date_filter == 'week':
                cutoff = time.time() - 7 * 86400
            elif date_filter == 'month':
                cutoff = time.time() - 30 * 86400
            elif date_filter == 'year':
                cutoff = time.time() - 365 * 86400

            filtered_results = []
            for res in results:
                try:
                    mtime = os.path.getmtime(res["path"])
                    if mtime >= cutoff:
                          filtered_results.append(res)
                except Exception:
                    pass

        # Python-level size filtering
        if size_filter and size_filter != 'all':
            filtered_by_size = []
            for res in filtered_results:
                try:
                    fsize = os.path.getsize(res["path"])
                    mb = 1024 * 1024
                    if size_filter == 'under_10m' and fsize < 10 * mb:
                        filtered_by_size.append(res)
                    elif size_filter == '10m_to_50m' and 10 * mb <= fsize < 50 * mb:
                        filtered_by_size.append(res)
                    elif size_filter == 'over_50m' and fsize >= 50 * mb:
                        filtered_by_size.append(res)
                    elif size_filter == 'over_100m' and fsize >= 100 * mb:
                        filtered_by_size.append(res)
                except Exception:
                    pass
            return filtered_by_size
 
        return filtered_results

    def start_watchdog(self, folder_path: str) -> bool:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
        
        self.stop_watchdog()
        
        class WatchdogHandler(FileSystemEventHandler):
            def __init__(self, engine):
                self.engine = engine
                
            def on_created(self, event):
                if event.is_directory: return
                self.engine.log_watch(f"File created: {event.src_path}")
                self.engine.index_single_file(event.src_path)
                
            def on_modified(self, event):
                if event.is_directory: return
                self.engine.log_watch(f"File modified: {event.src_path}")
                self.engine.index_single_file(event.src_path)
                
            def on_deleted(self, event):
                if event.is_directory: return
                self.engine.log_watch(f"File deleted: {event.src_path}")
                self.engine.remove_single_file(event.src_path)
                
        try:
            self.observer = Observer()
            handler = WatchdogHandler(self)
            self.observer.schedule(handler, folder_path, recursive=True)
            self.observer.start()
            print(f"[SearchEngine] Watchdog started for: {folder_path}")
            return True
        except Exception as e:
            print(f"[SearchEngine] Failed to start Watchdog: {e}")
            self.observer = None
            return False
            
    def stop_watchdog(self):
        if self.observer is not None:
            try:
                self.observer.stop()
                self.observer.join(timeout=1.0)
                print("[SearchEngine] Watchdog stopped.")
            except Exception as e:
                print(f"[SearchEngine] Error stopping watchdog: {e}")
            finally:
                self.observer = None
                
    def log_watch(self, message):
        print(f"[Watchdog] {message}")
        
    def index_single_file(self, file_path: str):
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in ALLOWED_EXTENSIONS: return
        
        def _run():
            with self.lock:
                try:
                    content = DocumentParser.extract_text(file_path)
                    if content:
                        with sqlite3.connect(self.db_path, timeout=5.0) as conn:
                            cursor = conn.cursor()
                            cursor.execute("DELETE FROM documents WHERE path = ?", (file_path,))
                            cursor.execute("""
                                INSERT INTO documents (path, title, content) 
                                VALUES (?, ?, ?)
                            """, (file_path, os.path.basename(file_path), content))
                            conn.commit()
                            print(f"[Watchdog] Successfully indexed: {file_path}")
                except Exception as e:
                    print(f"[Watchdog] Error indexing single file {file_path}: {e}")
                    
        import threading
        threading.Thread(target=_run, daemon=True).start()
        
    def remove_single_file(self, file_path: str):
        def _run():
            with self.lock:
                try:
                    with sqlite3.connect(self.db_path, timeout=5.0) as conn:
                        cursor = conn.cursor()
                        cursor.execute("DELETE FROM documents WHERE path = ?", (file_path,))
                        conn.commit()
                        print(f"[Watchdog] Successfully removed from DB: {file_path}")
                except Exception as e:
                    print(f"[Watchdog] Error removing single file {file_path}: {e}")
                    
        import threading
        threading.Thread(target=_run, daemon=True).start()

_search_engine_instance = None
def get_search_engine():
    global _search_engine_instance
    if _search_engine_instance is None:
        _search_engine_instance = SearchEngine()
    return _search_engine_instance
