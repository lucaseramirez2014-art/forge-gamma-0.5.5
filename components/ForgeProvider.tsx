"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { materializeGeneratedCampaign, type GeneratedCampaign } from "../lib/generatedCampaign";
import { applyCopilotActions as applyActions, type CopilotAction } from "../lib/copilotActions";
import { trackForgeEvent } from "../lib/analytics";
import { getSubscriptionStatus } from "../lib/billing";
import { streakFromSessions } from "../lib/momentum";
import { canCreateCampaign, canGenerateCampaign, canUseCampaignEditing, canUseCopilot, currentUsage, getUserPlan, recordUsage, unverifiedFreeStatus, type LimitDecision, type PlanId, type SubscriptionStatus } from "../lib/plans";
import { achievements as starterAchievements, createDefaultForgeData, starterCampaigns, worlds as starterWorlds } from "../lib/mockUser";
import type { Achievement, Campaign, CampaignWorld, FocusSession, ForgeData, LessonFeedback, OnboardingAnswers, PlayerProfile, PlayerStats, Quest, RewardBaseline, RewardHistoryEntry, RewardResult, StatName, StatRewards, UsageLedger } from "../lib/types";

const storageKey = "forge-v0-1-1-beta-data";
const legacyKeys = ["forge-v0-1-0-usable-beta", "forge-v0-1-0-alpha-data", "forge-v0-0-4-data", "forge-v0-0-3-data"];
const defaultSnapshot = JSON.stringify(createDefaultForgeData());
const listeners = new Set<() => void>();
let cachedSnapshot = defaultSnapshot;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const unknownLegacyTimestamp = "1970-01-01T00:00:00.000Z";
const nextLevel = (level: number) => level * 200 + 200;
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
const statNames: StatName[] = ["Development", "Creativity", "Learning", "Discipline", "Fitness", "Communication"];
const safeStatRewards = (value: unknown): StatRewards => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([name, amount]) => statNames.includes(name as StatName) && typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) as StatRewards;
};
function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => Boolean(item.id) && !seen.has(item.id) && (seen.add(item.id), true));
}
function uniqueRewardEvents(rewards: RewardHistoryEntry[]) {
  const completedLessons = new Set<string>();
  return uniqueById(rewards).filter((reward) => {
    if (reward.kind !== "completion") return true;
    if (completedLessons.has(reward.lessonId)) return false;
    completedLessons.add(reward.lessonId);
    return true;
  });
}

function readSnapshot() {
  if (typeof window === "undefined") return defaultSnapshot;
  try {
    const stored = window.localStorage.getItem(storageKey) ?? legacyKeys.map((key) => window.localStorage.getItem(key)).find(Boolean) ?? defaultSnapshot;
    if (stored !== cachedSnapshot) cachedSnapshot = stored;
    return cachedSnapshot;
  } catch {
    return defaultSnapshot;
  }
}
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach((listener) => listener()); }
function progressFor(quests: Quest[]) {
  const visible = quests.filter((quest) => quest.status !== "archived");
  const completed = visible.filter((quest) => quest.status === "completed").length;
  return { completed, total: visible.length, progress: visible.length ? Math.round((completed / visible.length) * 100) : 0 };
}
function resolveQuests(quests: Quest[], activeQuestId: string | null) {
  return quests.map((quest) => {
    if (["archived", "completed"].includes(quest.status)) return quest;
    if (quest.id === activeQuestId) return { ...quest, status: "active" as const };
    return { ...quest, status: quest.prerequisites.every((id) => quests.find((item) => item.id === id)?.status === "completed") ? "available" as const : "locked" as const };
  });
}
function resolveWorlds(quests: Quest[], worlds: CampaignWorld[]) {
  return worlds.map((world) => {
    const worldQuests = quests.filter((quest) => quest.worldId === world.id);
    const boss = quests.find((quest) => quest.id === world.bossQuestId);
    return { ...world, status: boss?.status === "completed" ? "completed" as const : worldQuests.some((quest) => ["available", "active", "completed"].includes(quest.status)) ? "available" as const : "locked" as const };
  });
}
function campaignsWithProgress(campaigns: Campaign[], quests: Quest[], worlds: CampaignWorld[]) {
  return campaigns.map((campaign) => {
    const progress = progressFor(quests.filter((quest) => quest.campaignId === campaign.id));
    const campaignWorlds = worlds.filter((world) => world.campaignId === campaign.id).sort((a, b) => a.order - b.order);
    const current = campaignWorlds.find((world) => world.status === "available") ?? campaignWorlds.at(-1);
    return { ...campaign, ...progress, level: current?.title ?? campaign.level, stage: current?.title ?? campaign.stage };
  });
}
function elapsed(session: ForgeData["activeFocusSession"]) { return !session ? 0 : Math.max(0, Math.round(session.elapsedSeconds + (session.isRunning && session.startedAt ? (Date.now() - session.startedAt) / 1000 : 0))); }
function achievementsFor(achievements: Achievement[], quests: Quest[], sessions: FocusSession[], xp: number) {
  const completed = quests.filter((quest) => quest.status === "completed");
  const rules: Record<Achievement["id"], boolean> = { "first-quest": completed.length > 0, "first-focus": sessions.some((session) => session.actualSeconds > 0), "hundred-xp": xp >= 100, "first-boss": completed.some((quest) => quest.difficulty === "Boss"), "three-quests": completed.length >= 3 };
  const newly: Achievement["id"][] = [];
  const now = new Date().toISOString();
  return { achievements: achievements.map((achievement) => !achievement.unlockedAt && rules[achievement.id] ? (newly.push(achievement.id), { ...achievement, unlockedAt: now }) : achievement), newly };
}
function validCampaign(value: unknown): value is Campaign { return Boolean(value) && typeof value === "object" && typeof (value as Campaign).id === "string" && typeof (value as Campaign).title === "string"; }
function validWorld(value: unknown): value is CampaignWorld { return Boolean(value) && typeof value === "object" && typeof (value as CampaignWorld).id === "string" && typeof (value as CampaignWorld).campaignId === "string" && typeof (value as CampaignWorld).bossQuestId === "string"; }
function validQuest(value: unknown): value is Quest { return Boolean(value) && typeof value === "object" && typeof (value as Quest).id === "string" && typeof (value as Quest).campaignId === "string" && typeof (value as Quest).worldId === "string" && typeof (value as Quest).title === "string"; }
function validReward(value: unknown): value is RewardResult {
  if (!value || typeof value !== "object") return false;
  const reward = value as Partial<RewardResult>;
  return typeof reward.sessionId === "string" && typeof reward.questId === "string" && typeof reward.questTitle === "string" && typeof reward.xpGained === "number" && typeof reward.focusMinutes === "number" && typeof reward.completionRatio === "number" && typeof reward.questCompleted === "boolean" && typeof reward.levelBefore === "number" && typeof reward.levelAfter === "number" && Array.isArray(reward.unlockedQuestIds) && Array.isArray(reward.unlockedWorldIds) && Array.isArray(reward.newAchievementIds) && typeof reward.campaignProgress === "number" && typeof reward.streak === "number" && Boolean(reward.statsDelta && typeof reward.statsDelta === "object");
}
function validRewardHistory(value: unknown): value is RewardHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const reward = value as Partial<RewardHistoryEntry>;
  return typeof reward.id === "string" && (reward.kind === "completion" || reward.kind === "focus-progress") && typeof reward.lessonId === "string" && typeof reward.lessonTitle === "string" && typeof reward.timestamp === "string" && typeof reward.xpAwarded === "number" && Boolean(reward.statChanges && typeof reward.statChanges === "object") && typeof reward.campaignId === "string" && typeof reward.stageId === "string" && typeof reward.stageTitle === "string";
}
function levelForXP(xp: number) {
  let level = 1;
  let threshold = nextLevel(level);
  while (xp >= threshold) { level += 1; threshold = nextLevel(level); }
  return { level, xpToNextLevel: threshold };
}
function rewardTotals(rewards: RewardHistoryEntry[]) {
  const stats = Object.fromEntries(statNames.map((name) => [name, 0])) as PlayerStats;
  let xp = 0;
  let focusMinutes = 0;
  rewards.forEach((reward) => {
    xp += finite(reward.xpAwarded);
    focusMinutes += finite(reward.focusMinutes);
    Object.entries(safeStatRewards(reward.statChanges)).forEach(([name, amount]) => { stats[name as StatName] += amount ?? 0; });
  });
  return { xp, stats, focusMinutes };
}
function baselineFrom(value: unknown, player: PlayerProfile, rewards: RewardHistoryEntry[]): RewardBaseline {
  if (value && typeof value === "object") {
    const baseline = value as Partial<RewardBaseline>;
    if (typeof baseline.xp === "number" && baseline.stats && typeof baseline.stats === "object" && typeof baseline.totalFocusMinutes === "number") return { xp: finite(baseline.xp), stats: Object.fromEntries(statNames.map((name) => [name, finite(baseline.stats?.[name])])) as PlayerStats, totalFocusMinutes: finite(baseline.totalFocusMinutes) };
  }
  const rewardsTotal = rewardTotals(rewards);
  return { xp: Math.max(0, finite(player.xp) - rewardsTotal.xp), stats: Object.fromEntries(statNames.map((name) => [name, Math.max(0, finite(player.stats?.[name]) - rewardsTotal.stats[name])])) as PlayerStats, totalFocusMinutes: Math.max(0, finite(player.totalFocusMinutes) - rewardsTotal.focusMinutes) };
}
function playerFromRewards(player: PlayerProfile, baseline: RewardBaseline, rewards: RewardHistoryEntry[], sessions: FocusSession[]) {
  const rewardsTotal = rewardTotals(rewards);
  const xp = baseline.xp + rewardsTotal.xp;
  const level = levelForXP(xp);
  return { ...player, xp, level: level.level, xpToNextLevel: level.xpToNextLevel, stats: Object.fromEntries(statNames.map((name) => [name, baseline.stats[name] + rewardsTotal.stats[name]])) as PlayerStats, totalFocusMinutes: baseline.totalFocusMinutes + rewardsTotal.focusMinutes, streak: streakFromSessions(sessions) };
}

function customCampaignData(candidate: Partial<ForgeData>) {
  const starterIds = new Set(starterCampaigns.map((campaign) => campaign.id));
  const campaigns = uniqueById((Array.isArray(candidate.campaigns) ? candidate.campaigns : []).filter(validCampaign).filter((campaign) => !starterIds.has(campaign.id)).map((campaign) => ({ ...campaign, primaryStats: Array.isArray(campaign.primaryStats) ? campaign.primaryStats : ["Learning", "Discipline", "Creativity"] as Campaign["primaryStats"], generated: Boolean(campaign.generated), estimatedWeeks: finite(campaign.estimatedWeeks) || undefined, sourceGoal: typeof campaign.sourceGoal === "string" ? campaign.sourceGoal : undefined })));
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const worlds = uniqueById((Array.isArray(candidate.worlds) ? candidate.worlds : []).filter(validWorld).filter((world) => campaignIds.has(world.campaignId)).map((world) => ({ ...world, order: Math.max(1, Math.round(finite(world.order, 1))) })));
  const worldIds = new Set(worlds.map((world) => world.id));
  const quests = uniqueById((Array.isArray(candidate.quests) ? candidate.quests : []).filter(validQuest).filter((quest) => campaignIds.has(quest.campaignId) && worldIds.has(quest.worldId)).map((quest) => ({ ...quest, prerequisites: Array.isArray(quest.prerequisites) ? quest.prerequisites.filter((id): id is string => typeof id === "string") : [], focusSeconds: finite(quest.focusSeconds), xpEarned: finite(quest.xpEarned), statEarned: quest.statEarned && typeof quest.statEarned === "object" ? quest.statEarned : {}, feedback: ["too-easy", "good", "too-hard"].includes(quest.feedback ?? "") ? quest.feedback : undefined })));
  const usable = new Set(campaigns.filter((campaign) => worlds.some((world) => world.campaignId === campaign.id) && quests.some((quest) => quest.campaignId === campaign.id)).map((campaign) => campaign.id));
  return { campaigns: campaigns.filter((campaign) => usable.has(campaign.id)), worlds: worlds.filter((world) => usable.has(world.campaignId)), quests: quests.filter((quest) => usable.has(quest.campaignId)) };
}
function starterCampaignExtensions(candidate: Partial<ForgeData>, starterQuestIds: Set<string>) {
  const starterCampaignIds = new Set(starterCampaigns.map((campaign) => campaign.id));
  const starterWorldIds = new Set(starterWorlds.map((world) => world.id));
  const savedWorlds = (Array.isArray(candidate.worlds) ? candidate.worlds : []).filter(validWorld).filter((world) => starterCampaignIds.has(world.campaignId));
  const worlds = uniqueById(savedWorlds.filter((world) => !starterWorldIds.has(world.id)).map((world) => ({ ...world, order: Math.max(1, Math.round(finite(world.order, 1))) })));
  const allWorldIds = new Set([...starterWorldIds, ...worlds.map((world) => world.id)]);
  const quests = uniqueById((Array.isArray(candidate.quests) ? candidate.quests : []).filter(validQuest).filter((quest) => starterCampaignIds.has(quest.campaignId) && allWorldIds.has(quest.worldId) && !starterQuestIds.has(quest.id)).map((quest) => ({ ...quest, prerequisites: Array.isArray(quest.prerequisites) ? quest.prerequisites.filter((id): id is string => typeof id === "string") : [], focusSeconds: finite(quest.focusSeconds), xpEarned: finite(quest.xpEarned), statEarned: quest.statEarned && typeof quest.statEarned === "object" ? quest.statEarned : {}, feedback: ["too-easy", "good", "too-hard"].includes(quest.feedback ?? "") ? quest.feedback : undefined })));
  const worldOverrides = new Map(savedWorlds.filter((world) => starterWorldIds.has(world.id)).map((world) => [world.id, world]));
  return { worlds, quests, worldOverrides };
}

function migrate(raw: unknown): ForgeData | null {
  try {
    const candidate = raw as Partial<ForgeData>;
    if (!candidate?.player || !Array.isArray(candidate.quests) || !Array.isArray(candidate.sessions)) return null;
    const fallback = createDefaultForgeData();
    const saved = candidate.quests as Partial<Quest>[];
    const starterQuests = fallback.quests.map((starter) => {
      const previous = saved.find((quest) => quest.id === starter.id || (starter.id === "python-variables" && quest.id === "variables"));
      const complete = previous?.status === "completed";
      return { ...starter, ...previous, id: starter.id, campaignId: starter.campaignId, worldId: starter.worldId, prerequisites: starter.prerequisites, statRewards: starter.statRewards, focusSeconds: finite(previous?.focusSeconds, complete ? starter.estimatedMinutes * 60 : 0), xpEarned: finite(previous?.xpEarned, complete ? starter.xpReward : 0), statEarned: previous?.statEarned ?? (complete ? starter.statRewards : {}), feedback: ["too-easy", "good", "too-hard"].includes(previous?.feedback ?? "") ? previous?.feedback : undefined } as Quest;
    });
    const custom = customCampaignData(candidate);
    const extensions = starterCampaignExtensions(candidate, new Set(starterQuests.map((quest) => quest.id)));
    const baseCampaigns = [...starterCampaigns, ...custom.campaigns];
    const baseWorlds = [...starterWorlds.map((world) => {
      const savedWorld = extensions.worldOverrides.get(world.id);
      return savedWorld ? { ...world, title: savedWorld.title, description: savedWorld.description, bossQuestId: savedWorld.bossQuestId } : world;
    }), ...extensions.worlds, ...custom.worlds];
    const rawQuests = uniqueById([...starterQuests, ...extensions.quests, ...custom.quests]);
    const questIds = new Set(rawQuests.map((quest) => quest.id));
    const quests = rawQuests.map((quest) => ({ ...quest, prerequisites: [...new Set(quest.prerequisites.filter((prerequisite) => prerequisite !== quest.id && questIds.has(prerequisite)))] }));
    const available = resolveQuests(quests, null);
    const requestedActiveId = typeof candidate.activeQuestId === "string" ? candidate.activeQuestId : candidate.activeFocusSession?.questId;
    const activeQuestId = requestedActiveId && available.find((quest) => quest.id === requestedActiveId)?.status === "available" ? requestedActiveId : null;
    const resolved = resolveQuests(quests, activeQuestId);
    const worlds = resolveWorlds(resolved, baseWorlds);
    const campaigns = campaignsWithProgress(baseCampaigns, resolved, worlds);
    const savedSession = candidate.activeFocusSession;
    const activeFocusSession = activeQuestId && savedSession?.questId === activeQuestId && typeof savedSession.id === "string" ? { ...savedSession, elapsedSeconds: finite(savedSession.elapsedSeconds), startedAt: typeof savedSession.startedAt === "number" ? savedSession.startedAt : null, createdAt: typeof savedSession.createdAt === "string" ? savedSession.createdAt : new Date().toISOString(), isRunning: Boolean(savedSession.isRunning) } : null;
    const sessions = uniqueById((candidate.sessions as Partial<FocusSession>[]).map((item) => ({ id: item.id ?? uid("session"), questId: item.questId ?? "unknown", questTitle: item.questTitle ?? "Imported session", campaignId: item.campaignId ?? "python-developer", campaignTitle: item.campaignTitle ?? "Python Developer", minutes: item.minutes ?? 1, targetMinutes: item.targetMinutes ?? item.minutes ?? 1, actualSeconds: item.actualSeconds ?? Math.max(1, (item.minutes ?? 1) * 60), xpAwarded: item.xpAwarded ?? 0, completionRatio: item.completionRatio ?? 0, result: item.result ?? (item.completionRatio === 1 ? "completed" : "ended-early"), startedAt: item.startedAt ?? item.completedAt ?? unknownLegacyTimestamp, finishedAt: item.finishedAt ?? item.completedAt ?? unknownLegacyTimestamp, completedAt: item.completedAt ?? item.finishedAt ?? unknownLegacyTimestamp })));
    const player = { ...fallback.player, ...candidate.player, stats: { ...fallback.player.stats, ...candidate.player.stats }, streak: streakFromSessions(sessions) };
    const activeCampaignId = typeof candidate.activeCampaignId === "string" && campaigns.some((campaign) => campaign.id === candidate.activeCampaignId) ? candidate.activeCampaignId : "python-developer";
    const savedAchievements = Array.isArray(candidate.achievements) ? candidate.achievements : [];
    const copilotActionHistory = Array.isArray(candidate.copilotActionHistory) ? candidate.copilotActionHistory.filter((item) => item && typeof item.id === "string" && typeof item.summary === "string" && typeof item.appliedAt === "string").slice(0, 50) : [];
    const savedRewards = Array.isArray(candidate.rewardHistory) ? uniqueRewardEvents(candidate.rewardHistory.filter(validRewardHistory).map((reward) => ({ ...reward, xpAwarded: finite(reward.xpAwarded), statChanges: safeStatRewards(reward.statChanges), focusMinutes: finite(reward.focusMinutes, sessions.find((session) => session.id === reward.sessionId)?.minutes ?? 0), previousStatEarned: safeStatRewards(reward.previousStatEarned) }))) : [];
    const completionIds = new Set(savedRewards.filter((reward) => reward.kind === "completion").map((reward) => reward.lessonId));
    const rewardHistory = [...savedRewards];
    resolved.filter((quest) => quest.status === "completed" && !completionIds.has(quest.id)).forEach((quest) => {
      const stage = worlds.find((world) => world.id === quest.worldId);
      rewardHistory.push({ id: `legacy-completion:${quest.id}`, kind: "completion", lessonId: quest.id, lessonTitle: quest.title, timestamp: quest.completionMeta?.completedAt ?? unknownLegacyTimestamp, xpAwarded: finite(quest.xpEarned, quest.xpReward), statChanges: safeStatRewards(quest.statEarned ?? quest.statRewards), focusMinutes: 0, campaignId: quest.campaignId, stageId: quest.worldId, stageTitle: stage?.title ?? "Campaign stage", previousFocusSeconds: 0, previousXpEarned: 0, previousStatEarned: {} });
    });
    const rewardBaseline = baselineFrom(candidate.rewardBaseline, player, rewardHistory);
    const reconciledPlayer = playerFromRewards(player, rewardBaseline, rewardHistory, sessions);
    return { ...fallback, version: 11, onboarding: { completed: Boolean(candidate.onboarding?.completed), answers: candidate.onboarding?.answers ?? null }, player: reconciledPlayer, rewardBaseline, campaigns, worlds, quests: resolved, sessions, achievements: starterAchievements.map((achievement) => ({ ...achievement, ...(savedAchievements.find((savedAchievement) => savedAchievement.id === achievement.id) ?? {}) })), copilotActionHistory, rewardHistory, usage: currentUsage(candidate.usage), activeCampaignId, activeQuestId, activeFocusSession, lastReward: validReward(candidate.lastReward) ? candidate.lastReward : null };
  } catch { return null; }
}
function parse(snapshot: string) { try { return migrate(JSON.parse(snapshot)); } catch { return null; } }

type ForgeState = {
  data: ForgeData; player: ForgeData["player"]; activeCampaign: Campaign; activeQuests: Quest[]; activeQuest: Quest | null; sessions: FocusSession[];
  plan: PlanId; subscriptionStatus: SubscriptionStatus; refreshSubscriptionStatus: () => Promise<SubscriptionStatus>; usage: UsageLedger; campaignCreationAccess: LimitDecision; copilotAccess: LimitDecision; campaignGenerationAccess: LimitDecision;
  dataRecoveryIssue: boolean;
  selectQuest: (questId: string) => boolean; startFocus: (sessionId: string) => void; pauseFocus: (sessionId: string) => void; finishFocusSession: (sessionId: string) => RewardResult | null; completeLesson: (lessonId: string) => RewardResult | null; undoLessonCompletion: (lessonId: string) => boolean; clearActiveSession: () => void;
  completeOnboarding: (answers: OnboardingAnswers) => void; createGeneratedCampaign: (campaign: GeneratedCampaign, answers: OnboardingAnswers) => boolean; consumeCopilotMessage: () => LimitDecision; consumeCampaignGeneration: () => LimitDecision; applyCopilotActions: (actions: CopilotAction[]) => { ok: boolean; error?: string }; setLessonFeedback: (questId: string, feedback: LessonFeedback) => void; restartOnboarding: () => void; setActiveCampaign: (campaignId: string) => void; resetProgress: () => void; exportData: () => string; importData: (serialized: string) => boolean;
};
const ForgeContext = createContext<ForgeState | null>(null);

export function ForgeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => defaultSnapshot);
  const parsedData = useMemo(() => parse(snapshot), [snapshot]);
  const data = parsedData ?? createDefaultForgeData();
  const dataRecoveryIssue = snapshot !== defaultSnapshot && !parsedData;
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(unverifiedFreeStatus);
  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const next = await getSubscriptionStatus();
      setSubscriptionStatus((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      return next;
    } catch {
      const fallback = unverifiedFreeStatus();
      setSubscriptionStatus((previous) => JSON.stringify(previous) === JSON.stringify(fallback) ? previous : fallback);
      return fallback;
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshSubscriptionStatus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSubscriptionStatus]);
  const plan = getUserPlan(subscriptionStatus);
  const usage = currentUsage(data.usage);
  const campaignCreationAccess = canCreateCampaign(data, subscriptionStatus);
  const copilotAccess = canUseCopilot(usage, subscriptionStatus);
  const campaignGenerationAccess = canGenerateCampaign(usage, subscriptionStatus);
  const commit = useCallback((next: ForgeData) => {
    const serialized = JSON.stringify(next);
    if (serialized === cachedSnapshot) return;
    cachedSnapshot = serialized;
    try { window.localStorage.setItem(storageKey, serialized); }
    catch { if (process.env.NODE_ENV !== "production") console.info("[FORGE] progress could not be saved to local storage"); }
    notify();
  }, []);
  const activeCampaign = data.campaigns.find((campaign) => campaign.id === data.activeCampaignId) ?? data.campaigns[0];
  const activeQuests = data.quests.filter((quest) => quest.campaignId === activeCampaign.id && quest.status !== "archived");
  const activeQuest = data.quests.find((quest) => quest.id === data.activeQuestId) ?? null;
  const completeLesson = useCallback((lessonId: string, activeSession?: ForgeData["activeFocusSession"], focusedSeconds?: number) => {
    const quest = data.quests.find((item) => item.id === lessonId);
    const priorReward = data.rewardHistory.find((item) => item.kind === "completion" && item.lessonId === lessonId);
    if (!quest || !["available", "active"].includes(quest.status) || priorReward) return null;
    const total = quest.estimatedMinutes * 60;
    const previousFocusSeconds = Math.min(total, Math.max(0, quest.focusSeconds));
    const previousXpEarned = Math.min(quest.xpReward, Math.max(0, quest.xpEarned));
    const previousStatEarned = { ...quest.statEarned };
    const xpGained = Math.max(0, quest.xpReward - previousXpEarned);
    const statsDelta = Object.fromEntries(Object.entries(quest.statRewards).map(([key, stat]) => [key, Math.max(0, (stat ?? 0) - (quest.statEarned[key as keyof StatRewards] ?? 0))]).filter(([, stat]) => Number(stat) > 0)) as StatRewards;
    const now = new Date().toISOString();
    const quests = resolveQuests(data.quests.map((item) => item.id === lessonId ? { ...item, status: "completed" as const, focusSeconds: total, xpEarned: item.xpReward, statEarned: { ...item.statRewards }, completionMeta: { ...item.completionMeta, completedAt: now, actualSeconds: total, endedEarly: false } } : item), null);
    const worlds = resolveWorlds(quests, data.worlds);
    const campaigns = campaignsWithProgress(data.campaigns, quests, worlds);
    const sessionSeconds = Math.min(total, Math.max(1, focusedSeconds ?? total));
    const campaign = data.campaigns.find((item) => item.id === quest.campaignId) ?? activeCampaign;
    const record = activeSession ? { id: activeSession.id, questId: quest.id, questTitle: quest.title, campaignId: quest.campaignId, campaignTitle: campaign.title, minutes: Math.max(1, Math.round(sessionSeconds / 60)), targetMinutes: quest.estimatedMinutes, actualSeconds: sessionSeconds, xpAwarded: xpGained, completionRatio: 1, result: "completed" as const, startedAt: activeSession.createdAt, finishedAt: now, completedAt: now } : null;
    const sessions = record ? [record, ...data.sessions].slice(0, 100) : data.sessions;
    const rewardId = "completion:" + lessonId;
    const rewardHistory = [{ id: rewardId, kind: "completion" as const, lessonId, lessonTitle: quest.title, timestamp: now, xpAwarded: xpGained, statChanges: statsDelta, focusMinutes: record?.minutes ?? 0, campaignId: quest.campaignId, stageId: quest.worldId, stageTitle: worlds.find((world) => world.id === quest.worldId)?.title ?? "Campaign stage", sessionId: activeSession?.id, previousFocusSeconds, previousXpEarned, previousStatEarned }, ...data.rewardHistory];
    const player = playerFromRewards(data.player, data.rewardBaseline, rewardHistory, sessions);
    const achievement = achievementsFor(data.achievements, quests, sessions, player.xp);
    const unlockedQuestIds = quests.filter((item) => item.status === "available" && data.quests.find((prior) => prior.id === item.id)?.status === "locked").map((item) => item.id);
    const unlockedWorldIds = worlds.filter((world) => world.status === "available" && data.worlds.find((prior) => prior.id === world.id)?.status === "locked").map((world) => world.id);
    const result: RewardResult = { sessionId: activeSession?.id ?? rewardId, questId: lessonId, questTitle: quest.title, xpGained, focusMinutes: record?.minutes ?? quest.estimatedMinutes, completionRatio: 1, questCompleted: true, levelBefore: data.player.level, levelAfter: player.level, unlockedQuestIds, unlockedWorldIds, newAchievementIds: achievement.newly, statsDelta, campaignProgress: campaigns.find((item) => item.id === quest.campaignId)?.progress ?? 0, streak: player.streak };
    commit({ ...data, player, campaigns, worlds, quests, sessions, achievements: achievement.achievements, rewardHistory, activeQuestId: null, activeFocusSession: null, lastReward: result });
    trackForgeEvent("lesson_completed", { lessonId, bossProject: quest.difficulty === "Boss" });
    if (activeSession) trackForgeEvent("focus_completed", { lessonId, completed: true });
    const updatedCampaign = campaigns.find((item) => item.id === quest.campaignId);
    if (updatedCampaign && updatedCampaign.total > 0 && updatedCampaign.completed >= updatedCampaign.total) trackForgeEvent("campaign_completed", { campaignId: updatedCampaign.id });
    return result;
  }, [activeCampaign, commit, data]);
  const undoLessonCompletion = useCallback((lessonId: string) => {
    const reward = data.rewardHistory.find((item) => item.kind === "completion" && item.lessonId === lessonId);
    const quest = data.quests.find((item) => item.id === lessonId);
    if (!reward || reward.id.startsWith("legacy-completion:") || !quest || quest.status !== "completed") return false;
    const restoredQuest = { ...quest, status: "available" as const, focusSeconds: reward.previousFocusSeconds ?? 0, xpEarned: reward.previousXpEarned ?? 0, statEarned: reward.previousStatEarned ?? {}, completionMeta: { ...quest.completionMeta, completedAt: undefined, actualSeconds: reward.previousFocusSeconds ?? 0, endedEarly: Boolean(reward.previousFocusSeconds) } };
    const quests = resolveQuests(data.quests.map((item) => item.id === lessonId ? restoredQuest : item), null);
    const worlds = resolveWorlds(quests, data.worlds);
    const campaigns = campaignsWithProgress(data.campaigns, quests, worlds);
    const sessions = reward.sessionId ? data.sessions.filter((item) => item.id !== reward.sessionId) : data.sessions;
    const rewardHistory = data.rewardHistory.filter((item) => item.id !== reward.id);
    const player = playerFromRewards(data.player, data.rewardBaseline, rewardHistory, sessions);
    const achievement = achievementsFor(data.achievements, quests, sessions, player.xp);
    commit({ ...data, player, campaigns, worlds, quests, sessions, achievements: achievement.achievements, rewardHistory, activeQuestId: null, activeFocusSession: null, lastReward: data.lastReward?.questId === lessonId ? null : data.lastReward });
    return true;
  }, [commit, data]);
  const value = useMemo<ForgeState>(() => ({
    data, player: data.player, activeCampaign, activeQuests, activeQuest, sessions: data.sessions, plan, subscriptionStatus, refreshSubscriptionStatus, usage, campaignCreationAccess, copilotAccess, campaignGenerationAccess, dataRecoveryIssue,
    completeLesson: (lessonId) => completeLesson(lessonId),
    undoLessonCompletion,
    selectQuest: (questId) => {
      const quest = data.quests.find((item) => item.id === questId);
      if (!quest || ["locked", "completed", "archived"].includes(quest.status) || (data.activeFocusSession && data.activeFocusSession.questId !== questId)) return false;
      if (data.activeQuestId === questId && data.activeFocusSession?.questId === questId) return true;
      const session = data.activeFocusSession ?? { id: uid("active"), questId, elapsedSeconds: 0, startedAt: null, createdAt: new Date().toISOString(), isRunning: false };
      commit({ ...data, activeQuestId: questId, activeFocusSession: session, quests: resolveQuests(data.quests, questId), lastReward: null });
      trackForgeEvent("lesson_started", { lessonId: questId, resumed: Boolean(data.activeFocusSession) });
      return true;
    },
    startFocus: (sessionId) => { const session = data.activeFocusSession; if (!session || session.id !== sessionId || session.isRunning) return; commit({ ...data, activeFocusSession: { ...session, elapsedSeconds: elapsed(session), startedAt: Date.now(), isRunning: true } }); },
    pauseFocus: (sessionId) => { const session = data.activeFocusSession; if (!session || session.id !== sessionId || !session.isRunning) return; commit({ ...data, activeFocusSession: { ...session, elapsedSeconds: elapsed(session), startedAt: null, isRunning: false } }); },
    finishFocusSession: (sessionId) => {
      if (data.sessions.some((session) => session.id === sessionId)) return data.lastReward?.sessionId === sessionId ? data.lastReward : null;
      const active = data.activeFocusSession;
      if (!active || active.id !== sessionId) return null;
      const quest = data.quests.find((item) => item.id === active.questId);
      if (!quest) return null;
      const seconds = Math.min(quest.estimatedMinutes * 60, elapsed(active));
      if (seconds <= 0) return null;
      const total = quest.estimatedMinutes * 60; const progressSeconds = Math.min(total, quest.focusSeconds + seconds); const ratio = progressSeconds / total; const newXP = Math.round(quest.xpReward * ratio); const xpGained = Math.max(0, newXP - quest.xpEarned);
      const statsDelta = Object.fromEntries(Object.entries(quest.statRewards).map(([key, stat]) => [key, Math.max(0, Math.round((stat ?? 0) * ratio) - (quest.statEarned[key as keyof StatRewards] ?? 0))]).filter(([, stat]) => Number(stat) > 0)) as StatRewards;
      if (progressSeconds >= total) return completeLesson(quest.id, active, seconds);
      const questCompleted = false;
      const quests = resolveQuests(data.quests.map((item) => item.id === quest.id ? { ...item, focusSeconds: progressSeconds, xpEarned: newXP, statEarned: Object.fromEntries(Object.entries(item.statRewards).map(([key, stat]) => [key, Math.round((stat ?? 0) * ratio)])), status: questCompleted ? "completed" as const : "available" as const, completionMeta: { ...item.completionMeta, completedAt: questCompleted ? new Date().toISOString() : item.completionMeta?.completedAt, actualSeconds: progressSeconds, endedEarly: !questCompleted } } : item), null);
      const worlds = resolveWorlds(quests, data.worlds); const campaigns = campaignsWithProgress(data.campaigns, quests, worlds);
      const now = new Date().toISOString(); const campaign = data.campaigns.find((item) => item.id === quest.campaignId) ?? activeCampaign;
      const record: FocusSession = { id: active.id, questId: quest.id, questTitle: quest.title, campaignId: quest.campaignId, campaignTitle: campaign.title, minutes: Math.max(1, Math.round(seconds / 60)), targetMinutes: quest.estimatedMinutes, actualSeconds: seconds, xpAwarded: xpGained, completionRatio: ratio, result: questCompleted ? "completed" : "ended-early", startedAt: active.createdAt, finishedAt: now, completedAt: now };
      const sessions = [record, ...data.sessions].slice(0, 100);
      const unlockedQuestIds = quests.filter((item) => item.status === "available" && data.quests.find((prior) => prior.id === item.id)?.status === "locked").map((item) => item.id);
      const unlockedWorldIds = worlds.filter((world) => world.status === "available" && data.worlds.find((prior) => prior.id === world.id)?.status === "locked").map((world) => world.id);
      const partialReward = { id: "focus-progress:" + sessionId, kind: "focus-progress" as const, lessonId: quest.id, lessonTitle: quest.title, timestamp: now, xpAwarded: xpGained, statChanges: statsDelta, focusMinutes: record.minutes, campaignId: quest.campaignId, stageId: quest.worldId, stageTitle: worlds.find((world) => world.id === quest.worldId)?.title ?? "Campaign stage", sessionId };
      const rewardHistory = [partialReward, ...data.rewardHistory.filter((item) => item.id !== partialReward.id)];
      const player = playerFromRewards(data.player, data.rewardBaseline, rewardHistory, sessions);
      const achievement = achievementsFor(data.achievements, quests, sessions, player.xp);
      const result: RewardResult = { sessionId, questId: quest.id, questTitle: quest.title, xpGained, focusMinutes: record.minutes, completionRatio: ratio, questCompleted, levelBefore: data.player.level, levelAfter: player.level, unlockedQuestIds, unlockedWorldIds, newAchievementIds: achievement.newly, statsDelta, campaignProgress: campaigns.find((item) => item.id === quest.campaignId)?.progress ?? 0, streak: player.streak };
      commit({ ...data, player, campaigns, worlds, quests, sessions, achievements: achievement.achievements, rewardHistory, activeQuestId: null, activeFocusSession: null, lastReward: result });
      trackForgeEvent("focus_completed", { lessonId: quest.id, completed: false });
      return result;
    },
    clearActiveSession: () => {
      const active = data.activeFocusSession; if (!active) return; const quest = data.quests.find((item) => item.id === active.questId); const seconds = elapsed(active); const now = new Date().toISOString();
      const record: FocusSession = { id: active.id, questId: active.questId, questTitle: quest?.title ?? "Unknown quest", campaignId: quest?.campaignId ?? data.activeCampaignId, campaignTitle: data.campaigns.find((item) => item.id === quest?.campaignId)?.title ?? "Unknown campaign", minutes: Math.max(0, Math.round(seconds / 60)), targetMinutes: quest?.estimatedMinutes ?? 0, actualSeconds: seconds, xpAwarded: 0, completionRatio: 0, result: "abandoned", startedAt: active.createdAt, finishedAt: now, completedAt: now };
      commit({ ...data, activeQuestId: null, activeFocusSession: null, quests: resolveQuests(data.quests, null), sessions: seconds ? [record, ...data.sessions].slice(0, 100) : data.sessions });
    },
    completeOnboarding: (answers) => { commit({ ...data, onboarding: { completed: true, answers } }); trackForgeEvent("onboarding_completed"); },
    createGeneratedCampaign: (campaign, answers) => {
      if (!canCreateCampaign(data, subscriptionStatus).ok) return false;
      const forged = materializeGeneratedCampaign(campaign);
      if (data.campaigns.some((item) => item.id === forged.campaign.id)) return false;
      const quests = resolveQuests([...data.quests, ...forged.quests], null); const worlds = resolveWorlds(quests, [...data.worlds, ...forged.worlds]); const campaigns = campaignsWithProgress([...data.campaigns, forged.campaign], quests, worlds);
      commit({ ...data, version: 11, onboarding: { completed: true, answers }, campaigns, worlds, quests, activeCampaignId: forged.campaign.id, activeQuestId: null, activeFocusSession: null, lastReward: null });
      trackForgeEvent("onboarding_completed");
      trackForgeEvent("campaign_created", { campaignId: forged.campaign.id, generated: true });
      return true;
    },
    consumeCopilotMessage: () => {
      const access = canUseCopilot(data.usage, subscriptionStatus);
      if (!access.ok) { trackForgeEvent("copilot_limit_hit"); return access; }
      commit({ ...data, usage: recordUsage(data.usage, "copilot") });
      return access;
    },
    consumeCampaignGeneration: () => {
      const access = canGenerateCampaign(data.usage, subscriptionStatus);
      if (!access.ok) { trackForgeEvent("ai_generation_limit_hit"); return access; }
      const campaignAccess = canCreateCampaign(data, subscriptionStatus);
      if (!campaignAccess.ok) { trackForgeEvent("campaign_limit_hit"); return campaignAccess; }
      commit({ ...data, usage: recordUsage(data.usage, "campaign-generation") });
      return access;
    },
    applyCopilotActions: (actions) => {
      if (!canUseCampaignEditing(subscriptionStatus)) return { ok: false, error: "Adaptive campaign editing is included with FORGE Gold. Your campaign is unchanged." };
      if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] validating actions", actions.length);
      const result = applyActions(data, actions);
      if (!result.ok) { if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] action validation failed", result.error); return result; }
      const appliedAt = new Date().toISOString();
      const history = result.summaries.map((summary, index) => ({ id: uid("copilot-change"), appliedAt, summary, actionTypes: [actions[index]?.type ?? "unknown"] }));
      commit({ ...result.data, copilotActionHistory: [...history, ...data.copilotActionHistory].slice(0, 50) });
      trackForgeEvent("copilot_used", { actions: actions.length, applied: true });
      if (process.env.NODE_ENV !== "production") console.info("[FORGE Copilot] actions applied and persisted", history.length);
      return { ok: true };
    },
    setLessonFeedback: (questId, feedback) => { const quest = data.quests.find((item) => item.id === questId); if (!quest || quest.status !== "completed" || quest.feedback === feedback) return; commit({ ...data, quests: data.quests.map((item) => item.id === questId ? { ...item, feedback } : item) }); },
    restartOnboarding: () => commit({ ...data, onboarding: { completed: false, answers: null } }),
    setActiveCampaign: (campaignId) => {
      if (!data.campaigns.some((item) => item.id === campaignId)) return;
      const savedSession = data.activeFocusSession;
      const activeQuestId = savedSession ? data.activeQuestId : null;
      commit({ ...data, activeCampaignId: campaignId, activeQuestId, activeFocusSession: savedSession, quests: resolveQuests(data.quests, activeQuestId) });
    },
    resetProgress: () => commit(createDefaultForgeData()),
    exportData: () => JSON.stringify(data, null, 2),
    importData: (serialized) => { const imported = parse(serialized); if (!imported) return false; commit(imported); return true; },
  }), [activeCampaign, activeQuest, activeQuests, campaignCreationAccess, campaignGenerationAccess, commit, completeLesson, copilotAccess, data, dataRecoveryIssue, plan, refreshSubscriptionStatus, subscriptionStatus, undoLessonCompletion, usage]);
  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}
export function useForge() { const context = useContext(ForgeContext); if (!context) throw new Error("useForge must be used inside ForgeProvider"); return context; }
export const campaignProgress = (quests: Quest[]) => progressFor(quests).progress;
