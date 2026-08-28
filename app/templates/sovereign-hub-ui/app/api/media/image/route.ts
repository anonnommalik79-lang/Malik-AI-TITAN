import { maxImagePromptLength } from "@/lib/media/config"
import { routeImageGeneration } from "@/lib/media/image-router"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"
import type { ImageAspectRatio, ImageMode } from "@/lib/media/types"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

const ASPECTS = new Set<ImageAspectRatio>(["1:1", "16:9", "9:16", "4:5"])
const MODES = new Set<ImageMode>(["cinematic", "realistic", "product", "design"])

export const POST = withCompute(handlePOST, "image")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || "").trim()
  const aspectRatio = ASPECTS.has(body?.aspectRatio) ? body.aspectRatio : "1:1"
  const mode = MODES.has(body?.mode) ? body.mode : "cinematic"

  if (!prompt) {
    return Response.json({ ok: false, error: "Prompt is required" }, { status: 400 })
  }

  if (prompt.length > maxImagePromptLength()) {
    return Response.json({
      ok: false,
      error: `Prompt too long (${prompt.length}/${maxImagePromptLength()})`,
      code: "PROMPT_TOO_LONG",
    }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  const limit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "image" })
  if (!limit.ok) {
    return Response.json({
      ok: false,
      error: limit.error,
      code: limit.code,
      resetAt: limit.resetAt,
      plan: limit.plan,
      remainingDailyImages: 0,
    }, { status: 429 })
  }

  const result = await routeImageGeneration({
    prompt,
    aspectRatio,
    mode,
    userId: user.userId,
    plan: user.plan,
  })

  if (!result.ok) {
    return Response.json({
      ok: false,
      error: result.error || "Image generation failed",
      provider: result.provider,
      remainingDailyImages: limit.remaining,
      resetAt: nextMediaResetAt(),
      plan: limit.plan,
    }, { status: 502 })
  }

  await recordMediaUsage(user.userId, "image")
  const remaining = Math.max(0, limit.remaining - 1)

  let storageUrl: string | undefined
  if (result.base64 || result.imageUrl.startsWith("data:")) {
    const { uploadMediaAsset } = await import("@/lib/storage/cloud-upload")
    const uploaded = await uploadMediaAsset({
      userId: user.userId,
      fileName: `generated-${Date.now()}.png`,
      mime: "image/png",
      base64: result.base64 || result.imageUrl,
      kind: "image",
    })
    if (uploaded.stored) storageUrl = uploaded.publicUrl
  }

  return Response.json({
    ok: true,
    provider: result.provider,
    imageUrl: storageUrl || result.imageUrl,
    base64: result.base64,
    storageUrl,
    remainingDailyImages: remaining,
    resetAt: nextMediaResetAt(),
    plan: limit.plan,
  })
}
