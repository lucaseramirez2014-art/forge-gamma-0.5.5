"use client";

import { ChangeEvent, useRef, useState } from "react";
import { useForge } from "./ForgeProvider";

export function ProgressControls() {
  const { exportData, importData, resetProgress } = useForge();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  function exportBackup() {
    const url = URL.createObjectURL(new Blob([exportData()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "forge-v0-3-3-delta-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  }

  function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setMessage(typeof reader.result === "string" && importData(reader.result) ? "Backup restored." : "That file is not a valid FORGE backup.");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  return (
    <section className="border-y border-slate-700 py-5">
      <h2 className="font-semibold text-white">Your local data</h2>
      <p className="mt-2 text-sm text-slate-400">Export a backup before moving browsers or resetting the beta.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={exportBackup} className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-teal-300">
          Export backup
        </button>
        <button onClick={() => input.current?.click()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-teal-300">
          Import backup
        </button>
        <button onClick={() => { if (window.confirm("Reset all local FORGE progress? This cannot be undone unless you exported a backup.")) { resetProgress(); setMessage("FORGE has been reset."); } }} className="rounded-lg border border-red-400/30 px-3 py-2 text-sm font-semibold text-red-300 hover:border-red-300">
          Reset all progress
        </button>
        <input ref={input} type="file" accept="application/json" className="hidden" onChange={restore} />
      </div>
      {message ? <p className="mt-3 text-xs text-slate-400">{message}</p> : null}
    </section>
  );
}
