import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Stop, Clock } from "@phosphor-icons/react";
import { toast } from "sonner";

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

export default function PomodoroTimer() {
  const [time, setTime] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("focus");
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem("pomodoroPos");
    return saved ? JSON.parse(saved) : { x: 16, y: 120 };
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const phaseRef = useRef("focus");
  const intervalRef = useRef(null);
  const startPosRef = useRef(null);
  const startMouseRef = useRef(null);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setTime(FOCUS);
    setPhase("focus");
    phaseRef.current = "focus";
  }, []);

  const toggle = useCallback(() => {
    if (running) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRunning(false);
    } else {
      setRunning(true);
    }
  }, [running]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          const next = phaseRef.current === "focus" ? "break" : "focus";
          phaseRef.current = next;
          setPhase(next);
          toast(next === "focus" ? "Pausa terminada! Hora de focar." : "Foco terminado! Hora de pausa.");
          return next === "focus" ? FOCUS : BREAK;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  useEffect(() => {
    localStorage.setItem("pomodoroPos", JSON.stringify(pos));
  }, [pos]);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest("button")) return;
    setDragging(true);
    startPosRef.current = { x: pos.x, y: pos.y };
    startMouseRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !startPosRef.current || !startMouseRef.current) return;
    setPos({
      x: startPosRef.current.x + (e.clientX - startMouseRef.current.x),
      y: startPosRef.current.y + (e.clientY - startMouseRef.current.y),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    startPosRef.current = null;
    startMouseRef.current = null;
  }, []);

  const mins = Math.floor(time / 60);
  const secs = time % 60;
  const pct = phase === "focus" ? (time / FOCUS) * 100 : (time / BREAK) * 100;

  return (
    <div
      ref={dragRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`fixed z-50 flex items-center gap-1.5 brutal-border brutal-shadow bg-white rounded-xl px-2.5 py-1.5 text-xs font-bold select-none ${dragging ? "cursor-grabbing opacity-80" : "cursor-grab"}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <Clock size={14} weight="bold" className={phase === "focus" ? "text-red-500" : "text-green-500"} />
      <span className="tabular-nums w-10 text-right">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
      <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${phase === "focus" ? "bg-red-400" : "bg-green-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <button onClick={toggle} className="brutal-border rounded-md p-0.5 hover:bg-gray-100 leading-none" title={running ? "Pausar" : "Iniciar"}>
        {running ? <Pause size={12} weight="bold" /> : <Play size={12} weight="bold" />}
      </button>
      <button onClick={stop} className="brutal-border rounded-md p-0.5 hover:bg-gray-100 leading-none" title="Parar">
        <Stop size={12} weight="bold" />
      </button>
    </div>
  );
}
