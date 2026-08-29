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

function normalizeImagePrompt(value: unknown): string {
  return String(value || "").replace(IMAGE_COMMAND, "").trim()
}

export async function handleMalikPhotoGenerationRequest(request: Request) {
  const body = await request.json().catch(() => ({}))
  // The chat dashboard deliberately carries /image as explicit media consent.
  // Remove only that transport command; the user's real visual request remains untouched.
  const prompt = normalizeImagePrompt(body?.prompt || body?.message)
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

  // Hard server-side single-flight guard. The UI already disables Send while a
  // request is loading, but a very fast double tap can happen before React has
  // committed that state. Never let a second image request race the first and
  // make an older result appear under a newer prompt.
  const generationLock = acquireImageGenerationLock(user.userId)
  if (!generationLock) {
    return Response.json({
      ok: false,
      status: "failed",
      error: "IMAGE_GENERATION_ALREADY_RUNNING",
      publicError: "Дождитесь завершения текущей генерации фото. Второй запрос не перебьёт первый.",
      modelId,
      modelLabel: imageModel.label,
    }, { status: 409 })
  }

  try {
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
  } finally {
    releaseImageGenerationLock(user.userId, generationLock)
  }
}
