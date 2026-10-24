"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ForgeNav } from "../../components/ForgeNav";
import { XPBar } from "../../components/XPBar";
import { useForge } from "../../components/ForgeProvider";

export default function CompletePage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-slate-400">Finalizing progress…</main>}><Completion /></Suspense>;
}

function Completion() {
  const params = useSearchParams();
  const { data, player, activeCampaign, finishFocusSession, setLessonFeedback, undoLessonCompletion } = useForge();
  const sessionId = params.get("session");
  const settled = useRef(false);
  const [undoConfirmation, setUndoConfirmation] = useState<{ title: string; xp: number; stats: string } | null>(null);
  useEffect(() => { if (sessionId && !settled.current) { settled.current = true; finishFocusSession(sessionId); } }, [finishFocusSession, sessionId]);
  const reward = data.lastReward?.sessionId === sessionId ? data.lastReward : null;
  const completedQuest = reward ? data.quests.find((item) => item.id === reward.questId) : null;
  const feedback = reward ? data.quests.find((item) => item.id === reward.questId)?.feedback : undefined;
  const nextLesson = reward?.unlockedQuestIds.map((id) => data.quests.find((lesson) => lesson.id === id)).find(Boolean);
  const statsGained = reward ? Object.entries(reward.statsDelta).filter(([, value]) => Number(value) > 0) : [];
  const rewardEvent = reward ? data.rewardHistory.find((entry) => entry.sessionId === reward.sessionId && entry.lessonId === reward.questId) ?? data.rewardHistory.find((entry) => entry.kind === "completion" && entry.lessonId === reward.questId) : null;
  const completionReward = rewardEvent?.kind === "completion" ? rewardEvent : null;
  const canUndoCompletion = Boolean(completionReward && !completionReward.id.startsWith("legacy-completion:"));

  if (undoConfirmation) return <main className="min-h-screen pb-12"><ForgeNav /><div className="mx-auto max-w-xl px-5 py-20 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Progress updated</p><h1 className="mt-3 text-3xl font-semibold text-white">Completion undone.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Removed +{undoConfirmation.xp} XP{undoConfirmation.stats ? ` and ${undoConfirmation.stats}` : ""} from {undoConfirmation.title}. Later lesson rewards remain unchanged.</p><div className="mx-auto mt-6 rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-left"><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">Updated totals</p><p className="mt-2 text-lg font-semibold text-white">Level {player.level} · {player.xp.toLocaleString()} XP</p></div><div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Link href="/campaign" className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Return to campaign</Link><Link href="/history" className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200">View history</Link></div></div></main>;

  if (!sessionId || (!reward && data.activeFocusSession?.id !== sessionId)) return <main className="min-h-screen"><ForgeNav /><div className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-3xl font-semibold text-white">No session to complete.</h1><p className="mt-3 text-slate-400">Start a focus session from your campaign to collect progress.</p><Link href="/campaign" className="mt-6 inline-block rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Open campaign</Link></div></main>;

  const levelUp = reward && reward.levelAfter > reward.levelBefore;
  return <main className="min-h-screen pb-12"><ForgeNav /><div className="mx-auto max-w-4xl px-5 py-14"><section className="border-y border-teal-400/30 py-7 text-center sm:py-12">
    <div className="forge-reveal mx-auto grid size-16 place-items-center rounded-2xl bg-teal-400 text-3xl text-slate-950">{reward?.questCompleted ? "✓" : "↗"}</div>
    <p className="forge-reveal mt-7 text-xs font-semibold uppercase tracking-[.2em] text-teal-300">{reward?.questCompleted ? "Lesson complete" : "Focus progress saved"}</p>
    <h1 className="forge-reveal mt-3 text-3xl font-semibold text-white">{reward?.questTitle ?? "Finalizing your session"}</h1>
    <p className="forge-reveal mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">{reward ? `${reward.focusMinutes} minutes focused · +${reward.xpGained} XP earned` : "Finalizing your progress…"}</p>
    {levelUp ? <div className="forge-level-up mt-6 rounded-xl border border-teal-300/25 bg-teal-400/10 p-4 text-teal-200"><p className="text-xs font-bold tracking-[.18em]">LEVEL UP</p><p className="mt-1 text-2xl font-semibold text-white">Level {reward.levelAfter}</p></div> : null}
    <div className="forge-reveal-delay mx-auto mt-8 grid max-w-md gap-3 sm:grid-cols-2"><div className="rounded-xl border border-teal-400/15 bg-teal-400/5 p-5"><p className="text-xs uppercase tracking-[.16em] text-teal-200">Campaign progress</p><p className="mt-2 text-4xl font-semibold text-white">{reward?.campaignProgress ?? activeCampaign.progress}%</p></div><div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5"><p className="text-xs uppercase tracking-[.16em] text-slate-500">Consistency</p><p className="mt-2 text-4xl font-semibold text-white">{reward?.streak ?? player.streak}d</p></div></div>
    {statsGained.length ? <section className="mx-auto mt-5 max-w-md rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-left text-sm text-slate-300"><p className="font-medium text-slate-100">Stats gained</p><div className="mt-2 space-y-1">{statsGained.map(([stat, value]) => <p key={stat}><span className="font-semibold text-teal-200">+{value} {stat}</span><span className="ml-2 text-slate-500">From: {rewardEvent?.lessonTitle ?? reward?.questTitle}</span></p>)}</div></section> : null}
    <div className="mx-auto mt-5 max-w-md rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-left"><div className="mb-3 flex justify-between text-sm"><span className="font-semibold text-white">Level {player.level}</span><span className="text-slate-400">{player.xp} XP</span></div><XPBar current={player.xp} goal={player.xpToNextLevel} compact /></div>
    {reward?.questCompleted ? <div className="mx-auto mt-5 max-w-md rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-left"><p className="text-sm font-semibold text-white">How did that feel?</p><div className="mt-3 flex flex-wrap gap-2">{([ ["too-easy", "Too easy"], ["good", "Good"], ["too-hard", "Too hard"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => reward && setLessonFeedback(reward.questId, value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${feedback === value ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-slate-600 text-slate-300 hover:border-teal-300"}`}>{label}</button>)}</div></div> : null}
    {completionReward ? <section className="mx-auto mt-5 max-w-md rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-4 text-left"><p className="text-sm font-semibold text-white">Completed by mistake?</p><p className="mt-1 text-xs leading-5 text-slate-400">Undo removes exactly +{completionReward.xpAwarded} XP and the recorded stat rewards. Later lesson rewards remain unchanged.</p>{canUndoCompletion ? <button type="button" onClick={() => { const stats = Object.entries(completionReward.statChanges).filter(([, value]) => Number(value) > 0).map(([stat, value]) => `+${value} ${stat}`).join(" · "); if (window.confirm(`Undo ${completionReward.lessonTitle}? Its +${completionReward.xpAwarded} XP and associated stat gains will be reversed. Later lesson rewards will remain unchanged.`) && undoLessonCompletion(completionReward.lessonId)) setUndoConfirmation({ title: completionReward.lessonTitle, xp: completionReward.xpAwarded, stats }); }} className="mt-3 rounded-lg border border-amber-200/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-200/60 focus:outline-none focus:ring-2 focus:ring-amber-200/50">Undo completion</button> : <p className="mt-3 text-xs text-amber-100/80">This reward predates detailed reward records and cannot be reversed safely.</p>}</section> : null}
    {nextLesson ? <div className="forge-reveal-delay mx-auto mt-5 max-w-md rounded-xl border border-teal-400/20 bg-teal-400/[.06] p-4 text-left"><p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-300">Unlocked next</p><p className="mt-1 font-semibold text-white">{nextLesson.title}</p><p className="mt-1 text-sm text-slate-400">Ready when you are.</p></div> : null}
    <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/campaign" className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">{nextLesson ? "Continue to next lesson →" : "Return to campaign →"}</Link><Link href="/dashboard" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">View dashboard</Link>{levelUp || completedQuest?.difficulty === "Boss" ? <Link href={`/share?type=${levelUp ? "level-up" : "boss"}`} className="rounded-xl border border-teal-400/40 px-5 py-3 text-sm font-semibold text-teal-100 hover:border-teal-300">Create share card</Link> : null}</div>
  </section></div></main>;
}
