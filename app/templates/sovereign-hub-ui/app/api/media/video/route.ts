import { maxVideoPromptLength } from "@/lib/media/config"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import { routeVideoGeneration } from "@/lib/media/video-router"
import type { VideoResolution } from "@/lib/media/types"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

const OWNER_TEN_SECOND_EMAIL = "amangeldymalik38@gmail.com"

export const POST = withCompute(handlePOST, "video")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || "").trim()
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : undefined
  const requestedLength = body?.length === 10 ? 10 : 5
  const resolution = (["480p", "720p", "1080p", "2k"].includes(body?.resolution) ? body.resolution : "1080p") as VideoResolution
  const ratio = ["16:9", "9:16", "1:1"].includes(body?.ratio) ? body.ratio : "16:9"
  const generateAudio = body?.generateAudio !== false

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
  const length = user.userId.toLowerCase() === OWNER_TEN_SECOND_EMAIL ? 10 : requestedLength
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

  const result = await routeVideoGeneration({
    prompt: prompt || "Animate this image",
    imageUrl,
    length,
    resolution,
    ratio,
    generateAudio,
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
      remainingDailyVideos: limit.remaining,
      resetAt: nextMediaResetAt(),
      plan: limit.plan,
    }, { status: result.status === "disabled" ? 503 : 502 })
  }

  await recordMediaUsage(user.userId, "video")
  const remaining = Math.max(0, limit.remaining - 1)

  return Response.json({
    ok: true,
    provider: result.provider,
    model: result.model,
    taskId: result.taskId,
    status: result.status,
    stage: result.stage,
    outputResolution: result.outputResolution || resolution,
    remainingDailyVideos: remaining,
    statusUrl: `/api/media/video/status?taskId=${encodeURIComponent(result.taskId)}`,
    resetAt: nextMediaResetAt(),
    plan: limit.plan,
  })
}