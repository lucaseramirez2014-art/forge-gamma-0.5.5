import type { Quest } from "../lib/types";

const difficultyText = { Easy: "Easy", Standard: "Standard", Hard: "Hard", Boss: "Boss Project" };

export function QuestCard({ quest, featured = false, lockedReason, onStart }: { quest: Quest; featured?: boolean; lockedReason?: string; onStart?: (id: string) => void }) {
  const complete = quest.status === "completed";
  const locked = quest.status === "locked";
  const active = quest.status === "active";
  const status = complete ? "Completed" : active ? "Focus session saved" : locked ? "Locked" : "Available now";
  const stateClass = complete || active || !locked ? "border-teal-400" : "border-slate-700";

  return <article className={`forge-lesson-state border-l-2 ${stateClass} px-4 py-1 ${featured ? "bg-teal-400/[.04]" : ""}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">{difficultyText[quest.difficulty]}</p><h3 className="mt-1 text-lg font-semibold text-white">{quest.title}</h3><p className="mt-2 text-sm leading-5 text-slate-400">{quest.description}</p></div><p className="shrink-0 text-sm font-semibold text-teal-300">+{quest.xpReward} XP</p></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3"><div><p className="text-xs text-slate-500">{quest.estimatedMinutes} min focus</p>{locked ? <p className="mt-1 text-xs leading-5 text-slate-500">{lockedReason ? `Complete ${lockedReason} to unlock.` : "Complete the previous lesson to unlock."}</p> : <p className={`mt-1 text-xs font-semibold ${complete || active || !locked ? "text-teal-200" : "text-slate-500"}`}>{status}</p>}</div>{complete ? <span className="text-sm font-semibold text-teal-200">Completed</span> : locked ? <span className="text-sm text-slate-500">Locked</span> : <button type="button" onClick={() => onStart?.(quest.id)} className="rounded-lg bg-teal-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-teal-300">{active ? "Resume focus" : "Start lesson"}</button>}</div></article>;
}
