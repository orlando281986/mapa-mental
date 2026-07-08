from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import json
import shutil
import asyncio
import sqlite3
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any
from contextlib import asynccontextmanager

import bcrypt
import jwt
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel, Field, EmailStr


# --- SQLite ---
# Banco de dados gratuito e sem dependências externas: usa o módulo `sqlite3`
# da biblioteca padrão do Python, gravando tudo em um único arquivo local.
# Não requer serviço externo, conta, chave de API nem custo algum.
DB_PATH = os.environ.get("DB_PATH", str(ROOT_DIR / "mindmap.db"))

_conn: Optional[sqlite3.Connection] = None
_db_lock = asyncio.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mindmaps_owner ON mindmaps(owner_id);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    node_id TEXT,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_map ON comments(map_id);

CREATE TABLE IF NOT EXISTS map_versions (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    title TEXT NOT NULL,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_versions_map ON map_versions(map_id);
"""

# Migração leve e idempotente: adiciona colunas novas em bancos já existentes
# (quem já tinha o projeto rodando antes das pastas/tags entrarem).
MIGRATIONS = [
    "ALTER TABLE mindmaps ADD COLUMN folder_id TEXT",
    "ALTER TABLE mindmaps ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.executescript(SCHEMA)
    conn.commit()
    for stmt in MIGRATIONS:
        try:
            conn.execute(stmt)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # coluna já existe
    return conn


async def db_execute(query: str, params: tuple = ()) -> sqlite3.Cursor:
    """Executa uma query (INSERT/UPDATE/DELETE) e comita, de forma thread-safe."""
    async with _db_lock:
        def _run():
            cur = _conn.execute(query, params)
            _conn.commit()
            return cur
        return await asyncio.to_thread(_run)


async def db_fetchone(query: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    async with _db_lock:
        def _run():
            return _conn.execute(query, params).fetchone()
        return await asyncio.to_thread(_run)


async def db_fetchall(query: str, params: tuple = ()) -> list:
    async with _db_lock:
        def _run():
            return _conn.execute(query, params).fetchall()
        return await asyncio.to_thread(_run)


# --- App / Router ---
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 24 * 7  # 7 days


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _conn
    _conn = _connect()

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db_fetchone("SELECT * FROM users WHERE email = ?", (admin_email,))
    if existing is None:
        await db_execute(
            "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                admin_email,
                "Admin",
                hash_password(admin_password),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    elif not verify_password(admin_password, existing["password_hash"]):
        await db_execute(
            "UPDATE users SET password_hash = ? WHERE email = ?",
            (hash_password(admin_password), admin_email),
        )

    yield

    _conn.close()


app = FastAPI(title="Mapa Mental API", lifespan=lifespan)
api = APIRouter(prefix="/api")


# --- Colaboração em tempo real (WebSocket) ---
PRESENCE_COLORS = ["#F87171", "#60A5FA", "#34D399", "#FBBF24", "#A78BFA", "#F472B6", "#38BDF8", "#FB923C"]


def _color_for_user(user_id: str) -> str:
    return PRESENCE_COLORS[hash(user_id) % len(PRESENCE_COLORS)]


class MapConnectionManager:
    """Mantém as conexões WebSocket por mapa e faz broadcast de eventos
    (edição ao vivo, cursores, comentários) entre todas as sessões abertas
    do dono do mapa (múltiplas abas/dispositivos logados na mesma conta)."""

    def __init__(self):
        self.rooms: dict[str, dict[WebSocket, dict]] = {}

    async def connect(self, map_id: str, ws: WebSocket, user: dict):
        await ws.accept()
        self.rooms.setdefault(map_id, {})[ws] = user

    def disconnect(self, map_id: str, ws: WebSocket):
        room = self.rooms.get(map_id)
        if room and ws in room:
            del room[ws]
            if not room:
                del self.rooms[map_id]

    def presence(self, map_id: str) -> list:
        room = self.rooms.get(map_id, {})
        seen = {}
        for u in room.values():
            seen[u["id"]] = u
        return list(seen.values())

    async def broadcast(self, map_id: str, message: dict, exclude: Optional[WebSocket] = None):
        room = self.rooms.get(map_id, {})
        dead = []
        for ws in list(room.keys()):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(map_id, ws)


manager = MapConnectionManager()


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Não autenticado")
    token = creds.credentials
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db_fetchone("SELECT * FROM users WHERE id = ?", (payload["sub"],))
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return {"id": user["id"], "email": user["email"], "name": user["name"] or ""}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


# --- Models ---
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str


class AuthResponse(BaseModel):
    user: UserOut
    token: str


class MindMapCreate(BaseModel):
    title: str = Field(default="Mapa sem título", max_length=120)
    template: Optional[str] = None  # "brainstorm" | "flowchart" | "kanban" | None
    folder_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class MindMapImport(BaseModel):
    title: str = Field(default="Mapa importado", max_length=120)
    nodes: List[dict] = Field(default_factory=list)
    edges: List[dict] = Field(default_factory=list)
    folder_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class MindMapUpdate(BaseModel):
    title: Optional[str] = None
    nodes: Optional[List[dict]] = None
    edges: Optional[List[dict]] = None
    is_public: Optional[bool] = None
    folder_id: Optional[str] = None
    clear_folder: bool = False  # necessário pois folder_id=None é ambíguo (não mudar vs remover)
    tags: Optional[List[str]] = None


class MindMapSummary(BaseModel):
    id: str
    title: str
    is_public: bool
    updated_at: str
    created_at: str
    folder_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class MindMapFull(BaseModel):
    id: str
    title: str
    nodes: List[dict]
    edges: List[dict]
    is_public: bool
    owner_id: str
    updated_at: str
    created_at: str
    folder_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class VersionOut(BaseModel):
    id: str
    map_id: str
    title: str
    created_at: str


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class FolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class FolderOut(BaseModel):
    id: str
    name: str
    created_at: str
    map_count: int = 0


class CommentCreate(BaseModel):
    node_id: Optional[str] = None
    text: str = Field(min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    resolved: Optional[bool] = None
    text: Optional[str] = Field(default=None, min_length=1, max_length=2000)


class CommentOut(BaseModel):
    id: str
    map_id: str
    node_id: Optional[str] = None
    author_id: str
    author_name: str
    text: str
    resolved: bool
    created_at: str


# --- Templates iniciais ---
def _node(x, y, label, color, shape="rectangle", bold=False):
    return {
        "id": str(uuid.uuid4()),
        "type": "mind",
        "position": {"x": x, "y": y},
        "data": {"label": label, "color": color, "shape": shape, "bold": bold, "italic": False},
    }


def _edge(source, target):
    return {"id": str(uuid.uuid4()), "source": source, "target": target, "type": "smoothstep"}


def build_template(template: Optional[str]):
    if template == "brainstorm":
        center = _node(500, 280, "Ideia Central", "#FDE047", "pill", True)
        n1 = _node(160, 100, "Tópico 1", "#86EFAC")
        n2 = _node(840, 100, "Tópico 2", "#93C5FD")
        n3 = _node(160, 460, "Tópico 3", "#D8B4FE")
        n4 = _node(840, 460, "Tópico 4", "#FDBA74")
        nodes = [center, n1, n2, n3, n4]
        edges = [_edge(center["id"], n["id"]) for n in (n1, n2, n3, n4)]
        return nodes, edges

    if template == "flowchart":
        start = _node(450, 40, "Início", "#86EFAC", "pill", True)
        step1 = _node(450, 180, "Processo 1", "#93C5FD")
        decision = _node(450, 320, "Decisão?", "#FDE047", "diamond", True)
        step_yes = _node(200, 480, "Sim: Ação A", "#D8B4FE")
        step_no = _node(700, 480, "Não: Ação B", "#FDBA74")
        end = _node(450, 620, "Fim", "#F9A8D4", "pill", True)
        nodes = [start, step1, decision, step_yes, step_no, end]
        edges = [
            _edge(start["id"], step1["id"]),
            _edge(step1["id"], decision["id"]),
            _edge(decision["id"], step_yes["id"]),
            _edge(decision["id"], step_no["id"]),
            _edge(step_yes["id"], end["id"]),
            _edge(step_no["id"], end["id"]),
        ]
        return nodes, edges

    if template == "kanban":
        col_todo = _node(120, 40, "A Fazer", "#FDBA74", "rectangle", True)
        col_doing = _node(500, 40, "Em Progresso", "#93C5FD", "rectangle", True)
        col_done = _node(880, 40, "Concluído", "#86EFAC", "rectangle", True)
        t1 = _node(120, 180, "Tarefa 1", "#FFFFFF")
        t2 = _node(120, 300, "Tarefa 2", "#FFFFFF")
        t3 = _node(500, 180, "Tarefa 3", "#FFFFFF")
        t4 = _node(880, 180, "Tarefa 4", "#FFFFFF")
        nodes = [col_todo, col_doing, col_done, t1, t2, t3, t4]
        edges = []
        return nodes, edges

    # Padrão: mapa em branco com um nó central
    return [
        {
            "id": str(uuid.uuid4()),
            "type": "mind",
            "position": {"x": 400, "y": 250},
            "data": {"label": "Ideia Central", "color": "#FDE047", "shape": "rectangle"},
        }
    ], []


# --- Auth endpoints ---
@api.post("/auth/register", response_model=AuthResponse)
async def register(body: RegisterInput):
    email = body.email.lower().strip()
    if await db_fetchone("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    user_id = str(uuid.uuid4())
    await db_execute(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, email, body.name.strip(), hash_password(body.password), datetime.now(timezone.utc).isoformat()),
    )
    token = create_access_token(user_id, email)
    return AuthResponse(user=UserOut(id=user_id, email=email, name=body.name), token=token)


@api.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginInput):
    email = body.email.lower().strip()
    user = await db_fetchone("SELECT * FROM users WHERE email = ?", (email,))
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_access_token(user["id"], email)
    return AuthResponse(
        user=UserOut(id=user["id"], email=email, name=user["name"] or ""),
        token=token,
    )


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


# --- Mind Map helpers ---
def _safe_tags(raw) -> list:
    try:
        parsed = json.loads(raw) if raw else []
        return [str(t).strip() for t in parsed if str(t).strip()][:20]
    except (json.JSONDecodeError, TypeError):
        return []


def _row_to_summary(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"] or "Mapa sem título",
        "is_public": bool(row["is_public"]),
        "updated_at": row["updated_at"],
        "created_at": row["created_at"],
        "folder_id": row["folder_id"] if "folder_id" in row.keys() else None,
        "tags": _safe_tags(row["tags"] if "tags" in row.keys() else None),
    }


def _row_to_full(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"] or "Mapa sem título",
        "nodes": json.loads(row["nodes"]) if row["nodes"] else [],
        "edges": json.loads(row["edges"]) if row["edges"] else [],
        "is_public": bool(row["is_public"]),
        "owner_id": row["owner_id"],
        "updated_at": row["updated_at"],
        "created_at": row["created_at"],
        "folder_id": row["folder_id"] if "folder_id" in row.keys() else None,
        "tags": _safe_tags(row["tags"] if "tags" in row.keys() else None),
    }


async def _get_owned_map_row(map_id: str, owner_id: str):
    return await db_fetchone("SELECT * FROM mindmaps WHERE id = ? AND owner_id = ?", (map_id, owner_id))


async def _get_owned_folder_row(folder_id: str, owner_id: str):
    return await db_fetchone("SELECT * FROM folders WHERE id = ? AND owner_id = ?", (folder_id, owner_id))


async def _insert_map(
    owner_id: str, title: str, nodes: list, edges: list,
    folder_id: Optional[str] = None, tags: Optional[list] = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    map_id = str(uuid.uuid4())
    tags = tags or []
    await db_execute(
        "INSERT INTO mindmaps (id, owner_id, title, nodes, edges, is_public, created_at, updated_at, folder_id, tags) "
        "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
        (map_id, owner_id, title or "Mapa sem título", json.dumps(nodes), json.dumps(edges), now, now, folder_id, json.dumps(tags)),
    )
    return {
        "id": map_id,
        "owner_id": owner_id,
        "title": title or "Mapa sem título",
        "nodes": nodes,
        "edges": edges,
        "is_public": False,
        "created_at": now,
        "updated_at": now,
        "folder_id": folder_id,
        "tags": tags,
    }


# --- Mind Map endpoints ---
@api.get("/maps", response_model=List[MindMapSummary])
async def list_maps(
    folder_id: Optional[str] = None,
    tag: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    rows = await db_fetchall(
        "SELECT * FROM mindmaps WHERE owner_id = ? ORDER BY updated_at DESC", (user["id"],)
    )
    summaries = [_row_to_summary(r) for r in rows]
    if folder_id == "__none__":
        summaries = [s for s in summaries if not s["folder_id"]]
    elif folder_id:
        summaries = [s for s in summaries if s["folder_id"] == folder_id]
    if tag:
        summaries = [s for s in summaries if tag in s["tags"]]
    return summaries


@api.get("/tags", response_model=List[str])
async def list_tags(user: dict = Depends(get_current_user)):
    rows = await db_fetchall("SELECT tags FROM mindmaps WHERE owner_id = ?", (user["id"],))
    seen = []
    for r in rows:
        for t in _safe_tags(r["tags"]):
            if t not in seen:
                seen.append(t)
    return sorted(seen, key=str.lower)


@api.post("/maps", response_model=MindMapFull)
async def create_map(body: MindMapCreate, user: dict = Depends(get_current_user)):
    if body.folder_id and not await _get_owned_folder_row(body.folder_id, user["id"]):
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
    nodes, edges = build_template(body.template)
    doc = await _insert_map(user["id"], body.title, nodes, edges, folder_id=body.folder_id, tags=body.tags)
    return MindMapFull(**doc)


@api.post("/maps/import", response_model=MindMapFull)
async def import_map(body: MindMapImport, user: dict = Depends(get_current_user)):
    if body.folder_id and not await _get_owned_folder_row(body.folder_id, user["id"]):
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
    doc = await _insert_map(user["id"], body.title, body.nodes, body.edges, folder_id=body.folder_id, tags=body.tags)
    return MindMapFull(**doc)


@api.post("/maps/{map_id}/duplicate", response_model=MindMapFull)
async def duplicate_map(map_id: str, user: dict = Depends(get_current_user)):
    row = await _get_owned_map_row(map_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    full = _row_to_full(row)
    doc = await _insert_map(user["id"], f'{full["title"]} (cópia)', full["nodes"], full["edges"])
    return MindMapFull(**doc)


@api.get("/maps/{map_id}", response_model=MindMapFull)
async def get_map(map_id: str, user: dict = Depends(get_current_user)):
    row = await _get_owned_map_row(map_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    return _row_to_full(row)


@api.patch("/maps/{map_id}", response_model=MindMapFull)
async def update_map(map_id: str, body: MindMapUpdate, user: dict = Depends(get_current_user)):
    row = await _get_owned_map_row(map_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")

    fields = []
    values: list[Any] = []
    if body.title is not None:
        fields.append("title = ?")
        values.append(body.title)
    if body.nodes is not None:
        fields.append("nodes = ?")
        values.append(json.dumps(body.nodes))
    if body.edges is not None:
        fields.append("edges = ?")
        values.append(json.dumps(body.edges))
    if body.is_public is not None:
        fields.append("is_public = ?")
        values.append(1 if body.is_public else 0)
    if body.clear_folder:
        fields.append("folder_id = ?")
        values.append(None)
    elif body.folder_id is not None:
        if not await _get_owned_folder_row(body.folder_id, user["id"]):
            raise HTTPException(status_code=404, detail="Pasta não encontrada")
        fields.append("folder_id = ?")
        values.append(body.folder_id)
    if body.tags is not None:
        fields.append("tags = ?")
        values.append(json.dumps([str(t).strip() for t in body.tags if str(t).strip()][:20]))
    fields.append("updated_at = ?")
    values.append(datetime.now(timezone.utc).isoformat())
    values.append(map_id)

    await db_execute(f"UPDATE mindmaps SET {', '.join(fields)} WHERE id = ?", tuple(values))

    # Auto-save version
    ts = datetime.now(timezone.utc).isoformat()
    await db_execute(
        "INSERT INTO map_versions (id, map_id, title, nodes, edges, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), map_id, body.title or row[2],
         json.dumps(body.nodes) if body.nodes else row[3],
         json.dumps(body.edges) if body.edges else row[4], ts),
    )

    row = await db_fetchone("SELECT * FROM mindmaps WHERE id = ?", (map_id,))
    return _row_to_full(row)


@api.delete("/maps/{map_id}")
async def delete_map(map_id: str, user: dict = Depends(get_current_user)):
    cur = await db_execute("DELETE FROM mindmaps WHERE id = ? AND owner_id = ?", (map_id, user["id"]))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    return {"ok": True}


# --- Folder endpoints ---
@api.get("/folders", response_model=List[FolderOut])
async def list_folders(user: dict = Depends(get_current_user)):
    rows = await db_fetchall(
        "SELECT * FROM folders WHERE owner_id = ? ORDER BY name COLLATE NOCASE", (user["id"],)
    )
    counts = await db_fetchall(
        "SELECT folder_id, COUNT(*) as c FROM mindmaps WHERE owner_id = ? AND folder_id IS NOT NULL GROUP BY folder_id",
        (user["id"],),
    )
    count_map = {c["folder_id"]: c["c"] for c in counts}
    return [
        FolderOut(id=r["id"], name=r["name"], created_at=r["created_at"], map_count=count_map.get(r["id"], 0))
        for r in rows
    ]


@api.post("/folders", response_model=FolderOut)
async def create_folder(body: FolderCreate, user: dict = Depends(get_current_user)):
    folder_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db_execute(
        "INSERT INTO folders (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)",
        (folder_id, user["id"], body.name.strip(), now),
    )
    return FolderOut(id=folder_id, name=body.name.strip(), created_at=now, map_count=0)


@api.patch("/folders/{folder_id}", response_model=FolderOut)
async def rename_folder(folder_id: str, body: FolderUpdate, user: dict = Depends(get_current_user)):
    row = await _get_owned_folder_row(folder_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
    await db_execute("UPDATE folders SET name = ? WHERE id = ?", (body.name.strip(), folder_id))
    count_row = await db_fetchone(
        "SELECT COUNT(*) as c FROM mindmaps WHERE folder_id = ? AND owner_id = ?", (folder_id, user["id"])
    )
    return FolderOut(id=folder_id, name=body.name.strip(), created_at=row["created_at"], map_count=count_row["c"])


@api.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(get_current_user)):
    row = await _get_owned_folder_row(folder_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
    # Mapas dessa pasta não são apagados, só perdem a referência à pasta
    await db_execute(
        "UPDATE mindmaps SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?", (folder_id, user["id"])
    )
    await db_execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    return {"ok": True}


# --- Comment helpers/endpoints ---
def _row_to_comment(row) -> dict:
    return {
        "id": row["id"],
        "map_id": row["map_id"],
        "node_id": row["node_id"],
        "author_id": row["author_id"],
        "author_name": row["author_name"],
        "text": row["text"],
        "resolved": bool(row["resolved"]),
        "created_at": row["created_at"],
    }


@api.get("/maps/{map_id}/comments", response_model=List[CommentOut])
async def list_comments(map_id: str, user: dict = Depends(get_current_user)):
    if not await _get_owned_map_row(map_id, user["id"]):
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    rows = await db_fetchall(
        "SELECT * FROM comments WHERE map_id = ? ORDER BY created_at ASC", (map_id,)
    )
    return [_row_to_comment(r) for r in rows]


@api.post("/maps/{map_id}/comments", response_model=CommentOut)
async def create_comment(map_id: str, body: CommentCreate, user: dict = Depends(get_current_user)):
    if not await _get_owned_map_row(map_id, user["id"]):
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    comment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db_execute(
        "INSERT INTO comments (id, map_id, node_id, author_id, author_name, text, resolved, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
        (comment_id, map_id, body.node_id, user["id"], user["name"] or user["email"], body.text.strip(), now),
    )
    comment = {
        "id": comment_id, "map_id": map_id, "node_id": body.node_id,
        "author_id": user["id"], "author_name": user["name"] or user["email"],
        "text": body.text.strip(), "resolved": False, "created_at": now,
    }
    await manager.broadcast(map_id, {"type": "comment_new", "comment": comment})
    return CommentOut(**comment)


@api.patch("/maps/{map_id}/comments/{comment_id}", response_model=CommentOut)
async def update_comment(map_id: str, comment_id: str, body: CommentUpdate, user: dict = Depends(get_current_user)):
    if not await _get_owned_map_row(map_id, user["id"]):
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    row = await db_fetchone("SELECT * FROM comments WHERE id = ? AND map_id = ?", (comment_id, map_id))
    if not row:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    fields, values = [], []
    if body.resolved is not None:
        fields.append("resolved = ?")
        values.append(1 if body.resolved else 0)
    if body.text is not None:
        fields.append("text = ?")
        values.append(body.text.strip())
    if fields:
        values.append(comment_id)
        await db_execute(f"UPDATE comments SET {', '.join(fields)} WHERE id = ?", tuple(values))
    row = await db_fetchone("SELECT * FROM comments WHERE id = ?", (comment_id,))
    comment = _row_to_comment(row)
    await manager.broadcast(map_id, {"type": "comment_updated", "comment": comment})
    return CommentOut(**comment)


@api.delete("/maps/{map_id}/comments/{comment_id}")
async def delete_comment(map_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    if not await _get_owned_map_row(map_id, user["id"]):
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    cur = await db_execute("DELETE FROM comments WHERE id = ? AND map_id = ?", (comment_id, map_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    await manager.broadcast(map_id, {"type": "comment_deleted", "comment_id": comment_id})
    return {"ok": True}


# --- Colaboração em tempo real: WebSocket por mapa ---
# Sincroniza edições (nós/arestas), cursores e comentários entre todas as
# sessões abertas do dono do mapa. Autenticação via querystring `?token=`
# (WebSocket do navegador não permite cabeçalho Authorization customizado).
@api.websocket("/ws/maps/{map_id}")
async def ws_map_collab(websocket: WebSocket, map_id: str, token: Optional[str] = Query(default=None)):
    if not token:
        await websocket.close(code=4001)
        return
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user_row = await db_fetchone("SELECT * FROM users WHERE id = ?", (payload.get("sub"),))
        if not user_row:
            raise ValueError("user not found")
    except Exception:
        await websocket.close(code=4001)
        return

    if not await _get_owned_map_row(map_id, user_row["id"]):
        await websocket.close(code=4004)
        return

    user = {
        "id": user_row["id"],
        "name": user_row["name"] or user_row["email"],
        "color": _color_for_user(user_row["id"]),
    }

    await manager.connect(map_id, websocket, user)
    await manager.broadcast(map_id, {"type": "presence", "users": manager.presence(map_id)})

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "graph_update":
                await manager.broadcast(
                    map_id,
                    {"type": "graph_update", "nodes": msg.get("nodes"), "edges": msg.get("edges"), "from": user["id"]},
                    exclude=websocket,
                )
            elif mtype == "cursor":
                await manager.broadcast(
                    map_id,
                    {"type": "cursor", "x": msg.get("x"), "y": msg.get("y"), "user": user},
                    exclude=websocket,
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(map_id, websocket)
        await manager.broadcast(map_id, {"type": "presence", "users": manager.presence(map_id)})


# Public read-only endpoint (no auth)
@api.get("/public/maps/{map_id}", response_model=MindMapFull)
async def get_public_map(map_id: str):
    row = await db_fetchone("SELECT * FROM mindmaps WHERE id = ? AND is_public = 1", (map_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Mapa público não encontrado")
    return _row_to_full(row)


# --- Version endpoints ---
@api.get("/maps/{map_id}/versions", response_model=List[VersionOut])
async def list_versions(map_id: str, user: dict = Depends(get_current_user)):
    row = await _get_owned_map_row(map_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    rows = await db_fetchall(
        "SELECT id, map_id, title, created_at FROM map_versions WHERE map_id = ? ORDER BY created_at DESC",
        (map_id,),
    )
    return [{"id": r[0], "map_id": r[1], "title": r[2], "created_at": r[3]} for r in rows]


@api.post("/maps/{map_id}/versions/{version_id}/restore", response_model=MindMapFull)
async def restore_version(map_id: str, version_id: str, user: dict = Depends(get_current_user)):
    row = await _get_owned_map_row(map_id, user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Mapa não encontrado")
    vr = await db_fetchone(
        "SELECT * FROM map_versions WHERE id = ? AND map_id = ?", (version_id, map_id),
    )
    if not vr:
        raise HTTPException(status_code=404, detail="Versão não encontrada")
    ts = datetime.now(timezone.utc).isoformat()
    await db_execute(
        "UPDATE mindmaps SET title = ?, nodes = ?, edges = ?, updated_at = ? WHERE id = ?",
        (vr[2], vr[3], vr[4], ts, map_id),
    )
    updated = await db_fetchone("SELECT * FROM mindmaps WHERE id = ?", (map_id,))
    return _row_to_full(updated)


# Backup endpoint
@api.post("/backup")
async def create_backup():
    project_root = ROOT_DIR.parent  # sobe de backend/ para mapa-mental/
    backup_root = ROOT_DIR.parent / "backups"
    backup_root.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    dst = backup_root / f"mapa-mental_{timestamp}"
    dst.mkdir(parents=True)

    exclude_dirs = {"node_modules", "__pycache__", ".git", "backups", ".venv", "venv"}
    exclude_exts = {".pyc", ".pyo", ".db"}

    total = 0
    for item in project_root.iterdir():
        if item.name in exclude_dirs:
            continue
        if item.is_dir():
            shutil.copytree(item, dst / item.name, ignore=lambda d, files: {
                f for f in files
                if (Path(d) / f).is_dir() and (Path(d) / f).name in exclude_dirs
                or (Path(d) / f).suffix in exclude_exts
            })
            for f in (dst / item.name).rglob("*"):
                if f.is_file():
                    total += 1
        else:
            if item.suffix not in exclude_exts:
                shutil.copy2(item, dst / item.name)
                total += 1

    return {"ok": True, "path": str(dst), "files": total}


# Upload de imagens
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

@api.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    allowed = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".webm", ".mov", ".avi",
               ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".wma",
               ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".csv", ".zip", ".rar", ".7z"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado.")
    original_name = file.filename or f"arquivo{ext}"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename
    content = await file.read()
    dest.write_bytes(content)
    url = f"/uploads/{filename}"
    return {"url": url, "original_name": original_name}


@api.post("/preview")
async def fetch_preview(data: dict, user: dict = Depends(get_current_user)):
    url = data.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="URL obrigatória")
    try:
        resp = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0 (compatible; MindMapBot/1.0)"})
        html = resp.text
        og_title = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', html)
        og_desc = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html)
        og_image = re.search(r'<meta\s+property="og:image"\s+content="([^"]*)"', html)
        fallback_title = re.search(r'<title>([^<]*)</title>', html)
        return {
            "title": og_title.group(1) if og_title else (fallback_title.group(1) if fallback_title else ""),
            "description": og_desc.group(1) if og_desc else "",
            "image": og_image.group(1) if og_image else "",
        }
    except:
        raise HTTPException(status_code=422, detail="Não foi possível obter preview")


app.include_router(api)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
