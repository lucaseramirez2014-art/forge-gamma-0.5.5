"use client";

import { useEffect, useRef, useState } from "react";
import type { ActiveFocusSession } from "../lib/types";

type Props = { minutes: number; xpReward: number; session: ActiveFocusSession; onStart: () => void; onPause: () => void; onFinish: () => void };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FocusTimer({ minutes, xpReward, session, onStart, onPause, onFinish }: Props) {
  const target = minutes * 60;
  const [now, setNow] = useState(0);
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(null);
  const sent = useRef(false);
  const finishRef = useRef(onFinish);
  const elapsed = Math.min(target, Math.max(0, session.elapsedSeconds + (session.isRunning && session.startedAt && now ? Math.floor((now - session.startedAt) / 1000) : 0)));
  const progress = target ? elapsed / target : 0;
  const remaining = Math.max(0, target - elapsed);
  const time = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  const completing = completingSessionId === session.id;
  useEffect(() => { sent.current = false; }, [session.id]);
  useEffect(() => {
    if (!session.isRunning) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.isRunning]);
  useEffect(() => {
    if (elapsed < target || sent.current) return;
    sent.current = true;
    let completion = 0;
    const reveal = window.setTimeout(() => {
      setCompletingSessionId(session.id);
      completion = window.setTimeout(() => finishRef.current(), prefersReducedMotion() ? 0 : 300);
    }, 0);
    return () => { window.clearTimeout(reveal); window.clearTimeout(completion); };
  }, [elapsed, session.id, target]);

  return <div className="text-center">
    <div className="relative mx-auto grid size-60 place-items-center sm:size-72">
      <svg className="-rotate-90 size-full" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle className="forge-timer-progress" cx="50" cy="50" r="46" fill="none" stroke="#2dd4bf" strokeLinecap="round" strokeWidth="4" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} />
      </svg>
      <div className="absolute inset-3 grid place-items-center rounded-full bg-[#101c2a] shadow-inner shadow-black/50">
        <div>
          <p className="font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl" aria-live="off">{completing ? "DONE" : time}</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-[.2em] text-slate-500">{completing ? "session complete" : "focus remaining"}</p>
          <p className="mt-4 text-sm font-semibold text-teal-300">{Math.round(xpReward * progress)} / {xpReward} XP</p>
        </div>
      </div>
    </div>
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <button aria-label={session.isRunning ? "Pause focus session" : "Start or resume focus session"} disabled={remaining === 0 || completing} onClick={session.isRunning ? onPause : onStart} className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50">{session.isRunning ? "Pause" : elapsed ? "Resume focus" : "Start focus"}</button>
      <button aria-label="End focus session early" disabled={!elapsed || remaining === 0 || completing} onClick={() => { if (window.confirm("End this focus session early? Your proportional progress will be saved.")) onFinish(); }} className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">End early</button>
    </div>
    <p className="mt-4 text-xs text-slate-500">Your session is saved locally. Ending early banks proportional progress.</p>
  </div>;
}
