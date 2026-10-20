import { cookies } from "next/headers";
import type Stripe from "stripe";
import { type BillingInterval, type SubscriptionState, type SubscriptionStatus, unverifiedFreeStatus } from "./plans";
import { getStripe } from "./stripe";

const INSTALLATION_COOKIE = "forge_installation_id";
const CUSTOMER_COOKIE = "forge_stripe_customer_id";
const yearInSeconds = 60 * 60 * 24 * 365;

export type BillingIdentity = {
  forgeInstallationId: string;
  stripeCustomerId: string;
};

export type StripeSubscriptionLink = BillingIdentity & {
  stripeSubscriptionId: string | null;
  plan: "free" | "gold";
  subscriptionStatus: SubscriptionState;
  currentPeriodEnd: string | null;
};

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: yearInSeconds,
};

function asId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function stripeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Stripe billing is not configured.") return "Stripe billing is not configured for this deployment.";
  if (message.startsWith("The FORGE Gold ") && (message.endsWith(" price is not configured.") || message.endsWith(" price is invalid."))) return "The selected FORGE Gold plan is not configured correctly for this deployment.";
  if (error && typeof error === "object" && "type" in error) {
    const type = String(error.type);
    if (type === "StripeAuthenticationError") return "Stripe could not verify the billing configuration.";
    if (type === "StripePermissionError") return "The Stripe billing key does not have the access FORGE needs.";
    if (type === "StripeInvalidRequestError") return "FORGE's Stripe plan configuration needs attention before Checkout can open.";
    if (type === "StripeRateLimitError") return "Billing is busy right now. Please try again shortly.";
    if (type === "StripeAPIConnectionError") return "FORGE could not reach Stripe right now. Please try again shortly.";
  }
  return "Billing is unavailable right now. Please try again.";
}

export function configuredPrice(interval: BillingInterval) {
  const configuredPrices: Record<BillingInterval, string | undefined> = {
    monthly: process.env.STRIPE_GOLD_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_GOLD_YEARLY_PRICE_ID,
  };
  const price = configuredPrices[interval]?.trim();
  if (!price) throw new Error(`The FORGE Gold ${interval} price is not configured.`);
  if (!price.startsWith("price_")) throw new Error(`The FORGE Gold ${interval} price is invalid.`);
  return price;
}

async function validCustomer(customerId: string, forgeInstallationId: string) {
  const customer = await getStripe().customers.retrieve(customerId);
  return !customer.deleted && customer.metadata.forgeInstallationId === forgeInstallationId;
}

export async function getOrCreateBillingIdentity(): Promise<BillingIdentity> {
  const cookieStore = await cookies();
  const existingInstallation = cookieStore.get(INSTALLATION_COOKIE)?.value;
  const forgeInstallationId = existingInstallation || crypto.randomUUID();
  if (!existingInstallation) cookieStore.set(INSTALLATION_COOKIE, forgeInstallationId, cookieOptions);

  const existingCustomerId = cookieStore.get(CUSTOMER_COOKIE)?.value;
  if (existingCustomerId) {
    try {
      if (await validCustomer(existingCustomerId, forgeInstallationId)) return { forgeInstallationId, stripeCustomerId: existingCustomerId };
    } catch {
      // A deleted or unavailable customer is safely replaced on the next checkout.
    }
  }

  const customer = await getStripe().customers.create({ metadata: { forgeInstallationId } });
  cookieStore.set(CUSTOMER_COOKIE, customer.id, cookieOptions);
  return { forgeInstallationId, stripeCustomerId: customer.id };
}

export async function getStoredBillingIdentity(): Promise<BillingIdentity | null> {
  const cookieStore = await cookies();
  const forgeInstallationId = cookieStore.get(INSTALLATION_COOKIE)?.value;
  const stripeCustomerId = cookieStore.get(CUSTOMER_COOKIE)?.value;
  if (!forgeInstallationId || !stripeCustomerId) return null;
  try {
    if (!(await validCustomer(stripeCustomerId, forgeInstallationId))) return null;
    return { forgeInstallationId, stripeCustomerId };
  } catch {
    return null;
  }
}

function intervalFor(subscription: Stripe.Subscription): BillingInterval | undefined {
  const recurring = subscription.items.data[0]?.price.recurring;
  return recurring?.interval === "year" ? "yearly" : recurring?.interval === "month" ? "monthly" : undefined;
}

function periodEndFor(subscription: Stripe.Subscription) {
  const seconds = subscription.items.data[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

function stateFor(subscription: Stripe.Subscription): SubscriptionState {
  if (subscription.status === "active" || subscription.status === "trialing") return "gold_active";
  if (subscription.status === "past_due" || subscription.status === "unpaid") return "gold_past_due";
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") return "gold_expired";
  return "gold_canceled";
}

function latestSubscription(subscriptions: Stripe.Subscription[]) {
  return subscriptions.slice().sort((left, right) => right.created - left.created)[0] ?? null;
}

export async function getSubscriptionEntitlement(): Promise<{ status: SubscriptionStatus; link: StripeSubscriptionLink | null }> {
  if (!process.env.STRIPE_SECRET_KEY) return { status: unverifiedFreeStatus(), link: null };
  const identity = await getStoredBillingIdentity();
  if (!identity) return { status: { state: "free", plan: "free", verified: true, provider: "billing-provider" }, link: null };
  try {
    const subscriptions = await getStripe().subscriptions.list({ customer: identity.stripeCustomerId, status: "all", limit: 20 });
    const subscription = latestSubscription(subscriptions.data);
    if (!subscription) return { status: { state: "free", plan: "free", verified: true, provider: "billing-provider" }, link: { ...identity, stripeSubscriptionId: null, plan: "free", subscriptionStatus: "free", currentPeriodEnd: null } };
    const state = stateFor(subscription);
    const interval = intervalFor(subscription);
    const currentPeriodEnd = periodEndFor(subscription);
    const isGold = state === "gold_active";
    return {
      status: { state, plan: isGold ? "gold" : "free", verified: true, provider: "billing-provider", interval, currentPeriodEnd },
      link: { ...identity, stripeSubscriptionId: subscription.id, plan: isGold ? "gold" : "free", subscriptionStatus: state, currentPeriodEnd },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[FORGE billing] subscription lookup failed", stripeErrorMessage(error));
    return { status: unverifiedFreeStatus(), link: null };
  }
}

export function publicBillingError(error: unknown) {
  return stripeErrorMessage(error);
}

export function subscriptionMetadata(subscription: Stripe.Subscription) {
  const interval = intervalFor(subscription);
  return {
    forgeSubscriptionId: subscription.id,
    forgePlan: stateFor(subscription) === "gold_active" ? "gold" : "free",
    forgeSubscriptionStatus: stateFor(subscription),
    forgeCurrentPeriodEnd: periodEndFor(subscription) ?? "",
    forgePlanInterval: interval ?? "",
  };
}

export function customerIdFrom(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  return asId(value);
}
