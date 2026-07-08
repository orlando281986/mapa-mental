import { useEffect, useRef } from "react";
import { getSmoothStepPath } from "reactflow";

export default function GrowingEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  markerEnd,
}) {
  const pathRef = useRef(null);
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const length = el.getTotalLength();
    el.style.strokeDasharray = length;
    el.style.strokeDashoffset = length;
    requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1.2s ease-out";
      el.style.strokeDashoffset = "0";
    });
  }, []);

  return (
    <path
      ref={pathRef}
      d={edgePath}
      fill="none"
      stroke="#000"
      strokeWidth={2}
      strokeLinecap="round"
      markerEnd={markerEnd}
    />
  );
}
