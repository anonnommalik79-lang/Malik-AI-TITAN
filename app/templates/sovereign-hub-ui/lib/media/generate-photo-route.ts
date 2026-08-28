import { maxImagePromptLength } from "./config"
import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  MALIK_IMAGE_MODEL_COOKIE,
  canUseMalikImageModel,
  getMalikImageModel,
  isMalikImageModelId,
} from "./image-models"
import { routeImageGeneration } from "./image-router"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "./limits"
import { resolveMediaUser } from "./request"
import type { ImageAspectRatio, ImageMode } from "./types"

const ASPECTS = new Set<ImageAspectRatio>(["1:1", "16:9", "9:16", "4:5", "4:3"])
const MODES = new Set<ImageMode>(["cinematic", "realistic", "product", "design"])

function cookieValue(request: Request, name: string): string {
  const raw = request.headers.get("cookie") || ""
  for (const chunk of raw.split(";")) {
    const [key, ...parts] = chunk.trim().split("=")
    if (key !== name) continue
    try {
      return decodeURIComponent(parts.join("="))
    } catch {
      return parts.join("=")
    }
  }
  return ""
}

export async function handleMalikPhotoGenerationRequest(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || body?.message || "").trim()
  const aspectRatio = ASPECTS.has(body?.aspectRatio) ? body.aspectRatio : "1:1"
  const requestedMode = String(body?.mode || body?.style || "").toLowerCase()
  const mode: ImageMode = MODES.has(requestedMode as ImageMode) ? requestedMode as ImageMode : "cinematic"

  if (!prompt) return Response.json({ ok: false, status: "failed", error: "Prompt is required" }, { status: 400 })
  if (prompt.length > maxImagePromptLength()) {
    return Response.json({ ok: false, status: "failed", error: "PROMPT_TOO_LONG" }, { status: 400 })
  }

  const bodyModel = isMalikImageModelId(body?.modelId) ? body.modelId : null
  const cookieModelRaw = cookieValue(request, MALIK_IMAGE_MODEL_COOKIE)
  const cookieModel = isMalikImageModelId(cookieModelRaw) ? cookieModelRaw : null
  const modelId = bodyModel || cookieModel || DEFAULT_MALIK_IMAGE_MODEL_ID
  const imageModel = getMalikImageModel(modelId)
  const user = await resolveMediaUser(request, body)

  if (!canUseMalikImageModel(modelId, user.plan)) {
    return Response.json({
      ok: false,
      status: "failed",
      error: "IMAGE_MODEL_REQUIRES_PLUS",
      publicError: `${imageModel.label} доступна в MalikAI Plus.`,
      modelId,
      modelLabel: imageModel.label,
    }, { status: 403 })
  }

  const limit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "image" })
  if (!limit.ok) {
    return Response.json({
      ok: false,
      status: "failed",
      error: limit.code || "IMAGE_LIMIT_REACHED",
      publicError: limit.error,
      resetAt: limit.resetAt,
      remainingDailyImages: 0,
      modelId,
      modelLabel: imageModel.label,
    }, { status: 429 })
  }

  const result = await routeImageGeneration({
    prompt,
    aspectRatio,
    mode,
    modelId,
    userId: user.userId,
    plan: user.plan,
  }, { signal: request.signal })

  if (!result.ok) {
    return Response.json({
      ok: false,
      status: "failed",
      error: result.error || "IMAGE_GENERATION_FAILED",
      publicError: result.error || "Не удалось сгенерировать изображение.",
      provider: result.provider,
      modelId,
      modelLabel: imageModel.label,
      providerModel: result.providerModel || imageModel.providerModel,
      remainingDailyImages: limit.remaining,
      resetAt: nextMediaResetAt(),
    }, { status: 502 })
  }

  await recordMediaUsage(user.userId, "image")
  const remaining = Math.max(0, limit.remaining - 1)

  let storageUrl: string | undefined
  if (result.base64 || result.imageUrl.startsWith("data:")) {
    const { uploadMediaAsset } = await import("@/lib/storage/cloud-upload")
    const uploaded = await uploadMediaAsset({
      userId: user.userId,
      fileName: `generated-${Date.now()}.jpg`,
      mime: "image/jpeg",
      base64: result.base64 || result.imageUrl,
      kind: "image",
    })
    if (uploaded.stored) storageUrl = uploaded.publicUrl
  }

  const imageUrl = storageUrl || result.imageUrl
  return Response.json({
    ok: true,
    status: "ready",
    kind: "photo",
    provider: result.provider,
    engine: imageModel.label,
    modelId,
    modelLabel: imageModel.label,
    providerModel: result.providerModel || imageModel.providerModel,
    imageUrl,
    url: imageUrl,
    mediaUrl: imageUrl,
    storageUrl,
    remainingDailyImages: remaining,
    resetAt: nextMediaResetAt(),
    plan: limit.plan,
  })
}
