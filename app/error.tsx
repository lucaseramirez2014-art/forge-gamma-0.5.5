"use client";

import Link from "next/link";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center px-5 text-center"><section className="max-w-md border-y border-red-400/35 py-10"><p className="text-xs font-semibold uppercase tracking-[.18em] text-red-300">FORGE needs a moment</p><h1 className="mt-3 text-3xl font-semibold text-white">This screen could not finish loading.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your saved progress has not been changed. Try this screen again, or return to a safe place in FORGE.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><button type="button" onClick={reset} className="rounded-lg bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Try again</button><Link href="/dashboard" className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200">Open dashboard</Link></div></section></main>;
}
