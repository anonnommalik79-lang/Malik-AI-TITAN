import { NextResponse } from "next/server"

import { mintLiveToken } from "@/lib/server/gemini-live-token"
import { LIVE_WS_URL } from "@/lib/voice/gemini-live-setup"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { getVoiceUsage } from "@/lib/voice/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const unlimited = entitlement.plan === "owner"
  const quota = getVoiceUsage(entitlement.userId, unlimited)
  if (!unlimited && quota.remainingSeconds <= 0) {
    return NextResponse.json(
      { ok: false, error: "voice_daily_limit_reached", displayMessage: "Лимит Voice на сегодня использован. Доступ восстановится завтра.", quota },
      { status: 429, headers: { "cache-control": "no-store, private" } },
    )
  }

  const minted = await mintLiveToken()
  if (!minted.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: minted.reason === "no_key" ? "voice_live_not_configured" : "voice_live_token_unavailable",
        reason: minted.reason,
        displayMessage: minted.message,
      },
      { status: minted.status },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      accessToken: minted.token,
      model: minted.model,
      websocketUrl: LIVE_WS_URL,
      unlimited,
      remainingSeconds: unlimited ? null : quota.remainingSeconds,
      resetAt: quota.resetAt,
    },
    { headers: { "cache-control": "no-store, private" } },
  )
}
