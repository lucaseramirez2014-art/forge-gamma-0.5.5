"use client";

import { useEffect, useState } from "react";
import { ForgeNav } from "../../components/ForgeNav";
import { startCheckout } from "../../lib/billing";
import { trackForgeEvent } from "../../lib/analytics";
import { foundingGold, foundingGoldEnabled, planConfig, type BillingInterval } from "../../lib/plans";
import { useForge } from "../../components/ForgeProvider";
import { PublicFooter } from "../../components/PublicFooter";

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [status, setStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [message, setMessage] = useState("");
  const { plan, subscriptionStatus } = useForge();

  useEffect(() => { trackForgeEvent("pricing_viewed"); }, []);
  const goldPrice = foundingGoldEnabled ? foundingGold[interval] : planConfig.gold.price[interval];
  const goldName = foundingGoldEnabled ? "Founding Gold" : "FORGE Gold";

  async function checkout() {
    setStatus("loading"); setMessage("");
    trackForgeEvent("upgrade_clicked", { interval });
    trackForgeEvent("checkout_started", { interval });
    try {
      const checkout = await startCheckout(interval);
      const checkoutUrl = checkout.url;
      if (!checkoutUrl) throw new Error("Stripe did not return a checkout link. Please try again.");
      const host = new URL(checkoutUrl).hostname;
      if (host !== "checkout.stripe.com" && !host.endsWith(".stripe.com")) throw new Error("FORGE received an invalid checkout link. Please try again.");
      window.location.assign(checkoutUrl);
      return;
    } catch (error) {
      trackForgeEvent("checkout_failed", { interval });
      setMessage(error instanceof Error ? error.message : "Checkout is not available right now.");
      setStatus("unavailable");
      return;
    }
    setStatus("idle");
  }

  return <main className="min-h-screen pb-14"><ForgeNav /><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <header className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">FORGE plans</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Keep the essentials free. Remove ceilings when you need to.</h1><p className="mt-4 text-sm leading-6 text-slate-400">FORGE Free is built for meaningful progress. Gold is for people who want more room for campaigns, AI, and deeper reflection.</p></header>
    <div className="mx-auto mt-8 grid max-w-xs grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-[#101c2a] p-1"><button type="button" onClick={() => setInterval("monthly")} className={`min-h-10 rounded-lg text-sm font-semibold ${interval === "monthly" ? "bg-teal-400 text-slate-950" : "text-slate-300"}`}>Monthly</button><button type="button" onClick={() => setInterval("yearly")} className={`min-h-10 rounded-lg text-sm font-semibold ${interval === "yearly" ? "bg-teal-400 text-slate-950" : "text-slate-300"}`}>Yearly</button></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><PlanCard name={planConfig.free.name} price="$0" period="forever" features={planConfig.free.features} /><article className="rounded-2xl border border-teal-400/50 bg-[#101c2a] p-6 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">{goldName}</p><h2 className="mt-3 text-2xl font-semibold text-white">More room to build momentum.</h2><p className="mt-5 text-4xl font-semibold tracking-tight text-white">${goldPrice.toFixed(2)}<span className="ml-1 text-base font-medium text-slate-400">/{interval === "monthly" ? "month" : "year"}</span></p>{interval === "yearly" ? <p className="mt-2 text-sm text-slate-400">About ${(goldPrice / 12).toFixed(2)}/month billed annually</p> : <p className="mt-2 text-sm text-slate-400">$49.99/year is also available.</p>}<ul className="mt-7 space-y-3 border-t border-slate-700 pt-6">{planConfig.gold.features.map((feature) => <li key={feature} className="flex gap-3 text-sm text-slate-300"><span aria-hidden="true" className="text-teal-300">✓</span>{feature}</li>)}</ul>{plan === "gold" ? <div className="mt-7 rounded-lg border border-teal-300/30 bg-teal-400/10 px-4 py-3 text-sm text-teal-100"><p className="font-bold">Gold is active.</p><p className="mt-1 text-xs text-teal-100/80">Your membership is verified by Stripe{subscriptionStatus.currentPeriodEnd ? ` through ${new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()}` : ""}.</p></div> : <button type="button" disabled={status === "loading"} onClick={() => void checkout()} className="mt-7 w-full rounded-lg bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60">{status === "loading" ? "Opening checkout…" : `Choose ${goldName}`}</button>}<p className="mt-3 text-xs leading-5 text-slate-500">Payment is completed securely through Stripe. Gold unlocks only after FORGE verifies the subscription.</p><p className="mt-3 text-xs leading-5 text-slate-500">FORGE Gold renews automatically until canceled. By continuing, you agree to the <a href="/terms" className="text-teal-200 underline underline-offset-2 hover:text-teal-100">Terms of Service</a> and <a href="/privacy" className="text-teal-200 underline underline-offset-2 hover:text-teal-100">Privacy Policy</a>.</p></article></div>
    {message ? <section className="mx-auto mt-6 max-w-2xl border-l-2 border-amber-300 bg-amber-300/[.07] p-4 text-sm text-amber-100" role="alert"><p className="font-semibold">Checkout is unavailable.</p><p className="mt-1 leading-6 text-slate-300">{message} Your FORGE progress and plan remain unchanged.</p></section> : null}
    <section className="mx-auto mt-12 max-w-3xl border-t border-slate-700 pt-8"><h2 className="text-xl font-semibold text-white">A few clear answers</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="font-semibold text-slate-100">Will Free stay useful?</h3><p className="mt-2 text-sm leading-6 text-slate-400">Yes. Lessons, Focus Sessions, XP, levels, stats, campaign progression, and Today stay available on Free.</p></div><div><h3 className="font-semibold text-slate-100">What happens if I downgrade?</h3><p className="mt-2 text-sm leading-6 text-slate-400">Nothing is deleted. Extra created campaigns stay preserved and can become read-only until you choose which paths remain active.</p></div></div></section>
    <PublicFooter className="mx-auto mt-12 max-w-3xl" />
  </div></main>;
}

function PlanCard({ name, price, period, features }: { name: string; price: string; period: string; features: readonly string[] }) {
  return <article className="rounded-2xl border border-slate-700 bg-[#101c2a] p-6 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{name}</p><h2 className="mt-3 text-2xl font-semibold text-white">A focused foundation.</h2><p className="mt-5 text-4xl font-semibold tracking-tight text-white">{price}<span className="ml-1 text-base font-medium text-slate-400">/{period}</span></p><ul className="mt-7 space-y-3 border-t border-slate-700 pt-6">{features.map((feature) => <li key={feature} className="flex gap-3 text-sm text-slate-300"><span aria-hidden="true" className="text-teal-300">✓</span>{feature}</li>)}</ul></article>;
}
