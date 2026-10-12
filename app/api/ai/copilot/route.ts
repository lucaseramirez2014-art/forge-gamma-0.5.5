import { NextResponse } from "next/server";
import { readCopilotActions, type CopilotAction } from "../../../../lib/copilotActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopilotRequest = {
  message?: unknown;
  history?: unknown;
  forgeContext?: unknown;
  currentCampaign?: unknown;
  currentStage?: unknown;
  completedLessons?: unknown;
  xp?: unknown;
  level?: unknown;
  userGoal?: unknown;
};

type CopilotReply = { reply: string; recommendedLesson: string | null; reason: string; actions: CopilotAction[] };
type ChatMessage = { role: "user" | "assistant"; content: string };
const COPILOT_MODEL = process.env.OPENROUTER_COPILOT_MODEL?.trim() || "openrouter/free";
type ForgeProgress = {
  currentCampaign: string;
  currentStage: string;
  completedLessons: string[];
  availableLessons: string[];
  xp: number;
  level: number;
  streak: number;
  stats: Record<string, number>;
  activeGoals: string[];
  editor: Record<string, unknown> | null;
};

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim().slice(0, 1200) : fallback;
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
const strings = (value: unknown, limit = 30) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, limit)
    : [];

function readHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null,
      content: text(item.content, "").slice(0, 1200),
    }))
    .filter((item): item is ChatMessage => Boolean(item.role && item.content))
    .slice(-12);
}

function readStats(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, stat]) => typeof stat === "number" && Number.isFinite(stat))
      .slice(0, 12)
      .map(([label, stat]) => [label.slice(0, 80), Math.max(0, stat as number)]),
  );
}

function readForgeProgress(value: unknown): ForgeProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const progress = value as Record<string, unknown>;

  const rawEditor = progress.editor;
  const editor = rawEditor && typeof rawEditor === "object" && !Array.isArray(rawEditor) ? rawEditor as Record<string, unknown> : null;
  return {
    currentCampaign: text(progress.currentCampaign, "No campaign selected") || "No campaign selected",
    currentStage: text(progress.currentStage, "No stage selected") || "No stage selected",
    completedLessons: strings(progress.completedLessons),
    availableLessons: strings(progress.availableLessons),
    xp: number(progress.xp),
    level: number(progress.level, 1),
    streak: number(progress.streak),
    stats: readStats(progress.stats),
    activeGoals: strings(progress.activeGoals, 10),
    editor,
  };
}

function readReply(content: string): { result: CopilotReply; parsed: boolean } {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned) as Partial<CopilotReply>;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) return { result: { reply: parsed.reply.trim().slice(0, 800), recommendedLesson: typeof parsed.recommendedLesson === "string" && parsed.recommendedLesson.trim() ? parsed.recommendedLesson.trim().slice(0, 160) : null, reason: typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 400) : "", actions: readCopilotActions(parsed.actions) }, parsed: true };
  } catch { /* Plain text is a valid Copilot fallback. */ }
  return { result: { reply: cleaned.slice(0, 1200), recommendedLesson: null, reason: "", actions: [] }, parsed: false };
}

function editableStage(progress: ForgeProgress | null) {
  const editor = progress?.editor;
  const campaignId = text(editor?.campaignId, "");
  const stages = Array.isArray(editor?.stages) ? editor.stages.filter((stage): stage is Record<string, unknown> => Boolean(stage) && typeof stage === "object") : [];
  const stage = stages.find((item) => item.status === "available") ?? stages.find((item) => item.status === "locked");
  if (!stage) return null;
  const stageId = text(stage?.id, "");
  return campaignId && stageId ? { campaignId, stageId, stage } : null;
}

function titleCase(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 8).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function inferredActions(message: string, progress: ForgeProgress | null, history: ChatMessage[]): CopilotAction[] {
  const target = editableStage(progress);
  if (!target) return [];
  const lower = message.toLowerCase();
  const minutes = Number(lower.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/)?.[1] ?? 30);
  if (/\b(add|create)\b/.test(lower) && /\blesson\b/.test(lower)) {
    const topic = (lower.match(/(?:about|on)\s+(.+?)(?:\s+(?:to|in|for)\b|[.!?]|$)/)?.[1] ?? "a focused practice").replace(/\b(current|my)\s+stage\b/g, "").trim();
    const title = titleCase(topic) || "Focused Practice";
    return [{ type: "createLesson", campaignId: target.campaignId, stageId: target.stageId, payload: { title: title.endsWith("Basics") ? title : `${title} Basics`, description: `Practice ${topic || "the requested skill"} in a focused session.`, difficulty: "standard", estimatedMinutes: Math.min(120, Math.max(10, minutes)), xpReward: minutes >= 45 ? 140 : 100 } }];
  }
  if (/\b(harder|increase difficulty|more difficult)\b/.test(lower)) {
    const previousTopic = [...history].reverse().find((item) => item.role === "user" && /(?:about|on)\s+(.+)/i.test(item.content))?.content.toLowerCase().match(/(?:about|on)\s+(.+?)(?:\s+(?:to|in|for)\b|[.!?]|$)/)?.[1];
    const lessons = Array.isArray(target.stage.lessons) ? target.stage.lessons.filter((lesson): lesson is Record<string, unknown> => Boolean(lesson) && typeof lesson === "object") : [];
    const lesson = lessons.find((item) => previousTopic && text(item.title, "").toLowerCase().includes(previousTopic.trim())) ?? lessons.find((item) => item.status !== "completed" && item.status !== "active");
    const lessonId = text(lesson?.id, "");
    if (lessonId) return [{ type: "adjustDifficulty", campaignId: target.campaignId, stageId: target.stageId, lessonId, payload: { difficulty: "hard" } }];
  }
  return [];
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json({ error: "Copilot is not configured on this deployment yet." }, 503);

  let input: CopilotRequest;
  try { input = await request.json() as CopilotRequest; } catch { return json({ error: "Please send a valid JSON request." }, 400); }

  const message = text(input.message);
  if (!message) return json({ error: "Enter a question for the Copilot." }, 400);
  const hasLegacyProgress = [
    input.currentCampaign,
    input.currentStage,
    input.completedLessons,
    input.xp,
    input.level,
  ].some((value) => value !== undefined);
  const legacyProgress = hasLegacyProgress
    ? readForgeProgress({
        currentCampaign: input.currentCampaign,
        currentStage: input.currentStage,
        completedLessons: input.completedLessons,
        xp: input.xp,
        level: input.level,
      })
    : null;
  const forgeProgress = readForgeProgress(input.forgeContext) ?? legacyProgress;
  const history = readHistory(input.history);
  const userGoal = text(input.userGoal);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: COPILOT_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are FORGE Copilot, a concise productivity and learning guide inside FORGE. Be useful in a conversation, referring to recent messages when relevant. If editable campaign context is supplied and the user explicitly asks to change it, you may propose actions only; never claim they are applied. Never alter completed lessons, XP, status, or unlocking. Return ONLY valid JSON: {\"reply\":string,\"recommendedLesson\":string|null,\"reason\":string,\"actions\":[{\"type\":\"createLesson\"|\"editLesson\"|\"deleteFutureLesson\"|\"reorderFutureLesson\"|\"createStage\"|\"editStage\"|\"addBossProject\"|\"adjustDifficulty\"|\"adjustEstimatedMinutes\"|\"adjustXPReward\"|\"regenerateFutureStage\",\"campaignId\":string,\"stageId\":string,\"lessonId\":string?,\"payload\":object}]}. Use actions:[] unless the user requested an edit and an editor context is supplied. For lessons, payload needs title, description, difficulty easy|standard|hard, estimatedMinutes 10-120, xpReward 20-500. Use IDs from editor context exactly.",
          },
          ...(forgeProgress
            ? [{ role: "system", content: `Opt-in FORGE progress (use as facts only): ${JSON.stringify(forgeProgress)}` }]
            : []),
          ...history,
          { role: "user", content: userGoal ? `${message}\n\nUser goal: ${userGoal}` : message },
        ],
      }),
    });
    if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] OpenRouter status", response.status);
    if (!response.ok) {
      if (response.status === 429) return json({ error: "Copilot is busy right now. Please try again shortly." }, 429);
      return json({ error: "Copilot is temporarily unavailable. Please try again." }, 502);
    }
    const rawBody = await response.text();
    if (!rawBody.trim()) return json({ error: "Copilot returned no response. Please try again." }, 502);
    let payload: { choices?: Array<{ message?: { content?: unknown } }> } | null = null;
    try { payload = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: unknown } }> }; } catch { /* Fall back to the non-empty provider body below. */ }
    const content = payload?.choices?.[0]?.message?.content;
    const modelText = typeof content === "string" ? content : "";
    if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] choices", Boolean(payload?.choices?.length), "message.content", Boolean(modelText.trim()));
    if (payload && !modelText.trim()) return json({ error: "Copilot returned no response content. Please try again." }, 502);
    const parsed = readReply(modelText || rawBody);
    const actions = parsed.result.actions.length ? parsed.result.actions : inferredActions(message, forgeProgress, history);
    if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] structured JSON parsed", parsed.parsed, "actions received", actions.length, "inferred", !parsed.result.actions.length && actions.length > 0);
    return json({ ...parsed.result, actions });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json({ error: "Copilot took too long to respond. Please try again." }, 504);
    return json({ error: "Copilot could not be reached. Please try again." }, 502);
  } finally { clearTimeout(timeout); }
}
