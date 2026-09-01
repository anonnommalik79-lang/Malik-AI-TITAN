import type { MalikImageModelId } from "./image-models"
import { getMalikImageModelCapability } from "./image-model-capabilities"

export type MalikImageQuality = "draft" | "balanced" | "quality" | "ultra" | "ultra4k" | "ultra8k" | "ultra16k"
export type MalikImageDeliveryResolution = "native" | "2k" | "4k" | "8k" | "16k"

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
/**
 * Every prompt gets the high tier without asking for it.
 *
 * 8K rather than 16K, and that is a deliberate stop. 8K adds about four seconds
 * and lands a 15MB file; 16K adds eleven and lands thirty, and on a small
 * instance it gets clamped back down to roughly 8K anyway. So 8K is the most
 * that can be given silently to every single generation without the person
 * noticing the cost. Anyone who wants more types "16к" in the prompt.
 *
 * Note what is *not* done here: the words "8K" and "16K" never reach the model.
 * They are a delivery instruction, and as prompt text they are a stock-render
 * cue that makes the picture worse. See image-resolution-intent.ts.
 */
export const DEFAULT_MALIK_IMAGE_QUALITY: MalikImageQuality = "ultra8k"

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
  // Above 2K the picture is no longer what the model drew - it is that render
  // enlarged. Detail is reconstructed, not recovered, so these tiers raise the
  // pixel count and the print size, not the amount of real information. Sharpen
  // falls as the factor climbs: the same amount of it on an 8x enlargement
  // reads as crunch rather than crispness.
  ultra4k: {
    id: "ultra4k",
    label: "Ultra 4K",
    description: "3840px по длинной стороне · ступенчатое увеличение",
    stepsRatio: 1,
    guidanceDelta: 0.5,
    detailBoost: true,
    artifactCleanup: true,
    preserveFaces: true,
    deliveryResolution: "4k",
    targetLongEdge: 3840,
    sharpen: 0.7,
  },
  ultra8k: {
    id: "ultra8k",
    label: "Ultra 8K",
    description: "7680px · для печати и кропа",
    stepsRatio: 1,
    guidanceDelta: 0.5,
    detailBoost: true,
    artifactCleanup: true,
    preserveFaces: true,
    deliveryResolution: "8k",
    targetLongEdge: 7680,
    sharpen: 0.5,
  },
  ultra16k: {
    id: "ultra16k",
    label: "Ultra 16K",
    description: "15360px · большой формат, файл десятки мегабайт",
    stepsRatio: 1,
    guidanceDelta: 0.5,
    detailBoost: true,
    artifactCleanup: true,
    preserveFaces: true,
    deliveryResolution: "16k",
    targetLongEdge: 15360,
    sharpen: 0.35,
  },
}

export function isMalikImageQuality(value: unknown): value is MalikImageQuality {
  return value === "draft" || value === "balanced" || value === "quality"
    || value === "ultra" || value === "ultra4k" || value === "ultra8k" || value === "ultra16k"
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
