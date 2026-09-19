import { deapiMusicConfigured, deapiMusicModel, submitDeapiMusic } from "@/lib/media/deapi-music"
import { resolveMediaUser } from "@/lib/media/request"
import {
  acquireMusicInFlight,
  getMusicQuota,
  incrementMusicQuota,
  releaseMusicInFlight,
} from "@/lib/server/music-account-quota"

export const runtime = "nodejs"

function readInt(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function limitsForPlan(plan: string) {
  const paid = plan === "pro" || plan === "ultra" || plan === "owner"
  return {
    dailyLimit: paid
      ? readInt("MUSIC_PRO_DAILY_LIMIT", 30)
      : readInt("MUSIC_FREE_DAILY_LIMIT", 3),
    maxDuration: paid
      ? readInt("MUSIC_PRO_MAX_DURATION_SECONDS", 180)
      : readInt("MUSIC_FREE_DURATION_SECONDS", 30),
  }
}

function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max)
}

function validDuration(value: unknown) {
  const duration = Number(value)
  return Number.isFinite(duration) ? Math.floor(duration) : 30
}

export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  const limits = limitsForPlan(user.plan)
  const quota = user.authenticated && user.userId !== "guest"
    ? await getMusicQuota(user.userId, limits.dailyLimit)
    : {
        limit: limits.dailyLimit,
        used: 0,
        remaining: limits.dailyLimit,
        resetAt: "",
        storage: "runtime-memory" as const,
      }

  return Response.json({
    ok: true,
    configured: deapiMusicConfigured(),
    provider: "deapi",
    model: deapiMusicModel(),
    authenticated: user.authenticated,
    plan: user.plan,
    limits: {
      daily: limits.dailyLimit,
      maxDurationSeconds: limits.maxDuration,
      used: quota.used,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    },
  }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = cleanText(body?.prompt ?? body?.caption, 2000)
  const lyrics = cleanText(body?.lyrics, 12_000)
  const instrumental = body?.instrumental === true
  const duration = validDuration(body?.duration)
  const genre = cleanText(body?.genre, 40)
  const mood = cleanText(body?.mood, 60)
  const lyricsLanguage = cleanText(body?.lyricsLanguage, 8).toLowerCase()

  if (!prompt) {
    return Response.json({ ok: false, code: "PROMPT_REQUIRED", error: "Опишите, какую музыку нужно создать." }, { status: 400 })
  }

  if (!instrumental && body?.lyricsEnabled === true && !lyrics) {
    return Response.json({ ok: false, code: "LYRICS_REQUIRED", error: "Добавьте текст песни или отключите режим «Текст песни»." }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Войдите в аккаунт, чтобы создавать музыку.",
    }, { status: 401 })
  }

  if (!deapiMusicConfigured()) {
    return Response.json({
      ok: false,
      code: "DEAPI_NOT_CONFIGURED",
      error: "Музыкальный provider не настроен на сервере.",
    }, { status: 503 })
  }

  const limits = limitsForPlan(user.plan)
  const minDuration = 10

  if (duration < minDuration || duration > limits.maxDuration) {
    return Response.json({
      ok: false,
      code: "INVALID_DURATION",
      error: `Для вашего тарифа доступна длительность от ${minDuration} до ${limits.maxDuration} секунд.`,
      maxDurationSeconds: limits.maxDuration,
    }, { status: 400 })
  }

  const quota = await getMusicQuota(user.userId, limits.dailyLimit)
  if (quota.remaining <= 0) {
    return Response.json({
      ok: false,
      code: "MUSIC_DAILY_LIMIT_REACHED",
      error: "Дневной лимит генерации музыки исчерпан.",
      dailyLimit: quota.limit,
      used: quota.used,
      remaining: 0,
      resetAt: quota.resetAt,
    }, { status: 429 })
  }

  if (!acquireMusicInFlight(user.userId)) {
    return Response.json({
      ok: false,
      code: "MUSIC_GENERATION_IN_PROGRESS",
      error: "Для этого аккаунта уже отправляется музыкальная генерация. Подождите несколько секунд.",
      remaining: quota.remaining,
      dailyLimit: quota.limit,
    }, { status: 429 })
  }

  try {
    const languageHint =
      lyricsLanguage === "kk" ? "Kazakh-language vocals" :
      lyricsLanguage === "ru" ? "Russian-language vocals" :
      lyricsLanguage === "en" ? "English-language vocals" : ""

    const caption = [
      prompt,
      genre ? `genre: ${genre}` : "",
      mood ? `mood: ${mood}` : "",
      !instrumental && languageHint ? languageHint : "",
    ].filter(Boolean).join(", ")

    const submitted = await submitDeapiMusic({
      caption,
      duration,
      lyrics: instrumental ? undefined : lyrics || undefined,
      instrumental,
    })

    if (!submitted.ok) {
      return Response.json({
        ok: false,
        code: submitted.code,
        error: submitted.error,
      }, { status: submitted.status })
    }

    const nextQuota = await incrementMusicQuota(user.userId, limits.dailyLimit)
    const requestId = submitted.requestId

    console.info("[MUSIC] deAPI queued", {
      requestId: requestId.slice(0, 12),
      model: submitted.model,
      duration,
      plan: user.plan,
    })

    return Response.json({
      ok: true,
      provider: submitted.provider,
      model: submitted.model,
      request_id: requestId,
      requestId,
      status: "queued",
      statusUrl: `/api/media/music/status?requestId=${encodeURIComponent(requestId)}`,
      downloadUrl: `/api/media/music/file?requestId=${encodeURIComponent(requestId)}`,
      dailyLimit: nextQuota.limit,
      used: nextQuota.used,
      remaining: nextQuota.remaining,
      resetAt: nextQuota.resetAt,
      maxDurationSeconds: limits.maxDuration,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } finally {
    releaseMusicInFlight(user.userId)
  }
}
