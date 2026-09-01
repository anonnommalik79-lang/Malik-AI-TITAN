import type { MalikImageModelId } from "./image-models"
import { getMalikImageModelCapability } from "./image-model-capabilities"

export type MalikImageQuality = "draft" | "balanced" | "quality" | "ultra"
export type MalikImageDeliveryResolution = "native" | "2k"

export type MalikImageQualityProfile = {
  id: MalikImageQuality
  label: string
  description: string
  stepsRatio: number
  guidanceDelta: number
  detailBoost: boolean
  artifactCleanup: boolean
  preserveFaces: boolean
  deliveryResolution: MalikImageDeliveryResolution
  targetLongEdge: number
  sharpen: number
}

export const MALIK_IMAGE_QUALITY_STORAGE_KEY = "malik_image_quality_v2"
export const MALIK_IMAGE_QUALITY_COOKIE = "malik_image_quality_v2"
export const DEFAULT_MALIK_IMAGE_QUALITY: MalikImageQuality = "ultra"

export const MALIK_IMAGE_QUALITY_PRESETS: Record<MalikImageQuality, MalikImageQualityProfile> = {
  draft: {
    id: "draft",
    label: "Draft",
    description: "Быстрый черновик без постобработки",
    stepsRatio: 0.45,
    guidanceDelta: -1,
    detailBoost: false,
    artifactCleanup: false,
    preserveFaces: false,
    deliveryResolution: "native",
    targetLongEdge: 0,
    sharpen: 0,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Сбалансированное качество и скорость",
    stepsRatio: 0.72,
    guidanceDelta: 0,
    detailBoost: true,
    artifactCleanup: false,
    preserveFaces: true,
    deliveryResolution: "native",
    targetLongEdge: 0,
    sharpen: 0.25,
  },
  quality: {
    id: "quality",
    label: "Quality 2K",
    description: "Высокая детализация + финальная 2K-доставка",
    stepsRatio: 0.9,
    guidanceDelta: 0.25,
    detailBoost: true,
    artifactCleanup: true,
    preserveFaces: true,
    deliveryResolution: "2k",
    targetLongEdge: 2048,
    sharpen: 0.55,
  },
  ultra: {
    id: "ultra",
    label: "Ultra 2K",
    description: "Максимум доступных шагов, микро-детали и 2048px output",
    stepsRatio: 1,
    guidanceDelta: 0.5,
    detailBoost: true,
    artifactCleanup: true,
    preserveFaces: true,
    deliveryResolution: "2k",
    targetLongEdge: 2048,
    sharpen: 0.82,
  },
}

export function isMalikImageQuality(value: unknown): value is MalikImageQuality {
  return value === "draft" || value === "balanced" || value === "quality" || value === "ultra"
}

export function resolveMalikImageQuality(value: unknown): MalikImageQuality {
  return isMalikImageQuality(value) ? value : DEFAULT_MALIK_IMAGE_QUALITY
}

export function getMalikImageQualityProfile(value: unknown): MalikImageQualityProfile {
  return MALIK_IMAGE_QUALITY_PRESETS[resolveMalikImageQuality(value)]
}

export type ProviderQualityTuning = {
  steps?: number
  guidance?: number
  deliveryResolution: MalikImageDeliveryResolution
  targetLongEdge: number
  detailBoost: boolean
  artifactCleanup: boolean
  preserveFaces: boolean
  sharpen: number
}

/**
 * Turns a product-level quality preset into values that are guaranteed to stay
 * inside the selected model's capability envelope.
 */
export function tuneImageModelForQuality(
  modelId: MalikImageModelId,
  quality: MalikImageQuality,
): ProviderQualityTuning {
  const model = getMalikImageModelCapability(modelId)
  const profile = MALIK_IMAGE_QUALITY_PRESETS[quality]

  const steps = model.maxSteps > 0
    ? Math.max(model.minSteps, Math.round(model.maxSteps * profile.stepsRatio))
    : undefined

  const guidance = model.maxGuidance > 0
    ? Math.min(model.maxGuidance, Math.max(0, model.defaultGuidance + profile.guidanceDelta))
    : undefined

  return {
    steps,
    guidance,
    deliveryResolution: profile.deliveryResolution,
    targetLongEdge: profile.targetLongEdge,
    detailBoost: profile.detailBoost,
    artifactCleanup: profile.artifactCleanup,
    preserveFaces: profile.preserveFaces,
    sharpen: profile.sharpen,
  }
}

export function readImageQualityCookie(request: Request): MalikImageQuality {
  const header = request.headers.get("cookie") || ""
  const match = header.match(/(?:^|;\s*)malik_image_quality_v2=([^;]+)/i)
  if (!match) return DEFAULT_MALIK_IMAGE_QUALITY
  try {
    return resolveMalikImageQuality(decodeURIComponent(match[1]))
  } catch {
    return DEFAULT_MALIK_IMAGE_QUALITY
  }
}
