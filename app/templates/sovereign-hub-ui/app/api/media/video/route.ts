import { maxVideoPromptLength } from "@/lib/media/config"
import { checkMediaLimit, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import { routeVideoGeneration } from "@/lib/media/video-router"
import type { VideoProviderId, VideoResolution } from "@/lib/media/types"
import { videoCapability, videoSupportsDuration, videoSupportsMode, videoSupportsResolution } from "@/lib/media/video-capabilities"
import {
  acquireVideoAccountInFlight,
  getVideoAccountDailyQuota,
  markVideoAccountDailyQuota,
  releaseVideoAccountInFlight,
} from "@/lib/server/video-account-quota"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

export const POST = withCompute(handlePOST, "video")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || "").trim()
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : undefined
  const sourceVideoUrl = typeof body?.sourceVideoUrl === "string" ? body.sourceVideoUrl.trim() : undefined
  const sourceDurationSeconds = Number(body?.sourceDurationSeconds || 0)
  const requestedMode = String(body?.mode || "").trim()
  const mode = requestedMode === "image" || requestedMode === "video" || requestedMode === "text"
    ? requestedMode
    : sourceVideoUrl
      ? "video"
      : imageUrl
        ? "image"
        : "text"

  const length = body?.length === 10 ? 10 : 5
  const resolution = (["480p", "720p", "1080p", "2k"].includes(body?.resolution) ? body.resolution : "720p") as VideoResolution
  const ratio = ["16:9", "9:16", "1:1"].includes(body?.ratio) ? body.ratio : "16:9"
  const generateAudio = body?.generateAudio !== false
  const providerRaw = typeof body?.provider === "string" ? body.provider.trim() : ""
  const validProviders = new Set<VideoProviderId>(["novai", "magichour", "pixazo", "cliptaps", "h3", "dashscope", "pollo", "runway", "fal", "luma", "veo"])
  let providerId = providerRaw && validProviders.has(providerRaw as VideoProviderId) ? providerRaw as VideoProviderId : undefined

  if (providerRaw && !providerId) {
    return Response.json({ ok: false, error: "Unknown video provider", code: "INVALID_VIDEO_PROVIDER" }, { status: 400 })
  }

  if (!prompt) {
    return Response.json({ ok: false, error: "Prompt is required", code: "PROMPT_REQUIRED" }, { status: 400 })
  }
  if (mode === "image" && !imageUrl) {
    return Response.json({ ok: false, error: "Загрузите фото для режима Изображение → Видео.", code: "IMAGE_SOURCE_REQUIRED" }, { status: 400 })
  }
  if (mode === "video" && !sourceVideoUrl) {
    return Response.json({ ok: false, error: "Загрузите видео для режима Видео → Видео.", code: "VIDEO_SOURCE_REQUIRED" }, { status: 400 })
  }
  if (mode === "video" && (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds < 3 || sourceDurationSeconds > 10.05)) {
    return Response.json({
      ok: false,
      error: "Для AI-редактирования загрузите видео длительностью от 3 до 10 секунд.",
      code: "VIDEO_SOURCE_DURATION_UNSUPPORTED",
    }, { status: 400 })
  }
  if (mode === "text" && (imageUrl || sourceVideoUrl)) {
    return Response.json({ ok: false, error: "Source media is not accepted in text-to-video mode", code: "UNEXPECTED_VIDEO_SOURCE" }, { status: 400 })
  }

  if (prompt.length > maxVideoPromptLength()) {
    return Response.json({
      ok: false,
      error: `Prompt too long (${prompt.length}/${maxVideoPromptLength()})`,
      code: "PROMPT_TOO_LONG",
    }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Войдите в аккаунт, чтобы использовать MalikVideo.",
    }, { status: 401 })
  }
  const ownerMode = user.plan === "owner"

  if (providerId) {
    const capability = videoCapability(providerId)
    if (!videoSupportsMode(providerId, mode)) {
      return Response.json({
        ok: false,
        code: "VIDEO_MODE_UNSUPPORTED_BY_PROVIDER",
        error: `${capability.label} не поддерживает режим ${mode === "image" ? "Фото → Видео" : mode === "video" ? "Видео → Видео" : "Текст → Видео"}.`,
        provider: providerId,
        supportedModes: capability.modes,
      }, { status: 422 })
    }
    if (!videoSupportsDuration(providerId, length)) {
      return Response.json({
        ok: false,
        code: "VIDEO_DURATION_UNSUPPORTED_BY_PROVIDER",
        error: `${capability.label} не поддерживает ${length} секунд.`,
        provider: providerId,
        supportedDurations: capability.durations,
      }, { status: 422 })
    }
    if (!videoSupportsResolution(providerId, resolution)) {
      return Response.json({
        ok: false,
        code: "VIDEO_RESOLUTION_UNSUPPORTED_BY_PROVIDER",
        error: `${capability.label} не поддерживает ${resolution}.`,
        provider: providerId,
        supportedResolutions: capability.resolutions,
      }, { status: 422 })
    }
  }

  const legacyLimit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "video" })
  const dailyVideoLimit = ownerMode ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(legacyLimit.max || 0))
  const persistedQuota = ownerMode ? null : await getVideoAccountDailyQuota(user.userId, dailyVideoLimit)
  if (!ownerMode && persistedQuota && !persistedQuota.available) {
    return Response.json({
      ok: false,
      code: "VIDEO_ACCOUNT_DAILY_LIMIT_REACHED",
      error: "Лимит видео на сегодня исчерпан.",
      remainingDailyVideos: persistedQuota.remaining,
      dailyVideoLimit,
      resetAt: persistedQuota.resetAt,
      quotaStorage: persistedQuota.storage,
    }, { status: 429 })
  }


  if (!legacyLimit.ok) {
    return Response.json({
      ok: false,
      error: legacyLimit.error,
      code: legacyLimit.code,
      resetAt: legacyLimit.resetAt,
      plan: legacyLimit.plan,
      remainingDailyVideos: ownerMode ? null : legacyLimit.remaining,
      dailyVideoLimit: ownerMode ? null : dailyVideoLimit,
      unlimited: ownerMode,
    }, { status: 429 })
  }

  if (!ownerMode && !acquireVideoAccountInFlight(user.userId)) {
    return Response.json({
      ok: false,
      code: "VIDEO_GENERATION_IN_PROGRESS",
      error: "На этом аккаунте уже идёт генерация видео. Дождитесь её завершения.",
      remainingDailyVideos: ownerMode ? null : Math.max(0, legacyLimit.remaining),
      dailyVideoLimit: ownerMode ? null : dailyVideoLimit,
      unlimited: false,
    }, { status: 429 })
  }

  try {
    const result = await routeVideoGeneration({
      prompt,
      imageUrl: mode === "image" ? imageUrl : undefined,
      sourceVideoUrl: mode === "video" ? sourceVideoUrl : undefined,
      sourceDurationSeconds: mode === "video" ? sourceDurationSeconds : undefined,
      mode,
      length,
      resolution,
      ratio,
      generateAudio,
      providerId,
      userId: user.userId,
      plan: user.plan,
    })

    if (!result.ok) {
      return Response.json({
        ok: false,
        error: result.error || "Video generation unavailable",
        provider: result.provider,
        model: result.model,
        status: result.status,
        stage: result.stage,
        outputResolution: result.outputResolution,
        remainingDailyVideos: ownerMode ? null : Math.max(0, legacyLimit.remaining),
        dailyVideoLimit: ownerMode ? null : dailyVideoLimit,
        unlimited: ownerMode,
        resetAt: persistedQuota?.resetAt,
        plan: legacyLimit.plan,
      }, { status: result.status === "disabled" ? 503 : 502 })
    }

    const quota = ownerMode ? null : await markVideoAccountDailyQuota(user.userId, dailyVideoLimit)
    if (!ownerMode) await recordMediaUsage(user.userId, "video")

    return Response.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      mode,
      length,
      taskId: result.taskId,
      status: result.status,
      stage: result.stage,
      outputResolution: result.outputResolution || resolution,
      remainingDailyVideos: ownerMode ? null : Math.max(0, Number(quota?.remaining ?? legacyLimit.remaining - 1)),
      dailyVideoLimit: ownerMode ? null : dailyVideoLimit,
      unlimited: ownerMode,
      globalDailyLimit: null,
      statusUrl: `/api/media/video/status?taskId=${encodeURIComponent(result.taskId)}&provider=${encodeURIComponent(result.provider)}`,
      resetAt: quota?.resetAt,
      quotaStorage: quota?.storage,
      plan: legacyLimit.plan,
    })
  } finally {
    if (!ownerMode) releaseVideoAccountInFlight(user.userId)
  }
}
