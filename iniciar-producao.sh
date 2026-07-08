#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=================================================="
echo " Mapa Mental - Modo Produção (backend serve frontend)"
echo "=================================================="

if ! command -v python3 &> /dev/null; then
    echo "Python 3 não encontrado."
    exit 1
fi

echo ""
echo "Compilando frontend..."
cd frontend
if [ ! -d "build" ]; then
    if [ ! -d "node_modules" ]; then
        yarn install --frozen-lockfile
    fi
    yarn build
fi
cd ..

echo ""
echo "Iniciando backend na porta 8000..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo ""
echo "=================================================="
echo " Aplicação disponível em: http://localhost:8000"
echo ""
echo " Login de teste:"
echo "   Email: admin@example.com"
echo "   Senha: admin123"
echo ""
echo " Pressione Ctrl+C para parar"
echo "=================================================="
echo ""

uvicorn server:app --host 0.0.0.0 --port 8000
