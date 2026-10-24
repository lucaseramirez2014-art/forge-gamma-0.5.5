import Link from "next/link";
import { PublicFooter } from "./PublicFooter";

type LegalPageLayoutProps = {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, effectiveDate, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <header className="flex min-h-20 items-center justify-between border-b border-slate-800">
          <Link href="/" className="flex items-center gap-2.5" aria-label="FORGE home">
            <span className="grid size-9 place-items-center rounded-md bg-teal-400 font-black text-slate-950">F</span>
            <span className="text-sm font-bold tracking-[.22em] text-white">FORGE</span>
          </Link>
          <Link href="/" className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-teal-300 hover:text-white">Back to FORGE</Link>
        </header>
        <article className="mx-auto max-w-3xl py-12 sm:py-16" aria-labelledby="legal-page-title">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-300">RamirezLabs</p>
          <h1 id="legal-page-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-slate-400">Effective date: {effectiveDate}</p>
          <div className="mt-10 space-y-8 text-[15px] leading-7 text-slate-300 sm:text-base">{children}</div>
        </article>
        <PublicFooter />
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5 marker:text-teal-300">{children}</ul>;
}
