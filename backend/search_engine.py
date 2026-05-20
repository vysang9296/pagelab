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
                                try:
                                    cursor.execute("SELECT path FROM documents WHERE path = ?", (file_path,))
                                    if cursor.fetchone(): continue

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


    def search(self, query: str) -> list:
        """
        Executes FTS5 match query under thread lock and returns extended highlighted snippets (200 tokens).
        """
        if not query:
            return []

        results = []
        with self.lock:
            try:
                with sqlite3.connect(self.db_path, timeout=10.0) as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT path, title, snippet(documents, 2, '<mark>', '</mark>', '...', 200) 
                        FROM documents 
                        WHERE documents MATCH ? 
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
                            cursor.execute("""
                                SELECT path, title, snippet(documents, 2, '<mark>', '</mark>', '...', 200) 
                                FROM documents 
                                WHERE documents MATCH ? 
                                LIMIT 50;
                            """, (clean_query,))
                            for row in cursor.fetchall():
                                results.append({ "path": row[0], "title": row[1], "snippet": row[2] })
                except Exception as ex:
                    print(f"Fallback search failed: {ex}")
            except Exception as e:
                print(f"[SearchEngine] Search Error: {traceback.format_exc()}")

        return results

_search_engine_instance = None
def get_search_engine():
    global _search_engine_instance
    if _search_engine_instance is None:
        _search_engine_instance = SearchEngine()
    return _search_engine_instance
