@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao foi encontrado. Instale Python 3.10+ e tente novamente.
  pause
  exit /b 1
)
python -m pip install -r requirements.txt
python app.py
pause
