# -*- mode: python ; coding: utf-8 -*-
# Portable Windows build for Public Binder (Page / Folder / Note Lab)
# Build:  pyinstaller --noconfirm PublicBinder.spec
# Output: dist/PublicBinder/PublicBinder.exe  (+ _internal with frontend & kordoc)

import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Heavy packages that need full collection
datas = [('frontend', 'frontend'), ('backend/bin', 'backend/bin')]
binaries = []
hiddenimports = [
    'win32timezone',
    'win32com',
    'win32com.client',
    'pythoncom',
    'pywintypes',
    'clr_loader',
    'webview',
    'webview.platforms.edgechromium',
]

for pkg in ('fitz', 'pymupdf'):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

a = Analysis(
    ['main.py'],
    pathex=[os.path.abspath('.')],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy.testing'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PublicBinder',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # GUI app — no black console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='PublicBinder',
)
