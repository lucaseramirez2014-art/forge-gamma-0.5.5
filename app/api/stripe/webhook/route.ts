import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { customerIdFrom, publicBillingError, subscriptionMetadata } from "../../../../lib/stripeBilling";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handledEvents = new Set<string>();

function rememberEvent(id: string) {
  if (handledEvents.has(id)) return false;
  handledEvents.add(id);
  if (handledEvents.size > 500) handledEvents.delete(handledEvents.values().next().value as string);
  return true;
}

async function updateCustomerFromSubscription(subscription: Stripe.Subscription) {
  const customerId = customerIdFrom(subscription.customer);
  if (!customerId) return;
  await getStripe().customers.update(customerId, { metadata: subscriptionMetadata(subscription) });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Stripe webhook verification is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  if (!rememberEvent(event.id)) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) await updateCustomerFromSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await updateCustomerFromSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
        if (subscriptionId) await updateCustomerFromSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[FORGE billing] webhook handling failed", publicBillingError(error));
    return NextResponse.json({ error: "Stripe event processing failed." }, { status: 500 });
  }
}
