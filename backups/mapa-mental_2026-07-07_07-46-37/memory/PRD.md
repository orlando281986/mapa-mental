# PRD — Mapa Mental (Whimsical-style)

## Problem Statement (Original)
"faça um aplicativo de mapa mentais ilimitados no estilo https://whimsical.com onde todas as informações ficaram armazenadas em um banco de dados gratuito"

## User Choices
- Autenticação: e-mail/senha (JWT)
- Banco de dados: **SQLite** (arquivo local, biblioteca padrão do Python — trocado a partir do MongoDB em 2026-07-07, sem custo e sem dependência externa)
- Funcionalidades: nós arrastáveis + conexões, editar cor/forma/texto, exportar PNG, link público
- IA: não
- Idioma: Português (pt-BR)

## Architecture
- **Backend**: FastAPI + `sqlite3` (stdlib, wrapped em thread pool assíncrono), JWT Bearer auth (bcrypt + PyJWT).
  Arquivo do banco: `backend/mindmap.db` (caminho configurável via `DB_PATH` no `.env`).
- **Frontend**: React 19 + React Router, React Flow (reactflow), Tailwind + shadcn base,
  neo-brutalist pastel theme (com variante dark), `@phosphor-icons/react`, `sonner` toasts, `html-to-image` para exportar PNG.
- **Auth token**: armazenado em `localStorage` na chave `mm_token`; anexado via interceptor do Axios.
- **Tema**: `ThemeContext` (`frontend/src/context/ThemeContext.jsx`) persiste a escolha em `localStorage` (`mm_theme`) e alterna a classe `.dark` no `<html>`.

## User Personas
- Estudante/profissional que precisa organizar ideias e compartilhar mapas.

## Core Requirements
- CRUD ilimitado de mapas por usuário
- Editor de canvas infinito com nós arrastáveis e conexões
- Estilização (cor / forma / texto) por nó
- Exportar mapa como PNG
- Compartilhar link público (read-only)

## Implemented (2026-02-07)
- Auth JWT: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- Mind Maps CRUD: `GET/POST /api/maps`, `GET/PATCH/DELETE /api/maps/{id}`
- Public read-only: `GET /api/public/maps/{id}`
- Frontend: `/login`, `/register`, `/dashboard`, `/map/:id`, `/public/:id`
- React Flow editor com MiniMap, Controls, nós customizados, floating toolbars
- Export PNG, toggle público + copiar link, seed admin no startup
- Undo/Redo, copiar/cortar/colar/duplicar nó (atalhos + menu de contexto)
- Testado: backend 100% (12/12 endpoints); frontend E2E verificado por screenshot (login → dashboard → editor → save → tornar público → visualização pública)

## Implemented (2026-07-07)
- **Banco de dados trocado de MongoDB para SQLite** — zero dependências externas, zero custo, roda com um único arquivo `.db`.
- **Duplicar mapa**: `POST /api/maps/{id}/duplicate` + botão no card do Dashboard.
- **Importar/Exportar JSON**: `POST /api/maps/import` + botão "Importar" no Dashboard; exportação gera um `.json` baixável a partir de `GET /api/maps/{id}`.
- **Templates iniciais**: campo `template` em `POST /api/maps` (`brainstorm`, `flowchart`, `kanban`); menu dropdown "Novo Mapa Mental" no Dashboard.
- **Modo escuro**: `ThemeContext` + botão de alternância no Dashboard e no Editor; paleta neo-brutalista adaptada (sombras/bordas brancas, canvas escuro).

## Implemented (2026-07-07, parte 2)
- **Pastas**: tabela `folders` (dono, nome). CRUD via `/api/folders` (GET/POST/PATCH/DELETE). Sidebar no Dashboard lista "Todos os mapas", "Sem pasta" e cada pasta com contagem de mapas, renomear e excluir (excluir pasta não apaga os mapas, só remove a referência).
- **Tags**: campo `tags` (JSON) em cada mapa. `PATCH /api/maps/{id}` aceita `tags: string[]`. `GET /api/tags` lista todas as tags únicas do usuário para os chips de filtro na sidebar. Cada card de mapa tem um botão de editar tags e um seletor de pasta.
- **Filtro combinado**: `GET /api/maps?folder_id=&tag=` filtra por pasta e/ou tag ao mesmo tempo.
- Migração automática e idempotente adiciona as colunas `folder_id`/`tags` em bancos `mindmap.db` já existentes, sem precisar apagar dados.

## Implemented (2026-07-07, parte 3)
- **Comentários em nós**: tabela `comments` (map_id, node_id opcional, autor, texto, resolvido). Endpoints `GET/POST /api/maps/{id}/comments`, `PATCH/DELETE /api/maps/{id}/comments/{comment_id}`. Painel lateral no Editor (`CommentsPanel.jsx`) lista comentários, permite resolver/reabrir/excluir e focar no nó relacionado. Nós com comentários não resolvidos mostram um badge de contagem. Ação "Comentar" no menu de contexto do nó.
- **Colaboração em tempo real**: endpoint WebSocket `GET /api/ws/maps/{map_id}?token=...` (autenticado via querystring, já que o WebSocket do navegador não permite header customizado). Sincroniza automaticamente nós/arestas entre sessões abertas do mesmo dono (múltiplas abas/dispositivos), transmite cursores ao vivo (posição + nome + cor por usuário) e notifica eventos de comentário (`comment_new`/`comment_updated`/`comment_deleted`) em tempo real para todos conectados no mesmo mapa. Frontend: hook `useMapCollab.js` + avatares de presença na topbar do Editor + cursores remotos sobrepostos ao canvas.
- Observação: como o modelo de dados ainda não tem "compartilhar mapa com outro usuário" (cada mapa pertence a um único dono), a colaboração em tempo real sincroniza sessões da mesma conta (ex.: você editando em duas abas/dispositivos ao mesmo tempo). Se quiser colaboração entre contas diferentes, é necessário adicionar um modelo de "colaboradores por mapa" — próximo passo natural do backlog.

## Implemented (2026-07-07, parte 4)
- **Expandir/retrair nós e conectores**: cada nó com filhos (arestas saindo dele) ganha um botão em forma de seta na base. Clicar recolhe a subárvore inteira (oculta filhos, netos etc. e as arestas correspondentes) e mostra um badge com a contagem de nós ocultos; clicar de novo expande. Estado `collapsed` é salvo por nó (persistido no `PATCH /api/maps/{id}`, sobrevive a reload). Botões "Expandir tudo" / "Recolher tudo" na barra de ferramentas esquerda, e ação equivalente "Recolher"/"Expandir" no menu de contexto do nó. A colaboração em tempo real e o export PNG respeitam o que está oculto (só o que está visível é considerado).

## Prioritized Backlog
- **P1** Modelo de colaboradores por mapa (convidar outro usuário/e-mail para editar um mapa) — hoje a colaboração em tempo real funciona apenas entre sessões do mesmo dono
- **P2** IA para gerar mapa a partir de um tópico (Claude/GPT via Emergent Key)

## Test Credentials
Ver `/app/memory/test_credentials.md`.
