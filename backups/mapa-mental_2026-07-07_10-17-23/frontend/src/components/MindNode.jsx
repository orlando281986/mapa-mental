import { Handle, Position } from "reactflow";
import { memo, useState, useRef, useCallback, useEffect } from "react";
import { CaretDown, CaretRight, Link as LinkIcon, NotePencil, Plus, Minus } from "@phosphor-icons/react";
import { ICON_MAP } from "../lib/icons";

const SHAPE_CLASSES = {
  rectangle: "rounded-lg",
  pill: "rounded-full px-8",
  diamond: "rotate-45",
  rounded: "rounded-[20px]",
  hexagon: "shape-hexagon",
  star: "shape-star",
};

const MIN_W = 100;
const MIN_H = 40;

function MindNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [cellEditing, setCellEditing] = useState(null); // {row, col}
  const shape = data.shape || "rectangle";
  const color = data.color || "#FDE047";

  const isDiamond = shape === "diamond";
  const shapeClass = SHAPE_CLASSES[shape] || SHAPE_CLASSES.rectangle;

  const nodeWidth = data.width || 200;
  const nodeHeight = data.height || 80;

  const textStyle = {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: data.bold ? 800 : 700,
    fontStyle: data.italic ? "italic" : "normal",
    color: data.textColor || "#000000",
  };

  const IconComp = data.icon ? ICON_MAP[data.icon] : null;
  const nodeRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  const onResizeStart = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = nodeRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;

    const onMove = (ev) => {
      const newW = Math.max(MIN_W, startW + ev.clientX - startX);
      const newH = Math.max(MIN_H, startH + ev.clientY - startY);
      el.style.width = newW + "px";
      el.style.height = newH + "px";
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (nodeRef.current) {
        data.onChange?.(id, {
          width: nodeRef.current.offsetWidth,
          height: nodeRef.current.offsetHeight,
        });
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [id, data]);

  const addRow = useCallback((nid, ndata) => {
    const t = { ...ndata.table };
    t.rows.push(t.headers.map(() => ""));
    ndata.onChange?.(nid, { table: t });
  }, []);

  const addCol = useCallback((nid, ndata) => {
    const t = { ...ndata.table };
    t.headers.push("Col");
    t.rows = t.rows.map(r => [...r, ""]);
    ndata.onChange?.(nid, { table: t });
  }, []);

  const removeRow = useCallback((nid, ndata, ri) => {
    if (ndata.table.rows.length <= 1) return;
    const t = { ...ndata.table };
    t.rows.splice(ri, 1);
    ndata.onChange?.(nid, { table: t });
  }, []);

  return (
    <div
      ref={nodeRef}
      data-testid={`node-${id}`}
      className={`relative brutal-border brutal-shadow flex items-center justify-center p-3 ${shapeClass} ${
        selected ? "ring-4 ring-black/20" : ""
      } ${data.dimmed ? "opacity-30" : ""}`}
      style={{ background: color, width: nodeWidth, height: nodeHeight }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="l" />

      {IconComp && (
        <span className={`absolute -top-[30px] -left-[14px] z-30 brutal-border bg-white rounded-full w-7 h-7 flex items-center justify-center ${isDiamond ? "-rotate-45" : ""}`}>
          <IconComp size={16} weight="bold" className="text-black/70" />
        </span>
      )}

      {data.image && (
        <img
          src={data.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-[inherit] opacity-40 pointer-events-none"
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}

      {data.url && (
        <span
          onMouseEnter={() => setShowLink(true)}
          onMouseLeave={() => setShowLink(false)}
          className={`absolute -top-[30px] -right-[18px] z-30 brutal-border bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer ${isDiamond ? "-rotate-45" : ""}`}
        >
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <LinkIcon size={14} weight="bold" className="text-black/70" />
          </a>
          {showLink && (
            <span className="absolute top-7 left-0 z-50 w-48 p-2 text-xs text-black brutal-border brutal-shadow-sm bg-white rounded-md pointer-events-none whitespace-pre-wrap break-words">
              {data.url}
            </span>
          )}
        </span>
      )}

      {data.commentCount > 0 && (
        <span
          data-testid={`node-comment-badge-${id}`}
          className={`absolute -top-2 -right-2 brutal-border bg-white text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
            isDiamond ? "-rotate-45" : ""
          }`}
          title={`${data.commentCount} comentário(s)`}
        >
          {data.commentCount}
        </span>
      )}

      {data.notes && (
        <span
          onMouseEnter={() => setShowNote(true)}
          onMouseLeave={() => setShowNote(false)}
          className={`absolute -bottom-[30px] -right-[18px] z-30 brutal-border bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer ${isDiamond ? "-rotate-45" : ""}`}
        >
          <NotePencil size={14} weight="bold" />
          {showNote && (
            <span
              className={`absolute top-7 left-0 z-50 w-48 p-2 text-xs text-black brutal-border brutal-shadow-sm bg-white rounded-md pointer-events-none whitespace-pre-wrap break-words ${
                isDiamond ? "-rotate-45" : ""
              }`}
            >
              {data.notes}
            </span>
          )}
        </span>
      )}

      {data.hasChildren && (
        <button
          data-testid={`node-collapse-toggle-${id}`}
          onClick={(e) => { e.stopPropagation(); data.onToggleCollapse?.(id); }}
          onDoubleClick={(e) => e.stopPropagation()}
          title={data.collapsed ? `Expandir (${data.childCount} oculto(s))` : "Recolher"}
          className={`nodrag absolute -bottom-3 left-1/2 -translate-x-1/2 brutal-border bg-white rounded-full w-6 h-6 flex items-center justify-center z-10 ${
            isDiamond ? "-rotate-45" : ""
          }`}
        >
          {data.collapsed ? <CaretRight size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </button>
      )}

      {data.collapsed && data.childCount > 0 && (
        <span
          data-testid={`node-hidden-count-${id}`}
          className={`absolute -bottom-3 left-[calc(50%+16px)] brutal-border bg-black text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ${
            isDiamond ? "-rotate-45" : ""
          }`}
        >
          +{data.childCount}
        </span>
      )}

      {data.table ? (
        <div className="w-full h-full flex flex-col overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {data.table.headers.map((h, ci) => (
                  <th
                    key={ci}
                    className="border border-black/20 px-2 py-1 font-bold bg-black/5 text-left"
                    style={{ color: data.textColor || "#000000" }}
                  >
                    {cellEditing && cellEditing.row === -1 && cellEditing.col === ci ? (
                      <input
                        autoFocus
                        defaultValue={h}
                        className="w-full bg-transparent outline-none font-bold"
                        onBlur={(e) => {
                          const t = { ...data.table };
                          t.headers[ci] = e.target.value;
                          data.onChange?.(id, { table: t });
                          setCellEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const t = { ...data.table };
                            t.headers[ci] = e.target.value;
                            data.onChange?.(id, { table: t });
                            setCellEditing(null);
                          }
                          if (e.key === "Escape") setCellEditing(null);
                        }}
                      />
                    ) : (
                      <span
                        className="nodrag cursor-text"
                        onDoubleClick={(e) => { e.stopPropagation(); setCellEditing({ row: -1, col: ci }); }}
                      >
                        {h}
                      </span>
                    )}
                  </th>
                ))}
                <th className="w-6 border border-black/20 p-0">
                  <button
                    className="nodrag w-full h-full flex items-center justify-center hover:bg-black/10"
                    onClick={(e) => { e.stopPropagation(); addCol(id, data); }}
                    title="Adicionar coluna"
                  >
                    <Plus size={12} weight="bold" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-black/20 px-2 py-1"
                      style={{ color: data.textColor || "#000000" }}
                    >
                      {cellEditing && cellEditing.row === ri && cellEditing.col === ci ? (
                        <input
                          autoFocus
                          defaultValue={cell}
                          className="w-full bg-transparent outline-none"
                          onBlur={(e) => {
                            const t = { ...data.table };
                            t.rows[ri][ci] = e.target.value;
                            data.onChange?.(id, { table: t });
                            setCellEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const t = { ...data.table };
                              t.rows[ri][ci] = e.target.value;
                              data.onChange?.(id, { table: t });
                              setCellEditing(null);
                            }
                            if (e.key === "Escape") setCellEditing(null);
                          }}
                        />
                      ) : (
                        <span
                          className="nodrag cursor-text"
                          onDoubleClick={(e) => { e.stopPropagation(); setCellEditing({ row: ri, col: ci }); }}
                        >
                          {cell}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="w-6 border border-black/20 p-0">
                    <button
                      className="nodrag w-full h-full flex items-center justify-center hover:bg-black/10"
                      onClick={(e) => { e.stopPropagation(); removeRow(id, data, ri); }}
                      title="Remover linha"
                    >
                      <Minus size={12} weight="bold" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-1 mt-1 justify-center">
            <button
              className="nodrag brutal-border bg-white rounded-md px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 hover:bg-black/5"
              onClick={(e) => { e.stopPropagation(); addRow(id, data); }}
            >
              <Plus size={10} weight="bold" /> Linha
            </button>
            <button
              className="nodrag brutal-border bg-white rounded-md px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 hover:bg-black/5"
              title="Remover última linha"
              onClick={(e) => { e.stopPropagation(); const t = { ...data.table }; if (t.rows.length > 1) { t.rows.pop(); data.onChange?.(id, { table: t }); } }}
            >
              <Minus size={10} weight="bold" /> Linha
            </button>
          </div>
        </div>
      ) : editing ? (
        <input
          ref={inputRef}
          defaultValue={data.label}
          onBlur={(e) => {
            data.onChange?.(id, { label: e.target.value });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              data.onChange?.(id, { label: e.target.value });
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          style={textStyle}
          className={`nodrag bg-transparent outline-none text-center w-full ${isDiamond ? "-rotate-45" : ""}`}
          data-testid={`node-input-${id}`}
        />
      ) : (
        <span
          style={textStyle}
          className={`text-center break-words px-1 ${isDiamond ? "-rotate-45" : ""}`}
        >
          {data.label || "Nó"}
        </span>
      )}

      {/* Resize handle */}
      <div
        onPointerDown={onResizeStart}
        className={`nodrag absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 ${
          isDiamond ? "-rotate-45" : ""
        }`}
      >
        <svg viewBox="0 0 10 10" className="w-full h-full">
          <line x1="8" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="8" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5" y1="10" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
}

export default memo(MindNode);
