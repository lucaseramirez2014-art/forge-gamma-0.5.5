"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { ForgeNav } from "../../components/ForgeNav";
import { ShareCard } from "../../components/ShareCard";
import { useForge } from "../../components/ForgeProvider";
import { UpgradeDialog } from "../../components/UpgradeDialog";
import { canUsePremiumShareCards } from "../../lib/plans";
import { cardDataFor, cardDataIsMeaningful, defaultShareFields, shareCardOptions, shareCardTypes, type ShareCardAspect, type ShareCardType, type ShareField } from "../../lib/shareCards";

const typeLabels: Record<ShareCardType, string> = {
  weekly: "Weekly recap",
  "level-up": "Level up",
  boss: "Boss Project",
  milestone: "Campaign milestone",
  "campaign-complete": "Campaign complete",
};

const fieldLabels: Record<ShareField, string> = {
  campaign: "Campaign",
  level: "Level",
  xp: "XP",
  focus: "Focus time",
  streak: "Streak",
  topStat: "Top stat",
  bosses: "Boss Projects",
  username: "Username",
};

export default function SharePage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-slate-400">Loading your progress card…</main>}><ShareWorkspace /></Suspense>;
}

function ShareWorkspace() {
  const { data, subscriptionStatus } = useForge();
  const params = useSearchParams();
  const premiumShareCards = canUsePremiumShareCards(subscriptionStatus);
  const rawOptions = useMemo(() => shareCardOptions(data), [data]);
  const options = useMemo(() => ({ ...rawOptions, "level-up": premiumShareCards && rawOptions["level-up"], boss: premiumShareCards && rawOptions.boss, milestone: premiumShareCards && rawOptions.milestone, "campaign-complete": premiumShareCards && rawOptions["campaign-complete"] }), [premiumShareCards, rawOptions]);
  const requested = params.get("type");
  const initialType = shareCardTypes.includes(requested as ShareCardType) && options[requested as ShareCardType] ? requested as ShareCardType : shareCardTypes.find((type) => options[type]) ?? "weekly";
  const [type, setType] = useState<ShareCardType>(initialType);
  const [fields, setFields] = useState(defaultShareFields);
  const [aspect, setAspect] = useState<ShareCardAspect>("square");
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "saved" | "error">("idle");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const card = useMemo(() => cardDataFor(data, type), [data, type]);

  const premiumFields = new Set<ShareField>(["streak", "bosses", "username"]);
  const effectiveFields = Object.fromEntries((Object.entries(fields) as [ShareField, boolean][]).map(([field, value]) => [field, premiumShareCards || !premiumFields.has(field) ? value : false])) as typeof fields;
  const updateField = (field: ShareField) => { if (!premiumShareCards && premiumFields.has(field)) { setUpgradeOpen(true); return; } setFields((current) => ({ ...current, [field]: !current[field] })); };
  const chooseType = (nextType: ShareCardType) => { if (!premiumShareCards && nextType !== "weekly" && rawOptions[nextType]) { setUpgradeOpen(true); return; } if (options[nextType]) { setType(nextType); setExportStatus("idle"); } };

  async function saveImage() {
    const svg = svgRef.current;
    if (!svg || !card || !cardDataIsMeaningful(card, effectiveFields)) { setExportStatus("error"); return; }
    if (typeof XMLSerializer === "undefined" || typeof HTMLCanvasElement === "undefined") { setExportStatus("error"); return; }
    setExportStatus("exporting");
    try {
      const serialized = new XMLSerializer().serializeToString(svg);
      const source = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(source);
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The card preview could not be rendered.")); image.src = url; });
      const height = aspect === "square" ? 1080 : 1350;
      const canvas = document.createElement("canvas");
      canvas.width = 2160;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export is unavailable in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("FORGE could not create the image.");
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `forge-${type}-progress.png`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setExportStatus("saved");
    } catch {
      setExportStatus("error");
    }
  }

  const noShareData = !shareCardTypes.some((candidate) => options[candidate]);
  return <main className="min-h-screen pb-14"><ForgeNav /><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
    <header className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">Share & proof</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Turn real work into a clean record.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Choose a card, decide what belongs on it, then save the exact preview as an image. Nothing is posted automatically.</p></header>
    {noShareData ? <section className="mt-10 max-w-2xl border-y border-slate-700 py-8"><h2 className="text-xl font-semibold text-white">No shareable progress yet.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Complete a lesson, make progress in a Focus Session, or reach a campaign milestone. When there is real progress to show, a card will appear here.</p><Link href="/campaign" className="mt-5 inline-block rounded-lg bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Open campaign</Link></section> : <div className="mt-9 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start"><section className="rounded-2xl border border-slate-700 bg-[#101c2a] p-4"><h2 className="text-sm font-semibold text-white">Card type</h2><div className="mt-3 grid gap-2">{shareCardTypes.map((candidate) => <button key={candidate} type="button" disabled={!rawOptions[candidate]} onClick={() => chooseType(candidate)} className={`min-h-11 rounded-lg border px-3 text-left text-sm font-semibold ${type === candidate ? "border-teal-400 bg-teal-400/10 text-teal-100" : rawOptions[candidate] ? "border-slate-700 text-slate-300 hover:border-slate-500" : "cursor-not-allowed border-slate-800 text-slate-600"}`}>{typeLabels[candidate]}{!premiumShareCards && candidate !== "weekly" && rawOptions[candidate] ? <span className="block pt-0.5 text-xs font-normal text-teal-300">Gold option</span> : !rawOptions[candidate] ? <span className="block pt-0.5 text-xs font-normal text-slate-600">No matching progress yet</span> : null}</button>)}</div></section>
        <fieldset className="rounded-2xl border border-slate-700 bg-[#101c2a] p-4"><legend className="px-1 text-sm font-semibold text-white">Include on card</legend><div className="mt-3 grid gap-2">{(Object.keys(fieldLabels) as ShareField[]).map((field) => <label key={field} className={`flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm ${!premiumShareCards && premiumFields.has(field) ? "cursor-pointer text-slate-500" : "cursor-pointer text-slate-300 hover:bg-slate-800/60"}`}><input type="checkbox" checked={effectiveFields[field]} onChange={() => updateField(field)} className="size-4 accent-teal-400" />{fieldLabels[field]}{!premiumShareCards && premiumFields.has(field) ? <span className="ml-auto text-xs text-teal-300">Gold</span> : null}</label>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">Username is off by default. Cards only use progress stored in this browser.</p></fieldset>
        <fieldset className="rounded-2xl border border-slate-700 bg-[#101c2a] p-4"><legend className="px-1 text-sm font-semibold text-white">Card size</legend><div className="mt-3 grid grid-cols-2 gap-2">{([ ["square", "Square 1:1"], ["portrait", "Portrait 4:5"] ] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold ${aspect === value ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-slate-700 text-slate-300"}`}><input className="sr-only" type="radio" name="share-aspect" value={value} checked={aspect === value} onChange={() => value === "portrait" && !premiumShareCards ? setUpgradeOpen(true) : setAspect(value)} />{label}{value === "portrait" && !premiumShareCards ? <span className="ml-1 text-teal-300">Gold</span> : null}</label>)}</div></fieldset>
      </aside>
      <section className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Preview</p><p className="mt-1 text-sm text-slate-400">This is exactly what will be saved.</p></div><button type="button" disabled={!card || !cardDataIsMeaningful(card, effectiveFields) || exportStatus === "exporting"} onClick={saveImage} className="min-h-11 rounded-lg bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{exportStatus === "exporting" ? "Preparing image…" : "Save image"}</button></div>
        {card && cardDataIsMeaningful(card, effectiveFields) ? <div className="mx-auto mt-5 max-w-[540px]"><ShareCard card={card} fields={effectiveFields} aspect={aspect} svgRef={svgRef} /></div> : <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.05] p-5"><h2 className="font-semibold text-amber-100">Choose at least one real data field.</h2><p className="mt-1 text-sm leading-6 text-slate-300">Turn a field back on, or pick a card type with activity to preview and export it.</p></div>}
        {exportStatus === "saved" ? <p className="mt-4 rounded-lg border-l-2 border-teal-400 bg-teal-400/[.07] p-3 text-sm text-teal-100" role="status">Your progress card was saved as a PNG image.</p> : null}
        {exportStatus === "error" ? <p className="mt-4 rounded-lg border-l-2 border-amber-300 bg-amber-300/[.08] p-3 text-sm text-amber-100" role="alert">FORGE could not create the image in this browser. Try again, or use a current desktop/mobile browser with image downloads enabled.</p> : null}
      </section>
    </div>}
  </div><UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Full share-card options" detail="FORGE Free includes a clean weekly recap. Gold adds milestone, Boss Project, and level-up cards, plus portrait formats and additional privacy fields." /></main>;
}
