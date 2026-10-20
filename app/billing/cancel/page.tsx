"use client";

import Link from "next/link";
import { ForgeNav } from "../../../components/ForgeNav";

export default function BillingCancelPage() {
  return <main className="min-h-screen pb-14"><ForgeNav /><div className="mx-auto max-w-xl px-5 py-20 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">FORGE billing</p><h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Checkout canceled.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">No payment was made and your FORGE progress is unchanged. You can keep building on Free or return when Gold feels useful.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/pricing" className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Back to plans</Link><Link href="/dashboard" className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-teal-300">Open dashboard</Link></div></div></main>;
}
