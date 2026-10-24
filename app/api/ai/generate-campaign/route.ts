import { NextResponse } from "next/server";
import type { GeneratedCampaign, GeneratedLesson, GeneratedStage } from "../../../../lib/generatedCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const generationTimeoutMs = 295_000;
const upstreamAttemptTimeoutMs = 290_000;
const generationTimeoutMessage = "FORGE is taking longer than expected. Your setup is saved. Try again.";
const CAMPAIGN_MODEL = process.env.OPENROUTER_CAMPAIGN_MODEL?.trim() || "openrouter/free";
const CAMPAIGN_FALLBACK_MODEL = process.env.OPENROUTER_CAMPAIGN_FALLBACK_MODEL?.trim() || CAMPAIGN_MODEL;
const generationModels = [CAMPAIGN_MODEL, CAMPAIGN_FALLBACK_MODEL] as const;

type GenerationRequest = {
  goal?: unknown;
  currentLevel?: unknown;
  desiredOutcome?: unknown;
  weeklyTime?: unknown;
  learningStyle?: unknown;
  deadline?: unknown;
  adjustment?: unknown;
  previousCampaign?: unknown;
};

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const text = (value: unknown, limit = 500) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";

type ValidationIssue = {
  path: string;
  expected: string;
  received: string;
};

type CampaignValidation = {
  campaign: GeneratedCampaign | null;
  issues: ValidationIssue[];
  normalized: boolean;
};

type JsonExtraction = {
  value: unknown | null;
  parsed: boolean;
  source: "full" | "fenced" | "embedded" | "none";
};

const MAX_DIAGNOSTIC_ISSUES = 20;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const receivedType = (value: unknown) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const addIssue = (issues: ValidationIssue[], path: string, expected: string, value: unknown) => {
  if (issues.length < MAX_DIAGNOSTIC_ISSUES) issues.push({ path, expected, received: receivedType(value) });
};

const numeric = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const boundedInteger = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  const parsed = numeric(value);
  return Math.min(maximum, Math.max(minimum, Math.round(parsed ?? fallback)));
};

const arrayFrom = (value: unknown, keys: string[] = []) => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  if (!source) return [];
  for (const key of keys) if (Array.isArray(source[key])) return source[key] as unknown[];
  return [];
};

const firstText = (source: Record<string, unknown>, keys: string[], limit: number) => {
  for (const key of keys) {
    const value = text(source[key], limit);
    if (value) return value;
  }
  return "";
};

const slug = (value: string, fallback: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 56) || fallback;

const uniqueId = (proposed: string, usedIds: Set<string>) => {
  const base = slug(proposed, "item");
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
};

function normalizeDifficulty(value: unknown, isBoss: boolean): GeneratedLesson["difficulty"] {
  if (isBoss) return "boss";
  const raw = text(value, 30).toLowerCase();
  if (["easy", "beginner", "intro", "basic"].includes(raw)) return "easy";
  if (["hard", "advanced", "expert", "challenging"].includes(raw)) return "hard";
  return "standard";
}

function defaultXp(difficulty: GeneratedLesson["difficulty"]) {
  return difficulty === "boss" ? 260 : difficulty === "hard" ? 140 : difficulty === "easy" ? 80 : 100;
}

function lessonFrom(
  value: unknown,
  type: "lesson" | "boss",
  usedIds: Set<string>,
  stageIndex: number,
  lessonIndex: number,
  fallbackTitle = "",
): { lesson: GeneratedLesson; rawPrerequisites: string[] } | null {
  const source = record(value) ?? {};
  const title = firstText(source, ["title", "name", "label"], 120) || fallbackTitle;
  if (!title) return null;
  const difficulty = normalizeDifficulty(source.difficulty ?? source.level, type === "boss");
  const providedId = firstText(source, ["id", "lessonId", "slug"], 64);
  const id = uniqueId(providedId || `${type}-${stageIndex + 1}-${lessonIndex + 1}-${title}`, usedIds);
  const rawPrerequisites = arrayFrom(source.prerequisites ?? source.prerequisiteIds ?? source.requires)
    .map((item) => text(item, 64))
    .filter(Boolean);
  return {
    lesson: {
      id,
      title,
      description: firstText(source, ["description", "summary", "details"], 360) || `Practice ${title}.`,
      difficulty,
      estimatedMinutes: boundedInteger(source.estimatedMinutes ?? source.minutes ?? source.duration ?? source.estimatedTime, type === "boss" ? 45 : 30, 10, 120),
      xpReward: boundedInteger(source.xpReward ?? source.xp ?? source.reward, defaultXp(difficulty), 20, 500),
      type,
      prerequisites: [],
    },
    rawPrerequisites,
  };
}

function extractJson(value: string): JsonExtraction {
  const trimmed = value.trim();
  const candidates: Array<{ text: string; source: JsonExtraction["source"] }> = [{ text: trimmed, source: "full" }];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fenced)) candidates.push({ text: match[1].trim(), source: "fenced" });

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.text) as unknown;
      if (record(parsed)) return { value: parsed, parsed: true, source: candidate.source };
    } catch {
      // Fall through to the balanced-object scan below.
    }
  }

  for (let start = trimmed.indexOf("{"); start >= 0; start = trimmed.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < trimmed.length; end += 1) {
      const character = trimmed[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
            if (record(parsed)) return { value: parsed, parsed: true, source: "embedded" };
          } catch {
            // There may be another JSON object later in the response.
          }
          break;
        }
      }
    }
  }
  return { value: null, parsed: false, source: "none" };
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n");
  const source = record(value);
  if (!source) return "";
  return contentText(source.text ?? source.content ?? source.value);
}

function validateCampaign(value: unknown): CampaignValidation {
  const issues: ValidationIssue[] = [];
  const wrapper = record(value);
  const campaign = wrapper && record(wrapper.campaign) ? record(wrapper.campaign)! : wrapper;
  if (!campaign) {
    addIssue(issues, "campaign", "object", value);
    return { campaign: null, issues, normalized: false };
  }

  const title = firstText(campaign, ["title", "name", "campaignTitle"], 100);
  if (!title) {
    addIssue(issues, "title", "non-empty string", campaign.title);
    return { campaign: null, issues, normalized: false };
  }

  const rawStages = arrayFrom(campaign.stages ?? campaign.modules ?? campaign.phases ?? campaign.roadmap, ["stages", "modules", "phases", "items"]);
  if (!rawStages.length) {
    addIssue(issues, "stages", "array with at least one usable stage", campaign.stages);
    return { campaign: null, issues, normalized: false };
  }

  const usedIds = new Set<string>();
  const stages: GeneratedStage[] = [];
  rawStages.slice(0, 6).forEach((rawStage, stageIndex) => {
    const stage = record(rawStage);
    if (!stage) {
      addIssue(issues, `stages[${stageIndex}]`, "object", rawStage);
      return;
    }
    const stageTitle = firstText(stage, ["title", "name", "label"], 120);
    if (!stageTitle) {
      addIssue(issues, `stages[${stageIndex}].title`, "non-empty string", stage.title);
      return;
    }
    const stageId = uniqueId(firstText(stage, ["id", "stageId", "slug"], 64) || `stage-${stageIndex + 1}-${stageTitle}`, usedIds);
    const rawLessons = arrayFrom(stage.lessons ?? stage.modules ?? stage.activities ?? stage.items, ["lessons", "modules", "activities", "items"]);
    const candidateBoss = stage.bossProject ?? stage.boss ?? stage.capstone ?? stage.project;
    const bossInLessons = rawLessons.find((item) => {
      const source = record(item);
      const kind = text(source?.type ?? source?.difficulty, 30).toLowerCase();
      return kind === "boss" || kind === "project" || kind === "capstone";
    });
    const lessonSources = rawLessons.filter((item) => item !== bossInLessons).slice(0, 5);
    const lessonsWithSources = lessonSources
      .map((item, lessonIndex) => lessonFrom(item, "lesson", usedIds, stageIndex, lessonIndex))
      .filter((item): item is { lesson: GeneratedLesson; rawPrerequisites: string[] } => Boolean(item));
    if (!lessonsWithSources.length) {
      addIssue(issues, `stages[${stageIndex}].lessons`, "array with at least one lesson with a title", stage.lessons);
      return;
    }
    const sourceIds = new Map<string, string>();
    lessonSources.forEach((item, lessonIndex) => {
      const source = record(item);
      const sourceId = firstText(source ?? {}, ["id", "lessonId", "slug"], 64);
      const normalized = lessonsWithSources[lessonIndex];
      if (sourceId && normalized) sourceIds.set(sourceId, normalized.lesson.id);
    });
    const previousIds = new Set<string>();
    const lessons = lessonsWithSources.map(({ lesson, rawPrerequisites }) => {
      const prerequisites = rawPrerequisites
        .map((prerequisite) => sourceIds.get(prerequisite) ?? prerequisite)
        .filter((prerequisite) => previousIds.has(prerequisite));
      previousIds.add(lesson.id);
      return { ...lesson, prerequisites: Array.from(new Set(prerequisites)) };
    });
    const boss = lessonFrom(candidateBoss ?? bossInLessons, "boss", usedIds, stageIndex, lessons.length, `Apply ${stageTitle}`)?.lesson
      ?? lessonFrom({}, "boss", usedIds, stageIndex, lessons.length, `Apply ${stageTitle}`)?.lesson;
    if (!boss) return;
    stages.push({
      id: stageId,
      title: stageTitle,
      description: firstText(stage, ["description", "summary", "details"], 360) || `Build practical skill in ${stageTitle}.`,
      lessons,
      bossProject: boss,
    });
  });

  if (!stages.length) {
    if (!issues.length) addIssue(issues, "stages", "at least one usable stage", rawStages);
    return { campaign: null, issues, normalized: false };
  }

  return {
    campaign: {
      title,
      description: firstText(campaign, ["description", "summary", "overview"], 420) || `A focused path toward ${title}.`,
      estimatedWeeks: boundedInteger(campaign.estimatedWeeks ?? campaign.durationWeeks ?? campaign.weeks, Math.max(2, stages.length * 2), 1, 52),
      stages,
    },
    issues,
    normalized: true,
  };
}

function logValidation(event: string, details: Record<string, unknown>) {
  console.info("[FORGE Campaign Generator]", event, details);
}

type OpenRouterResponse = {
  status: number;
  body: string;
  elapsedMs: number;
};

async function requestCompletion(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs: number,
): Promise<OpenRouterResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.35, messages }),
    });
    return { status: response.status, body: await response.text(), elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json({ error: "Campaign forging is not configured on this deployment yet." }, 503);

  let input: GenerationRequest;
  try {
    input = (await request.json()) as GenerationRequest;
  } catch {
    return json({ error: "Please send a valid campaign brief." }, 400);
  }

  const goal = text(input.goal, 160);
  const currentLevel = text(input.currentLevel, 60);
  const desiredOutcome = text(input.desiredOutcome, 420);
  const weeklyTime = text(input.weeklyTime, 80);
  const learningStyle = text(input.learningStyle, 60);
  const deadline = text(input.deadline, 80);
  const adjustment = text(input.adjustment, 280);
  if (!goal || !currentLevel || !desiredOutcome || !weeklyTime || !learningStyle) {
    return json({ error: "Add your goal and personalization details before forging a campaign." }, 400);
  }

  const previousCampaign = validateCampaign(input.previousCampaign).campaign;
  const startedAt = Date.now();
  logValidation("request started", { configuredModel: CAMPAIGN_MODEL, fallbackConfigured: CAMPAIGN_FALLBACK_MODEL !== CAMPAIGN_MODEL });
  const messages = [
    {
      role: "system",
      content:
        "You design structured learning campaigns for FORGE. Return ONLY one valid JSON object: no Markdown fences, comments, prose, or text before or after it. Use exactly this shape: {\"title\":\"string\",\"description\":\"string\",\"estimatedWeeks\":4,\"stages\":[{\"id\":\"stage-1\",\"title\":\"string\",\"description\":\"string\",\"lessons\":[{\"id\":\"lesson-1\",\"title\":\"string\",\"description\":\"string\",\"difficulty\":\"easy\",\"estimatedMinutes\":30,\"xpReward\":80,\"type\":\"lesson\",\"prerequisites\":[]}],\"bossProject\":{\"id\":\"boss-1\",\"title\":\"string\",\"description\":\"string\",\"difficulty\":\"boss\",\"estimatedMinutes\":45,\"xpReward\":260,\"type\":\"boss\",\"prerequisites\":[]}}]}. Create 2 to 4 stages. Every stage needs 2 to 4 regular lessons plus one bossProject. All IDs must be unique simple kebab-case strings. Regular difficulty is only easy, standard, or hard; bossProject difficulty is boss. estimatedMinutes and xpReward must be JSON integers (not strings), within 10-120 and 20-500. A lesson prerequisite may only reference an earlier lesson in the same stage; the first lesson has []. Never mark progress complete or award progress.",
    },
    {
      role: "user",
      content: JSON.stringify({ goal, currentLevel, desiredOutcome, weeklyTime, learningStyle, deadline: deadline || null, adjustment: adjustment || null, previousCampaign: previousCampaign ?? null }),
    },
  ];

  let lastFailure = "Campaign forging is temporarily unavailable. Please try again.";
  let repairAttempted = false;
  for (const [attempt, model] of generationModels.entries()) {
    const remainingMs = generationTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) { lastFailure = generationTimeoutMessage; break; }
    const attemptBudgetMs = Math.min(upstreamAttemptTimeoutMs, remainingMs);
    try {
      const upstream = await requestCompletion(apiKey, model, messages, attemptBudgetMs);
      logValidation("upstream response", { attempt: attempt + 1, status: upstream.status, elapsedMs: upstream.elapsedMs, timeoutMs: attemptBudgetMs, configuredModel: model });
      if (upstream.status < 200 || upstream.status >= 300) {
        lastFailure = upstream.status === 429 ? "Campaign forging is rate-limited. Please try again shortly." : "The AI provider is temporarily unavailable. Please try again.";
        if (upstream.status >= 400 && upstream.status < 500) break;
        continue;
      }
      const parsingStartedAt = Date.now();
      let providerPayload: { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown } | null = null;
      try {
        providerPayload = JSON.parse(upstream.body) as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown };
      } catch {
        logValidation("provider envelope parse failed", { attempt: attempt + 1, parseSucceeded: false, parseElapsedMs: Date.now() - parsingStartedAt });
        lastFailure = "The AI provider returned an unreadable campaign response. Please try again.";
        continue;
      }
      const selectedModel = typeof providerPayload?.model === "string" ? providerPayload.model : model;
      const content = contentText(providerPayload?.choices?.[0]?.message?.content);
      const extracted = content ? extractJson(content) : { value: null, parsed: false, source: "none" as const };
      if (!extracted.parsed) {
        logValidation("campaign JSON extraction", { attempt: attempt + 1, parseSucceeded: false, hasChoices: Boolean(providerPayload?.choices?.length), hasMessageContent: Boolean(content), extractionSource: extracted.source, selectedModel, parseElapsedMs: Date.now() - parsingStartedAt });
        lastFailure = "The AI provider returned an unreadable campaign response. Please try again.";
        continue;
      }
      const validation = validateCampaign(extracted.value);
      logValidation("campaign validation", {
        attempt: attempt + 1,
        parseSucceeded: true,
        validationSucceeded: Boolean(validation.campaign),
        normalized: validation.normalized,
        extractionSource: extracted.source,
        issues: validation.issues,
        selectedModel,
        parseElapsedMs: Date.now() - parsingStartedAt,
        totalElapsedMs: Date.now() - startedAt,
      });
      if (validation.campaign) return json({ campaign: validation.campaign });
      lastFailure = "The AI provider returned a campaign plan FORGE could not validate. Please try again.";

      if (!repairAttempted) {
        repairAttempted = true;
        const repairRemainingMs = generationTimeoutMs - (Date.now() - startedAt);
        if (repairRemainingMs <= 0) { lastFailure = generationTimeoutMessage; break; }
        const repairMessages = [
          {
            role: "system",
            content: "Repair the supplied FORGE campaign JSON. Return ONLY corrected JSON, with no Markdown or explanation. Required shape: title:string, description:string, estimatedWeeks:integer, stages: array; every stage has id:string, title:string, description:string, lessons: non-empty array of lessons, and bossProject. Every lesson has id, title, description, difficulty (easy|standard|hard), estimatedMinutes integer 10-120, xpReward integer 20-500, type lesson, prerequisites array. bossProject uses difficulty boss, type boss, and prerequisites []. Keep the campaign's intent and lesson content; only repair its schema.",
          },
          {
            role: "user",
            content: JSON.stringify({ invalidCampaign: extracted.value, validationErrors: validation.issues }),
          },
        ];
        try {
          const repair = await requestCompletion(apiKey, model, repairMessages, Math.min(upstreamAttemptTimeoutMs, repairRemainingMs));
          logValidation("repair response", { attempt: attempt + 1, status: repair.status, elapsedMs: repair.elapsedMs, selectedModel });
          if (repair.status >= 200 && repair.status < 300) {
            let repairPayload: { choices?: Array<{ message?: { content?: unknown } }> } | null = null;
            try { repairPayload = JSON.parse(repair.body) as { choices?: Array<{ message?: { content?: unknown } }> }; } catch { repairPayload = null; }
            const repairedContent = contentText(repairPayload?.choices?.[0]?.message?.content);
            const repairedJson = repairedContent ? extractJson(repairedContent) : { value: null, parsed: false, source: "none" as const };
            const repairedValidation = repairedJson.parsed ? validateCampaign(repairedJson.value) : { campaign: null, issues: [{ path: "response", expected: "JSON object", received: "unreadable" }], normalized: false };
            logValidation("repair validation", { attempt: attempt + 1, parseSucceeded: repairedJson.parsed, validationSucceeded: Boolean(repairedValidation.campaign), extractionSource: repairedJson.source, issues: repairedValidation.issues });
            if (repairedValidation.campaign) return json({ campaign: repairedValidation.campaign });
          }
        } catch (repairError) {
          logValidation("repair request failed", { attempt: attempt + 1, timedOut: repairError instanceof Error && repairError.name === "AbortError" });
        }
      }
    } catch (error) {
      lastFailure = error instanceof Error && error.name === "AbortError" ? generationTimeoutMessage : "The AI provider could not be reached. Please try again.";
      logValidation("request failed", { attempt: attempt + 1, timedOut: error instanceof Error && error.name === "AbortError" });
      if (error instanceof Error && error.name === "AbortError") break;
    }
  }
  const status = lastFailure === generationTimeoutMessage ? 504 : lastFailure.includes("rate-limited") ? 429 : 502;
  return json({ error: lastFailure }, status);
}
