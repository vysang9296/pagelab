@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Public Binder - Portable EXE Build
echo ============================================================
echo.

if not exist "backend\bin\kordoc.exe" (
    echo [ERROR] backend\bin\kordoc.exe 가 없습니다.
    echo         Note Lab 한글 파싱/패치에 필요합니다.
    pause
    exit /b 1
)

echo [1/3] Dependencies...
python -m pip install -r requirements.txt pyinstaller olefile --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed
    pause
    exit /b 1
)

echo [2/3] PyInstaller build (PublicBinder.spec)...
python -m PyInstaller --noconfirm PublicBinder.spec
if errorlevel 1 (
    echo [ERROR] PyInstaller failed
    pause
    exit /b 1
)

echo [3/3] Verify package...
set OUT=dist\PublicBinder
if not exist "%OUT%\PublicBinder.exe" (
    echo [ERROR] PublicBinder.exe not found under %OUT%
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  BUILD OK
echo ============================================================
echo.
echo  Run:  %CD%\%OUT%\PublicBinder.exe
echo.
echo  Copy the whole folder to another PC:
echo    %OUT%\
echo      PublicBinder.exe
echo      _internal\   (libraries, frontend, kordoc)
echo.
echo  Requirements on target PC:
echo    - Windows 10/11 64-bit
echo    - WebView2 Runtime (usually preinstalled)
echo    - Hancom Office (optional, for HWP-^>PDF view)
echo    - Korean OCR pack (optional, for image OCR)
echo.
echo  Writable data is created next to the exe as PublicBinder_data\
echo ============================================================
pause
