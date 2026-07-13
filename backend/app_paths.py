"""
개발 실행 vs PyInstaller 동결 실행 경로 해석.

- resource_root: 읽기 전용 리소스 (frontend, kordoc.exe) — frozen 시 sys._MEIPASS
- writable_root: 쓰기 가능 (cache, attachments) — frozen 시 exe 옆 PublicBinder_data
"""
from __future__ import annotations

import os
import sys


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"))


def resource_root() -> str:
    """Bundled read-only assets root."""
    if is_frozen():
        meipass = sys._MEIPASS  # type: ignore[attr-defined]
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        # Prefer the tree that actually contains frontend/
        if os.path.isdir(os.path.join(meipass, "frontend")):
            return meipass
        if os.path.isdir(os.path.join(exe_dir, "frontend")):
            return exe_dir
        return meipass
    # Lab/ project root (parent of backend/)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def writable_root() -> str:
    """User-writable data next to the executable (or project root in dev)."""
    if is_frozen():
        base = os.path.dirname(os.path.abspath(sys.executable))
        data = os.path.join(base, "PublicBinder_data")
        os.makedirs(data, exist_ok=True)
        return data
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return root


def kordoc_exe_path() -> str:
    return os.path.join(resource_root(), "backend", "bin", "kordoc.exe")


def frontend_dir() -> str:
    return os.path.join(resource_root(), "frontend")


def frontend_index_html() -> str:
    return os.path.join(frontend_dir(), "index.html")


def attachments_dir() -> str:
    """
    Crop/OCR images under frontend/attachments so pywebview http_server can serve them
    as relative attachments/*.png from the same frontend root as index.html.
    """
    d = os.path.join(frontend_dir(), "attachments")
    os.makedirs(d, exist_ok=True)
    return d


def pdf_cache_dir() -> str:
    # Cache is large / disposable — keep next to exe (or project) not in _MEIPASS when possible
    d = os.path.join(writable_root(), "backend", "cache")
    os.makedirs(d, exist_ok=True)
    return d


def frontend_static_root_for_attachments() -> str:
    """Parent of attachments/ (…/frontend) for resolving relative attachment paths."""
    d = frontend_dir()
    os.makedirs(os.path.join(d, "attachments"), exist_ok=True)
    return d
