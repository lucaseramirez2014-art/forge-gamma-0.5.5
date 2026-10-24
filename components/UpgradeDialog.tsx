"use client";

import Link from "next/link";

export function UpgradeDialog({ open, onClose, title, detail }: { open: boolean; onClose: () => void; title: string; detail: string }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/75 p-4 sm:place-items-center" role="presentation" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="upgrade-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#101c2a] p-6 shadow-2xl shadow-black/40" onMouseDown={(event) => event.stopPropagation()}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">FORGE Gold</p>
      <h2 id="upgrade-title" className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
      <p className="mt-5 border-l-2 border-teal-400 bg-teal-400/[.06] px-3 py-2 text-sm text-teal-100">FORGE Gold removes the ceilings for people who use FORGE seriously.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Link href="/pricing" className="rounded-lg bg-teal-400 px-4 py-3 text-center text-sm font-bold text-slate-950">View Gold plans</Link><button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-teal-300">Not now</button></div>
    </section>
  </div>;
}
