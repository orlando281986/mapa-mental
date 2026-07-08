@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==================================================
echo  Mapa Mental - configurando tudo automaticamente...
echo ==================================================

where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo Python nao encontrado.
    echo Instale em: https://www.python.org/downloads/
    echo IMPORTANTE: marque a opcao "Add Python to PATH" durante a instalacao.
    echo Depois rode este arquivo de novo.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js nao encontrado.
    echo Instale em: https://nodejs.org/ ^(versao LTS^)
    echo Depois rode este arquivo de novo.
    pause
    exit /b 1
)

where yarn >nul 2>nul
if errorlevel 1 (
    echo Instalando o Yarn...
    call npm install -g yarn
)

echo.
echo Preparando o backend ^(pode levar 1-2 minutos na primeira vez^)...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo Backend pronto.

echo Iniciando o backend na porta 8000...
start "Backend - Mapa Mental" cmd /c "call venv\Scripts\activate.bat && uvicorn server:app --host 0.0.0.0 --port 8000"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo Preparando o frontend ^(pode levar alguns minutos na primeira vez^)...
cd frontend

powershell -Command "(Get-Content .env) -replace 'REACT_APP_BACKEND_URL=.*', 'REACT_APP_BACKEND_URL=http://localhost:8000' | Set-Content .env"

if not exist node_modules (
    call yarn install
)

echo.
echo ==================================================
echo  TUDO PRONTO!
echo  O app vai abrir automaticamente em http://localhost:3000
echo.
echo  Login de teste:
echo    Email: admin@example.com
echo    Senha: admin123
echo.
echo  Para PARAR: feche as janelas do terminal que abriram.
echo ==================================================
echo.

call yarn start
