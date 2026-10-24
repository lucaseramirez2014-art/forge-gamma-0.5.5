"use client";

import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../lib/site";

export function PublicFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-slate-800 py-6 text-xs text-slate-500 ${className}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p>© 2026 RamirezLabs · FORGE</p>
        <nav aria-label="Legal and support" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/terms" className="hover:text-teal-200">Terms</Link>
          <Link href="/privacy" className="hover:text-teal-200">Privacy</Link>
          <a href={SUPPORT_MAILTO} className="hover:text-teal-200">Support <span className="sr-only">at {SUPPORT_EMAIL}</span></a>
        </nav>
      </div>
    </footer>
  );
}
