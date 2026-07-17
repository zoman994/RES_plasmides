@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PY_EXE="
set "PY_ARGS="

if defined PYTHON if exist "%PYTHON%" set "PY_EXE=%PYTHON%"

if not defined PY_EXE (
  for /f "delims=" %%P in ('where py 2^>nul') do if not defined PY_EXE (
    set "PY_EXE=%%P"
    set "PY_ARGS=-3"
  )
)

if not defined PY_EXE (
  for /f "delims=" %%P in ('where python 2^>nul') do if not defined PY_EXE set "PY_EXE=%%P"
)

if not defined PY_EXE if defined LOCALAPPDATA (
  for /d %%D in ("%LOCALAPPDATA%\Python\pythoncore-*") do if exist "%%~fD\python.exe" set "PY_EXE=%%~fD\python.exe"
)

if not defined PY_EXE (
  echo Python 3 was not found. Set the PYTHON environment variable to python.exe.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found in PATH.
  exit /b 1
)

if /I "%~1"=="--check" (
  "%PY_EXE%" %PY_ARGS% --version
  if errorlevel 1 exit /b 1
  "%PY_EXE%" %PY_ARGS% -c "import fastapi, uvicorn, pydantic, multipart" >nul 2>nul
  if errorlevel 1 (
    echo Missing Python GUI dependencies.
    echo Install them with:
    echo   py -m pip install -e "%~dp0..[gui]"
    exit /b 1
  )
  npm.cmd --version
  if errorlevel 1 exit /b 1
  exit /b 0
)

echo Starting BodgeGene API on http://localhost:8000
echo Starting BodgeGene designer on http://localhost:3000

start "BodgeGene API" /D "%~dp0api" "%PY_EXE%" %PY_ARGS% -m uvicorn server:app --port 8000 --reload
timeout /t 2 /nobreak >nul

cd /d "%~dp0designer"
call npm.cmd run dev:front
