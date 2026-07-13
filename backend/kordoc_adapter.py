import os
import json
import shutil
import subprocess
from typing import Dict, Any, Optional

class KordocParserAdapter:
    def __init__(self, exe_path: Optional[str] = None):
        if exe_path is None:
            try:
                from backend.app_paths import kordoc_exe_path
                exe_path = kordoc_exe_path()
            except Exception:
                exe_path = os.path.join("backend", "bin", "kordoc.exe")
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

    def patch_document(self, original_path: str, edited_markdown: str, output_path: str) -> Dict[str, Any]:
        """
        Apply edited markdown back onto original HWP/HWPX preserving formatting.
        Returns {"success": bool, "error": str|None, "backup_path": str|None, "output_path": str|None}
        """
        if not os.path.exists(original_path):
            return {
                "success": False,
                "error": f"원본 파일이 없습니다: {original_path}",
                "backup_path": None,
                "output_path": None,
            }

        ext = os.path.splitext(original_path)[1].lower()
        if ext not in (".hwp", ".hwpx"):
            return {
                "success": False,
                "error": (
                    "HWPX 패치는 .hwp / .hwpx 원본만 지원합니다. "
                    f"현재 원본: {ext or '(확장자 없음)'} — PDF/이미지에서는 역패치할 수 없습니다."
                ),
                "backup_path": None,
                "output_path": None,
            }

        if not os.path.exists(self.exe_path):
            return {
                "success": False,
                "error": f"kordoc.exe를 찾을 수 없습니다: {self.exe_path}",
                "backup_path": None,
                "output_path": None,
            }

        # Ensure output extension stays HWP family (default to original ext)
        out_ext = os.path.splitext(output_path)[1].lower()
        if out_ext not in (".hwp", ".hwpx"):
            output_path = output_path + ext

        out_dir = os.path.dirname(os.path.abspath(output_path))
        if out_dir and not os.path.exists(out_dir):
            try:
                os.makedirs(out_dir, exist_ok=True)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"출력 폴더를 만들 수 없습니다: {e}",
                    "backup_path": None,
                    "output_path": None,
                }

        # Backup original only (never overwrite original without a .bak next to it)
        backup_path = original_path + ".bak"
        try:
            # Skip re-backup if output is a different path and original already has recent bak? Always refresh bak.
            shutil.copy2(original_path, backup_path)
        except Exception as e:
            return {
                "success": False,
                "error": f"원본 백업(.bak) 생성 실패: {e}",
                "backup_path": None,
                "output_path": None,
            }

        temp_md_path = f"{original_path}.temp.md"
        try:
            with open(temp_md_path, "w", encoding="utf-8") as f:
                f.write(edited_markdown)

            cmd = [self.exe_path, "patch", original_path, temp_md_path, "-o", output_path]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode != 0:
                err_msg = (result.stderr or result.stdout or "").strip()
                if not err_msg:
                    err_msg = f"kordoc patch 실패 (exit {result.returncode})"
                return {
                    "success": False,
                    "error": err_msg,
                    "backup_path": backup_path,
                    "output_path": None,
                }

            if not os.path.exists(output_path):
                return {
                    "success": False,
                    "error": "kordoc이 성공을 반환했으나 출력 파일이 생성되지 않았습니다.",
                    "backup_path": backup_path,
                    "output_path": None,
                }

            return {
                "success": True,
                "error": None,
                "backup_path": backup_path,
                "output_path": output_path,
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "backup_path": backup_path,
                "output_path": None,
            }
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
