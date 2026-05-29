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


    def search(self, query: str, ext_filter: str = 'all', date_filter: str = 'all') -> list:
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
            return filtered_results

        return results

_search_engine_instance = None
def get_search_engine():
    global _search_engine_instance
    if _search_engine_instance is None:
        _search_engine_instance = SearchEngine()
    return _search_engine_instance
