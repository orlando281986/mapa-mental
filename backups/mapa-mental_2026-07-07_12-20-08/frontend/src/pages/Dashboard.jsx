import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  Plus,
  Trash,
  Brain,
  SignOut,
  Globe,
  CaretDown,
  CopySimple,
  DownloadSimple,
  UploadSimple,
  Sun,
  Moon,
  Lightning,
  FlowArrow,
  Kanban,
  FileDashed,
  FolderSimple,
  FolderPlus,
  PencilSimple,
  Tag,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const TEMPLATES = [
  { key: null, label: "Em branco", Icon: FileDashed },
  { key: "brainstorm", label: "Brainstorm", Icon: Lightning },
  { key: "flowchart", label: "Fluxograma", Icon: FlowArrow },
  { key: "kanban", label: "Kanban", Icon: Kanban },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [maps, setMaps] = useState([]);
  const [folders, setFolders] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null); // null = todos, "__none__" = sem pasta, ou id
  const [selectedTag, setSelectedTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [folderMenuFor, setFolderMenuFor] = useState(null); // map id com dropdown de pasta aberto
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const folderMenuRef = useRef(null);

  const loadFolders = useCallback(async () => {
    try {
      const { data } = await api.get("/folders");
      setFolders(data);
    } catch {
      toast.error("Erro ao carregar pastas");
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const { data } = await api.get("/tags");
      setAllTags(data);
    } catch {
      /* silencioso: filtro de tags é acessório */
    }
  }, []);

  const loadMaps = useCallback(async (folderId, tag) => {
    setLoading(true);
    try {
      const params = {};
      if (folderId) params.folder_id = folderId;
      if (tag) params.tag = tag;
      const { data } = await api.get("/maps", { params });
      setMaps(data);
    } catch {
      toast.error("Erro ao carregar mapas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolders(); loadTags(); }, [loadFolders, loadTags]);
  useEffect(() => { loadMaps(selectedFolder, selectedTag); }, [loadMaps, selectedFolder, selectedTag]);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setTemplateMenuOpen(false);
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) setFolderMenuFor(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const refreshSidebars = () => { loadFolders(); loadTags(); };

  const createMap = async (template = null) => {
    setCreating(true);
    setTemplateMenuOpen(false);
    try {
      const body = { title: "Mapa sem título", template };
      if (selectedFolder && selectedFolder !== "__none__") body.folder_id = selectedFolder;
      const { data } = await api.post("/maps", body);
      navigate(`/map/${data.id}`);
    } catch {
      toast.error("Erro ao criar mapa");
    } finally {
      setCreating(false);
    }
  };

  const deleteMap = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Excluir este mapa?")) return;
    try {
      await api.delete(`/maps/${id}`);
      setMaps((prev) => prev.filter((m) => m.id !== id));
      toast.success("Mapa excluído");
      refreshSidebars();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const duplicateMap = async (id, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/maps/${id}/duplicate`);
      setMaps((prev) => [
        { id: data.id, title: data.title, is_public: data.is_public, updated_at: data.updated_at, created_at: data.created_at, folder_id: data.folder_id, tags: data.tags },
        ...prev,
      ]);
      toast.success("Mapa duplicado");
      refreshSidebars();
    } catch {
      toast.error("Erro ao duplicar mapa");
    }
  };

  const exportMap = async (id, title, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.get(`/maps/${id}`);
      const payload = { title: data.title, nodes: data.nodes, edges: data.edges };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(title || "mapa").replace(/[^a-z0-9-_]+/gi, "_")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("JSON exportado");
    } catch {
      toast.error("Erro ao exportar mapa");
    }
  };

  const triggerImport = () => fileInputRef.current?.click();

  const importMap = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error("Formato inválido");
      }
      const body = { title: parsed.title || "Mapa importado", nodes: parsed.nodes, edges: parsed.edges };
      if (selectedFolder && selectedFolder !== "__none__") body.folder_id = selectedFolder;
      const { data } = await api.post("/maps/import", body);
      toast.success("Mapa importado!");
      navigate(`/map/${data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Arquivo JSON inválido");
    }
  };

  // --- Pastas ---
  const createFolder = async () => {
    const name = window.prompt("Nome da nova pasta:");
    if (!name || !name.trim()) return;
    try {
      await api.post("/folders", { name: name.trim() });
      toast.success("Pasta criada");
      refreshSidebars();
    } catch {
      toast.error("Erro ao criar pasta");
    }
  };

  const renameFolder = async (folder, e) => {
    e.stopPropagation();
    const name = window.prompt("Novo nome da pasta:", folder.name);
    if (!name || !name.trim() || name.trim() === folder.name) return;
    try {
      await api.patch(`/folders/${folder.id}`, { name: name.trim() });
      toast.success("Pasta renomeada");
      refreshSidebars();
    } catch {
      toast.error("Erro ao renomear pasta");
    }
  };

  const deleteFolder = async (folder, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir a pasta "${folder.name}"? Os mapas dentro dela não serão apagados.`)) return;
    try {
      await api.delete(`/folders/${folder.id}`);
      if (selectedFolder === folder.id) setSelectedFolder(null);
      toast.success("Pasta excluída");
      refreshSidebars();
      loadMaps(selectedFolder === folder.id ? null : selectedFolder, selectedTag);
    } catch {
      toast.error("Erro ao excluir pasta");
    }
  };

  const assignFolder = async (mapId, folderId, e) => {
    e?.stopPropagation();
    setFolderMenuFor(null);
    try {
      const body = folderId ? { folder_id: folderId } : { clear_folder: true };
      await api.patch(`/maps/${mapId}`, body);
      toast.success("Pasta atualizada");
      refreshSidebars();
      loadMaps(selectedFolder, selectedTag);
    } catch {
      toast.error("Erro ao mover mapa");
    }
  };

  // --- Tags ---
  const editTags = async (map, e) => {
    e.stopPropagation();
    const input = window.prompt("Tags separadas por vírgula:", (map.tags || []).join(", "));
    if (input === null) return;
    const tags = input.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const { data } = await api.patch(`/maps/${map.id}`, { tags });
      setMaps((prev) => prev.map((m) => (m.id === map.id ? { ...m, tags: data.tags } : m)));
      toast.success("Tags atualizadas");
      loadTags();
    } catch {
      toast.error("Erro ao atualizar tags");
    }
  };

  const folderName = (id) => folders.find((f) => f.id === id)?.name;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <header className="brutal-border border-x-0 border-t-0 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="brutal-border brutal-shadow-sm bg-[#FDE047] rounded-lg p-2">
              <Brain size={24} weight="duotone" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Mapa Mental</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-600">
              {user?.name} · {user?.email}
            </span>
            <button
              onClick={toggleTheme}
              data-testid="theme-toggle-button"
              className="brutal-btn bg-white p-2"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
            </button>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="brutal-btn bg-white px-3 py-2 flex items-center gap-2 text-sm"
            >
              <SignOut size={16} weight="bold" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 flex flex-col lg:flex-row gap-8">
        {/* Sidebar de pastas */}
        <aside className="lg:w-64 shrink-0">
          <div className="brutal-border brutal-shadow rounded-xl bg-white p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-sm uppercase tracking-wide text-gray-500">Pastas</h3>
              <button
                onClick={createFolder}
                data-testid="new-folder-button"
                className="p-1.5 rounded-md hover:bg-black/5"
                title="Nova pasta"
                aria-label="Nova pasta"
              >
                <FolderPlus size={18} weight="bold" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => setSelectedFolder(null)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  selectedFolder === null ? "bg-[#FDE047] brutal-border" : "hover:bg-black/5"
                }`}
              >
                <Brain size={16} weight="bold" /> Todos os mapas
              </button>
              <button
                onClick={() => setSelectedFolder("__none__")}
                className={`text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  selectedFolder === "__none__" ? "bg-[#FDE047] brutal-border" : "hover:bg-black/5"
                }`}
              >
                <FileDashed size={16} weight="bold" /> Sem pasta
              </button>
              {folders.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFolder(f.id)}
                  role="button"
                  tabIndex={0}
                  data-testid={`folder-item-${f.id}`}
                  className={`group text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                    selectedFolder === f.id ? "bg-[#FDE047] brutal-border" : "hover:bg-black/5"
                  }`}
                >
                  <FolderSimple size={16} weight="bold" className="shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-gray-500 font-normal">{f.map_count}</span>
                  <span
                    onClick={(e) => renameFolder(f, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded"
                    title="Renomear"
                  >
                    <PencilSimple size={13} weight="bold" />
                  </span>
                  <span
                    onClick={(e) => deleteFolder(f, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded"
                    title="Excluir pasta"
                  >
                    <Trash size={13} weight="bold" />
                  </span>
                </div>
              ))}
              {folders.length === 0 && (
                <p className="text-xs text-gray-500 px-3 py-2">Nenhuma pasta ainda. Crie uma com o ícone acima.</p>
              )}
            </nav>

            {allTags.length > 0 && (
              <>
                <h3 className="font-extrabold text-sm uppercase tracking-wide text-gray-500 mt-6 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTag((cur) => (cur === t ? null : t))}
                      data-testid={`tag-filter-${t}`}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full brutal-border ${
                        selectedTag === t ? "bg-black text-white" : "bg-white hover:bg-black/5"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-4 justify-between items-end mb-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">
                {selectedFolder === "__none__"
                  ? "Sem pasta"
                  : selectedFolder
                  ? folderName(selectedFolder) || "Pasta"
                  : "Meu espaço"}
              </p>
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tighter">
                Meus Mapas
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={importMap}
                className="hidden"
                data-testid="import-file-input"
              />
              <button
                onClick={triggerImport}
                data-testid="import-map-button"
                className="brutal-btn bg-white px-4 py-3 flex items-center gap-2"
                title="Importar mapa de um arquivo JSON"
              >
                <UploadSimple size={18} weight="bold" />
                <span className="hidden sm:inline">Importar</span>
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setTemplateMenuOpen((v) => !v)}
                  disabled={creating}
                  data-testid="create-map-button"
                  className="brutal-btn bg-[#FDE047] text-black px-5 py-3 flex items-center gap-2"
                >
                  <Plus size={20} weight="bold" />
                  {creating ? "Criando..." : "Novo Mapa Mental"}
                  <CaretDown size={14} weight="bold" />
                </button>
                {templateMenuOpen && (
                  <div
                    data-testid="template-menu"
                    className="absolute right-0 mt-2 w-56 brutal-border brutal-shadow bg-white rounded-xl py-2 z-50"
                  >
                    {TEMPLATES.map(({ key, label, Icon }) => (
                      <button
                        key={label}
                        onClick={() => createMap(key)}
                        data-testid={`template-option-${key || "blank"}`}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-left hover:bg-[#FDE047]"
                      >
                        <Icon size={18} weight="bold" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 font-bold text-gray-500">Carregando...</div>
          ) : maps.length === 0 ? (
            <div className="brutal-border brutal-shadow-lg rounded-2xl bg-white p-12 text-center max-w-2xl mx-auto">
              <div className="inline-block brutal-border brutal-shadow bg-[#D8B4FE] rounded-full p-4 mb-4">
                <Brain size={40} weight="duotone"/>
              </div>
              <h3 className="text-2xl font-bold mb-2">Nenhum mapa aqui ainda</h3>
              <p className="text-gray-600 mb-6">
                Clique em &quot;Novo Mapa Mental&quot; para começar a organizar suas ideias.
              </p>
              <button
                onClick={() => createMap(null)}
                data-testid="empty-create-button"
                className="brutal-btn bg-black text-white px-5 py-3 inline-flex items-center gap-2"
              >
                <Plus size={20} weight="bold"/>
                Criar meu primeiro mapa
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {maps.map((m, i) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/map/${m.id}`)}
                  data-testid={`map-card-${m.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/map/${m.id}`)}
                  className="text-left cursor-pointer brutal-border brutal-shadow bg-white rounded-xl overflow-hidden hover:-translate-y-1 hover:brutal-shadow-lg transition-all duration-200 group flex flex-col"
                >
                  <div
                    className="h-40 border-b-2 border-black relative overflow-hidden canvas-bg flex items-center justify-center"
                  >
                    <div
                      className="brutal-border brutal-shadow-sm rounded-lg px-4 py-2 font-bold"
                      style={{ background: ["#FDE047","#86EFAC","#D8B4FE","#FDBA74","#93C5FD","#F9A8D4"][i % 6] }}
                    >
                      {(m.title || "Mapa").slice(0, 22)}
                    </div>
                  </div>
                  <div className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg truncate">{m.title || "Mapa sem título"}</h3>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Última edição:{" "}
                        {new Date(m.updated_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      {m.is_public && (
                        <span className="inline-flex items-center gap-1 font-bold text-black bg-[#FDE047] brutal-border rounded-md px-2 py-0.5">
                          <Globe size={12} weight="bold"/> Público
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(m.tags || []).map((t) => (
                        <span
                          key={t}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10"
                        >
                          {t}
                        </span>
                      ))}
                      <span
                        onClick={(e) => editTags(m, e)}
                        data-testid={`edit-tags-${m.id}`}
                        className="p-1 rounded-md hover:bg-black/5 cursor-pointer text-gray-400"
                        role="button"
                        aria-label="Editar tags"
                        title="Editar tags"
                      >
                        <Tag size={13} weight="bold" />
                      </span>
                    </div>

                    {/* Pasta */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setFolderMenuFor(folderMenuFor === m.id ? null : m.id)}
                        data-testid={`folder-select-${m.id}`}
                        className="w-full flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-black px-2 py-1 rounded-md hover:bg-black/5 border border-dashed border-gray-300"
                      >
                        <FolderSimple size={13} weight="bold" />
                        <span className="truncate flex-1 text-left">
                          {m.folder_id ? folderName(m.folder_id) || "Pasta" : "Sem pasta"}
                        </span>
                        <CaretDown size={11} weight="bold" />
                      </button>
                      {folderMenuFor === m.id && (
                        <div
                          ref={folderMenuRef}
                          className="absolute left-0 right-0 mt-1 brutal-border brutal-shadow bg-white rounded-lg py-1 z-50 max-h-48 overflow-y-auto"
                        >
                          <button
                            onClick={(e) => assignFolder(m.id, null, e)}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-[#FDE047] flex items-center gap-2"
                          >
                            <X size={12} weight="bold" /> Sem pasta
                          </button>
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              onClick={(e) => assignFolder(m.id, f.id, e)}
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-[#FDE047] flex items-center gap-2 truncate"
                            >
                              <FolderSimple size={12} weight="bold" /> {f.name}
                            </button>
                          ))}
                          {folders.length === 0 && (
                            <p className="px-3 py-1.5 text-xs text-gray-400">Crie uma pasta na barra lateral</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 pt-1 border-t border-black/10 dark:border-white/10 mt-1">
                      <span
                        onClick={(e) => duplicateMap(m.id, e)}
                        data-testid={`duplicate-map-${m.id}`}
                        className="p-2 rounded-md hover:bg-black/5 cursor-pointer"
                        role="button"
                        aria-label="Duplicar"
                        title="Duplicar mapa"
                      >
                        <CopySimple size={16} weight="bold" />
                      </span>
                      <span
                        onClick={(e) => exportMap(m.id, m.title, e)}
                        data-testid={`export-map-${m.id}`}
                        className="p-2 rounded-md hover:bg-black/5 cursor-pointer"
                        role="button"
                        aria-label="Exportar JSON"
                        title="Exportar como JSON"
                      >
                        <DownloadSimple size={16} weight="bold" />
                      </span>
                      <span className="flex-1" />
                      <span
                        onClick={(e) => deleteMap(m.id, e)}
                        data-testid={`delete-map-${m.id}`}
                        className="p-2 rounded-md hover:bg-red-100 cursor-pointer"
                        role="button"
                        aria-label="Excluir"
                        title="Excluir mapa"
                      >
                        <Trash size={16} weight="bold" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
