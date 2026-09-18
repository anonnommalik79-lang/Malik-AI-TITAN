import { maxVideoPromptLength } from "@/lib/media/config"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import { routeVideoGeneration } from "@/lib/media/video-router"
import { isFreeVideoProvider } from "@/lib/media/providers/free-video"
import type { VideoProviderId, VideoResolution } from "@/lib/media/types"
import { acquireVideoDailySlot, videoDailyLimitResponse } from "@/lib/server/media-availability"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

export const POST = withCompute(handlePOST, "video")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || "").trim()
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : undefined
  const length = body?.length === 10 ? 10 : 5
  const resolution = (["480p", "720p", "1080p", "2k"].includes(body?.resolution) ? body.resolution : "720p") as VideoResolution
  const ratio = ["16:9", "9:16", "1:1"].includes(body?.ratio) ? body.ratio : "16:9"
  const generateAudio = body?.generateAudio !== false
  const providerRaw = typeof body?.provider === "string" ? body.provider.trim() : ""
  const validProviders = new Set<VideoProviderId>(["novai", "magichour", "pixazo", "cliptaps", "h3", "dashscope", "pollo", "runway", "fal", "luma", "veo"])
  const providerId = providerRaw && validProviders.has(providerRaw as VideoProviderId) ? providerRaw as VideoProviderId : undefined

  if (providerRaw && !providerId) {
    return Response.json({ ok: false, error: "Unknown video provider", code: "INVALID_VIDEO_PROVIDER" }, { status: 400 })
  }

  if (!prompt && !imageUrl) {
    return Response.json({ ok: false, error: "Prompt or imageUrl is required" }, { status: 400 })
  }

  if (prompt.length > maxVideoPromptLength()) {
    return Response.json({
      ok: false,
      error: `Prompt too long (${prompt.length}/${maxVideoPromptLength()})`,
      code: "PROMPT_TOO_LONG",
    }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  const limit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "video" })
  if (!limit.ok) {
    return Response.json({
      ok: false,
      error: limit.error,
      code: limit.code,
      resetAt: limit.resetAt,
      plan: limit.plan,
      remainingDailyVideos: 0,
    }, { status: 429 })
  }

  let globalResetAt = nextMediaResetAt()
  const usesProviderManagedQuota = !providerId || isFreeVideoProvider(providerId)
  if (!usesProviderManagedQuota) {
    const globalSlot = await acquireVideoDailySlot(user.userId)
    if (!globalSlot.available) {
      return videoDailyLimitResponse(globalSlot, "/api/media/video")
    }
    globalResetAt = globalSlot.resetAt
  }

  const result = await routeVideoGeneration({
    prompt: prompt || "Animate this image",
    imageUrl,
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
      remainingDailyVideos: 0,
      globalDailyLimit: usesProviderManagedQuota ? null : 1,
      resetAt: globalResetAt,
      plan: limit.plan,
    }, { status: result.status === "disabled" ? 503 : 502 })
  }

  await recordMediaUsage(user.userId, "video")

  return Response.json({
    ok: true,
    provider: result.provider,
    model: result.model,
    taskId: result.taskId,
    status: result.status,
    stage: result.stage,
    outputResolution: result.outputResolution || resolution,
    remainingDailyVideos: 0,
    globalDailyLimit: usesProviderManagedQuota ? null : 1,
    statusUrl: `/api/media/video/status?taskId=${encodeURIComponent(result.taskId)}&provider=${encodeURIComponent(result.provider)}`,
    resetAt: globalResetAt,
    plan: limit.plan,
  })
}
