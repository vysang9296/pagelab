# backend/local_nav.py
import os
import time
import traceback

ALLOWED_EXTENSIONS = {'.hwp', '.hwpx', '.pdf', '.pptx', '.xlsx', '.docx', '.doc', '.ppt', '.xls', '.txt', '.md'}

def format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"

def format_mtime(mtime):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime))

class LocalNav:
    @staticmethod
    def get_local_tree(root_path: str = None) -> list:
        """
        Scans the root_path directory and returns a structured list of 1st-level children (Shallow Scan).
        Includes file size and last modified date metadata for professional explorer view.
        """
        if not root_path or not os.path.exists(root_path):
            root_path = os.path.expanduser('~/Documents')
            if not os.path.exists(root_path):
                root_path = os.path.expanduser('~')
                if not os.path.exists(root_path):
                    root_path = os.path.abspath('.')

        tree = []
        count = 0
        max_items = 300  # Strict limit to prevent Powershell/AccessibilityObject timeout crash!

        try:
            with os.scandir(root_path) as entries:
                for entry in entries:
                    if count >= max_items: break
                    try:
                        if entry.name.startswith('.'): continue
                        
                        # Use follow_symlinks=False to prevent network/symlink freezing
                        stat_info = entry.stat(follow_symlinks=False)
                        mtime_str = format_mtime(stat_info.st_mtime)

                        if entry.is_dir(follow_symlinks=False):
                            tree.append({
                                "name": entry.name,
                                "isDir": True,
                                "path": entry.path,
                                "size": "[ DIR ]",
                                "mtime": mtime_str,
                                "children": []
                            })
                            count += 1
                        elif entry.is_file(follow_symlinks=False):
                            size_str = format_size(stat_info.st_size)
                            tree.append({
                                "name": entry.name,
                                "isDir": False,
                                "path": entry.path,
                                "size": size_str,
                                "mtime": mtime_str
                            })
                            count += 1
                    except (PermissionError, OSError):
                        continue
                        
            tree.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
        except (PermissionError, OSError) as e:
            print(f"[LocalNav] Root Permission Error scanning {root_path}: {e}")
            return []
        except Exception as e:
            print(f"[LocalNav] Unexpected Error scanning {root_path}: {traceback.format_exc()}")
            return []
            
        return tree
