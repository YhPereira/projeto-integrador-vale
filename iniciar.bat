@echo off
cd /d "%~dp0"
if not exist "%~dp0requirements.txt" (
  echo Nao foi encontrado requirements.txt na pasta do projeto.
  echo Extraia todos os arquivos do projeto e tente novamente.
  pause
  exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao foi encontrado. Instale Python 3.10+ e tente novamente.
  pause
  exit /b 1
)
python -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo Falha ao instalar as dependencias. Verifique a conexao e tente novamente.
  pause
  exit /b 1
)
python "%~dp0app.py"
pause
