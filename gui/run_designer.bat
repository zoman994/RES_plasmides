@echo off
echo Starting PlasmidVCS Construct Designer...
echo.
echo FastAPI backend: http://localhost:8000
echo React designer:  http://localhost:3000
echo.

cd /d "%~dp0"

REM Start FastAPI in background
start "PlasmidVCS API" cmd /c "cd api && "C:\Users\Zoman\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m uvicorn server:app --port 8000 --reload"

REM Wait a moment for API to start
timeout /t 2 /nobreak >nul

REM Start React dev server
cd designer
set PATH=C:\Program Files\nodejs;%PATH%
npm run dev

pause
