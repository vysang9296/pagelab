@echo off
echo ===================================================
echo Public Binder - Developer Environment Setup
echo ===================================================
echo.
echo Installing Python dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b %errorlevel%
)
echo [SUCCESS] Dependencies installed successfully.
echo.
echo Launching Public Binder...
python main.py
if %errorlevel% neq 0 (
    echo [ERROR] Failed to launch application.
    pause
    exit /b %errorlevel%
)
