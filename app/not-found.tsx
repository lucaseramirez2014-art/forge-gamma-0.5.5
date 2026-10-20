import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center px-5 text-center"><section className="max-w-md border-y border-slate-700 py-10"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">FORGE route unavailable</p><h1 className="mt-3 text-3xl font-semibold text-white">That page is not part of your path.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your local progress is safe. Return to your dashboard or campaign to keep moving.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/dashboard" className="rounded-lg bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Open dashboard</Link><Link href="/campaign" className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200">Open campaign</Link></div></section></main>;
}
