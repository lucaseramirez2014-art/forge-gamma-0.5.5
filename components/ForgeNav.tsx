"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useForge } from "./ForgeProvider";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/campaign", label: "Campaigns", icon: "campaign" },
  { href: "/progress", label: "Progress", icon: "progress" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/copilot", label: "Copilot", icon: "copilot" },
  { href: "/pricing", label: "Plans", icon: "pricing" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

type IconName = typeof links[number]["icon"] | "timer";
function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    campaign: <><path d="M4 19V5l14 4-14 4" /><path d="M8 13v6" /></>,
    progress: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    copilot: <><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M8 7V4m8 3V4M9 13h.01M15 13h.01M8 17h8" /></>,
    pricing: <><path d="M12 3v18M16 7.5c-.7-1-2-1.5-4-1.5-2.2 0-3.5 1.1-3.5 2.6 0 4.2 7 1.8 7 6 0 1.6-1.4 2.7-3.7 2.7-1.8 0-3.3-.6-4.2-1.7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.02 1.56v.08h-3v-.08A1.7 1.7 0 0 0 10.7 18.7a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.04 15a1.7 1.7 0 0 0-1.56-1.02H5.4v-3h.08A1.7 1.7 0 0 0 7.04 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.02-1.56V4.7h3v.08A1.7 1.7 0 0 0 15.74 6.3a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.02h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
    timer: <><circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 1.5M9 3h6M12 3v3" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">{paths[name]}</svg>;
}

export function ForgeNav() {
  const path = usePathname();
  const { data } = useForge();
  const hasSavedFocus = Boolean(data.activeFocusSession);
  return <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#081521]"><nav className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-5 sm:px-8"><Link href="/dashboard" className="flex shrink-0 items-center gap-2.5"><span className="grid size-8 place-items-center rounded-md bg-teal-400 text-sm font-black text-slate-950">F</span><span className="hidden text-sm font-bold tracking-[.2em] text-white sm:inline">FORGE</span></Link><div className="flex min-w-0 flex-1 justify-end gap-1 overflow-x-auto">{links.map((link) => <Link key={link.href} href={link.href} className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3 text-xs font-medium transition sm:px-3 ${path === link.href ? "border-teal-400 text-teal-200" : "border-transparent text-slate-400 hover:text-white"}`}><NavIcon name={link.icon} /><span>{link.label}</span></Link>)}</div>{hasSavedFocus ? <Link href="/focus" className="hidden items-center gap-1.5 rounded-lg bg-teal-400 px-3 py-2 text-xs font-bold text-slate-950 md:inline-flex"><NavIcon name="timer" />Resume</Link> : null}</nav></header>;
}
