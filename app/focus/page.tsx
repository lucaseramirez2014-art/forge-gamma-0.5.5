"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FocusTimer } from "../../components/FocusTimer";
import { ForgeNav } from "../../components/ForgeNav";
import { useForge } from "../../components/ForgeProvider";

export default function FocusPage() {
  const router = useRouter();
  const { activeCampaign, activeQuest, data, startFocus, pauseFocus } = useForge();
  const session = data.activeFocusSession;
  const lessonCampaign = activeQuest ? data.campaigns.find((campaign) => campaign.id === activeQuest.campaignId) ?? activeCampaign : activeCampaign;

  if (!activeQuest || !session || session.questId !== activeQuest.id) {
    const staleSession = Boolean(session);
    return <main className="min-h-screen"><ForgeNav /><div className="mx-auto max-w-xl px-5 py-24 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Focus Mode</p><h1 className="mt-3 text-2xl font-semibold text-white">{staleSession ? "That saved focus session is no longer available." : "Choose a lesson to begin a focus session."}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{staleSession ? "Your completed progress is safe. Open the campaign to choose an available lesson." : "Start from a lesson in your campaign and FORGE will carry it safely into Focus Mode."}</p><Link href="/campaign" className="mt-6 inline-block rounded-lg bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Open campaign</Link></div></main>;
  }

  return <main className="min-h-screen pb-12"><ForgeNav /><div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12"><Link href="/campaign" className="text-sm text-slate-500 hover:text-slate-200">← Back to campaign <span className="text-slate-600">· session stays saved</span></Link><section className="mt-8 rounded-2xl border border-slate-700 bg-[#101c2a] p-6 sm:p-10"><div className="mx-auto max-w-xl text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">{lessonCampaign.title} · {activeQuest.difficulty === "Boss" ? "Boss Project" : "Lesson"}</p><h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">{activeQuest.title}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{activeQuest.focusPrompt}</p><div className="mt-5 flex flex-wrap justify-center gap-2 text-xs"><span className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300">{activeQuest.estimatedMinutes} min focus</span><span className="rounded-lg border border-teal-400/25 bg-teal-400/10 px-3 py-1.5 text-teal-300">+{activeQuest.xpReward} XP</span></div></div><div className="mt-10"><FocusTimer minutes={activeQuest.estimatedMinutes} xpReward={activeQuest.xpReward} session={session} onStart={() => startFocus(session.id)} onPause={() => pauseFocus(session.id)} onFinish={() => router.push("/complete?session=" + session.id)} /></div></section></div></main>;
}
