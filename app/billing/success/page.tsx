"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ForgeNav } from "../../../components/ForgeNav";
import { useForge } from "../../../components/ForgeProvider";

export default function BillingSuccessPage() {
  const { plan, refreshSubscriptionStatus } = useForge();
  const [state, setState] = useState<"checking" | "active" | "pending" | "unavailable">("checking");

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const status = await refreshSubscriptionStatus();
        if (cancelled) return;
        if (status.verified && status.plan === "gold" && status.state === "gold_active") { setState("active"); return; }
        if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }
      if (!cancelled) setState("pending");
    }
    void verify().catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; };
  }, [refreshSubscriptionStatus]);

  const title = state === "active" || plan === "gold" ? "Welcome to FORGE Gold." : state === "pending" ? "Your payment is being verified." : state === "unavailable" ? "We could not verify Gold yet." : "Checking your Gold membership…";
  const detail = state === "active" || plan === "gold" ? "Your Stripe subscription is active and Gold features are ready." : state === "pending" ? "Stripe may still be finishing the subscription update. Your progress is safe; refresh this page in a moment to check again." : state === "unavailable" ? "No Gold access has been granted from this page. Please try again shortly or return to Plans." : "FORGE is confirming your subscription with Stripe. Gold is never unlocked from the return URL alone.";

  return <main className="min-h-screen pb-14"><ForgeNav /><div className="mx-auto max-w-xl px-5 py-20 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">FORGE billing</p><div className="mx-auto mt-6 grid size-14 place-items-center rounded-2xl bg-teal-400 text-2xl font-black text-slate-950">{state === "active" || plan === "gold" ? "✓" : "…"}</div><h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">{title}</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">{detail}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{state === "active" || plan === "gold" ? <Link href="/dashboard" className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Open dashboard</Link> : <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Check again</button>}<Link href="/pricing" className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-teal-300">View plans</Link></div></div></main>;
}
