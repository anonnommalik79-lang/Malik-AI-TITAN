import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { takeSharedRequestFrequency } from "@/lib/server/request-frequency"
import { getVoiceUsage } from "@/lib/voice/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function deepgramKey() {
  return process.env.DEEPGRAM_VOICE_API_KEY?.trim() || process.env.DEEPGRAM_API_KEY?.trim() || ""
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  if (!await takeSharedRequestFrequency("deepgram-token", entitlement.userId, 4)) {
    return Response.json({ ok: false, error: "RATE_LIMIT_REACHED" }, { status: 429 })
  }
  const quota = await getVoiceUsage(entitlement.userId, entitlement.plan === "owner")
  if (entitlement.plan !== "owner" && quota.remainingSeconds <= 0) {
    return Response.json({ ok: false, error: "voice_daily_limit_reached" }, { status: 429 })
  }

  const key = deepgramKey()
  if (!key) {
    return Response.json({ ok: false, error: "Deepgram Voice is not configured" }, { status: 503 })
  }

  try {
    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        authorization: `Token ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 120 }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    })

    const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; err_msg?: string } | null
    if (!response.ok || !payload?.access_token) {
      console.warn("[VOICE_DEEPGRAM_TOKEN_ERROR]", response.status, payload?.err_msg || "token grant failed")
      return Response.json({ ok: false, error: "Deepgram streaming token unavailable" }, { status: 503 })
    }

    return Response.json(
      { ok: true, accessToken: payload.access_token, expiresIn: payload.expires_in || 120 },
      { headers: { "cache-control": "no-store, private" } },
    )
  } catch (error) {
    console.warn("[VOICE_DEEPGRAM_TOKEN_ERROR]", error instanceof Error ? error.message : error)
    return Response.json({ ok: false, error: "Deepgram streaming token unavailable" }, { status: 503 })
  }
}
