import type { Campaign, CampaignWorld, ForgeData, Quest, QuestDifficulty } from "./types";

export const copilotActionTypes = ["createLesson", "editLesson", "deleteFutureLesson", "reorderFutureLesson", "createStage", "editStage", "addBossProject", "adjustDifficulty", "adjustEstimatedMinutes", "adjustXPReward", "regenerateFutureStage"] as const;
export type CopilotActionType = typeof copilotActionTypes[number];
export type LessonDraft = { title: string; description: string; difficulty: "easy" | "standard" | "hard"; estimatedMinutes: number; xpReward: number };
export type CopilotAction = { type: CopilotActionType; campaignId: string; stageId?: string; lessonId?: string; payload?: Record<string, unknown> };
export type ApplyResult = { ok: true; data: ForgeData; summaries: string[] } | { ok: false; error: string };

const text = (value: unknown, limit = 180) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
const difficulty = (value: unknown): QuestDifficulty | null => ({ easy: "Easy", standard: "Standard", medium: "Standard", hard: "Hard", boss: "Boss" }[text(value, 16).toLowerCase()] as QuestDifficulty | undefined) ?? null;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const mutable = (quest: Quest) => quest.status !== "completed" && quest.status !== "active" && quest.xpEarned === 0;

export function readCopilotActions(value: unknown): CopilotAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const action = item as Record<string, unknown>;
    const type = text(action.type, 40) as CopilotActionType;
    const campaignId = text(action.campaignId, 120);
    const stageId = text(action.stageId, 120) || undefined;
    const lessonId = text(action.lessonId, 120) || undefined;
    if (!copilotActionTypes.includes(type) || !campaignId) return [];
    return [{ type, campaignId, stageId, lessonId, payload: action.payload && typeof action.payload === "object" && !Array.isArray(action.payload) ? action.payload as Record<string, unknown> : {} }];
  });
}

export function actionSummary(action: CopilotAction) {
  const title = text(action.payload?.title, 100);
  const names: Record<CopilotActionType, string> = { createLesson: "Add lesson", editLesson: "Edit lesson", deleteFutureLesson: "Remove future lesson", reorderFutureLesson: "Reorder future lessons", createStage: "Create stage", editStage: "Edit future stage", addBossProject: "Add Boss Project", adjustDifficulty: "Adjust lesson difficulty", adjustEstimatedMinutes: "Adjust lesson duration", adjustXPReward: "Adjust lesson XP", regenerateFutureStage: "Regenerate future stage" };
  return `${names[action.type]}${title ? ` · ${title}` : ""}`;
}

function resolve(quests: Quest[], activeId: string | null) {
  return quests.map((quest) => {
    if (quest.status === "completed" || quest.status === "archived") return quest;
    if (quest.id === activeId) return { ...quest, status: "active" as const };
    return { ...quest, status: quest.prerequisites.every((prerequisite) => quests.find((item) => item.id === prerequisite)?.status === "completed") ? "available" as const : "locked" as const };
  });
}
function resolveWorlds(quests: Quest[], worlds: CampaignWorld[]) {
  return worlds.map((world) => {
    const boss = quests.find((quest) => quest.id === world.bossQuestId);
    const scoped = quests.filter((quest) => quest.worldId === world.id);
    return { ...world, status: boss?.status === "completed" ? "completed" as const : scoped.some((quest) => ["available", "active", "completed"].includes(quest.status)) ? "available" as const : "locked" as const };
  });
}
function progress(campaigns: Campaign[], quests: Quest[], worlds: CampaignWorld[]) {
  return campaigns.map((campaign) => {
    const scoped = quests.filter((quest) => quest.campaignId === campaign.id && quest.status !== "archived");
    const completed = scoped.filter((quest) => quest.status === "completed").length;
    const current = worlds.filter((world) => world.campaignId === campaign.id).sort((a, b) => a.order - b.order).find((world) => world.status === "available");
    return { ...campaign, completed, total: scoped.length, progress: scoped.length ? Math.round(completed / scoped.length * 100) : 0, stage: current?.title ?? campaign.stage, level: current?.title ?? campaign.level };
  });
}
function stage(data: ForgeData, action: CopilotAction) {
  const campaign = data.campaigns.find((item) => item.id === action.campaignId);
  const world = data.worlds.find((item) => item.id === action.stageId && item.campaignId === action.campaignId);
  return campaign && world ? { campaign, world } : null;
}
function draft(value: Record<string, unknown> | undefined): LessonDraft | null {
  const title = text(value?.title); const description = text(value?.description, 360); const itemDifficulty = difficulty(value?.difficulty);
  const estimatedMinutes = integer(value?.estimatedMinutes, 10, 120); const xpReward = integer(value?.xpReward, 20, 500);
  return title && description && itemDifficulty && itemDifficulty !== "Boss" && estimatedMinutes !== null && xpReward !== null ? { title, description, difficulty: itemDifficulty.toLowerCase() as LessonDraft["difficulty"], estimatedMinutes, xpReward } : null;
}
function questFromDraft(source: LessonDraft, campaignId: string, worldId: string, prerequisites: string[]): Quest {
  const mappedDifficulty = difficulty(source.difficulty) ?? "Standard";
  return { id: id("copilot-lesson"), campaignId, worldId, title: source.title, description: source.description, difficulty: mappedDifficulty, estimatedMinutes: source.estimatedMinutes, xpReward: source.xpReward, status: "locked", prerequisites, statRewards: { Learning: mappedDifficulty === "Hard" ? 3 : 2, Discipline: 2 }, focusPrompt: source.description, focusSeconds: 0, xpEarned: 0, statEarned: {} };
}
function bossFromDraft(source: LessonDraft, campaignId: string, worldId: string, prerequisites: string[]): Quest {
  return { ...questFromDraft({ ...source, difficulty: "hard" }, campaignId, worldId, prerequisites), id: id("copilot-boss"), title: source.title.startsWith("Boss:") ? source.title : `Boss: ${source.title}`, difficulty: "Boss", xpReward: Math.max(100, source.xpReward) };
}
function bossDraft(value: unknown): LessonDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  return draft({ ...payload, difficulty: "hard" });
}
function stagePlan(payload: Record<string, unknown>) {
  const title = text(payload.title); const description = text(payload.description, 360);
  const lessons = Array.isArray(payload.lessons) ? payload.lessons.map((item) => item && typeof item === "object" ? draft(item as Record<string, unknown>) : null).filter((item): item is LessonDraft => Boolean(item)).slice(0, 5) : [];
  const boss = bossDraft(payload.bossProject);
  return title && description && lessons.length && boss ? { title, description, lessons, boss } : null;
}

export function applyCopilotActions(data: ForgeData, actions: CopilotAction[]): ApplyResult {
  if (!actions.length) return { ok: false, error: "There are no valid campaign changes to apply." };
  let quests = data.quests.map((quest) => ({ ...quest, prerequisites: [...quest.prerequisites] }));
  let worlds = data.worlds.map((world) => ({ ...world }));
  let campaigns = data.campaigns.map((campaign) => ({ ...campaign }));
  const summaries: string[] = [];
  for (const action of actions) {
    const campaign = campaigns.find((item) => item.id === action.campaignId);
    if (!campaign) return { ok: false, error: "That change references a campaign that no longer exists." };
    // Keep shipped campaign paths additive until their content can be versioned.
    // This prevents a destructive AI rewrite from partially restoring on reload.
    if (!campaign.generated && ["deleteFutureLesson", "reorderFutureLesson", "regenerateFutureStage"].includes(action.type)) {
      return { ok: false, error: "FORGE keeps starter campaign structure fixed for now. Copilot can add a lesson or edit a future lesson instead." };
    }
    if (action.type === "createStage") {
      const plan = stagePlan(action.payload ?? {});
      if (!plan) return { ok: false, error: "A new stage needs a title, description, at least one lesson, and a Boss Project." };
      const previous = worlds.filter((world) => world.campaignId === action.campaignId).sort((a, b) => a.order - b.order).at(-1);
      const previousBoss = previous ? quests.find((quest) => quest.id === previous.bossQuestId) : null;
      const worldId = id("copilot-stage"); const regular: Quest[] = [];
      plan.lessons.forEach((item, index) => regular.push(questFromDraft(item, action.campaignId, worldId, index === 0 && previousBoss ? [previousBoss.id] : index ? [regular[index - 1].id] : [])));
      const boss = bossFromDraft(plan.boss, action.campaignId, worldId, [regular.at(-1)!.id]);
      worlds.push({ id: worldId, campaignId: action.campaignId, title: plan.title, subtitle: `Stage ${(previous?.order ?? 0) + 1}`, description: plan.description, order: (previous?.order ?? 0) + 1, bossQuestId: boss.id, status: "locked" });
      quests.push(...regular, boss); summaries.push(actionSummary(action)); continue;
    }
    const target = stage({ ...data, quests, worlds, campaigns }, action);
    if (!target) return { ok: false, error: "That change references a campaign or stage that no longer exists." };
    const stageQuests = quests.filter((quest) => quest.worldId === target.world.id);
    const lesson = action.lessonId ? quests.find((quest) => quest.id === action.lessonId && quest.campaignId === action.campaignId) : null;
    const payload = action.payload ?? {};
    if (action.type === "editStage") {
      if (target.world.status !== "locked") return { ok: false, error: "Only future stages can be edited." };
      const title = payload.title === undefined ? target.world.title : text(payload.title);
      const description = payload.description === undefined ? target.world.description : text(payload.description, 360);
      if (!title || !description) return { ok: false, error: "That stage needs a valid title and description." };
      worlds = worlds.map((world) => world.id === target.world.id ? { ...world, title, description } : world); summaries.push(actionSummary(action)); continue;
    }
    if (action.type === "regenerateFutureStage") {
      const plan = stagePlan(payload);
      if (target.world.status !== "locked" || !plan || stageQuests.some((quest) => !mutable(quest))) return { ok: false, error: "Only an untouched future stage with a complete replacement plan can be regenerated." };
      const oldBossId = target.world.bossQuestId; const oldFirst = stageQuests.find((quest) => quest.difficulty !== "Boss"); const external = oldFirst?.prerequisites.filter((prerequisite) => !stageQuests.some((quest) => quest.id === prerequisite)) ?? []; const regular: Quest[] = [];
      plan.lessons.forEach((item, index) => regular.push(questFromDraft(item, action.campaignId, target.world.id, index ? [regular[index - 1].id] : external)));
      const boss = bossFromDraft(plan.boss, action.campaignId, target.world.id, [regular.at(-1)!.id]);
      quests = quests.filter((quest) => quest.worldId !== target.world.id).map((quest) => ({ ...quest, prerequisites: quest.prerequisites.map((prerequisite) => prerequisite === oldBossId ? boss.id : prerequisite) }));
      quests.push(...regular, boss);
      worlds = worlds.map((world) => world.id === target.world.id ? { ...world, title: plan.title, description: plan.description, bossQuestId: boss.id } : world);
      summaries.push(actionSummary(action)); continue;
    }
    if (action.type === "addBossProject") {
      if (target.world.status !== "locked" || stageQuests.some((quest) => quest.difficulty === "Boss")) return { ok: false, error: "A Boss Project can only be added to a future stage that does not already have one." };
      const next = bossDraft(payload); const previous = stageQuests.filter((quest) => quest.difficulty !== "Boss").at(-1);
      if (!next || !previous) return { ok: false, error: "The Boss Project needs valid details and at least one prior lesson." };
      const boss = bossFromDraft(next, action.campaignId, target.world.id, [previous.id]); quests.push(boss); worlds = worlds.map((world) => world.id === target.world.id ? { ...world, bossQuestId: boss.id } : world); summaries.push(actionSummary(action)); continue;
    }
    if (action.type === "createLesson") {
      const next = draft(payload); if (!next || target.world.status === "completed") return { ok: false, error: "The new lesson needs a valid title, description, duration, difficulty, and XP reward." };
      const regular = stageQuests.filter((quest) => quest.difficulty !== "Boss"); const previous = regular.at(-1);
      const created = questFromDraft(next, action.campaignId, target.world.id, previous ? [previous.id] : []);
      const boss = stageQuests.find((quest) => quest.difficulty === "Boss");
      quests.push(created);
      if (boss) quests = quests.map((quest) => quest.id === boss.id ? { ...quest, prerequisites: [created.id] } : quest);
      summaries.push(actionSummary(action)); continue;
    }
    if (!lesson || lesson.worldId !== target.world.id) return { ok: false, error: "That change references a lesson that no longer exists in this stage." };
    if (!mutable(lesson)) return { ok: false, error: "Completed or active lessons cannot be changed by Copilot." };
    if (action.type === "deleteFutureLesson") {
      if (target.world.status !== "locked" || lesson.difficulty === "Boss" || quests.some((quest) => quest.prerequisites.includes(lesson.id))) return { ok: false, error: "Only an unused future lesson with no dependencies can be removed." };
      quests = quests.filter((quest) => quest.id !== lesson.id); summaries.push(actionSummary(action)); continue;
    }
    if (action.type === "editLesson" || action.type === "adjustDifficulty" || action.type === "adjustEstimatedMinutes" || action.type === "adjustXPReward") {
      const nextDifficulty = payload.difficulty === undefined ? lesson.difficulty : difficulty(payload.difficulty);
      const nextMinutes = payload.estimatedMinutes === undefined ? lesson.estimatedMinutes : integer(payload.estimatedMinutes, 10, 120);
      const nextXP = payload.xpReward === undefined ? lesson.xpReward : integer(payload.xpReward, 20, 500);
      const nextTitle = payload.title === undefined ? lesson.title : text(payload.title);
      const nextDescription = payload.description === undefined ? lesson.description : text(payload.description, 360);
      if (!nextDifficulty || !nextMinutes || !nextXP || !nextTitle || !nextDescription || nextDifficulty === "Boss" && lesson.difficulty !== "Boss") return { ok: false, error: "That lesson edit has invalid duration, XP, difficulty, or text." };
      quests = quests.map((quest) => quest.id === lesson.id ? { ...quest, title: nextTitle, description: nextDescription, focusPrompt: nextDescription, difficulty: lesson.difficulty === "Boss" ? "Boss" : nextDifficulty, estimatedMinutes: nextMinutes, xpReward: nextXP } : quest); summaries.push(actionSummary(action)); continue;
    }
    if (action.type === "reorderFutureLesson") {
      const requested = Array.isArray(payload.lessonIds) ? payload.lessonIds.filter((item): item is string => typeof item === "string") : [];
      const regular = stageQuests.filter((quest) => quest.difficulty !== "Boss");
      if (target.world.status !== "locked" || requested.length !== regular.length || new Set(requested).size !== regular.length || requested.some((item) => !regular.some((quest) => quest.id === item))) return { ok: false, error: "Future lesson reordering must include each uncompleted lesson exactly once." };
      const ordered = requested.map((item) => quests.find((quest) => quest.id === item)!); const boss = stageQuests.find((quest) => quest.difficulty === "Boss");
      const external = ordered[0].prerequisites.filter((item) => !regular.some((quest) => quest.id === item));
      const replacement = ordered.map((quest, index) => ({ ...quest, prerequisites: index === 0 ? external : [ordered[index - 1].id] }));
      if (boss) replacement.push({ ...boss, prerequisites: [ordered.at(-1)!.id] }); quests = quests.map((quest) => replacement.find((item) => item.id === quest.id) ?? quest); summaries.push(actionSummary(action)); continue;
    }
    return { ok: false, error: "That proposed action is only supported for a future stage." };
  }
  quests = resolve(quests, data.activeQuestId);
  worlds = resolveWorlds(quests, worlds);
  campaigns = progress(campaigns, quests, worlds);
  return { ok: true, data: { ...data, version: 11, campaigns, worlds, quests }, summaries };
}
