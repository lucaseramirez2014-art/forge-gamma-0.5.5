import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { type BillingInterval } from "../../../../lib/plans";
import { configuredPrice, getOrCreateBillingIdentity, publicBillingError } from "../../../../lib/stripeBilling";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function billingOrigin(request: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return configuredOrigin || new URL(request.url).origin;
}

function intervalFrom(value: unknown): BillingInterval | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

type StripeDiagnosticError = {
  type?: unknown;
  code?: unknown;
  param?: unknown;
  message?: unknown;
  requestId?: unknown;
  statusCode?: unknown;
};

function logStripeCheckoutError(error: unknown, operation: string) {
  const details = (error && typeof error === "object" ? error : {}) as StripeDiagnosticError;
  console.error("Stripe Checkout error", {
    operation,
    type: details.type,
    code: details.code,
    param: details.param,
    message: details.message,
    requestId: details.requestId,
    statusCode: details.statusCode,
  });
}

export async function POST(request: Request) {
  let body: { interval?: unknown };
  try {
    body = await request.json() as { interval?: unknown };
  } catch {
    return NextResponse.json({ error: "Choose a valid Gold billing interval." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const interval = intervalFrom(body.interval);
  if (!interval) return NextResponse.json({ error: "Choose either the monthly or yearly Gold plan." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  let operation = "initializing Stripe";
  let stripe: Stripe | null = null;
  let price: string | null = null;
  let origin: string | null = null;
  let identity: { forgeInstallationId: string; stripeCustomerId: string } | null = null;
  try {
    stripe = getStripe();
    operation = "resolving the selected Gold Price ID";
    price = configuredPrice(interval);
    origin = billingOrigin(request);
    operation = "creating or retrieving the FORGE billing customer";
    identity = await getOrCreateBillingIdentity();
    operation = "checking existing subscriptions";
    const existingSubscriptions = await stripe.subscriptions.list({ customer: identity.stripeCustomerId, status: "all", limit: 20 });
    if (existingSubscriptions.data.some((subscription) => subscription.status === "active" || subscription.status === "trialing")) {
      return NextResponse.json({ error: "Your FORGE Gold subscription is already active." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    operation = "checking open Checkout Sessions";
    const openSessions = await stripe.checkout.sessions.list({ customer: identity.stripeCustomerId, status: "open", limit: 10 });
    const existingSession = openSessions.data.find((session) => session.mode === "subscription" && session.metadata?.forgePlanInterval === interval && session.url);
    if (existingSession?.url) return NextResponse.json({ url: existingSession.url }, { headers: { "Cache-Control": "no-store" } });

    operation = "creating the hosted subscription Checkout Session";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: identity.stripeCustomerId,
      client_reference_id: identity.forgeInstallationId,
      metadata: { forgeInstallationId: identity.forgeInstallationId, forgePlanInterval: interval },
      subscription_data: { metadata: { forgeInstallationId: identity.forgeInstallationId, forgePlanInterval: interval } },
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logStripeCheckoutError(error, operation);
    if (process.env.NODE_ENV !== "production") console.error("[FORGE billing] checkout creation failed", publicBillingError(error));
    return NextResponse.json({ error: publicBillingError(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
