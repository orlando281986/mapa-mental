#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=================================================="
echo " Mapa Mental - Build de Produção"
echo "=================================================="
echo ""

echo "[1/3] Instalando dependências do frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    yarn install --frozen-lockfile
fi

echo "[2/3] Compilando frontend..."
yarn build
cd ..

echo "[3/3] Build concluído com sucesso!"
echo ""
echo "Para iniciar em produção:"
echo "  cd backend"
echo "  uvicorn server:app --host 0.0.0.0 --port 8000"
echo ""
echo "Ou use Docker:"
echo "  docker compose up --build"
