import { resolveMediaUser } from "@/lib/media/request"
import { musicModel, musicProviderConfigured, submitDeapiMusic } from "@/lib/server/deapi-music"
import {
  acquireMusicInFlight,
  getMusicQuota,
  recordMusicUsage,
  releaseMusicInFlight,
} from "@/lib/server/music-account-quota"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  const quota = await getMusicQuota(user.userId, user.plan)
  return Response.json({
    ok: true,
    authenticated: user.authenticated,
    providerConfigured: musicProviderConfigured(),
    provider: "deAPI",
    model: musicModel(),
    plan: user.plan,
    dailyLimit: quota.dailyLimit,
    used: quota.used,
    remaining: quota.remaining,
    maxDurationSeconds: quota.maxDurationSeconds,
    resetAt: quota.resetAt,
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || body?.caption || "").trim()
  const lyrics = String(body?.lyrics || "").trim()
  const instrumental = body?.instrumental !== false
  const requestedDuration = Number(body?.duration || 30)

  if (!prompt) {
    return Response.json({ ok: false, code: "PROMPT_REQUIRED", error: "Опишите музыку, которую хотите создать." }, { status: 400 })
  }
  if (prompt.length > 2000) {
    return Response.json({ ok: false, code: "PROMPT_TOO_LONG", error: "Описание музыки слишком длинное." }, { status: 400 })
  }
  if (lyrics.length > 12000) {
    return Response.json({ ok: false, code: "LYRICS_TOO_LONG", error: "Текст песни слишком длинный." }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Войдите в аккаунт, чтобы создавать музыку.",
    }, { status: 401 })
  }

  const quota = await getMusicQuota(user.userId, user.plan)
  if (quota.remaining <= 0) {
    return Response.json({
      ok: false,
      code: "MUSIC_DAILY_LIMIT_REACHED",
      error: "Дневной лимит генерации музыки исчерпан.",
      dailyLimit: quota.dailyLimit,
      remaining: 0,
      resetAt: quota.resetAt,
    }, { status: 429 })
  }

  if (!Number.isFinite(requestedDuration) || requestedDuration < 10 || requestedDuration > quota.maxDurationSeconds || requestedDuration > 300) {
    return Response.json({
      ok: false,
      code: "MUSIC_DURATION_NOT_ALLOWED",
      error: `Для вашего тарифа доступна длительность до ${quota.maxDurationSeconds} секунд.`,
      maxDurationSeconds: quota.maxDurationSeconds,
    }, { status: 400 })
  }

  if (!musicProviderConfigured()) {
    return Response.json({
      ok: false,
      code: "MUSIC_PROVIDER_NOT_CONFIGURED",
      error: "Музыкальный provider не настроен на сервере.",
    }, { status: 503 })
  }

  if (!acquireMusicInFlight(user.userId)) {
    return Response.json({
      ok: false,
      code: "MUSIC_SUBMIT_IN_PROGRESS",
      error: "Запрос на генерацию уже отправляется. Подождите несколько секунд.",
    }, { status: 429 })
  }

  try {
    const result = await submitDeapiMusic({
      prompt,
      lyrics: instrumental ? undefined : lyrics,
      instrumental,
      duration: Math.floor(requestedDuration),
    })

    if (!result.ok) {
      return Response.json({
        ok: false,
        code: "DEAPI_MUSIC_SUBMIT_FAILED",
        error: result.error,
        provider: "deAPI",
        model: musicModel(),
      }, { status: result.status >= 400 && result.status < 600 ? result.status : 502 })
    }

    const updatedQuota = await recordMusicUsage(user.userId, user.plan)
    const requestId = result.requestId

    return Response.json({
      ok: true,
      provider: "deAPI",
      model: result.model,
      requestId,
      request_id: requestId,
      status: "queued",
      statusUrl: `/api/media/music/status?requestId=${encodeURIComponent(requestId)}`,
      downloadUrl: `/api/media/music/download?requestId=${encodeURIComponent(requestId)}`,
      dailyLimit: updatedQuota.dailyLimit,
      remaining: updatedQuota.remaining,
      maxDurationSeconds: updatedQuota.maxDurationSeconds,
      resetAt: updatedQuota.resetAt,
    }, { headers: { "Cache-Control": "no-store" } })
  } finally {
    releaseMusicInFlight(user.userId)
  }
}