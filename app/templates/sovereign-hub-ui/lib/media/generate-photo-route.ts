import { mediaAssetExtension } from "./asset-store"
import { maxImagePromptLength } from "./config"
import { createMalikImageDisplayPreview } from "./image-display-preview"
import { withMalikImageProcessingSlot } from "./image-processing-capacity"
import {
  canUseMalikImageModel,
  getMalikImageModel,
  isMalikImageModelId,
  MALIK_IMAGE_MODEL_COOKIE,
  type MalikImageModelId,
} from "./image-models"
import {
  getMalikImageQualityProfile,
  readImageQualityCookie,
  resolveMalikImageQuality,
} from "./image-quality-presets"
import { postProcessGeneratedImage } from "./image-postprocess"
import { resolveRequestedQuality } from "./image-resolution-intent"
import { routeImageGeneration } from "./image-router"
import { checkMediaLimit, nextMediaResetAt, recordMediaUsage } from "./limits"
import { resolveMediaUser } from "./request"
import type { ImageAspectRatio, ImageMode } from "./types"

const ASPECTS = new Set<ImageAspectRatio>(["1:1", "16:9", "9:16", "4:5", "4:3"])
const MODES = new Set<ImageMode>(["cinematic", "realistic", "product", "design"])
const IMAGE_COMMAND = /^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])\s*:?\s*/iu
const IMAGE_GENERATION_LOCK_TTL_MS = 3 * 60 * 1000
const MASTER_FRAGMENT = "#malik-master="

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

function canEmbedMasterReference(value: string) {
  const src = String(value || "")
  return Boolean(src && src.length < 2048 && !/^(?:data|blob):/i.test(src))
}

function displayImageReference(previewUrl: string | undefined, masterUrl: string) {
  if (!previewUrl || previewUrl === masterUrl || !canEmbedMasterReference(masterUrl)) return masterUrl
  return `${previewUrl}${MASTER_FRAGMENT}${encodeURIComponent(masterUrl)}`
}

export async function handleMalikPhotoGenerationRequest(request: Request) {
  const body = await request.json().catch(() => ({}))
  const rawPrompt = normalizeImagePrompt(body?.prompt || body?.message)
  const aspectRatio = ASPECTS.has(body?.aspectRatio) ? body.aspectRatio : "1:1"
  const requestedMode = String(body?.mode || body?.style || "").toLowerCase()
  const mode: ImageMode = MODES.has(requestedMode as ImageMode) ? requestedMode as ImageMode : "cinematic"

  const requested = resolveRequestedQuality(
    rawPrompt,
    resolveMalikImageQuality(body?.quality || readImageQualityCookie(request)),
  )
  const prompt = requested.prompt
  const quality = requested.quality

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
    })

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

    const nativePreviewPromise = createMalikImageDisplayPreview({ sourceUrl: result.imageUrl })
    const delivered = await withMalikImageProcessingSlot(() =>
      postProcessGeneratedImage({ imageUrl: result.imageUrl, quality }),
    )

    let displayPreview = await nativePreviewPromise
    if (!displayPreview && delivered.buffer?.length) {
      displayPreview = await withMalikImageProcessingSlot(() =>
        createMalikImageDisplayPreview({
          buffer: delivered.buffer,
          width: delivered.width,
          height: delivered.height,
        }),
      )
    }

    await recordMediaUsage(user.userId, "image")
    const remaining = Math.max(0, limit.remaining - 1)

    let storageUrl: string | undefined
    let previewStorageUrl: string | undefined
    let cloudStorageConfigured = false
    let persistenceError: string | undefined

    if (delivered.buffer?.length) {
      const { isCloudStorageConfigured, uploadMediaAsset } = await import("@/lib/storage/cloud-upload")
      cloudStorageConfigured = isCloudStorageConfigured()
      const mime = delivered.mime || "image/webp"

      if (cloudStorageConfigured) {
        const [uploaded, previewUploaded] = await Promise.all([
          uploadMediaAsset({
            userId: user.userId,
            fileName: `generated-${Date.now()}.${mediaAssetExtension(mime)}`,
            mime,
            buffer: delivered.buffer,
            kind: "image",
          }),
          displayPreview?.buffer.length
            ? uploadMediaAsset({
                userId: user.userId,
                fileName: `generated-preview-${Date.now()}.webp`,
                mime: displayPreview.mime,
                buffer: displayPreview.buffer,
                kind: "image",
              })
            : Promise.resolve(null),
        ])

        if (uploaded.stored) storageUrl = uploaded.publicUrl
        else persistenceError = uploaded.reason || "Cloud media upload failed."
        if (previewUploaded?.stored) previewStorageUrl = previewUploaded.publicUrl
      } else {
        persistenceError = "Cloud media storage is not configured."
      }
    }

    // Never persist generated account media on Render's local filesystem.
    // Render disks are ephemeral and are the wrong ownership boundary for chat
    // history. Durable account media belongs in object storage under
    // users/<account-hash>/..., while the browser only receives short URLs.
    const imageUrl = storageUrl || delivered.imageUrl
    const previewUrl = previewStorageUrl
    const displayUrl = displayImageReference(previewUrl, imageUrl)
    const resolvedModelId = result.modelId || requestedModelId
    const resolvedImageModel = resolvedModelId ? getMalikImageModel(resolvedModelId) : undefined
    const durable = Boolean(storageUrl)

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
      masterUrl: imageUrl,
      url: displayUrl,
      mediaUrl: displayUrl,
      previewUrl,
      thumbnailUrl: previewUrl,
      previewWidth: displayPreview?.width,
      previewHeight: displayPreview?.height,
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
      requestedResolution: getMalikImageQualityProfile(quality).deliveryResolution,
      qualityFromPrompt: requested.fromPrompt,
      deliveryMs: delivered.elapsedMs,
      postProcessed: delivered.postProcessed,
      upscaleApplied: delivered.upscaleApplied,
      processor: delivered.processor,
      routeReason: result.routeReason,
      storageUrl,
      durable,
      cloudStorageConfigured,
      persistenceError,
      remainingDailyImages: remaining,
      resetAt: nextMediaResetAt(),
      plan: limit.plan,
    })
  } finally {
    releaseImageGenerationLock(user.userId, generationLock)
  }
}
