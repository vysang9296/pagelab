import os
import json
import shutil
import subprocess
from typing import Dict, Any

class KordocParserAdapter:
    def __init__(self, exe_path: str = "backend/bin/kordoc.exe"):
        self.exe_path = os.path.abspath(exe_path)

    def parse_to_markdown(self, file_path: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        cmd = [self.exe_path, file_path, "--format", "json"]
        try:
            # Prevent cp949 encoding crash on Windows by using encoding="utf-8"
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        except Exception as e:
            return {
                "markdown": f"# Fallback\nFailed to execute kordoc.exe: {str(e)}",
                "metadata": {},
                "success": False
            }
            
        if result.returncode != 0:
            # If kordoc.exe fails, return error info
            return {
                "markdown": f"### 오류\nkordoc.exe 파싱 실패: {result.stderr or result.stdout}",
                "metadata": {},
                "success": False
            }
            
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return {
                "markdown": result.stdout,
                "metadata": {},
                "success": True
            }
            
        return {
            "markdown": data.get("markdown", ""),
            "metadata": data.get("metadata", {}),
            "success": True
        }

    def patch_document(self, original_path: str, edited_markdown: str, output_path: str) -> bool:
        if not os.path.exists(original_path):
            raise FileNotFoundError(f"Original file not found: {original_path}")
            
        # Create .bak backup copy to prevent original corruption
        backup_path = original_path + ".bak"
        try:
            shutil.copy2(original_path, backup_path)
        except Exception as e:
            print(f"Failed to create backup copy: {e}")
            return False
            
        temp_md_path = f"{original_path}.temp.md"
        try:
            with open(temp_md_path, "w", encoding="utf-8") as f:
                f.write(edited_markdown)
                
            cmd = [self.exe_path, "patch", original_path, temp_md_path, "-o", output_path]
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
            return result.returncode == 0
        except Exception:
            return False
        finally:
            if os.path.exists(temp_md_path):
                try:
                    os.remove(temp_md_path)
                except Exception:
                    pass

    def compare_documents(self, path_old: str, path_new: str) -> str:
        if not os.path.exists(path_old) or not os.path.exists(path_new):
            raise FileNotFoundError("One of the files for comparison is missing.")
            
        cmd = [self.exe_path, "compare", path_old, path_new]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
            if result.returncode != 0:
                raise RuntimeError(f"Kordoc compare failed: {result.stderr or result.stdout}")
            return result.stdout
        except Exception as e:
            return f"### 비교 실패\n구버전과 신버전 비교 중 오류가 발생했습니다: {str(e)}"
