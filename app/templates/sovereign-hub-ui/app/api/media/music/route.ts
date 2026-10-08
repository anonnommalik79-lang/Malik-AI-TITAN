import { resolveMediaUser } from "@/lib/media/request"
import { compileMusicBrief } from "@/lib/media/music-intent"
import { directMediaUrl } from "@/lib/os/media-reference"
import { musicModel, musicProviderConfigured, musicProviderName, submitDeapiMusic } from "@/lib/server/deapi-music"
import { generateMusicLyrics, resolveMusicLyricsLanguage } from "@/lib/server/music-lyrics"
import { recordMusicJobOwner } from "@/lib/server/music-job-ownership"
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
    configured: musicProviderConfigured(),
    providerConfigured: musicProviderConfigured(),
    provider: musicProviderName(),
    model: musicModel(),
    plan: user.plan,
    unlimited: quota.unlimited,
    dailyLimit: quota.unlimited ? null : quota.dailyLimit,
    used: quota.used,
    remaining: quota.unlimited ? null : quota.remaining,
    maxDurationSeconds: quota.maxDurationSeconds,
    resetAt: quota.resetAt,
    limits: {
      unlimited: quota.unlimited,
      daily: quota.unlimited ? null : quota.dailyLimit,
      maxDurationSeconds: quota.maxDurationSeconds,
      used: quota.used,
      remaining: quota.unlimited ? null : quota.remaining,
      resetAt: quota.resetAt,
    },
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || body?.caption || "").trim()
  const lyrics = String(body?.lyrics || "").trim()
  const requestedInstrumental = body?.instrumental !== false
  const requestedGenre = String(body?.genre || "").trim()
  const requestedMood = String(body?.mood || "").trim()
  const musicBrief = compileMusicBrief({
    prompt, lyrics, requestedInstrumental, genre: requestedGenre, mood: requestedMood,
  })
  const { instrumental, genre, mood, intent: promptIntent } = musicBrief
  const requestedLyricsLanguage = body?.lyricsLanguage
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
  const ownerMode = user.plan === "owner"
  if (!ownerMode && quota.remaining <= 0) {
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

  if (!ownerMode && !acquireMusicInFlight(user.userId)) {
    return Response.json({
      ok: false,
      code: "MUSIC_SUBMIT_IN_PROGRESS",
      error: "Запрос на генерацию уже отправляется. Подождите несколько секунд.",
    }, { status: 429 })
  }

  try {
    let resolvedLyrics = lyrics
    let lyricsGenerated = false
    let resolvedLyricsLanguage = resolveMusicLyricsLanguage(prompt, requestedLyricsLanguage)

    if (!instrumental && !resolvedLyrics) {
      try {
        const generated = await generateMusicLyrics({
          prompt,
          genre,
          mood,
          duration: Math.floor(requestedDuration),
          language: requestedLyricsLanguage,
        })
        resolvedLyrics = generated.lyrics
        resolvedLyricsLanguage = generated.language
        lyricsGenerated = true
      } catch (error) {
        return Response.json({
          ok: false,
          code: "MALIK_LYRICS_GENERATION_FAILED",
          error: error instanceof Error ? error.message : "Malik AI не смог написать слова песни.",
        }, { status: 503 })
      }
    }

    const styledPrompt = compileMusicBrief({
      prompt,
      lyrics: instrumental ? "" : resolvedLyrics,
      requestedInstrumental,
      genre,
      mood,
      lyricsLanguage: resolvedLyricsLanguage,
    }).providerPrompt

    const result = await submitDeapiMusic({
      prompt: styledPrompt,
      lyrics: instrumental ? undefined : resolvedLyrics,
      instrumental,
      duration: Math.floor(requestedDuration),
    })

    if (!result.ok) {
      return Response.json({
        ok: false,
        code: "MUSIC_SUBMIT_FAILED",
        error: result.error,
        provider: musicProviderName(),
        model: musicModel(),
      }, { status: result.status >= 400 && result.status < 600 ? result.status : 502 })
    }

    // Free.ai may complete synchronously and return a direct audio URL in POST.
    // Validate before exposing the URL; then let the browser verify the sound.
    const immediateUrl = result.status === "done" && "resultUrl" in result
      ? directMediaUrl(String(result.resultUrl || ""), String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
      : ""
    if (result.status === "done" && !immediateUrl) {
      return Response.json({
        ok: false,
        code: "MUSIC_AUDIO_URL_INVALID",
        error: "Музыкальный провайдер вернул некорректную ссылку на аудио.",
      }, { status: 502 })
    }

    const updatedQuota = await recordMusicUsage(user.userId, user.plan)
    const requestId = result.requestId
    const ownershipDurable = await recordMusicJobOwner(requestId, user.userId)

    return Response.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      requestId,
      request_id: requestId,
      ownershipDurable,
      status: immediateUrl ? "ready" : "queued",
      resultUrl: immediateUrl || undefined,
      deferred: Boolean("deferred" in result && result.deferred),
      statusUrl: `/api/media/music/status?requestId=${encodeURIComponent(requestId)}`,
      downloadUrl: immediateUrl || `/api/media/music/download?requestId=${encodeURIComponent(requestId)}`,
      unlimited: updatedQuota.unlimited,
      dailyLimit: updatedQuota.unlimited ? null : updatedQuota.dailyLimit,
      used: updatedQuota.used,
      remaining: updatedQuota.unlimited ? null : updatedQuota.remaining,
      maxDurationSeconds: updatedQuota.maxDurationSeconds,
      resetAt: updatedQuota.resetAt,
      lyrics: instrumental ? "" : resolvedLyrics,
      lyricsGenerated,
      lyricsLanguage: instrumental ? null : resolvedLyricsLanguage,
      lyricsEngine: lyricsGenerated ? "Malik AI" : "user",
      instrumental,
      genre: promptIntent.genre || genre || "other",
      mood: promptIntent.mood || mood || "Другое",
      detectedIntent: {
        vocalDirective: promptIntent.vocalDirective,
        instruments: promptIntent.instruments,
        excludedInstruments: promptIntent.excludedInstruments,
        bpm: promptIntent.bpm,
        explicit: promptIntent.explicit,
      },
    }, { headers: { "Cache-Control": "no-store" } })
  } finally {
    if (!ownerMode) releaseMusicInFlight(user.userId)
  }
}
