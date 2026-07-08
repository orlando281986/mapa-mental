import { useEffect, useRef } from "react";
import {
  Copy,
  Scissors,
  ClipboardText,
  Trash,
  Copy as Duplicate,
  StackSimple,
  ArrowsInSimple,
  ArrowSquareOut,
  ChatCircle,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";

const baseItems = [
  { key: "copy", label: "Copiar", shortcut: "Ctrl+C", Icon: Copy },
  { key: "cut", label: "Recortar", shortcut: "Ctrl+X", Icon: Scissors },
  { key: "paste", label: "Colar", shortcut: "Ctrl+V", Icon: ClipboardText, requireClipboard: true },
  { key: "duplicate", label: "Duplicar", shortcut: "Ctrl+D", Icon: Duplicate },
  { divider: true },
  { key: "comment", label: "Comentar", Icon: ChatCircle, requireNode: true },
  { key: "bringFront", label: "Trazer para frente", Icon: ArrowSquareOut },
  { key: "sendBack", label: "Enviar para trás", Icon: StackSimple },
  { divider: true },
  { key: "delete", label: "Excluir", shortcut: "Delete", Icon: Trash, danger: true },
];

export default function ContextMenu({ x, y, hasClipboard, hasNode, hasChildren, collapsed, onAction, onClose }) {
  const items = hasChildren
    ? [
        ...baseItems.slice(0, 5),
        {
          key: "toggleCollapse",
          label: collapsed ? "Expandir" : "Recolher",
          Icon: collapsed ? CaretRight : CaretDown,
          requireNode: true,
        },
        ...baseItems.slice(5),
      ]
    : baseItems;
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  // Clamp position to viewport
  const style = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 340),
  };

  return (
    <div
      ref={ref}
      data-testid="context-menu"
      className="fixed z-[100] w-56 brutal-border brutal-shadow bg-white rounded-xl py-2"
      style={style}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={`d-${i}`} className="my-1 border-t-2 border-black/20" />
        ) : (
          <button
            key={it.key}
            data-testid={`ctx-${it.key}`}
            disabled={(it.requireClipboard && !hasClipboard) || (it.requireNode && !hasNode)}
            onClick={() => { onAction(it.key); onClose(); }}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-left hover:bg-[#FDE047] disabled:opacity-40 disabled:hover:bg-transparent ${
              it.danger ? "text-red-600 hover:bg-red-100" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <it.Icon size={16} weight="bold" />
              {it.label}
            </span>
            {it.shortcut && (
              <span className="text-[10px] font-mono text-gray-500">{it.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
