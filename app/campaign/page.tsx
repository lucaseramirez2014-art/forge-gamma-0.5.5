"use client";

import { useRouter } from "next/navigation";
import { ForgeNav } from "../../components/ForgeNav";
import { QuestCard } from "../../components/QuestCard";
import { useForge } from "../../components/ForgeProvider";

export default function CampaignPage() {
  const router = useRouter();
  const { data, activeCampaign, activeQuests, selectQuest, setActiveCampaign } = useForge();
  const stages = data.worlds.filter((world) => world.campaignId === activeCampaign.id).sort((a, b) => a.order - b.order);
  const campaignComplete = activeCampaign.total > 0 && activeCampaign.completed >= activeCampaign.total;
  const savedFocusLesson = data.activeFocusSession ? data.quests.find((lesson) => lesson.id === data.activeFocusSession?.questId) ?? null : null;

  function start(lessonId: string) {
    if (savedFocusLesson && savedFocusLesson.id !== lessonId) { router.push("/focus"); return; }
    if (selectQuest(lessonId)) router.push("/focus");
  }
  function lockedReason(lessonId: string) {
    const lesson = activeQuests.find((item) => item.id === lessonId);
    return lesson?.prerequisites.map((id) => activeQuests.find((item) => item.id === id)?.title).filter(Boolean).join(" and ");
  }

  return <main className="min-h-screen pb-14">
    <ForgeNav />
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Campaign</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{activeCampaign.title}</h1><p className="mt-3 text-slate-400">{activeCampaign.description}</p></header>
      {savedFocusLesson ? <section className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-teal-400/25 bg-teal-400/[.06] p-4 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-200">Focus Session Saved</p><p className="mt-1 text-sm text-slate-200">Resume {savedFocusLesson.title} before starting another lesson. Your current progress is safe.</p></div><button type="button" onClick={() => router.push("/focus")} className="shrink-0 rounded-lg bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950">Resume focus</button></section> : null}
      <div className="mt-8 grid gap-3 md:grid-cols-3">{data.campaigns.map((campaign) => <button type="button" key={campaign.id} onClick={() => setActiveCampaign(campaign.id)} className={`rounded-xl border p-4 text-left transition ${campaign.id === activeCampaign.id ? "border-teal-400/50 bg-teal-400/[.07]" : "border-slate-700 bg-[#101c2a] hover:border-slate-500"}`}><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">{campaign.id === activeCampaign.id ? "Current campaign" : "Switch campaign"}</p><h2 className="mt-2 text-lg font-semibold text-white">{campaign.title}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{campaign.primaryStats.join(" · ")}</p></button>)}</div>
      <section className="mt-10"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Your progression path</p>{campaignComplete ? <div className="mt-5 border-l-2 border-teal-400 bg-teal-400/[.06] p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">Campaign complete</p><h2 className="mt-2 text-xl font-semibold text-white">Every stage is cleared.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Your completed lessons, XP, and Boss Projects are preserved. Review the path below or switch to another existing campaign.</p><button type="button" onClick={() => router.push("/share?type=campaign-complete")} className="mt-4 rounded-lg border border-teal-400/40 px-4 py-2.5 text-sm font-bold text-teal-100 hover:border-teal-300">Create completion card</button></div> : null}
        {stages.length ? <div className="mt-5 space-y-6">{stages.map((stage) => {
          const lessons = activeQuests.filter((lesson) => lesson.worldId === stage.id);
          const cleared = lessons.filter((lesson) => lesson.status === "completed").length;
          const isLocked = stage.status === "locked";
          const nextLesson = lessons.find((lesson) => lesson.status === "active" || lesson.status === "available");
          return <article key={stage.id} className={`forge-stage-state rounded-2xl border p-5 sm:p-6 ${isLocked ? "border-slate-800 bg-slate-950/30" : "border-slate-700 bg-[#101c2a]"}`}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">{stage.subtitle} · {isLocked ? "Locked" : cleared === lessons.length ? "Complete" : "In progress"}</p><h2 className="mt-2 text-xl font-semibold text-white">{stage.title}</h2><p className="mt-1 text-sm text-slate-400">{stage.description}</p></div><p className="text-xs text-slate-500">{cleared}/{lessons.length} lessons complete</p></div>{isLocked ? <p className="mt-5 text-sm text-slate-500">Complete the previous Boss Project to unlock this stage.</p> : <><p className="mt-5 text-sm text-teal-100">{nextLesson ? `Up next · ${nextLesson.title}` : "This stage is complete."}</p><div className="mt-5 grid gap-4 md:grid-cols-3">{lessons.map((lesson) => <QuestCard key={lesson.id} quest={lesson} featured={lesson.difficulty === "Boss"} lockedReason={lockedReason(lesson.id)} onStart={start} />)}</div></>}</article>;
        })}</div> : <div className="mt-5 rounded-2xl border border-slate-700 bg-[#101c2a] p-6 text-center"><h2 className="text-lg font-semibold text-white">This campaign is still being prepared.</h2><p className="mt-2 text-sm text-slate-400">Choose another campaign or return to the dashboard while its lessons are available.</p><button type="button" onClick={() => router.push("/dashboard")} className="mt-5 rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Back to dashboard</button></div>}
      </section>
    </div>
  </main>;
}
