import type { BillingInterval, SubscriptionStatus } from "./plans";
import { unverifiedFreeStatus } from "./plans";

type BillingResponse = { status?: SubscriptionStatus; url?: string; error?: string };

async function callBilling(path: string, body?: object) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as BillingResponse;
  if (!response.ok) throw new Error(payload.error || "Billing is not available right now.");
  return payload;
}

export async function getSubscriptionStatus() {
  const payload = await callBilling("/api/billing/status");
  return payload.status ?? unverifiedFreeStatus();
}

export async function startCheckout(interval: BillingInterval) {
  return callBilling("/api/billing/checkout", { interval });
}

export async function openBillingPortal() {
  return callBilling("/api/billing/portal", {});
}
