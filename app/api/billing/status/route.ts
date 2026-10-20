import { NextResponse } from "next/server";
import { getSubscriptionEntitlement } from "../../../../lib/stripeBilling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { status } = await getSubscriptionEntitlement();
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
