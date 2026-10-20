"use client";

import { ForgeNav } from "../../components/ForgeNav";
import { useForge } from "../../components/ForgeProvider";

export default function ProfilePage() {
  const { data, player } = useForge();
  return <main className="min-h-screen pb-14"><ForgeNav /><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Profile</p><h1 className="mt-3 text-3xl font-semibold text-white">{player.name}, the {player.title}</h1><div className="mt-8 grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><section className="border-l-2 border-teal-400 pl-5"><p className="text-sm text-slate-400">Level & XP</p><p className="mt-2 text-4xl font-semibold text-white">Level {player.level}</p><p className="mt-2 text-slate-400">{player.xp} / {player.xpToNextLevel} XP</p><div className="mt-4 h-2 bg-slate-800"><div className="h-full bg-teal-400" style={{ width: `${Math.min(100, player.xp / player.xpToNextLevel * 100)}%` }} /></div></section><section><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Achievements</p><div className="mt-4 divide-y divide-slate-800 border-y border-slate-800">{data.achievements.map((item) => <article key={item.id} className="flex items-start justify-between gap-5 py-4"><div><p className="font-medium text-slate-200">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.description}</p></div><span className={`shrink-0 text-xs font-semibold ${item.unlockedAt ? "text-teal-200" : "text-slate-600"}`}>{item.unlockedAt ? "Unlocked" : "Locked"}</span></article>)}</div></section></div></div></main>;
}
