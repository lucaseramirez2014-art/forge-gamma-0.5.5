"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { actionSummary, readCopilotActions, type CopilotAction } from "../lib/copilotActions";
import { trackForgeEvent } from "../lib/analytics";
import type { LimitDecision } from "../lib/plans";

export type ForgeProgressContext = {
  currentCampaign: string;
  currentStage: string;
  completedLessons: string[];
  availableLessons: string[];
  xp: number;
  level: number;
  streak: number;
  stats: Record<string, number>;
  activeGoals: string[];
  editor?: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendedLesson?: string | null;
  reason?: string;
  actions?: CopilotAction[];
  actionStatus?: "applied" | "dismissed";
};

type CopilotResponse = {
  reply: string;
  recommendedLesson: string | null;
  reason: string;
  actions?: CopilotAction[];
  error?: string;
};

const threadStorageKey = "forge-copilot-v1-thread";
const progressStorageKey = "forge-copilot-v1-use-progress";
const starterPrompts = [
  "What should I work on today?",
  "Help me plan a 30-minute session.",
  "Explain my current campaign.",
  "Help me break down a goal.",
  "What skill should I focus on next?",
];

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    Boolean(message.content.trim()) &&
    (message.actionStatus === undefined || message.actionStatus === "applied" || message.actionStatus === "dismissed")
  );
}

function messageId(role: ChatMessage["role"]) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CopilotChat({ forgeContext, onApplyActions, beforeSend, onLimitReached }: { forgeContext: ForgeProgressContext; onApplyActions: (actions: CopilotAction[]) => { ok: boolean; error?: string }; beforeSend: () => LimitDecision; onLimitReached: (message: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [useForgeProgress, setUseForgeProgress] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFailedMessage, setLastFailedMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const applyingActions = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedThread = window.localStorage.getItem(threadStorageKey);
        if (storedThread) {
          const parsed = JSON.parse(storedThread) as unknown;
          if (Array.isArray(parsed)) setMessages(parsed.filter(isChatMessage).map((message) => ({ ...message, actions: readCopilotActions(message.actions) })).slice(-24));
        }
        const storedToggle = window.localStorage.getItem(progressStorageKey);
        if (storedToggle === "false") setUseForgeProgress(false);
      } catch {
        window.localStorage.removeItem(threadStorageKey);
      } finally {
        setHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(threadStorageKey, JSON.stringify(messages.slice(-24)));
    window.localStorage.setItem(progressStorageKey, String(useForgeProgress));
  }, [hydrated, messages, useForgeProgress]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
  }, [loading, messages]);

  function startNewChat() {
    if (loading) return;
    setMessages([]);
    setDraft("");
    setError("");
    setLastFailedMessage("");
    inputRef.current?.focus();
  }

  async function send(retryMessage = "") {
    const content = (retryMessage || draft).trim();
    if (!content || loading) return;
    const access = beforeSend();
    if (!access.ok) { setError(access.message || "Copilot is unavailable right now."); onLimitReached(access.message || "Copilot is unavailable right now."); return; }

    const userMessage: ChatMessage = { id: messageId("user"), role: "user", content };
    const priorMessages = messages.slice(-12);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setLastFailedMessage("");
    setLoading(true);
    trackForgeEvent("copilot_used", { usesForgeProgress: useForgeProgress });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: priorMessages.map(({ role, content: historyContent }) => ({ role, content: historyContent })),
          ...(useForgeProgress ? { forgeContext } : {}),
        }),
      });
      const rawBody = await response.text();
      let body: CopilotResponse = { reply: "", recommendedLesson: null, reason: "" };
      try { body = JSON.parse(rawBody) as CopilotResponse; } catch { /* Use the friendly fallback below. */ }
      if (!response.ok || !body.reply) throw new Error(body.error || "Copilot could not respond.");

      setMessages((current) => [
        ...current,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: body.reply,
          recommendedLesson: body.recommendedLesson,
          reason: body.reason,
          actions: readCopilotActions(body.actions),
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.name === "AbortError" ? "Copilot took too long to respond. Please try again." : requestError instanceof Error && requestError.message ? requestError.message : "Copilot could not respond. Please try again.");
      setLastFailedMessage(content);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }
  function apply(message: ChatMessage) {
    if (applyingActions.current.has(message.id)) return;
    applyingActions.current.add(message.id);
    setApplyingMessageId(message.id);
    const actions = message.actions ?? [];
    window.setTimeout(() => {
      const result = onApplyActions(actions);
      if (result.ok) {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, actions: [], actionStatus: "applied" } : item));
      } else {
        applyingActions.current.delete(message.id);
        setError(result.error || "FORGE could not apply those changes.");
      }
      setApplyingMessageId(null);
    }, 0);
  }
  function dismissActions(messageId: string) {
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, actions: [], actionStatus: "dismissed" } : item));
  }

  return (
    <section className="forge-view border border-slate-700 bg-[#101c2a]" aria-labelledby="copilot-title">
      <header className="flex flex-col gap-4 border-b border-slate-700/80 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">FORGE Copilot · beta</p>
          <h1 id="copilot-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">Plan your next move.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">An optional thinking partner. It can draft campaign edits, but only you can confirm them—and never to completed progress.</p>
        </div>
        <button type="button" onClick={startNewChat} disabled={loading} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-teal-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
          New chat
        </button>
      </header>

      <div className="border-b border-slate-700/80 px-5 py-4 sm:px-6">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-l-2 border-teal-400 bg-slate-900/50 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-slate-100">Use my FORGE progress</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-400">Share your campaign, lessons, XP, streak, stats, and saved goals with Copilot.</span>
          </span>
          <input
            type="checkbox"
            checked={useForgeProgress}
            onChange={(event) => setUseForgeProgress(event.target.checked)}
            className="size-4 accent-teal-400"
            aria-label="Use my FORGE progress"
          />
        </label>
      </div>

      <div className="min-h-[360px] max-h-[58vh] space-y-4 overflow-y-auto p-5 sm:p-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-4">
            <p className="text-sm leading-6 text-slate-400">Start a conversation for a recommendation, a plan, or a clearer next step.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => { setDraft(prompt); inputRef.current?.focus(); }} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-left text-xs font-medium text-slate-300 transition hover:border-teal-400/50 hover:text-teal-100">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "forge-reveal ml-auto max-w-[88%] rounded-lg bg-teal-400 px-4 py-3 text-sm text-slate-950" : "forge-reveal mr-auto max-w-[88%] border-l-2 border-slate-600 bg-slate-900/70 px-4 py-3 text-sm text-slate-100"}>
              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
              {message.role === "assistant" && message.actionStatus === "applied" ? <p className="forge-success-flash mt-3 border-t border-teal-400/20 pt-3 text-xs font-semibold text-teal-200">✓ Campaign change applied and saved. Your campaign is updated now.</p> : null}
              {message.role === "assistant" && message.actionStatus === "dismissed" ? <p className="mt-3 border-t border-slate-700 pt-3 text-xs text-slate-400">Suggested change dismissed.</p> : null}
              {message.role === "assistant" && message.recommendedLesson ? <p className="mt-3 border-t border-slate-700 pt-3 text-xs font-semibold text-teal-200">Recommended lesson · {message.recommendedLesson}</p> : null}
              {message.role === "assistant" && message.reason ? <p className="mt-2 text-xs leading-5 text-slate-400">{message.reason}</p> : null}
              {message.role === "assistant" && message.actions?.length ? <div className="forge-reveal mt-4 rounded-xl border border-teal-400/20 bg-teal-400/[.05] p-3"><p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-200">Copilot wants to make these changes</p><p className="mt-1 text-xs leading-5 text-slate-400">Nothing changes until you apply this preview. Completed progress is protected.</p><ul className="mt-2 space-y-1.5 text-xs text-slate-300">{message.actions.map((action, index) => <li key={`${action.type}-${index}`}>• {actionSummary(action)}{typeof action.payload?.estimatedMinutes === "number" ? ` · ${action.payload.estimatedMinutes} min` : ""}{typeof action.payload?.xpReward === "number" ? ` · +${action.payload.xpReward} XP` : ""}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={applyingMessageId === message.id} onClick={() => apply(message)} className="rounded-lg bg-teal-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-teal-300 disabled:cursor-wait disabled:opacity-60">{applyingMessageId === message.id ? "Applying…" : "Apply changes"}</button><button type="button" disabled={applyingMessageId === message.id} onClick={() => { setDraft("Please revise the proposed campaign changes: "); inputRef.current?.focus(); }} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-teal-300 disabled:opacity-50">Edit request</button><button type="button" disabled={applyingMessageId === message.id} onClick={() => dismissActions(message.id)} className="rounded-lg px-2 py-2 text-xs font-medium text-slate-400 hover:text-white disabled:opacity-50">Cancel</button></div></div> : null}
            </article>
          ))
        )}
        {loading ? <div className="forge-reveal mr-auto inline-flex items-center gap-2 border-l-2 border-teal-400 bg-slate-900/70 px-4 py-3 text-sm text-slate-300"><span className="forge-spinner" aria-hidden="true" /><span>Copilot is thinking<span aria-hidden="true"><span className="forge-typing-dot">.</span><span className="forge-typing-dot">.</span><span className="forge-typing-dot">.</span></span></span></div> : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-slate-700/80 p-5 sm:p-6">
        {error ? <div className="mb-3 border-l-2 border-red-400 bg-red-400/10 p-3 text-sm text-red-200" role="alert"><p>{error}</p><p className="mt-1 text-xs text-slate-300">Your campaign and progress are still available.</p>{lastFailedMessage ? <button type="button" onClick={() => void send(lastFailedMessage)} disabled={loading} className="mt-3 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold text-red-100 hover:border-red-200 disabled:opacity-50">Try again</button> : null}</div> : null}
        <label className="sr-only" htmlFor="copilot-message">Message FORGE Copilot</label>
        <textarea ref={inputRef} id="copilot-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={1200} rows={3} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" placeholder="Ask about your next step…" />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">Press ⌘/Ctrl + Enter to send</p>
          <button disabled={loading || !draft.trim()} className="rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-[#101c2a] disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
