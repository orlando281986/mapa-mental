@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==================================================
echo  Mapa Mental - Build de Producao
echo ==================================================
echo.

echo [1/3] Instalando dependencias do frontend...
cd frontend
if not exist node_modules (
    call yarn install
    if errorlevel 1 exit /b 1
)

echo [2/3] Compilando frontend...
call yarn build
if errorlevel 1 exit /b 1
cd ..

echo [3/3] Build concluido com sucesso!
echo.
echo Para iniciar em producao:
echo   cd backend
echo   uvicorn server:app --host 0.0.0.0 --port 8000
echo.
echo Ou use Docker:
echo   docker compose up --build
