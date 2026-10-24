"use client";

import { CopilotChat } from "../../components/CopilotChat";
import { ForgeNav } from "../../components/ForgeNav";
import { useForge } from "../../components/ForgeProvider";
import { UpgradeDialog } from "../../components/UpgradeDialog";
import { planConfig } from "../../lib/plans";
import { useState } from "react";

export default function CopilotPage() {
  const { activeCampaign, activeQuests, player, data, applyCopilotActions, consumeCopilotMessage, usage, plan } = useForge();
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const completedLessons = activeQuests.filter((lesson) => lesson.status === "completed").map((lesson) => lesson.title);
  const availableLessons = activeQuests.filter((lesson) => lesson.status === "available" || lesson.status === "active").map((lesson) => lesson.title);
  const answers = data.onboarding.answers;
  const activeGoals = answers ? [answers.goalType, answers.improve, answers.commitment, answers.motivation].filter(Boolean) : [];

  return (
    <main className="min-h-screen pb-14">
      <ForgeNav />
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        {plan === "free" ? <p className="mb-4 text-xs text-slate-500">Free Copilot usage · {usage.copilotMessages}/{planConfig.free.limits.copilotMessagesPerWeek} messages this week</p> : null}
        <CopilotChat forgeContext={{ currentCampaign: activeCampaign.title, currentStage: activeCampaign.stage, completedLessons, availableLessons, xp: player.xp, level: player.level, streak: player.streak, stats: player.stats, activeGoals, editor: { campaignId: activeCampaign.id, stages: data.worlds.filter((stage) => stage.campaignId === activeCampaign.id).sort((a, b) => a.order - b.order).map((stage) => ({ id: stage.id, title: stage.title, description: stage.description, status: stage.status, lessons: data.quests.filter((lesson) => lesson.worldId === stage.id).map((lesson) => ({ id: lesson.id, title: lesson.title, description: lesson.description, difficulty: lesson.difficulty, estimatedMinutes: lesson.estimatedMinutes, xpReward: lesson.xpReward, status: lesson.status, prerequisites: lesson.prerequisites })) })) } }} beforeSend={consumeCopilotMessage} onLimitReached={setUpgradeMessage} onApplyActions={(actions) => { const result = applyCopilotActions(actions); if (!result.ok && result.error?.includes("Gold")) setUpgradeMessage(result.error); return result; }} />
        <section className="mt-6 rounded-2xl border border-slate-700 bg-[#101c2a] p-5">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Applied campaign changes</p>
          {data.copilotActionHistory.length ? <ul className="mt-4 space-y-2">{data.copilotActionHistory.slice(0, 5).map((change) => <li key={change.id} className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-300">{change.summary}</span><span className="text-xs text-slate-500">{new Date(change.appliedAt).toLocaleDateString()}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Confirmed Copilot edits will appear here. Campaign progress is never changed automatically.</p>}
        </section>
      </div>
      <UpgradeDialog open={Boolean(upgradeMessage)} onClose={() => setUpgradeMessage("")} title="More room for Copilot" detail={upgradeMessage} />
    </main>
  );
}
