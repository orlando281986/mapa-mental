@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==================================================
echo  Mapa Mental - Modo Producao (backend serve frontend)
echo ==================================================

where python >nul 2>nul
if errorlevel 1 (
    echo Python nao encontrado.
    pause
    exit /b 1
)

echo.
echo Compilando frontend...
cd frontend
if not exist build (
    if not exist node_modules call yarn install
    call yarn build
    if errorlevel 1 exit /b 1
)
cd ..

echo.
echo Iniciando backend na porta 8000...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo.
echo ==================================================
echo  Aplicacao disponivel em: http://localhost:8000
echo.
echo  Login de teste:
echo    Email: admin@example.com
echo    Senha: admin123
echo.
echo  Pressione Ctrl+C para parar
echo ==================================================
echo.

uvicorn server:app --host 0.0.0.0 --port 8000
