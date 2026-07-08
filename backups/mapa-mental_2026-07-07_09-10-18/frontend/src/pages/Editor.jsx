import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "../lib/api";
import MindNode from "../components/MindNode";
import { ICON_LIST, ICON_MAP } from "../lib/icons";
import ContextMenu from "../components/ContextMenu";
import CommentsPanel from "../components/CommentsPanel";
import useMapCollab from "../hooks/useMapCollab";
import { useTheme } from "../context/ThemeContext";
import { toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  Plus,
  FloppyDisk,
  Trash,
  ArrowLeft,
  Download,
  Link as LinkIcon,
  Rectangle,
  Circle,
  Diamond,
  Hexagon,
  Star,
  Palette,
  ArrowUUpLeft,
  ArrowUUpRight,
  MagnetStraight,
  TextB,
  TextItalic,
  Sun,
  Moon,
  ChatCircle,
  CaretDown,
  ArrowsOutSimple,
  ArrowsInSimple as ArrowsInSimpleIcon,
  NotePencil,
  X,
  Minus,
  HardDrive,
  MagnifyingGlass,
  ClockCounterClockwise,
  MagnifyingGlassPlus,
  Table,
} from "@phosphor-icons/react";

const COLORS = ["#FDE047", "#86EFAC", "#D8B4FE", "#FDBA74", "#93C5FD", "#F9A8D4", "#FFFFFF"];
const SHAPES = [
  { key: "rectangle", label: "Retângulo", Icon: Rectangle },
  { key: "pill", label: "Pílula", Icon: Circle },
  { key: "diamond", label: "Diamante", Icon: Diamond },
  { key: "rounded", label: "Arredondado", Icon: Circle },
  { key: "hexagon", label: "Hexágono", Icon: Hexagon },
  { key: "star", label: "Estrela", Icon: Star },
];
const FIT_VIEW_OPTIONS = { padding: 0.4, maxZoom: 1.2 };
const PRO_OPTIONS = { hideAttribution: true };
const GRID_SIZE = 24;
const HISTORY_LIMIT = 50;

function EditorInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [title, setTitle] = useState("Mapa sem título");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // {x, y, nodeId}
  const [clipboard, setClipboard] = useState(null); // node data snapshot
  const [zoomPct, setZoomPct] = useState(100);
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [commentTargetNode, setCommentTargetNode] = useState(null);
  const flowWrapper = useRef(null);
  const rf = useReactFlow();
  const applyingRemoteRef = useRef(false);
  const lastLocalEditRef = useRef(0);
  const connectionSrcRef = useRef(null);
  const connectedRef = useRef(false);

  // history for undo/redo — stores {nodes, edges} snapshots
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const skipNextHistoryRef = useRef(false);

  const nodeTypes = useMemo(() => ({ mind: MindNode }), []);

  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }, [setNodes]);

  // Snapshot current state to undo stack
  const pushHistory = useCallback(() => {
    const snap = {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
    };
    undoStack.current.push(snap);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  }, [nodes, edges]);

  // Load map
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/maps/${id}`);
        setTitle(data.title);
        setIsPublic(data.is_public);
        const decorated = (data.nodes || []).map((n) => ({
          ...n,
          type: "mind",
          data: { ...n.data, onChange: updateNodeData },
        }));
        setNodes(decorated);
        setEdges(data.edges || []);
        undoStack.current = [];
        redoStack.current = [];
      } catch {
        toast.error("Erro ao carregar mapa");
        navigate("/dashboard");
        return;
      }
      try {
        const { data: cms } = await api.get(`/maps/${id}/comments`);
        setComments(cms || []);
      } catch {
        // comentários são um extra; falha ao carregar não deve travar o editor
      }
    })();
  }, [id]);

  // --- Colaboração em tempo real ---
  const onRemoteGraphUpdate = useCallback((msg) => {
    applyingRemoteRef.current = true;
    if (Array.isArray(msg.nodes)) {
      setNodes(msg.nodes.map((n) => ({ ...n, type: "mind", data: { ...n.data, onChange: updateNodeData } })));
    }
    if (Array.isArray(msg.edges)) {
      setEdges(msg.edges);
    }
    toast.message("Alterações recebidas de outra sessão", { duration: 1500 });
  }, [setNodes, setEdges, updateNodeData]);

  const onRemoteComment = useCallback((msg) => {
    if (msg.type === "comment_new") {
      setComments((cur) => (cur.some((c) => c.id === msg.comment.id) ? cur : [...cur, msg.comment]));
    } else if (msg.type === "comment_updated") {
      setComments((cur) => cur.map((c) => (c.id === msg.comment.id ? msg.comment : c)));
    } else if (msg.type === "comment_deleted") {
      setComments((cur) => cur.filter((c) => c.id !== msg.comment_id));
    }
  }, []);

  const { presence, cursors, sendGraphUpdate, sendCursor } = useMapCollab(id, {
    onGraphUpdate: onRemoteGraphUpdate,
    onComment: onRemoteComment,
  });

  // Transmite as mudanças locais para outras sessões abertas (debounced)
  useEffect(() => {
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      const cleanNodes = nodes.map((n) => ({
        ...n,
        data: { ...n.data, onChange: undefined },
      }));
      sendGraphUpdate(cleanNodes, edges);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const commentCounts = useMemo(() => {
    const counts = {};
    comments.forEach((c) => {
      if (!c.resolved && c.node_id) counts[c.node_id] = (counts[c.node_id] || 0) + 1;
    });
    return counts;
  }, [comments]);

  // --- Expandir/retrair (recolher subárvore de um nó) ---
  const toggleCollapse = useCallback((nodeId) => {
    pushHistory();
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } } : n)),
    );
  }, [setNodes, pushHistory]);

  // Mapa nó -> filhos diretos (a partir das arestas source -> target)
  const childrenMap = useMemo(() => {
    const map = {};
    edges.forEach((e) => {
      if (!map[e.source]) map[e.source] = [];
      map[e.source].push(e.target);
    });
    return map;
  }, [edges]);

  const expandAll = useCallback(() => {
    pushHistory();
    setNodes((nds) => nds.map((n) => (n.data.collapsed ? { ...n, data: { ...n.data, collapsed: false } } : n)));
  }, [setNodes, pushHistory]);

  const collapseAll = useCallback(() => {
    pushHistory();
    setNodes((nds) =>
      nds.map((n) =>
        (childrenMap[n.id] || []).length > 0 ? { ...n, data: { ...n.data, collapsed: true } } : n,
      ),
    );
  }, [setNodes, pushHistory, childrenMap]);

  // Todos os descendentes (transitivo) de cada nó, usado para saber quantos
  // nós ficam ocultos e para calcular o conjunto de nós escondidos.
  const descendantsMap = useMemo(() => {
    const cache = {};
    const visit = (nodeId, trail) => {
      if (cache[nodeId]) return cache[nodeId];
      if (trail.has(nodeId)) return []; // proteção contra ciclo
      trail.add(nodeId);
      const direct = childrenMap[nodeId] || [];
      let all = [...direct];
      direct.forEach((child) => {
        all = all.concat(visit(child, trail));
      });
      cache[nodeId] = all;
      return all;
    };
    const result = {};
    Object.keys(childrenMap).forEach((nid) => {
      result[nid] = visit(nid, new Set());
    });
    return result;
  }, [childrenMap]);

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set();
    nodes.forEach((n) => {
      if (n.data.collapsed) {
        (descendantsMap[n.id] || []).forEach((d) => hidden.add(d));
      }
    });
    return hidden;
  }, [nodes, descendantsMap]);

  // BFS to find all nodes connected to the focused node
  const focusBranchSet = useMemo(() => {
    if (!focusNodeId) return null;
    const adj = {};
    for (const n of nodes) adj[n.id] = [];
    for (const e of edges) {
      if (adj[e.source]) adj[e.source].push(e.target);
      if (adj[e.target]) adj[e.target].push(e.source);
    }
    const visited = new Set();
    const queue = [focusNodeId];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const nb of adj[cur] || []) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    return visited;
  }, [focusNodeId, nodes, edges]);

  const nodesForRender = useMemo(
    () => {
      const q = searchQuery.toLowerCase().trim();
      return nodes
        .filter((n) => !hiddenNodeIds.has(n.id))
        .map((n) => {
          const match = !q || (n.data.label || "").toLowerCase().includes(q);
          const inFocus = !focusBranchSet || focusBranchSet.has(n.id);
          return {
            ...n,
            data: {
              ...n.data,
              commentCount: commentCounts[n.id] || 0,
              hasChildren: (childrenMap[n.id] || []).length > 0,
              childCount: (descendantsMap[n.id] || []).length,
              onToggleCollapse: toggleCollapse,
              dimmed: !match || !inFocus,
            },
          };
        });
    },
    [nodes, commentCounts, childrenMap, descendantsMap, toggleCollapse, hiddenNodeIds, searchQuery, focusBranchSet],
  );

  const edgesForRender = useMemo(
    () => edges.filter((e) => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)),
    [edges, hiddenNodeIds],
  );

  const unresolvedCommentCount = useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);

  const addComment = useCallback(async (nodeId, text) => {
    try {
      const { data } = await api.post(`/maps/${id}/comments`, { node_id: nodeId, text });
      setComments((cur) => [...cur, data]);
    } catch {
      toast.error("Erro ao comentar");
    }
  }, [id]);

  const resolveComment = useCallback(async (commentId, resolved) => {
    try {
      const { data } = await api.patch(`/maps/${id}/comments/${commentId}`, { resolved });
      setComments((cur) => cur.map((c) => (c.id === commentId ? data : c)));
    } catch {
      toast.error("Erro ao atualizar comentário");
    }
  }, [id]);

  const deleteComment = useCallback(async (commentId) => {
    try {
      await api.delete(`/maps/${id}/comments/${commentId}`);
      setComments((cur) => cur.filter((c) => c.id !== commentId));
    } catch {
      toast.error("Erro ao excluir comentário");
    }
  }, [id]);

  const focusOnNode = useCallback((nodeId) => {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) return;
    setSelectedNodeId(nodeId);
    rf.setCenter(n.position.x + 70, n.position.y + 30, { zoom: 1, duration: 400 });
  }, [nodes, rf]);

  const onCanvasMouseMove = useCallback((e) => {
    if (!flowWrapper.current) return;
    const rect = flowWrapper.current.getBoundingClientRect();
    sendCursor(e.clientX - rect.left, e.clientY - rect.top);
  }, [sendCursor]);

  const onConnect = useCallback((params) => {
    pushHistory();
    connectedRef.current = true;
    setEdges((eds) => addEdge({ ...params, type: "smoothstep" }, eds));
  }, [setEdges, pushHistory]);

  const addNodeAt = useCallback((flowX, flowY, initial = {}) => {
    const nid = crypto.randomUUID();
    const newNode = {
      id: nid,
      type: "mind",
      position: { x: flowX, y: flowY },
      data: {
        label: "Nova ideia",
        color: COLORS[Math.floor(Math.random() * (COLORS.length - 1))],
        shape: "rectangle",
        bold: false,
        italic: false,
        width: 200,
        height: 80,
        ...initial,
        onChange: updateNodeData,
      },
    };
    pushHistory();
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(nid);
    return nid;
  }, [setNodes, updateNodeData, pushHistory]);

  const onConnectStart = useCallback((_, { nodeId }) => {
    connectionSrcRef.current = nodeId;
  }, []);

  const onConnectEnd = useCallback((event) => {
    if (connectedRef.current) {
      connectedRef.current = false;
      return;
    }
    const fromNodeId = connectionSrcRef.current;
    connectionSrcRef.current = null;
    if (!fromNodeId) return;
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    if (!fromNode) return;
    const pos = rf.screenToFlowPosition({ x: event.clientX || event.changedTouches?.[0]?.clientX || 0, y: event.clientY || event.changedTouches?.[0]?.clientY || 0 });
    const newId = addNodeAt(pos.x, pos.y);
    pushHistory();
    setEdges((eds) => [...eds, { id: crypto.randomUUID(), source: fromNode.id, target: newId, type: "smoothstep" }]);
  }, [rf, addNodeAt, pushHistory, setEdges, nodes]);

  const addNode = () => {
    const { x, y } = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNodeAt(x - 60 + Math.random() * 60, y - 30 + Math.random() * 60);
  };

  const deleteSelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) {
      if (selectedNodeId) {
        pushHistory();
        setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
        setSelectedNodeId(null);
      }
      return;
    }
    const ids = new Set(selected.map((n) => n.id));
    pushHistory();
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    if (selectedNodeId && ids.has(selectedNodeId)) setSelectedNodeId(null);
  }, [nodes, selectedNodeId, setNodes, setEdges, pushHistory]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        deleteSelectedNodes();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelectedNodes]);

  const copyNode = useCallback((nodeId) => {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) return;
    setClipboard({
      data: { ...n.data, onChange: undefined },
      position: { ...n.position },
    });
    toast.success("Copiado");
  }, [nodes]);

  const removeNode = useCallback((nodeId) => {
    if (!nodeId) return;
    pushHistory();
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((cur) => (cur === nodeId ? null : cur));
  }, [setNodes, setEdges, pushHistory]);

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const { data } = await api.get(`/maps/${id}/versions`);
      setVersions(data);
    } catch {
      toast.error("Erro ao carregar versões");
    } finally {
      setLoadingVersions(false);
    }
  }, [id]);

  const restoreVersion = useCallback(async (versionId) => {
    try {
      const { data } = await api.post(`/maps/${id}/versions/${versionId}/restore`);
      setNodes(data.nodes.map((n) => ({ ...n, type: "mind", data: { ...n.data, onChange: updateNodeData } })));
      setEdges(data.edges || []);
      setTitle(data.title);
      setShowVersions(false);
      toast.success("Versão restaurada!");
    } catch {
      toast.error("Erro ao restaurar versão");
    }
  }, [id, setNodes, setEdges, updateNodeData]);

  const cutNode = useCallback((nodeId) => {
    copyNode(nodeId);
    removeNode(nodeId);
  }, [copyNode, removeNode]);

  const pasteNode = useCallback((atFlowPos) => {
    if (!clipboard) return;
    const pos = atFlowPos || {
      x: clipboard.position.x + 40,
      y: clipboard.position.y + 40,
    };
    addNodeAt(pos.x, pos.y, {
      label: clipboard.data.label,
      color: clipboard.data.color,
      shape: clipboard.data.shape,
      bold: clipboard.data.bold,
      italic: clipboard.data.italic,
      url: clipboard.data.url || null,
      notes: clipboard.data.notes || null,
      icon: clipboard.data.icon || null,
      image: clipboard.data.image || null,
      textColor: clipboard.data.textColor || null,
      table: clipboard.data.table || null,
      width: clipboard.data.width || 200,
      height: clipboard.data.height || 80,
    });
  }, [clipboard, addNodeAt]);

  const duplicateNode = useCallback((nodeId) => {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) return;
    addNodeAt(n.position.x + 40, n.position.y + 40, {
      label: n.data.label,
      color: n.data.color,
      shape: n.data.shape,
      bold: n.data.bold,
      italic: n.data.italic,
      url: n.data.url || null,
      notes: n.data.notes || null,
      icon: n.data.icon || null,
      image: n.data.image || null,
      textColor: n.data.textColor || null,
      table: n.data.table || null,
      width: n.data.width || 200,
      height: n.data.height || 80,
    });
  }, [nodes, addNodeAt]);

  const reorderNode = useCallback((nodeId, direction) => {
    // "front" -> move to end, "back" -> move to start
    setNodes((nds) => {
      const idx = nds.findIndex((n) => n.id === nodeId);
      if (idx < 0) return nds;
      const target = nds[idx];
      const rest = nds.filter((_, i) => i !== idx);
      return direction === "front" ? [...rest, target] : [target, ...rest];
    });
  }, [setNodes]);

  // Undo/redo
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const snap = undoStack.current.pop();
    redoStack.current.push({
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
    });
    // reattach onChange
    setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data, onChange: updateNodeData } })));
    setEdges(snap.edges);
  }, [nodes, edges, setNodes, setEdges, updateNodeData]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const snap = redoStack.current.pop();
    undoStack.current.push({
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
    });
    setNodes(snap.nodes.map((n) => ({ ...n, data: { ...n.data, onChange: updateNodeData } })));
    setEdges(snap.edges);
  }, [nodes, edges, setNodes, setEdges, updateNodeData]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (inField) return;

      if (meta && e.key.toLowerCase() === "c" && selectedNodeId) {
        e.preventDefault(); copyNode(selectedNodeId);
      } else if (meta && e.key.toLowerCase() === "x" && selectedNodeId) {
        e.preventDefault(); cutNode(selectedNodeId);
      } else if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault(); pasteNode();
      } else if (meta && e.key.toLowerCase() === "d" && selectedNodeId) {
        e.preventDefault(); duplicateNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeId, undo, redo, copyNode, cutNode, pasteNode, duplicateNode]);

  // Fechar menu de export ao clicar fora
  useEffect(() => {
    const onClick = (e) => {
      if (showExportMenu) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showExportMenu]);

  const onSave = async () => {
    setSaving(true);
    try {
      const cleanedNodes = nodes.map(({ id: nid, position, data, type }) => ({
        id: nid,
        type,
        position,
          data: {
            label: data.label,
            color: data.color,
            shape: data.shape,
            bold: !!data.bold,
            italic: !!data.italic,
            collapsed: !!data.collapsed,
            url: data.url || null,
            notes: data.notes || null,
            icon: data.icon || null,
            image: data.image || null,
            textColor: data.textColor || null,
            table: data.table || null,
            width: data.width || 200,
            height: data.height || 80,
          },
      }));
      const cleanedEdges = edges.map(({ id: eid, source, target, sourceHandle, targetHandle, type, animated }) => ({
        id: eid, source, target, sourceHandle, targetHandle, type, animated,
      }));
      await api.patch(`/maps/${id}`, { title, nodes: cleanedNodes, edges: cleanedEdges });
      toast.success("Mapa salvo!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const onSaveBackup = async () => {
    setBackingUp(true);
    try {
      const { data } = await api.post("/backup");
      toast.success(`Backup salvo! ${data.files} arquivos em:\n${data.path}`);
    } catch {
      toast.error("Erro ao criar backup");
    } finally {
      setBackingUp(false);
    }
  };

  const exportPng = async () => {
    setShowExportMenu(false);
    const container = flowWrapper.current;
    if (!container) return;
    try {
      const dataUrl = await toPng(container, {
        backgroundColor: "#F3F4F6",
        filter: (node) => {
          const testid = node.dataset?.testid;
          if (node.classList?.contains("react-flow__minimap")) return false;
          if (node.classList?.contains("react-flow__controls")) return false;
          if (["editor-toolbar", "editor-topbar", "node-toolbar", "zoom-controls", "context-menu"].includes(testid)) return false;
          return true;
        },
      });
      const link = document.createElement("a");
      link.download = `${title || "mapa"}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("PNG exportado");
    } catch (err) {
      console.error("PNG export failed:", err);
      toast.error("Erro ao exportar PNG");
    }
  };

  const exportSvg = async () => {
    setShowExportMenu(false);
    const container = flowWrapper.current;
    if (!container) return;
    try {
      const dataUrl = await toSvg(container, {
        backgroundColor: "#F3F4F6",
        filter: (node) => {
          const testid = node.dataset?.testid;
          if (node.classList?.contains("react-flow__minimap")) return false;
          if (node.classList?.contains("react-flow__controls")) return false;
          if (["editor-toolbar", "editor-topbar", "node-toolbar", "zoom-controls", "context-menu"].includes(testid)) return false;
          return true;
        },
      });
      const link = document.createElement("a");
      link.download = `${title || "mapa"}.svg`;
      link.href = dataUrl;
      link.click();
      toast.success("SVG exportado");
    } catch (err) {
      console.error("SVG export failed:", err);
      toast.error("Erro ao exportar SVG");
    }
  };

  const exportPdf = async () => {
    setShowExportMenu(false);
    const container = flowWrapper.current;
    if (!container) return;
    try {
      const dataUrl = await toPng(container, {
        backgroundColor: "#F3F4F6",
        filter: (node) => {
          const testid = node.dataset?.testid;
          if (node.classList?.contains("react-flow__minimap")) return false;
          if (node.classList?.contains("react-flow__controls")) return false;
          if (["editor-toolbar", "editor-topbar", "node-toolbar", "zoom-controls", "context-menu"].includes(testid)) return false;
          return true;
        },
      });
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      const pdfW = 210;
      const pdfH = (img.height / img.width) * pdfW;
      const pdf = new jsPDF({ orientation: pdfH > pdfW ? "portrait" : "landscape", unit: "mm" });
      if (pdfH > 297) {
        const pageH = 297;
        let y = 0;
        let page = 0;
        while (y < pdfH) {
          if (page > 0) pdf.addPage();
          const h = Math.min(pageH, pdfH - y);
          pdf.addImage(dataUrl, "PNG", 0, -y, pdfW, pdfH);
          y += pageH;
          page++;
        }
      } else {
        pdf.addImage(dataUrl, "PNG", 0, 0, pdfW, pdfH);
      }
      pdf.save(`${title || "mapa"}.pdf`);
      toast.success("PDF exportado");
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("Erro ao exportar PDF");
    }
  };

  const togglePublic = async () => {
    const next = !isPublic;
    try {
      await api.patch(`/maps/${id}`, { is_public: next });
      setIsPublic(next);
      if (next) {
        const url = `${window.location.origin}/public/${id}`;
        try { await navigator.clipboard.writeText(url); } catch (err) { console.warn("Clipboard copy failed:", err); }
        toast.success("Link público copiado!");
      } else {
        toast.success("Mapa tornado privado");
      }
    } catch {
      toast.error("Erro ao alterar visibilidade");
    }
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}/public/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  // Context menu handlers
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: null });
  }, []);

  const handleContextAction = useCallback((action) => {
    const nid = contextMenu?.nodeId;
    switch (action) {
      case "copy": if (nid) copyNode(nid); break;
      case "cut": if (nid) cutNode(nid); break;
      case "paste": {
        const pos = rf.screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
        pasteNode(pos);
        break;
      }
      case "duplicate": if (nid) duplicateNode(nid); break;
      case "comment":
        if (nid) {
          setCommentTargetNode(nid);
          setShowComments(true);
        }
        break;
      case "toggleCollapse": if (nid) toggleCollapse(nid); break;
      case "delete": if (nid) removeNode(nid); break;
      case "focus": if (nid) setFocusNodeId(focusNodeId === nid ? null : nid); break;
      case "bringFront": if (nid) reorderNode(nid, "front"); break;
      case "sendBack": if (nid) reorderNode(nid, "back"); break;
      default: break;
    }
  }, [contextMenu, rf, copyNode, cutNode, pasteNode, duplicateNode, removeNode, reorderNode, toggleCollapse, focusNodeId]);

  // Zoom tracker
  const onMove = useCallback((_, viewport) => {
    setZoomPct(Math.round(viewport.zoom * 100));
  }, []);

  const zoomIn = () => rf.zoomIn({ duration: 200 });
  const zoomOut = () => rf.zoomOut({ duration: 200 });
  const zoomReset = () => rf.fitView({ padding: 0.4, duration: 300 });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FDFBF7] overflow-hidden">
      {/* Top bar */}
      <div
        data-testid="editor-topbar"
        className="brutal-border border-x-0 border-t-0 bg-white px-4 py-3 flex items-center gap-3 z-30"
      >
        <button
          onClick={() => navigate("/dashboard")}
          data-testid="back-to-dashboard-button"
          className="brutal-btn bg-white p-2"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="map-title-input"
          className="flex-1 min-w-0 brutal-border rounded-md px-3 py-2 font-bold text-lg bg-white"
        />

        <div className="relative flex items-center">
          <MagnifyingGlass size={16} weight="bold" className="absolute left-3 text-gray-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar nós..."
            className="w-48 brutal-border rounded-md pl-9 pr-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="flex items-center gap-2 mr-2">
          <button
            onClick={undo}
            disabled={undoStack.current.length === 0}
            data-testid="undo-button"
            className="brutal-btn bg-white p-2"
            title="Desfazer (Ctrl+Z)"
          >
            <ArrowUUpLeft size={18} weight="bold" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.current.length === 0}
            data-testid="redo-button"
            className="brutal-btn bg-white p-2"
            title="Refazer (Ctrl+Shift+Z)"
          >
            <ArrowUUpRight size={18} weight="bold" />
          </button>
        </div>

        {presence.length > 0 && (
          <div data-testid="presence-avatars" className="hidden sm:flex items-center -space-x-2 mr-1" title="Sessões conectadas agora">
            {presence.slice(0, 5).map((u) => (
              <div
                key={u.id}
                className="w-7 h-7 rounded-full brutal-border flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: u.color }}
                title={u.name}
              >
                {(u.name || "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {presence.length > 5 && (
              <div className="w-7 h-7 rounded-full brutal-border flex items-center justify-center text-[10px] font-bold bg-white">
                +{presence.length - 5}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => { setCommentTargetNode(null); setShowComments((v) => !v); }}
          data-testid="toggle-comments-button"
          className={`brutal-btn p-2 relative ${showComments ? "bg-[#FDE047]" : "bg-white"}`}
          title="Comentários"
        >
          <ChatCircle size={18} weight="bold" />
          {unresolvedCommentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-black text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unresolvedCommentCount}
            </span>
          )}
        </button>
        <button
          onClick={toggleTheme}
          data-testid="theme-toggle-button"
          className="brutal-btn bg-white p-2"
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
        >
          {theme === "dark" ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
        </button>
        <button
          onClick={togglePublic}
          data-testid="toggle-public-button"
          className={`brutal-btn px-3 py-2 flex items-center gap-2 text-sm ${
            isPublic ? "bg-[#FDE047]" : "bg-white"
          }`}
          title="Compartilhar Link Público"
        >
          <LinkIcon size={16} weight="bold" />
          {isPublic ? "Público" : "Privado"}
        </button>
        {isPublic && (
          <button
            onClick={copyShareLink}
            data-testid="copy-link-button"
            className="brutal-btn bg-white px-3 py-2 text-sm hidden sm:inline-flex"
          >
            Copiar Link
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            data-testid="export-button"
            className="brutal-btn bg-white p-2"
            title="Exportar"
          >
            <Download size={18} weight="bold" />
          </button>
          {showExportMenu && (
            <div
              data-testid="export-menu"
              className="absolute right-0 mt-2 w-40 brutal-border brutal-shadow bg-white rounded-xl py-2 z-50"
            >
              <button
                onClick={exportPng}
                data-testid="export-png-option"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-left hover:bg-[#FDE047]"
              >
                PNG
              </button>
              <button
                onClick={exportSvg}
                data-testid="export-svg-option"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-left hover:bg-[#FDE047]"
              >
                SVG
              </button>
              <button
                onClick={exportPdf}
                data-testid="export-pdf-option"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-left hover:bg-[#FDE047]"
              >
                PDF
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => { loadVersions(); setShowVersions((v) => !v); }}
          className="brutal-btn bg-white p-2"
          title="Histórico de versões"
        >
          <ClockCounterClockwise size={18} weight="bold" />
        </button>
        {focusNodeId && (
          <button
            onClick={() => setFocusNodeId(null)}
            className="brutal-btn bg-[#FDE047] px-3 py-2 text-xs font-bold flex items-center gap-1"
            title="Sair do modo foco"
          >
            <MagnifyingGlassPlus size={16} weight="bold" />
            Foco
          </button>
        )}
        <button
          onClick={onSaveBackup}
          disabled={backingUp}
          className="brutal-btn bg-white text-black px-4 py-2 flex items-center gap-2"
        >
          <HardDrive size={16} weight="bold" />
          {backingUp ? "Salvando..." : "SALVAR BACKUP"}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          data-testid="save-map-button"
          className="brutal-btn bg-black text-white px-4 py-2 flex items-center gap-2"
        >
          <FloppyDisk size={16} weight="bold" />
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative" ref={flowWrapper} data-testid="canvas-area" onMouseMove={onCanvasMouseMove}>
        <ReactFlow
          nodes={nodesForRender}
          edges={edgesForRender}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeClick={(_, n) => {
            setSelectedNodeId(n.id);
            setSearchQuery("");
          }}
          onPaneClick={() => { setSelectedNodeId(null); setContextMenu(null); setShowExportMenu(false); setSearchQuery(""); setFocusNodeId(null); }}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onMove={onMove}
          snapToGrid={snapToGrid}
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          proOptions={PRO_OPTIONS}
        >
          <Background color="#D1D5DB" gap={GRID_SIZE} size={2} />
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.05)" nodeColor={(n) => n.data?.color || "#FDE047"} position="bottom-left" />
        </ReactFlow>

        {/* Left floating toolbar */}
        <div
          data-testid="editor-toolbar"
          className="absolute left-4 top-4 z-20 flex flex-col gap-2 brutal-border brutal-shadow bg-white rounded-xl p-2"
        >
          <button
            onClick={addNode}
            data-testid="add-node-button"
            className="brutal-btn bg-[#FDE047] p-2 flex items-center gap-2"
            title="Adicionar nó"
          >
            <Plus size={18} weight="bold" />
          </button>
          <button
            onClick={deleteSelectedNodes}
            disabled={!nodes.some((n) => n.selected) && !selectedNodeId}
            data-testid="delete-node-button"
            className="brutal-btn bg-white p-2"
            title="Excluir selecionados (Delete)"
          >
            <Trash size={18} weight="bold" />
          </button>
          <div className="border-t-2 border-black/20 my-1" />
          <button
            onClick={() => setSnapToGrid((v) => !v)}
            data-testid="snap-grid-toggle"
            className={`brutal-btn p-2 ${snapToGrid ? "bg-[#FDE047]" : "bg-white"}`}
            title="Snap to grid"
          >
            <MagnetStraight size={18} weight="bold" />
          </button>
          <div className="border-t-2 border-black/20 my-1" />
          <button
            onClick={expandAll}
            data-testid="expand-all-button"
            className="brutal-btn bg-white p-2"
            title="Expandir tudo"
          >
            <ArrowsOutSimple size={18} weight="bold" />
          </button>
          <button
            onClick={collapseAll}
            data-testid="collapse-all-button"
            className="brutal-btn bg-white p-2"
            title="Recolher tudo"
          >
            <ArrowsInSimpleIcon size={18} weight="bold" />
          </button>
        </div>

        {/* Zoom controls (bottom-right) */}
        <div
          data-testid="zoom-controls"
          className="absolute right-4 bottom-4 z-20 flex items-center gap-1 brutal-border brutal-shadow bg-white rounded-xl p-1"
        >
          <button onClick={zoomOut} className="brutal-btn bg-white px-2 py-1 text-sm" data-testid="zoom-out" title="Diminuir zoom">–</button>
          <button onClick={zoomReset} className="px-3 py-1 text-sm font-bold min-w-[52px]" data-testid="zoom-reset" title="Ajustar à tela">
            {zoomPct}%
          </button>
          <button onClick={zoomIn} className="brutal-btn bg-white px-2 py-1 text-sm" data-testid="zoom-in" title="Aumentar zoom">+</button>
        </div>

        {/* Node editor floating panel */}
        {selectedNode && (
          <div
            data-testid="node-toolbar"
            className="absolute right-4 top-4 z-20 w-72 brutal-border brutal-shadow bg-white rounded-xl p-4 flex flex-col gap-3 max-h-[calc(100vh-120px)] overflow-y-auto"
          >
            {/* Texto */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Texto</p>
              <input
                value={selectedNode.data.label || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                data-testid="node-label-input"
                className="w-full brutal-border rounded-md px-3 py-2 font-semibold"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => updateNodeData(selectedNode.id, { bold: !selectedNode.data.bold })}
                  data-testid="node-bold-toggle"
                  className={`brutal-btn p-2 flex-1 ${selectedNode.data.bold ? "bg-[#FDE047]" : "bg-white"}`}
                  title="Negrito"
                >
                  <TextB size={16} weight="bold" />
                </button>
                <button
                  onClick={() => updateNodeData(selectedNode.id, { italic: !selectedNode.data.italic })}
                  data-testid="node-italic-toggle"
                  className={`brutal-btn p-2 flex-1 ${selectedNode.data.italic ? "bg-[#FDE047]" : "bg-white"}`}
                  title="Itálico"
                >
                  <TextItalic size={16} weight="bold" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs font-semibold text-gray-500">Cor do texto:</label>
                <input
                  type="color"
                  value={selectedNode.data.textColor || "#000000"}
                  onChange={(e) => updateNodeData(selectedNode.id, { textColor: e.target.value })}
                  className="w-8 h-8 brutal-border rounded-md cursor-pointer"
                />
              </div>
            </div>

            {/* URL / Link */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                <LinkIcon size={14} weight="bold" /> Link
              </p>
              <input
                value={selectedNode.data.url || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { url: e.target.value })}
                placeholder="https://..."
                data-testid="node-url-input"
                className="w-full brutal-border rounded-md px-3 py-2 text-sm"
              />
            </div>

            {/* Anotações */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                <NotePencil size={14} weight="bold" /> Anotação
              </p>
              <textarea
                value={selectedNode.data.notes || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { notes: e.target.value })}
                placeholder="Escreva uma anotação para este nó..."
                rows={3}
                data-testid="node-notes-input"
                className="w-full brutal-border rounded-md px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Tamanho */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Tamanho</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateNodeData(selectedNode.id, {
                    width: Math.max(100, (selectedNode.data.width || 200) - 20),
                    height: Math.max(40, (selectedNode.data.height || 80) - 20),
                  })}
                  className="brutal-btn bg-white p-2"
                  title="Diminuir"
                >
                  <Minus size={16} weight="bold" />
                </button>
                <span className="text-sm font-bold flex-1 text-center">
                  {(selectedNode.data.width || 200)}×{(selectedNode.data.height || 80)}
                </span>
                <button
                  onClick={() => updateNodeData(selectedNode.id, {
                    width: (selectedNode.data.width || 200) + 20,
                    height: (selectedNode.data.height || 80) + 20,
                  })}
                  className="brutal-btn bg-white p-2"
                  title="Aumentar"
                >
                  <Plus size={16} weight="bold" />
                </button>
              </div>
            </div>

            {/* Ícone */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Ícone</p>
              <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto brutal-border rounded-md p-2">
                <button
                  onClick={() => updateNodeData(selectedNode.id, { icon: null })}
                  data-testid="icon-none"
                  className={`w-8 h-8 brutal-border rounded-md flex items-center justify-center text-[10px] font-bold ${
                    !selectedNode.data.icon ? "bg-[#FDE047]" : "bg-white hover:bg-black/5"
                  }`}
                  title="Sem ícone"
                >
                  <X size={14} weight="bold" />
                </button>
                {ICON_LIST.map(({ key, Icon }) => (
                  <button
                    key={key}
                    onClick={() => updateNodeData(selectedNode.id, { icon: key })}
                    data-testid={`icon-${key}`}
                    className={`w-8 h-8 brutal-border rounded-md flex items-center justify-center ${
                      selectedNode.data.icon === key ? "bg-[#FDE047]" : "bg-white hover:bg-black/5"
                    }`}
                    title={key}
                  >
                    <Icon size={18} weight="bold" />
                  </button>
                ))}
              </div>
            </div>

            {/* Cor */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                <Palette size={14} weight="bold" /> Cor
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateNodeData(selectedNode.id, { color: c })}
                    data-testid={`color-swatch-${c}`}
                    className={`w-8 h-8 brutal-border rounded-md ${
                      selectedNode.data.color === c ? "ring-4 ring-black/40" : ""
                    }`}
                    style={{ background: c }}
                    aria-label={`cor ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={selectedNode.data.color || "#FDE047"}
                  onChange={(e) => updateNodeData(selectedNode.id, { color: e.target.value })}
                  className="w-8 h-8 brutal-border rounded-md cursor-pointer"
                  title="Cor personalizada"
                />
              </div>
            </div>

            {/* Imagem */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Imagem</p>
              <input
                value={selectedNode.data.image || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { image: e.target.value })}
                placeholder="URL da imagem..."
                className="w-full brutal-border rounded-md px-3 py-2 text-sm"
              />
              {selectedNode.data.image && (
                <div className="mt-2 relative">
                  <img
                    src={selectedNode.data.image}
                    alt="preview"
                    className="w-full h-24 object-cover rounded-md brutal-border"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <button
                    onClick={() => updateNodeData(selectedNode.id, { image: null })}
                    className="absolute -top-2 -right-2 brutal-border bg-white rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              )}
            </div>

            {/* Forma */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Forma</p>
              <div className="grid grid-cols-3 gap-2">
                {SHAPES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => updateNodeData(selectedNode.id, { shape: key })}
                    data-testid={`shape-${key}`}
                    className={`brutal-border rounded-md p-2 flex flex-col items-center gap-1 text-xs font-bold ${
                      selectedNode.data.shape === key ? "bg-[#FDE047]" : "bg-white"
                    }`}
                  >
                    <Icon size={20} weight="bold" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cursores remotos (colaboração ao vivo) */}
        {Object.entries(cursors).map(([uid, c]) => (
          <div
            key={uid}
            data-testid={`remote-cursor-${uid}`}
            className="absolute z-30 pointer-events-none flex items-center gap-1"
            style={{ left: c.x, top: c.y, transform: "translate(-2px, -2px)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ fill: c.user?.color || "#000" }}>
              <path d="M1 1l6.5 13.5L9 9l5.5-1.5L1 1z" />
            </svg>
            <span
              className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: c.user?.color || "#000" }}
            >
              {c.user?.name}
            </span>
          </div>
        ))}

        {/* Versions panel */}
        {showVersions && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 brutal-border brutal-shadow bg-white rounded-xl p-4 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Histórico de Versões</h3>
              <button onClick={() => setShowVersions(false)} className="brutal-btn bg-white p-1">
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingVersions ? (
                <p className="text-sm text-gray-500 text-center py-8">Carregando...</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Nenhuma versão salva ainda.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between brutal-border rounded-md px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{v.title}</p>
                      <p className="text-xs text-gray-500">{new Date(v.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("Restaurar esta versão? As alterações não salvas serão perdidas.")) {
                          restoreVersion(v.id);
                        }
                      }}
                      className="brutal-btn bg-[#FDE047] px-3 py-1 text-xs font-bold"
                    >
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Comments panel */}
        {showComments && (
          <CommentsPanel
            key={commentTargetNode || "general"}
            comments={comments}
            nodes={nodes}
            focusNodeId={commentTargetNode}
            onAdd={addComment}
            onResolve={resolveComment}
            onDelete={deleteComment}
            onClose={() => setShowComments(false)}
            onFocusNode={focusOnNode}
          />
        )}

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            hasClipboard={!!clipboard}
            hasNode={!!contextMenu.nodeId}
            hasChildren={!!contextMenu.nodeId && (childrenMap[contextMenu.nodeId] || []).length > 0}
            collapsed={!!contextMenu.nodeId && !!nodes.find((n) => n.id === contextMenu.nodeId)?.data.collapsed}
            onAction={handleContextAction}
            onClose={() => setContextMenu(null)}
          />
        )}
            </div>

            {/* Tabela */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Tabela</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (selectedNode.data.table) {
                      updateNodeData(selectedNode.id, { table: null });
                    } else {
                      updateNodeData(selectedNode.id, {
                        table: {
                          headers: ["Coluna 1", "Coluna 2", "Coluna 3"],
                          rows: [
                            ["", "", ""],
                            ["", "", ""],
                            ["", "", ""],
                          ],
                        },
                        width: 400,
                        height: 200,
                      });
                    }
                  }}
                  className={`brutal-btn p-2 flex-1 flex items-center justify-center gap-1 ${
                    selectedNode.data.table ? "bg-[#FDE047]" : "bg-white"
                  }`}
                  title="Alternar modo tabela"
                >
                  <Table size={16} weight="bold" />
                  {selectedNode.data.table ? "Remover Tabela" : "Inserir Tabela"}
                </button>
              </div>
            </div>
          </div>
  );
}

export default function Editor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}
