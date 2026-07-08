import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "../lib/api";

/**
 * Conecta o mapa a um canal WebSocket para colaboração em tempo real:
 * - sincroniza nós/arestas entre sessões abertas (múltiplas abas/dispositivos)
 * - mostra presença (quem está vendo o mapa agora)
 * - transmite cursores ao vivo
 * - notifica comentários novos/atualizados/removidos
 */
export default function useMapCollab(mapId, { onGraphUpdate, onComment } = {}) {
  const [presence, setPresence] = useState([]);
  const [cursors, setCursors] = useState({}); // userId -> {x, y, user}
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const cursorTimeouts = useRef({});
  const callbacksRef = useRef({ onGraphUpdate, onComment });
  callbacksRef.current = { onGraphUpdate, onComment };

  useEffect(() => {
    if (!mapId) return undefined;
    const token = localStorage.getItem("mm_token");
    if (!token) return undefined;

    let closedByUs = false;
    const url = `${WS_BASE}/ws/maps/${mapId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (!closedByUs) wsRef.current = null;
    };
    ws.onerror = () => {};
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "presence":
          setPresence(msg.users || []);
          break;
        case "cursor": {
          const uid = msg.user?.id;
          if (!uid) return;
          setCursors((cur) => ({ ...cur, [uid]: { x: msg.x, y: msg.y, user: msg.user } }));
          clearTimeout(cursorTimeouts.current[uid]);
          cursorTimeouts.current[uid] = setTimeout(() => {
            setCursors((cur) => {
              const next = { ...cur };
              delete next[uid];
              return next;
            });
          }, 6000);
          break;
        }
        case "graph_update":
          callbacksRef.current.onGraphUpdate?.(msg);
          break;
        case "comment_new":
        case "comment_updated":
        case "comment_deleted":
          callbacksRef.current.onComment?.(msg);
          break;
        default:
          break;
      }
    };

    return () => {
      closedByUs = true;
      ws.close();
      wsRef.current = null;
      Object.values(cursorTimeouts.current).forEach(clearTimeout);
    };
  }, [mapId]);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendGraphUpdate = useCallback((nodes, edges) => send({ type: "graph_update", nodes, edges }), [send]);
  const sendCursor = useCallback((x, y) => send({ type: "cursor", x, y }), [send]);

  return { presence, cursors, connected, sendGraphUpdate, sendCursor };
}
