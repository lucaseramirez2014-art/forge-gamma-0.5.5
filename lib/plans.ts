import type { ForgeData, UsageLedger } from "./types";

export type PlanId = "free" | "gold";
export type BillingInterval = "monthly" | "yearly";
export type SubscriptionState = "free" | "gold_active" | "gold_canceled" | "gold_past_due" | "gold_expired";
export type SubscriptionStatus = {
  state: SubscriptionState;
  plan: PlanId;
  verified: boolean;
  provider: "unconfigured" | "billing-provider";
  interval?: BillingInterval;
  currentPeriodEnd?: string | null;
};
export type UsageKind = "copilot" | "campaign-generation";
export type LimitDecision = { ok: boolean; code?: "campaign-limit" | "copilot-limit" | "generation-limit"; message?: string };

const freeLimits = { activeCampaigns: 2, copilotMessagesPerWeek: 10, campaignGenerationsPerMonth: 2 } as const;
const goldLimits = { activeCampaigns: null, copilotMessagesPerWeek: 100, campaignGenerationsPerMonth: 20 } as const;

export const foundingGoldEnabled = process.env.NEXT_PUBLIC_FORGE_FOUNDING_GOLD === "true";
export const planConfig = {
  free: {
    id: "free" as const,
    name: "FORGE Free",
    label: "Free",
    price: { monthly: 0, yearly: 0 },
    limits: freeLimits,
    features: ["2 active created campaigns", "Unlimited lessons and Focus Sessions", "XP, levels, stats, and Today", "Basic weekly recap and share cards", "10 Copilot messages each week", "2 AI campaign generations each month"],
  },
  gold: {
    id: "gold" as const,
    name: "FORGE Gold",
    label: "Gold",
    price: { monthly: 5.99, yearly: 49.99 },
    limits: goldLimits,
    features: ["More active campaigns", "Expanded AI usage", "Adaptive campaign editing", "Deeper progress history", "Full share-card options"],
  },
} as const;

export const foundingGold = { monthly: 3.99, yearly: 34.99 } as const;

export function startOfWeekKey(date = new Date()) {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function emptyUsage(date = new Date()): UsageLedger {
  return { copilotWeek: startOfWeekKey(date), copilotMessages: 0, campaignGenerationMonth: monthKey(date), campaignGenerations: 0 };
}

export function currentUsage(usage: UsageLedger | undefined, date = new Date()): UsageLedger {
  const empty = emptyUsage(date);
  if (!usage) return empty;
  const copilotMessages = typeof usage.copilotMessages === "number" && Number.isFinite(usage.copilotMessages) ? Math.max(0, Math.floor(usage.copilotMessages)) : 0;
  const campaignGenerations = typeof usage.campaignGenerations === "number" && Number.isFinite(usage.campaignGenerations) ? Math.max(0, Math.floor(usage.campaignGenerations)) : 0;
  return {
    copilotWeek: empty.copilotWeek,
    copilotMessages: usage.copilotWeek === empty.copilotWeek ? copilotMessages : 0,
    campaignGenerationMonth: empty.campaignGenerationMonth,
    campaignGenerations: usage.campaignGenerationMonth === empty.campaignGenerationMonth ? campaignGenerations : 0,
  };
}

export function recordUsage(usage: UsageLedger | undefined, kind: UsageKind, date = new Date()) {
  const current = currentUsage(usage, date);
  return kind === "copilot"
    ? { ...current, copilotMessages: current.copilotMessages + 1 }
    : { ...current, campaignGenerations: current.campaignGenerations + 1 };
}

export function unverifiedFreeStatus(): SubscriptionStatus {
  return { state: "free", plan: "free", verified: false, provider: "unconfigured" };
}

export function getUserPlan(status: SubscriptionStatus): PlanId {
  return status.verified && status.state === "gold_active" && status.plan === "gold" ? "gold" : "free";
}

export function activeCreatedCampaignCount(data: ForgeData) {
  return data.campaigns.filter((campaign) => campaign.generated).length;
}

export function downgradeCampaignAccess(data: ForgeData) {
  const generated = data.campaigns.filter((campaign) => campaign.generated);
  const activeFirst = generated.slice().sort((left, right) => Number(right.id === data.activeCampaignId) - Number(left.id === data.activeCampaignId));
  const keep = activeFirst.slice(0, freeLimits.activeCampaigns).map((campaign) => campaign.id);
  const readOnly = activeFirst.slice(freeLimits.activeCampaigns).map((campaign) => campaign.id);
  return { keep, readOnly };
}

export function canCreateCampaign(data: ForgeData, status: SubscriptionStatus): LimitDecision {
  const plan = getUserPlan(status);
  const limit = planConfig[plan].limits.activeCampaigns;
  if (limit === null || activeCreatedCampaignCount(data) < limit) return { ok: true };
  return { ok: false, code: "campaign-limit", message: `You’ve reached the Free limit of ${limit} active campaigns. FORGE Gold gives you room for more paths.` };
}

export function canUseCopilot(usage: UsageLedger | undefined, status: SubscriptionStatus): LimitDecision {
  const plan = getUserPlan(status);
  const current = currentUsage(usage);
  const limit = planConfig[plan].limits.copilotMessagesPerWeek;
  if (current.copilotMessages < limit) return { ok: true };
  return { ok: false, code: "copilot-limit", message: "You’ve used your Free Copilot messages for this week. FORGE Gold includes expanded AI usage." };
}

export function canGenerateCampaign(usage: UsageLedger | undefined, status: SubscriptionStatus): LimitDecision {
  const plan = getUserPlan(status);
  const current = currentUsage(usage);
  const limit = planConfig[plan].limits.campaignGenerationsPerMonth;
  if (current.campaignGenerations < limit) return { ok: true };
  return { ok: false, code: "generation-limit", message: "You’ve used your Free AI campaign generations for this month. FORGE Gold includes expanded AI usage." };
}

export function canUseAdvancedHistory(status: SubscriptionStatus) { return getUserPlan(status) === "gold"; }
export function canUsePremiumShareCards(status: SubscriptionStatus) { return getUserPlan(status) === "gold"; }
export function canUseCampaignEditing(status: SubscriptionStatus) { return getUserPlan(status) === "gold"; }
