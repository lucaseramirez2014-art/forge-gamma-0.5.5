import { weeklyProgress } from "./momentum";
import type { Campaign, ForgeData, RewardHistoryEntry, StatName } from "./types";

export const shareCardTypes = ["weekly", "level-up", "boss", "milestone", "campaign-complete"] as const;
export type ShareCardType = typeof shareCardTypes[number];
export type ShareCardAspect = "square" | "portrait";
export type ShareField = "campaign" | "level" | "xp" | "focus" | "streak" | "topStat" | "bosses" | "username";
export type ShareFields = Record<ShareField, boolean>;

export const defaultShareFields: ShareFields = {
  campaign: true,
  level: true,
  xp: true,
  focus: true,
  streak: false,
  topStat: true,
  bosses: true,
  username: false,
};

export type ShareMetric = { label: string; value: string };
export type ShareCardData = {
  type: ShareCardType;
  label: string;
  title: string;
  subtitle?: string;
  campaign?: string;
  username?: string;
  level: number;
  metrics: ShareMetric[];
  stat?: { name: string; gain: number };
  progress?: { label: string; current: number; total: number };
  date?: string;
};

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getFullYear() <= 1970 ? null : date;
}

function latestByTimestamp<T extends { timestamp: string }>(items: T[]) {
  return items.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null;
}

function titleForType(type: ShareCardType) {
  return ({ weekly: "Weekly Recap", "level-up": "Level Up", boss: "Boss Project Complete", milestone: "Campaign Milestone", "campaign-complete": "Campaign Complete" })[type];
}

function campaignFor(data: ForgeData, campaignId?: string) {
  return data.campaigns.find((item) => item.id === campaignId) ?? data.campaigns.find((item) => item.id === data.activeCampaignId) ?? null;
}

function statFromRewards(rewards: RewardHistoryEntry[]) {
  const totals = new Map<StatName, number>();
  rewards.forEach((reward) => Object.entries(reward.statChanges).forEach(([name, amount]) => {
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) totals.set(name as StatName, (totals.get(name as StatName) ?? 0) + amount);
  }));
  const result = [...totals.entries()].sort((left, right) => right[1] - left[1])[0];
  return result ? { name: result[0], gain: result[1] } : null;
}

function focusLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function shareCardOptions(data: ForgeData) {
  const active = campaignFor(data);
  const week = weeklyProgress(data);
  const recentLevelUp = data.lastReward && data.lastReward.levelAfter > data.lastReward.levelBefore ? data.lastReward : null;
  const latestBoss = latestByTimestamp(data.rewardHistory.filter((reward) => reward.kind === "completion" && data.quests.find((quest) => quest.id === reward.lessonId)?.difficulty === "Boss"));
  const campaignMilestone = active && [100, 75, 50, 25].find((point) => active.progress >= point);
  return {
    weekly: Boolean(week.lessonsCompleted || week.focusMinutes || week.xpEarned || week.strongestStat || week.bossProjectsCompleted),
    "level-up": Boolean(recentLevelUp),
    boss: Boolean(latestBoss),
    milestone: Boolean(campaignMilestone),
    "campaign-complete": Boolean(active && active.total > 0 && active.completed >= active.total),
  } satisfies Record<ShareCardType, boolean>;
}

export function cardDataFor(data: ForgeData, type: ShareCardType): ShareCardData | null {
  const active = campaignFor(data);
  if (!active) return null;
  const week = weeklyProgress(data);
  const base = { type, label: titleForType(type), campaign: active.title, username: data.player.name, level: data.player.level };

  if (type === "weekly") {
    const metrics: ShareMetric[] = [];
    if (week.lessonsCompleted) metrics.push({ label: "Lessons completed", value: String(week.lessonsCompleted) });
    if (week.focusMinutes) metrics.push({ label: "Focused", value: focusLabel(week.focusMinutes) });
    if (week.xpEarned) metrics.push({ label: "XP earned", value: `+${week.xpEarned} XP` });
    if (week.bossProjectsCompleted) metrics.push({ label: "Boss Projects", value: String(week.bossProjectsCompleted) });
    return { ...base, title: "Proof of the work.", subtitle: "This week in FORGE", metrics, stat: week.strongestStat ? { name: week.strongestStat.name, gain: week.strongestStat.gained } : undefined, progress: { label: "Current streak", current: week.currentStreak, total: Math.max(1, week.currentStreak) } };
  }

  if (type === "level-up") {
    const reward = data.lastReward && data.lastReward.levelAfter > data.lastReward.levelBefore ? data.lastReward : null;
    if (!reward) return null;
    const rewards = data.rewardHistory.filter((entry) => entry.lessonId === reward.questId);
    return { ...base, title: `Reached Level ${reward.levelAfter}`, subtitle: reward.questTitle, campaign: campaignFor(data, data.quests.find((quest) => quest.id === reward.questId)?.campaignId)?.title ?? active.title, metrics: [{ label: "Recent XP", value: `+${reward.xpGained} XP` }], stat: statFromRewards(rewards) ?? undefined, progress: { label: "Campaign progress", current: reward.campaignProgress, total: 100 } };
  }

  if (type === "boss") {
    const reward = latestByTimestamp(data.rewardHistory.filter((entry) => entry.kind === "completion" && data.quests.find((quest) => quest.id === entry.lessonId)?.difficulty === "Boss"));
    if (!reward) return null;
    const campaign = campaignFor(data, reward.campaignId) ?? active;
    const stage = data.worlds.find((world) => world.id === reward.stageId);
    const stageLessons = data.quests.filter((quest) => quest.worldId === reward.stageId);
    const cleared = stageLessons.filter((quest) => quest.status === "completed").length;
    const bossRewards = data.rewardHistory.filter((entry) => entry.lessonId === reward.lessonId);
    return { ...base, title: reward.lessonTitle.replace(/^Boss:\s*/i, ""), subtitle: stage?.title ? `Boss Project · ${stage.title}` : "Boss Project", campaign: campaign.title, metrics: [{ label: "XP earned", value: `+${bossRewards.reduce((total, entry) => total + Math.max(0, entry.xpAwarded), 0)} XP` }], stat: statFromRewards(bossRewards) ?? undefined, progress: { label: "Stage progress", current: cleared, total: Math.max(1, stageLessons.length) }, date: validDate(reward.timestamp)?.toLocaleDateString() };
  }

  if (type === "milestone") {
    const point = [100, 75, 50, 25].find((candidate) => active.progress >= candidate);
    if (!point) return null;
    const rewards = data.rewardHistory.filter((reward) => reward.campaignId === active.id);
    return { ...base, title: `${point}% complete`, subtitle: "Campaign milestone", metrics: [{ label: "Lessons cleared", value: `${active.completed} of ${active.total}` }], stat: statFromRewards(rewards) ?? undefined, progress: { label: active.title, current: active.progress, total: 100 } };
  }

  if (active.total <= 0 || active.completed < active.total) return null;
  const rewards = data.rewardHistory.filter((reward) => reward.campaignId === active.id);
  const completionRewards = rewards.filter((reward) => reward.kind === "completion");
  const bossCount = completionRewards.filter((reward) => data.quests.find((quest) => quest.id === reward.lessonId)?.difficulty === "Boss").length;
  const focusMinutes = Math.round(data.sessions.filter((session) => session.campaignId === active.id).reduce((total, session) => total + Math.max(0, session.actualSeconds), 0) / 60);
  const xp = rewards.reduce((total, reward) => total + Math.max(0, reward.xpAwarded), 0);
  const latest = latestByTimestamp(completionRewards);
  const metrics = [{ label: "Lessons completed", value: String(active.completed) }];
  if (focusMinutes) metrics.push({ label: "Focused", value: focusLabel(focusMinutes) });
  if (xp) metrics.push({ label: "Campaign XP", value: `+${xp} XP` });
  if (bossCount) metrics.push({ label: "Boss Projects", value: String(bossCount) });
  return { ...base, title: `${active.title} complete`, subtitle: "Campaign complete", metrics, stat: statFromRewards(rewards) ?? undefined, progress: { label: "Campaign progress", current: active.completed, total: active.total }, date: validDate(latest?.timestamp ?? "")?.toLocaleDateString() };
}

export function cardDataIsMeaningful(card: ShareCardData, fields: ShareFields) {
  const visibleMetric = card.metrics.some((metric) => metric.label.includes("XP") ? fields.xp : metric.label === "Focused" ? fields.focus : metric.label === "Boss Projects" ? fields.bosses : true);
  return Boolean(visibleMetric || (fields.topStat && card.stat) || fields.level || (fields.campaign && card.campaign));
}
