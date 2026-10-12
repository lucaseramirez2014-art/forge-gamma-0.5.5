export const forgeAnalyticsEvents = ["onboarding_completed", "campaign_created", "lesson_started", "lesson_completed", "focus_completed", "copilot_used", "campaign_completed", "pricing_viewed", "upgrade_clicked", "campaign_limit_hit", "copilot_limit_hit", "ai_generation_limit_hit", "checkout_started", "checkout_completed", "checkout_failed"] as const;
export type ForgeAnalyticsEvent = typeof forgeAnalyticsEvents[number];

export function trackForgeEvent(event: ForgeAnalyticsEvent, details: Record<string, string | number | boolean> = {}) {
  if (process.env.NODE_ENV !== "production") console.info("[FORGE analytics]", event, details);
}
