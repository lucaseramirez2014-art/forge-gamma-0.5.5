"use client";

import { useEffect, useRef, useState } from "react";

type XPBarProps = { current: number; goal: number; compact?: boolean; };

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function XPBar({ current, goal, compact = false }: XPBarProps) {
  const [displayedXP, setDisplayedXP] = useState(current);
  const previous = useRef(current);
  const frame = useRef<number | null>(null);
  const percentage = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  useEffect(() => {
    if (previous.current === current) return;
    if (reducedMotion()) {
      frame.current = requestAnimationFrame(() => {
        previous.current = current;
        setDisplayedXP(current);
      });
      return () => { if (frame.current) cancelAnimationFrame(frame.current); };
    }
    const start = previous.current;
    const startTime = performance.now();
    const duration = 320;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      setDisplayedXP(Math.round(start + (current - start) * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else previous.current = current;
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [current]);

  return <div className={compact ? "w-full" : "w-full max-w-md"}>
    <div className="mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-slate-400"><span>{displayedXP.toLocaleString()} XP</span><span>{goal.toLocaleString()} XP</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={current} aria-label="Experience progress">
      <div className="forge-xp-fill h-full rounded-full bg-teal-400" style={{ width: `${percentage}%` }} />
    </div>
  </div>;
}
