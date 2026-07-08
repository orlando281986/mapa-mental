#!/bin/bash
# ============================================================
#  Mapa Mental - Instalador e Iniciador Automático (Mac/Linux)
#  Basta rodar este arquivo. Ele faz tudo sozinho.
# ============================================================

set -e
cd "$(dirname "$0")"

echo "=================================================="
echo " Mapa Mental - configurando tudo automaticamente..."
echo "=================================================="

# --- Checar Python ---
if ! command -v python3 &> /dev/null; then
    echo ""
    echo "❌ Python 3 não encontrado."
    echo "   Instale em: https://www.python.org/downloads/"
    echo "   Depois rode este script de novo."
    read -p "Pressione ENTER para sair..."
    exit 1
fi

# --- Checar Node/Yarn ---
if ! command -v node &> /dev/null; then
    echo ""
    echo "❌ Node.js não encontrado."
    echo "   Instale em: https://nodejs.org/ (versão LTS)"
    echo "   Depois rode este script de novo."
    read -p "Pressione ENTER para sair..."
    exit 1
fi

if ! command -v yarn &> /dev/null; then
    echo "📦 Instalando o Yarn..."
    npm install -g yarn
fi

# --- Backend ---
echo ""
echo "📦 Preparando o backend (isso pode levar 1-2 minutos na primeira vez)..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "✅ Backend pronto."

# Sobe o backend em segundo plano
echo "🚀 Iniciando o backend na porta 8000..."
uvicorn server:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Garante que o backend morre quando o script for encerrado
trap "echo ''; echo 'Encerrando servidores...'; kill $BACKEND_PID 2>/dev/null; exit" INT TERM EXIT

sleep 3

# --- Frontend ---
echo ""
echo "📦 Preparando o frontend (isso pode levar alguns minutos na primeira vez)..."
cd frontend

# Corrige a URL do backend automaticamente para localhost
if [ -f ".env" ]; then
    sed -i.bak 's#REACT_APP_BACKEND_URL=.*#REACT_APP_BACKEND_URL=http://localhost:8000#' .env
fi

if [ ! -d "node_modules" ]; then
    yarn install
fi

echo ""
echo "=================================================="
echo " ✅ TUDO PRONTO!"
echo " O app vai abrir automaticamente em http://localhost:3000"
echo ""
echo " Login de teste:"
echo "   Email: admin@example.com"
echo "   Senha: admin123"
echo ""
echo " Para PARAR: feche esta janela ou aperte Ctrl+C"
echo "=================================================="
echo ""

yarn start
