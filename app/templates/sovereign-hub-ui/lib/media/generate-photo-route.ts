import { mediaAssetExtension, saveMediaAsset } from "./asset-store"
import { maxImagePromptLength } from "./config"
import {
  canUseMalikImageModel,
  getMalikImageModel,
  isMalikImageModelId,
  MALIK_IMAGE_MODEL_COOKIE,
  type MalikImageModelId,
} from "./image-models"
import {
  readImageQualityCookie,
  resolveMalikImageQuality,
} from "./image-quality-presets"
import { postProcessGeneratedImage } from "./image-postprocess"
import { routeImageGeneration } from "./image-router"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "./limits"
import { resolveMediaUser } from "./request"
import type { ImageAspectRatio, ImageMode } from "./types"

const ASPECTS = new Set<ImageAspectRatio>(["1:1", "16:9", "9:16", "4:5", "4:3"])
const MODES = new Set<ImageMode>(["cinematic", "realistic", "product", "design"])
const IMAGE_COMMAND = /^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])\s*:?\s*/iu
const IMAGE_GENERATION_LOCK_TTL_MS = 3 * 60 * 1000

type ActiveImageGeneration = { token: string; startedAt: number }
type MalikImageGlobal = typeof globalThis & {
  __malikActiveImageGenerations?: Map<string, ActiveImageGeneration>
}

function imageGenerationLocks() {
  const scope = globalThis as MalikImageGlobal
  if (!scope.__malikActiveImageGenerations) scope.__malikActiveImageGenerations = new Map()
  return scope.__malikActiveImageGenerations
}

function acquireImageGenerationLock(userId: string) {
  const locks = imageGenerationLocks()
  const now = Date.now()
  const existing = locks.get(userId)
  if (existing && now - existing.startedAt < IMAGE_GENERATION_LOCK_TTL_MS) return null
  if (existing) locks.delete(userId)

  const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(36).slice(2)}`
  locks.set(userId, { token, startedAt: now })
  return token
}

function releaseImageGenerationLock(userId: string, token: string) {
  const locks = imageGenerationLocks()
  const current = locks.get(userId)
  if (current?.token === token) locks.delete(userId)
}

function normalizeImagePrompt(value: unknown): string {
  return String(value || "").replace(IMAGE_COMMAND, "").trim()
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") || ""
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`, "i"))
  if (!match) return ""
  try { return decodeURIComponent(match[1]) } catch { return "" }
}

function requestedImageModel(request: Request, body: any): MalikImageModelId | undefined {
  const candidates = [body?.imageModelId, body?.imageModel, cookieValue(request, MALIK_IMAGE_MODEL_COOKIE)]
  return candidates.find(isMalikImageModelId)
}

function optionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function handleMalikPhotoGenerationRequest(request: Request) {
  const body = await request.json().catch(() => ({}))
  // The chat dashboard deliberately carries /image as explicit media consent.
  // Remove only that transport command; the user's real visual request remains untouched.
  const prompt = normalizeImagePrompt(body?.prompt || body?.message)
  const aspectRatio = ASPECTS.has(body?.aspectRatio) ? body.aspectRatio : "1:1"
  const requestedMode = String(body?.mode || body?.style || "").toLowerCase()
  const mode: ImageMode = MODES.has(requestedMode as ImageMode) ? requestedMode as ImageMode : "cinematic"
  const quality = resolveMalikImageQuality(body?.quality || readImageQualityCookie(request))

  if (!prompt) return Response.json({ ok: false, status: "failed", error: "Prompt is required" }, { status: 400 })
  if (prompt.length > maxImagePromptLength()) {
    return Response.json({ ok: false, status: "failed", error: "PROMPT_TOO_LONG" }, { status: 400 })
  }

  const user = await resolveMediaUser(request, body)
  const requestedModelId = requestedImageModel(request, body)
  if (requestedModelId && !canUseMalikImageModel(requestedModelId, user.plan)) {
    const lockedModel = getMalikImageModel(requestedModelId)
    return Response.json({
      ok: false,
      status: "failed",
      error: "IMAGE_MODEL_REQUIRES_PLUS",
      publicError: `${lockedModel.label} доступна в MalikAI Plus.`,
      modelId: requestedModelId,
      modelLabel: lockedModel.label,
      quality,
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
      modelId: requestedModelId,
      modelLabel: requestedModelId ? getMalikImageModel(requestedModelId).label : "MalikImage Auto",
      quality,
    }, { status: 429 })
  }

  // Hard server-side single-flight guard. A second click must never race the
  // first render and make an older image appear under a newer prompt.
  const generationLock = acquireImageGenerationLock(user.userId)
  if (!generationLock) {
    return Response.json({
      ok: false,
      status: "failed",
      error: "IMAGE_GENERATION_ALREADY_RUNNING",
      publicError: "Дождитесь завершения текущей генерации фото. Второй запрос не перебьёт первый.",
      modelId: requestedModelId,
      quality,
    }, { status: 409 })
  }

  try {
    const result = await routeImageGeneration({
      prompt,
      understood: typeof body?.understood === "string" ? body.understood : undefined,
      aspectRatio,
      mode,
      modelId: requestedModelId,
      quality,
      steps: optionalNumber(body?.steps),
      guidance: optionalNumber(body?.guidance ?? body?.cfg),
      seed: optionalNumber(body?.seed),
      detailBoost: typeof body?.detailBoost === "boolean" ? body.detailBoost : undefined,
      artifactCleanup: typeof body?.artifactCleanup === "boolean" ? body.artifactCleanup : undefined,
      preserveFaces: typeof body?.preserveFaces === "boolean" ? body.preserveFaces : undefined,
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
        modelId: result.modelId || requestedModelId,
        modelLabel: result.modelId ? getMalikImageModel(result.modelId).label : "MalikImage Auto",
        providerModel: result.providerModel,
        quality,
        routeReason: result.routeReason,
        remainingDailyImages: limit.remaining,
        resetAt: nextMediaResetAt(),
      }, { status: 502 })
    }

    // Every provider now enters the same delivery pipeline. Quality/Ultra
    // renders are materialised, Lanczos-upscaled to a 2048px long edge when
    // needed, lightly sharpened, and then persisted as one immutable result.
    const delivered = await postProcessGeneratedImage({ imageUrl: result.imageUrl, quality })

    await recordMediaUsage(user.userId, "image")
    const remaining = Math.max(0, limit.remaining - 1)

    let storageUrl: string | undefined
    if (delivered.buffer?.length) {
      const { uploadMediaAsset } = await import("@/lib/storage/cloud-upload")
      const mime = delivered.mime || "image/webp"
      const uploaded = await uploadMediaAsset({
        userId: user.userId,
        fileName: `generated-${Date.now()}.${mediaAssetExtension(mime)}`,
        mime,
        buffer: delivered.buffer,
        kind: "image",
      })
      if (uploaded.stored) storageUrl = uploaded.publicUrl
    }

    let assetId: string | undefined
    let assetUrl: string | undefined
    if (!storageUrl) {
      const stored = delivered.buffer?.length
        ? saveMediaAsset({ buffer: delivered.buffer, mime: delivered.mime })
        : delivered.imageUrl.startsWith("data:")
          ? saveMediaAsset({ dataUrl: delivered.imageUrl })
          : null
      if (stored) {
        assetId = stored.id
        assetUrl = stored.url
      }
    }

    const finalInlineUrl = delivered.imageUrl
    const imageUrl = storageUrl || assetUrl || finalInlineUrl
    const resolvedModelId = result.modelId || requestedModelId
    const resolvedImageModel = resolvedModelId ? getMalikImageModel(resolvedModelId) : undefined

    return Response.json({
      ok: true,
      status: "ready",
      kind: "photo",
      provider: result.provider,
      engine: resolvedImageModel?.label || "MalikImage Auto",
      modelId: resolvedModelId,
      modelLabel: resolvedImageModel?.label || "MalikImage Auto",
      providerModel: result.providerModel || resolvedImageModel?.providerModel,
      imageUrl,
      url: imageUrl,
      mediaUrl: imageUrl,
      understood: result.understood,
      originalPrompt: prompt,
      enhancedPrompt: result.enhancedPrompt,
      negativePrompt: result.negativePrompt,
      quality,
      steps: result.steps,
      guidance: result.guidance,
      width: delivered.width,
      height: delivered.height,
      sourceWidth: delivered.sourceWidth,
      sourceHeight: delivered.sourceHeight,
      deliveryResolution: delivered.deliveryResolution,
      postProcessed: delivered.postProcessed,
      upscaleApplied: delivered.upscaleApplied,
      processor: delivered.processor,
      routeReason: result.routeReason,
      storageUrl,
      assetId,
      assetUrl,
      // The browser only receives inline bytes when no durable short URL exists.
      inlineImageUrl: imageUrl === finalInlineUrl ? undefined : finalInlineUrl,
      durable: Boolean(storageUrl || assetUrl),
      remainingDailyImages: remaining,
      resetAt: nextMediaResetAt(),
      plan: limit.plan,
    })
  } finally {
    releaseImageGenerationLock(user.userId, generationLock)
  }
}
