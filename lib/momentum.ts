import type { Campaign, ForgeData, FocusSession, PlayerStats, Quest, StatName } from "./types";

const statNames: StatName[] = ["Development", "Creativity", "Learning", "Discipline", "Fitness", "Communication"];

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueSessions(sessions: FocusSession[]) {
  const ids = new Set<string>();
  return sessions.filter((session) => Boolean(session.id) && !ids.has(session.id) && (ids.add(session.id), true));
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfLocalWeek(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

export function streakFromSessions(sessions: FocusSession[], now = new Date()) {
  const focusedDays = new Set(uniqueSessions(sessions)
    .filter((session) => session.actualSeconds > 0)
    .map((session) => validDate(session.finishedAt))
    .filter((date): date is Date => Boolean(date))
    .map(localDateKey));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!focusedDays.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let value = 0;
  while (focusedDays.has(localDateKey(cursor))) { value += 1; cursor.setDate(cursor.getDate() - 1); }
  return value;
}

export type TodayRecommendation = { lesson: Quest; campaign: Campaign; reason: string; resume: boolean };

export function todayRecommendation(data: ForgeData): TodayRecommendation | null {
  const activeCampaign = data.campaigns.find((campaign) => campaign.id === data.activeCampaignId) ?? data.campaigns[0];
  if (!activeCampaign) return null;
  const savedLesson = data.activeFocusSession ? data.quests.find((lesson) => lesson.id === data.activeFocusSession?.questId) : null;
  if (savedLesson && savedLesson.status !== "completed") return { lesson: savedLesson, campaign: data.campaigns.find((campaign) => campaign.id === savedLesson.campaignId) ?? activeCampaign, reason: "Recommended because you already have progress saved in this Focus Session.", resume: true };
  const available = data.quests.filter((lesson) => lesson.campaignId === activeCampaign.id && (lesson.status === "available" || lesson.status === "active"));
  const lesson = available.find((item) => item.difficulty !== "Boss") ?? available.find((item) => item.difficulty === "Boss");
  if (!lesson) return null;
  return { lesson, campaign: activeCampaign, reason: lesson.difficulty === "Boss" ? "Recommended because your Boss Project is unlocked and ready." : "Recommended because it is your next unlocked lesson.", resume: lesson.status === "active" };
}

export type WeeklyProgress = { focusMinutes: number; lessonsCompleted: number; xpEarned: number; bossProjectsCompleted: number; strongestStat: { name: StatName; gained: number } | null; currentStreak: number };

export function weeklyProgress(data: ForgeData, now = new Date()): WeeklyProgress {
  const weekStart = startOfLocalWeek(now);
  const beforeNow = now.getTime();
  const inCurrentWeek = (value: string) => {
    const date = validDate(value);
    return Boolean(date && date.getTime() >= weekStart.getTime() && date.getTime() <= beforeNow);
  };
  const sessions = uniqueSessions(data.sessions).filter((session) => inCurrentWeek(session.finishedAt));
  const rewards = data.rewardHistory.filter((reward) => inCurrentWeek(reward.timestamp));
  const statTotals = Object.fromEntries(statNames.map((name) => [name, 0])) as PlayerStats;
  rewards.forEach((reward) => Object.entries(reward.statChanges).forEach(([name, amount]) => {
    if (statNames.includes(name as StatName) && typeof amount === "number" && Number.isFinite(amount)) statTotals[name as StatName] += amount;
  }));
  const strongest = statNames.map((name) => ({ name, gained: statTotals[name] })).sort((left, right) => right.gained - left.gained)[0];
  const lessonLookup = new Map(data.quests.map((lesson) => [lesson.id, lesson]));
  const completedRewards = rewards.filter((reward) => reward.kind === "completion");
  return {
    focusMinutes: Math.round(sessions.reduce((total, session) => total + Math.max(0, session.actualSeconds), 0) / 60),
    lessonsCompleted: completedRewards.length,
    xpEarned: rewards.reduce((total, reward) => total + Math.max(0, reward.xpAwarded), 0),
    bossProjectsCompleted: completedRewards.filter((reward) => lessonLookup.get(reward.lessonId)?.difficulty === "Boss").length,
    strongestStat: strongest.gained > 0 ? strongest : null,
    currentStreak: streakFromSessions(data.sessions, now),
  };
}

export type MomentumMilestone = { id: string; title: string; detail: string; progress: number; target: number; achieved: boolean };

export function momentumMilestones(data: ForgeData, campaign: Campaign) {
  const completedLessons = data.quests.filter((lesson) => lesson.status === "completed").length;
  const completedBosses = data.quests.filter((lesson) => lesson.status === "completed" && lesson.difficulty === "Boss").length;
  const milestones: MomentumMilestone[] = [
    { id: "first-boss", title: "First Boss Project", detail: "Complete your first Boss Project.", progress: completedBosses, target: 1, achieved: completedBosses >= 1 },
    { id: "five-lessons", title: "Five lessons", detail: "Complete 5 lessons.", progress: completedLessons, target: 5, achieved: completedLessons >= 5 },
    { id: "xp-500", title: "500 XP", detail: "Earn 500 total XP.", progress: data.player.xp, target: 500, achieved: data.player.xp >= 500 },
    { id: "focus-5-hours", title: "Five focused hours", detail: "Bank 5 hours of Focus Sessions.", progress: data.player.totalFocusMinutes, target: 300, achieved: data.player.totalFocusMinutes >= 300 },
    { id: "campaign-half", title: "Campaign halfway", detail: `Reach 50% in ${campaign.title}.`, progress: campaign.progress, target: 50, achieved: campaign.progress >= 50 },
    { id: "campaign-complete", title: "Campaign complete", detail: `Finish ${campaign.title}.`, progress: campaign.completed, target: campaign.total || 1, achieved: campaign.total > 0 && campaign.completed >= campaign.total },
  ];
  return { milestones, next: milestones.find((milestone) => !milestone.achieved) ?? milestones.at(-1) };
}

export type ShareReadyProgress = { level: number; xpThisWeek: number; focusMinutes: number; lessonsCompleted: number; topStat: string | null; campaign: string };

export function shareReadyProgress(data: ForgeData, campaign: Campaign): ShareReadyProgress {
  const weekly = weeklyProgress(data);
  return { level: data.player.level, xpThisWeek: weekly.xpEarned, focusMinutes: weekly.focusMinutes, lessonsCompleted: weekly.lessonsCompleted, topStat: weekly.strongestStat?.name ?? null, campaign: campaign.title };
}
