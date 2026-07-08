import { useMemo, useState } from "react";
import { ChatCircle, Check, Trash, X } from "@phosphor-icons/react";

export default function CommentsPanel({
  comments,
  nodes,
  focusNodeId,
  onAdd,
  onResolve,
  onDelete,
  onClose,
  onFocusNode,
}) {
  const [text, setText] = useState("");
  const [targetNodeId, setTargetNodeId] = useState(focusNodeId || "");
  const [showResolved, setShowResolved] = useState(false);

  const nodeLabel = useMemo(() => {
    const map = {};
    nodes.forEach((n) => { map[n.id] = n.data?.label || "Nó"; });
    return map;
  }, [nodes]);

  const visible = comments.filter((c) => (showResolved ? true : !c.resolved));

  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(targetNodeId || null, trimmed);
    setText("");
  };

  return (
    <div
      data-testid="comments-panel"
      className="absolute right-4 top-20 bottom-4 z-20 w-80 brutal-border brutal-shadow bg-white rounded-xl flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black/20">
        <p className="font-bold flex items-center gap-2">
          <ChatCircle size={18} weight="bold" /> Comentários
        </p>
        <button onClick={onClose} data-testid="close-comments-panel" className="brutal-btn bg-white p-1">
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="px-4 py-2 border-b-2 border-black/10 flex items-center gap-2">
        <select
          value={targetNodeId}
          onChange={(e) => setTargetNodeId(e.target.value)}
          data-testid="comment-target-select"
          className="flex-1 min-w-0 text-sm brutal-border rounded-md px-2 py-1"
        >
          <option value="">Mapa (geral)</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.data?.label || "Nó"}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          resolvidos
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {visible.length === 0 && (
          <p className="text-sm text-gray-500 text-center mt-6">Nenhum comentário ainda.</p>
        )}
        {visible.map((c) => (
          <div
            key={c.id}
            data-testid={`comment-${c.id}`}
            className={`brutal-border rounded-lg p-2 text-sm ${c.resolved ? "opacity-50 bg-gray-50" : "bg-[#FFFDF5]"}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-xs">{c.author_name}</span>
              <span className="text-[10px] text-gray-500">
                {new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {c.node_id && (
              <button
                onClick={() => onFocusNode?.(c.node_id)}
                className="text-[11px] font-semibold underline text-blue-700 mb-1"
              >
                em: {nodeLabel[c.node_id] || "nó removido"}
              </button>
            )}
            <p className="whitespace-pre-wrap break-words">{c.text}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onResolve(c.id, !c.resolved)}
                data-testid={`resolve-comment-${c.id}`}
                className="brutal-btn bg-white px-2 py-1 text-xs flex items-center gap-1"
              >
                <Check size={12} weight="bold" /> {c.resolved ? "Reabrir" : "Resolver"}
              </button>
              <button
                onClick={() => onDelete(c.id)}
                data-testid={`delete-comment-${c.id}`}
                className="brutal-btn bg-white px-2 py-1 text-xs flex items-center gap-1 text-red-600"
              >
                <Trash size={12} weight="bold" /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="border-t-2 border-black/20 p-3 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva um comentário..."
          data-testid="comment-input"
          rows={2}
          className="w-full brutal-border rounded-md px-2 py-1 text-sm resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          data-testid="submit-comment-button"
          className="brutal-btn bg-black text-white px-3 py-2 text-sm font-bold disabled:opacity-40"
        >
          Comentar
        </button>
      </form>
    </div>
  );
}
