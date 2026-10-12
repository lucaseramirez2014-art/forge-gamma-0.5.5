"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForge } from "../../components/ForgeProvider";
import { UpgradeDialog } from "../../components/UpgradeDialog";
import { planConfig } from "../../lib/plans";
import type { GeneratedCampaign } from "../../lib/generatedCampaign";
import type { OnboardingAnswers } from "../../lib/types";

const steps = [["Your direction", "What do you want to become better at?"], ["Starting point", "What is your current level?"], ["Outcome", "What specifically do you want to be able to do?"], ["Capacity", "How much time can you spend per week?"], ["Learning style", "How do you prefer to learn?"]] as const;
const campaignRequestTimeoutMs = 118_000;

function initialAnswers(saved: OnboardingAnswers | null): OnboardingAnswers {
  return { improve: saved?.improve ?? "", goalType: saved?.goalType ?? "", commitment: saved?.commitment ?? "3–5 hours weekly", motivation: saved?.motivation ?? "Mix of both", goal: saved?.goal ?? saved?.goalType ?? "", currentLevel: saved?.currentLevel ?? "Beginner", desiredOutcome: saved?.desiredOutcome ?? saved?.improve ?? "", weeklyTime: saved?.weeklyTime ?? saved?.commitment ?? "3–5 hours weekly", learningStyle: saved?.learningStyle ?? saved?.motivation ?? "Mix of both", deadline: saved?.deadline ?? "" };
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data, completeOnboarding, createGeneratedCampaign, consumeCampaignGeneration, usage, plan } = useForge();
  const [answers, setAnswers] = useState(() => initialAnswers(data.onboarding.answers));
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<GeneratedCampaign | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [status, setStatus] = useState<"questions" | "forging" | "preview">("questions");
  const [error, setError] = useState("");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const forgingRef = useRef(false);
  const ready = step === 0 ? Boolean(answers.goal?.trim()) : step === 2 ? Boolean(answers.desiredOutcome?.trim()) : true;
  const update = (next: Partial<OnboardingAnswers>) => setAnswers((current) => ({ ...current, ...next }));

  async function forgePlan(instruction = "") {
    if (forgingRef.current) return;
    const access = consumeCampaignGeneration();
    if (!access.ok) { setError(access.message || "Campaign generation is unavailable right now."); setStatus(preview ? "preview" : "questions"); setUpgradeMessage(access.message || "Campaign generation is unavailable right now."); return; }
    forgingRef.current = true;
    setStatus("forging"); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), campaignRequestTimeoutMs);
    try {
      const response = await fetch("/api/ai/generate-campaign", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: answers.goal, currentLevel: answers.currentLevel, desiredOutcome: answers.desiredOutcome, weeklyTime: answers.weeklyTime, learningStyle: answers.learningStyle, adjustment: instruction || undefined, previousCampaign: preview ?? undefined }) });
      const rawBody = await response.text();
      let body: { campaign?: GeneratedCampaign; error?: string } = {};
      try { body = JSON.parse(rawBody) as { campaign?: GeneratedCampaign; error?: string }; } catch { /* A safe generic error is shown below. */ }
      if (!response.ok || !body.campaign) throw new Error(body.error || "FORGE could not forge a campaign right now.");
      setPreview(body.campaign); setStatus("preview"); setAdjustment("");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      setError(requestError instanceof Error && requestError.name === "AbortError" ? "Campaign forging took too long. Please try again." : message || "FORGE could not forge a campaign right now.");
      setStatus("questions");
    } finally { window.clearTimeout(timeout); forgingRef.current = false; }
  }

  function finalizedAnswers(): OnboardingAnswers {
    return { ...answers, goalType: answers.goal?.trim() || "A focused goal", improve: answers.desiredOutcome?.trim() || answers.goal?.trim() || "", commitment: answers.weeklyTime ?? "", motivation: answers.learningStyle ?? "" };
  }
  function next() { if (!ready) return; if (step === steps.length - 1) { void forgePlan(); return; } setStep((current) => current + 1); }
  function startCampaign() { if (!preview) return; if (createGeneratedCampaign(preview, finalizedAnswers())) router.replace("/dashboard"); else setError("FORGE could not save that campaign. Please regenerate and try again."); }
  function useStarterCampaign() { completeOnboarding(finalizedAnswers()); router.replace("/campaign?choose=1"); }

  return <main className="min-h-screen bg-[#081521] px-5 py-10 text-white sm:px-8 sm:py-16"><div className="mx-auto max-w-3xl">
    <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-lg bg-teal-400 font-black text-slate-950">F</span><span className="text-sm font-bold tracking-[.22em]">FORGE</span></div>

    {status === "forging" ? <section className="forge-view mt-16 border-y border-teal-400/25 py-8 text-left sm:py-12" aria-live="polite"><div className="flex items-center gap-2"><span className="forge-spinner" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-300">FORGE Campaign Generator</p></div><h1 className="mt-3 text-3xl font-semibold tracking-tight">Forging your campaign…</h1><p className="mt-3 max-w-md text-sm leading-6 text-slate-400">Building a focused path around your goal, time, and preferred way of learning. This can take up to two minutes.</p><div className="forge-loading-line mt-6 h-px bg-slate-700" aria-hidden="true" /></section> : null}

    {status === "preview" && preview ? <section className="forge-view mt-12 border-y border-teal-400/25 py-6 sm:py-10"><p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-300">Your campaign has been forged</p><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h1 className="text-3xl font-semibold tracking-tight">{preview.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{preview.description}</p></div><span className="shrink-0 border border-teal-400/20 px-3 py-2 text-xs font-semibold text-teal-200">{preview.estimatedWeeks} weeks · {preview.stages.length} stages</span></div><div className="mt-8 divide-y divide-slate-700 border-y border-slate-700">{preview.stages.map((stage, index) => <article key={stage.id} className="py-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">Stage {index + 1}</p><h2 className="mt-1 text-lg font-semibold text-white">{stage.title}</h2><p className="mt-1 text-sm text-slate-400">{stage.description}</p><ul className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-2">{stage.lessons.slice(0, 3).map((lesson) => <li key={lesson.id} className="flex justify-between border-l-2 border-slate-600 pl-3 text-sm text-slate-300"><span>{lesson.title}</span><span className="text-xs text-teal-200">+{lesson.xpReward} XP</span></li>)}</ul><p className="mt-4 border-l-2 border-teal-400 px-3 text-sm font-semibold text-teal-100">Boss Project · {stage.bossProject.title}<span className="float-right text-xs">+{stage.bossProject.xpReward} XP</span></p></article>)}</div>{error ? <p className="mt-5 border-l-2 border-red-400 bg-red-400/10 p-3 text-sm text-red-200" role="alert">{error}</p> : null}<div className="mt-7 border-y border-slate-700 py-4"><label htmlFor="adjustment" className="text-sm font-semibold text-white">Adjust this plan</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input id="adjustment" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} maxLength={280} placeholder="Make it more project-based…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400" /><button type="button" disabled={!adjustment.trim()} onClick={() => void forgePlan(adjustment.trim())} className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50">Adjust plan</button></div></div><div className="mt-6 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={startCampaign} className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-300">Start campaign →</button><button type="button" onClick={() => void forgePlan()} className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-teal-300">Regenerate</button><button type="button" onClick={() => setStatus("questions")} className="rounded-lg px-4 py-3 text-sm font-medium text-slate-400 hover:text-white">Edit answers</button></div></section> : null}

    {status === "questions" ? <section className="mt-12 border-y border-slate-700 py-6 sm:py-10"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-300">Campaign forge · {step + 1}/{steps.length}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{steps[step][1]}</h1></div><span className="text-sm text-slate-500">{steps[step][0]}</span></div><div className="mt-7 h-px overflow-hidden bg-slate-700"><div className="h-full bg-teal-400 transition-[width]" style={{ width: String((step + 1) * 20) + "%" }} /></div><div className="mt-8">{step === 0 ? <><label className="sr-only" htmlFor="goal">Your goal</label><input id="goal" autoFocus value={answers.goal} onChange={(event) => update({ goal: event.target.value })} maxLength={160} placeholder="e.g. Graphic Designer, Python Developer, Better Student" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3.5 text-base text-white outline-none focus:border-teal-400" /><p className="mt-3 text-sm text-slate-400">Name a skill, role, or direction. You can be specific or broad.</p></> : null}{step === 1 ? <Choices values={["Beginner", "Intermediate", "Advanced"]} selected={answers.currentLevel ?? ""} onChoose={(currentLevel) => update({ currentLevel })} /> : null}{step === 2 ? <><label className="sr-only" htmlFor="outcome">Desired outcome</label><textarea id="outcome" autoFocus value={answers.desiredOutcome} onChange={(event) => update({ desiredOutcome: event.target.value })} maxLength={420} rows={4} placeholder="e.g. Build and launch simple Python tools for my own workflow." className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-4 py-3.5 text-base text-white outline-none focus:border-teal-400" /></> : null}{step === 3 ? <Choices values={["1–2 hours weekly", "3–5 hours weekly", "6+ hours weekly"]} selected={answers.weeklyTime ?? ""} onChoose={(weeklyTime) => update({ weeklyTime })} /> : null}{step === 4 ? <Choices values={["Projects", "Theory", "Mix of both"]} selected={answers.learningStyle ?? ""} onChoose={(learningStyle) => update({ learningStyle })} /> : null}</div>{error ? <div className="mt-5 border-l-2 border-red-400 bg-red-400/10 p-3 text-sm text-red-200" role="alert"><p>{error}</p><p className="mt-1 text-xs leading-5 text-slate-300">Your answers are still here. You can retry safely or use a starter campaign instead.</p>{step === steps.length - 1 ? <button type="button" onClick={() => void forgePlan()} className="mt-3 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold text-red-100 hover:border-red-200">Retry forging</button> : null}</div> : null}<div className="mt-9 flex items-center justify-between gap-4"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-400 hover:text-white disabled:opacity-0">Back</button><button type="button" onClick={next} disabled={!ready} className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50">{step === steps.length - 1 ? "Forge my campaign →" : "Continue →"}</button></div><button type="button" onClick={useStarterCampaign} className="mt-6 text-sm text-slate-500 hover:text-teal-200">Use a starter campaign instead</button></section> : null}
    {plan === "free" ? <p className="mt-5 text-center text-xs text-slate-500">Free AI campaign generations used this month · {usage.campaignGenerations}/{planConfig.free.limits.campaignGenerationsPerMonth}</p> : null}
  </div><UpgradeDialog open={Boolean(upgradeMessage)} onClose={() => setUpgradeMessage("")} title="More room to forge" detail={upgradeMessage} /></main>;
}

function Choices({ values, selected, onChoose }: { values: string[]; selected: string; onChoose: (value: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-3">{values.map((value) => <button key={value} type="button" onClick={() => onChoose(value)} className={selected === value ? "rounded-lg border border-teal-400 bg-teal-400/10 p-4 text-left text-sm font-semibold text-teal-100" : "rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-left text-sm font-semibold text-slate-300 hover:border-slate-500"}>{value}</button>)}</div>;
}
