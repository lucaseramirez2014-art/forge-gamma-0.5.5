import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  let openRouterTestStatus: number | null = null;
  let openRouterReachable = false;

  if (apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // This authentication-only endpoint does not create a completion or return its body.
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        method: "GET",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      openRouterTestStatus = response.status;
      openRouterReachable = true;
    } catch {
      // Keep network failures distinguishable from provider HTTP responses.
    } finally {
      clearTimeout(timeout);
    }
  }

  return NextResponse.json({
    environment: process.env.VERCEL_ENV ?? null,
    hasOpenRouterKey: Boolean(apiKey),
    keyLength: apiKey?.length ?? 0,
    openRouterTestStatus,
    openRouterReachable,
  }, { headers: { "Cache-Control": "no-store" } });
}
