import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { consumeVoiceUsage, getVoiceUsage } from "@/lib/voice/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function response(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store" } })
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const unlimited = entitlement.plan === "owner"
  const quota = await getVoiceUsage(entitlement.userId, unlimited)
  return response({ ok: true, quota })
}

/**
 * Gemini Live runs browser -> Google, so this heartbeat meters only the time
 * the microphone is actually attached. The client reports small slices while
 * capture is active; the same daily counter is shared with legacy STT.
 */
export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const unlimited = entitlement.plan === "owner"
  const before = await getVoiceUsage(entitlement.userId, unlimited)

  if (!unlimited && before.remainingSeconds <= 0) {
    return response({ ok: false, code: "VOICE_DAILY_LIMIT_REACHED", error: "Лимит Voice на сегодня использован. Доступ восстановится завтра.", quota: before }, 429)
  }

  const body = await request.json().catch(() => ({})) as { seconds?: unknown }
  const seconds = Math.max(0, Math.min(15, Number(body.seconds) || 0))
  if (!seconds) return response({ ok: true, quota: before })

  const quota = await consumeVoiceUsage(entitlement.userId, seconds, unlimited)
  if (!quota.ok) {
    return response({ ok: false, code: "VOICE_DAILY_LIMIT_REACHED", error: "Лимит Voice на сегодня использован. Доступ восстановится завтра.", quota }, 429)
  }
  return response({ ok: true, quota })
}
