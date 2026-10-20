import { NextResponse } from "next/server";
import { getStoredBillingIdentity, publicBillingError } from "../../../../lib/stripeBilling";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function billingOrigin(request: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return configuredOrigin || new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const identity = await getStoredBillingIdentity();
    if (!identity) return NextResponse.json({ error: "No FORGE Gold billing profile was found in this browser." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const session = await getStripe().billingPortal.sessions.create({ customer: identity.stripeCustomerId, return_url: `${billingOrigin(request)}/settings` });
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[FORGE billing] portal creation failed", publicBillingError(error));
    return NextResponse.json({ error: publicBillingError(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
