import { maxVideoPromptLength } from "@/lib/media/config"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import { routeVideoGeneration } from "@/lib/media/video-router"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

export const POST = withCompute(handlePOST, "video")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || "").trim()
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : undefined
  const length = body?.length === 10 ? 10 : 5
  const resolution = ["480p", "720p", "1080p"].includes(body?.resolution) ? body.resolution : "720p"
  const generateAudio = Boolean(body?.generateAudio)

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

  const result = await routeVideoGeneration({
    prompt: prompt || "Animate this image",
    imageUrl,
    length,
    resolution,
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
    remainingDailyVideos: remaining,
    statusUrl: `/api/media/video/status?taskId=${encodeURIComponent(result.taskId)}`,
    resetAt: nextMediaResetAt(),
    plan: limit.plan,
  })
}
