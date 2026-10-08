import { maxVideoPromptLength } from "@/lib/media/config"
import { checkMediaLimit, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import { hasMalikProAccess } from "@/lib/ai/malik-models"
import { routeVideoGeneration } from "@/lib/media/video-router"
import { getArtifact } from "@/lib/os/store"
import { directMediaUrl } from "@/lib/os/media-reference"
import { getVideoJob } from "@/lib/media/jobs"
import type { VideoProviderId, VideoResolution } from "@/lib/media/types"
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
  let imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : undefined
  const imageArtifactId = typeof body?.imageArtifactId === "string" ? body.imageArtifactId.trim() : ""
  const sourceVideoUrl = typeof body?.sourceVideoUrl === "string" ? body.sourceVideoUrl.trim() : undefined
  const sourceDurationSeconds = Number(body?.sourceDurationSeconds || 0)
  const editOperation = body?.editOperation === "extend" ? "extend" : "edit"
  const sourceTaskId = typeof body?.sourceTaskId === "string" ? body.sourceTaskId.trim() : ""
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
  if (mode === "image" && !imageUrl && !imageArtifactId) {
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
  if (mode === "text" && (imageUrl || imageArtifactId || sourceVideoUrl)) {
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
  const proAccess = hasMalikProAccess(user.plan)
  // One free video model. Premium provider selection is enforced server-side
  // and cannot be bypassed by changing the client JSON request.
  if (!providerId && !proAccess) providerId = "novai"
  if (!proAccess && (providerId !== "novai" || mode !== "text")) {
    return Response.json({
      ok: false,
      code: "MALIK_PRO_REQUIRED",
      error: "Эта видеомодель или режим доступен только в Malik PRO.",
      upgrade: "pro",
    }, { status: 402, headers: { "Cache-Control": "no-store" } })
  }

  if (editOperation === "extend") {
    const sourceJob = sourceTaskId ? await getVideoJob(sourceTaskId, user.userId) : null
    const safeSource = directMediaUrl(sourceVideoUrl || "", String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
    if (mode !== "video" || !sourceJob || sourceJob.status !== "completed" || !safeSource || directMediaUrl(sourceJob.videoUrl || "") !== safeSource) {
      return Response.json({ ok: false, code: "VIDEO_EXTEND_SOURCE_INVALID", error: "Продлить можно только своё готовое видео по проверенной прямой ссылке." }, { status: 400 })
    }
    if (providerId !== "runway" || !(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET) || String(process.env.RUNWAY_VIDEO_EDIT_MODEL || "").trim() !== "seedance2_5") {
      return Response.json({ ok: false, code: "VIDEO_EXTEND_UNAVAILABLE", error: "Продление видео через Runway Seedance 2.5 сейчас не подключено." }, { status: 503 })
    }
  }

  if (imageArtifactId) {
    if (mode !== "image" || imageUrl || providerId && providerId !== "runway") {
      return Response.json({ ok: false, code: "INVALID_IMAGE_ARTIFACT", error: "Изображение проекта можно передать только в режим Фото → Видео через Runway." }, { status: 400 })
    }
    const artifact = await getArtifact(user.userId, imageArtifactId)
    if (artifact?.kind !== "image" || !artifact.url || !directMediaUrl(artifact.url, String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))) {
      return Response.json({ ok: false, code: "IMAGE_ARTIFACT_NOT_FOUND", error: "Изображение проекта не найдено или недоступно по прямой ссылке." }, { status: 404 })
    }
    imageUrl = artifact.url
    providerId = "runway"
  }

  // Source-driven modes must use a provider that can consume the uploaded
  // provider-native asset. Magic Hour and Runway both support source media.
  if ((mode === "image" || mode === "video") && providerId && providerId !== "magichour" && providerId !== "runway") {
    return Response.json({
      ok: false,
      code: "VIDEO_SOURCE_PROVIDER_UNSUPPORTED",
      error: "Для Фото/Видео → Видео выберите Magic Hour или Runway.",
    }, { status: 400 })
  }
  if ((mode === "image" || mode === "video") && !providerId) providerId = "magichour"

  // The verified founder account is unlimited at the Malik AI application layer.
  // Regular accounts keep the durable one-video-per-day gate.
  const persistedQuota = ownerMode ? null : await getVideoAccountDailyQuota(user.userId)
  if (!ownerMode && persistedQuota && !persistedQuota.available) {
    return Response.json({
      ok: false,
      code: "VIDEO_ACCOUNT_DAILY_LIMIT_REACHED",
      error: "Сегодняшняя генерация видео на этом аккаунте уже использована. Лимит обновится завтра.",
      remainingDailyVideos: 0,
      dailyVideoLimit: 1,
      resetAt: persistedQuota.resetAt,
      quotaStorage: persistedQuota.storage,
    }, { status: 429 })
  }

  const legacyLimit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "video" })
  if (!legacyLimit.ok) {
    return Response.json({
      ok: false,
      error: legacyLimit.error,
      code: legacyLimit.code,
      resetAt: legacyLimit.resetAt,
      plan: legacyLimit.plan,
      remainingDailyVideos: ownerMode ? null : 0,
      dailyVideoLimit: ownerMode ? null : 1,
      unlimited: ownerMode,
    }, { status: 429 })
  }

  if (!ownerMode && !acquireVideoAccountInFlight(user.userId)) {
    return Response.json({
      ok: false,
      code: "VIDEO_GENERATION_IN_PROGRESS",
      error: "На этом аккаунте уже идёт генерация видео. Дождитесь её завершения.",
      remainingDailyVideos: 1,
      dailyVideoLimit: 1,
      unlimited: false,
    }, { status: 429 })
  }

  try {
    const result = await routeVideoGeneration({
      prompt,
      imageUrl: mode === "image" ? imageUrl : undefined,
      sourceVideoUrl: mode === "video" ? sourceVideoUrl : undefined,
      sourceDurationSeconds: mode === "video" ? sourceDurationSeconds : undefined,
      editOperation: mode === "video" ? editOperation : undefined,
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
        remainingDailyVideos: ownerMode ? null : 1,
        dailyVideoLimit: ownerMode ? null : 1,
        unlimited: ownerMode,
        resetAt: persistedQuota?.resetAt,
        plan: legacyLimit.plan,
      }, { status: result.status === "disabled" ? 503 : 502 })
    }

    const quota = ownerMode ? null : await markVideoAccountDailyQuota(user.userId)
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
      remainingDailyVideos: ownerMode ? null : 0,
      dailyVideoLimit: ownerMode ? null : 1,
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
