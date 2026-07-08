import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Stop, Clock, Plus, Minus } from "@phosphor-icons/react";
import { toast } from "sonner";

const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;

export default function PomodoroTimer() {
  const [focusMin, setFocusMin] = useState(() => {
    const s = localStorage.getItem("pomodoroFocus");
    return s ? Number(s) : DEFAULT_FOCUS;
  });
  const [breakMin, setBreakMin] = useState(() => {
    const s = localStorage.getItem("pomodoroBreak");
    return s ? Number(s) : DEFAULT_BREAK;
  });
  const [time, setTime] = useState(focusMin * 60);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("focus");
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem("pomodoroPos");
    return saved ? JSON.parse(saved) : { x: 16, y: 120 };
  });
  const [dragging, setDragging] = useState(false);
  const phaseRef = useRef("focus");
  const intervalRef = useRef(null);
  const startPosRef = useRef(null);
  const startMouseRef = useRef(null);
  const focusRef = useRef(focusMin);
  const breakRef = useRef(breakMin);

  useEffect(() => { focusRef.current = focusMin; }, [focusMin]);
  useEffect(() => { breakRef.current = breakMin; }, [breakMin]);
  useEffect(() => { localStorage.setItem("pomodoroFocus", String(focusMin)); }, [focusMin]);
  useEffect(() => { localStorage.setItem("pomodoroBreak", String(breakMin)); }, [breakMin]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setPhase("focus");
    phaseRef.current = "focus";
    setTime(focusMin * 60);
  }, [focusMin]);

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
          const dur = next === "focus" ? focusRef.current : breakRef.current;
          toast(next === "focus" ? "Pausa terminada! Hora de focar." : "Foco terminado! Hora de pausa.");
          return dur * 60;
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

  const adjustFocus = useCallback((delta) => {
    setFocusMin((v) => {
      const next = Math.max(1, Math.min(120, v + delta));
      if (!running && phase === "focus") setTime(next * 60);
      return next;
    });
  }, [running, phase]);

  const adjustBreak = useCallback((delta) => {
    setBreakMin((v) => Math.max(1, Math.min(60, v + delta)));
  }, []);

  const mins = Math.floor(time / 60);
  const secs = time % 60;
  const pct = phase === "focus" ? (time / (focusMin * 60)) * 100 : (time / (breakMin * 60)) * 100;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`fixed z-50 flex items-center gap-2 brutal-border brutal-shadow bg-white rounded-xl px-3 py-2 text-xs font-bold select-none ${dragging ? "cursor-grabbing opacity-80" : "cursor-grab"}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <Clock size={16} weight="bold" className={phase === "focus" ? "text-red-500" : "text-green-500"} />
      <span className="tabular-nums w-12 text-right">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
      <div className="w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${phase === "focus" ? "bg-red-400" : "bg-green-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <button onClick={toggle} className="brutal-border rounded-md p-0.5 hover:bg-gray-100 leading-none" title={running ? "Pausar" : "Iniciar"}>
        {running ? <Pause size={12} weight="bold" /> : <Play size={12} weight="bold" />}
      </button>
      <button onClick={stop} className="brutal-border rounded-md p-0.5 hover:bg-gray-100 leading-none" title="Parar">
        <Stop size={12} weight="bold" />
      </button>

      <div className="border-l border-gray-300 pl-2 flex items-center gap-1.5">
        <span className="text-gray-400">Foco</span>
        <button onClick={(e) => { e.stopPropagation(); adjustFocus(-5); }} className="brutal-border rounded-sm p-0.5 hover:bg-gray-100 leading-none" title="-5 min">
          <Minus size={10} weight="bold" />
        </button>
        <span className="tabular-nums w-5 text-center">{focusMin}</span>
        <button onClick={(e) => { e.stopPropagation(); adjustFocus(5); }} className="brutal-border rounded-sm p-0.5 hover:bg-gray-100 leading-none" title="+5 min">
          <Plus size={10} weight="bold" />
        </button>
        <span className="text-gray-300 mx-0.5">|</span>
        <span className="text-gray-400">Pausa</span>
        <button onClick={(e) => { e.stopPropagation(); adjustBreak(-5); }} className="brutal-border rounded-sm p-0.5 hover:bg-gray-100 leading-none" title="-5 min">
          <Minus size={10} weight="bold" />
        </button>
        <span className="tabular-nums w-5 text-center">{breakMin}</span>
        <button onClick={(e) => { e.stopPropagation(); adjustBreak(5); }} className="brutal-border rounded-sm p-0.5 hover:bg-gray-100 leading-none" title="+5 min">
          <Plus size={10} weight="bold" />
        </button>
      </div>
    </div>
  );
}
