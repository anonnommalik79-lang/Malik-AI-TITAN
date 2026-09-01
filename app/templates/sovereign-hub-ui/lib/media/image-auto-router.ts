import {
  MALIK_IMAGE_MODELS,
  canUseMalikImageModel,
  isMalikImageModelId,
  type MalikImageModelId,
} from "./image-models"
import { getMalikImageModelCapability } from "./image-model-capabilities"
import type { MalikImageQuality } from "./image-quality-presets"
import type { ImageMode } from "./types"

export type MalikImageRouteDecision = {
  modelId: MalikImageModelId
  automatic: boolean
  reason: string
}

function qualityWeights(quality: MalikImageQuality) {
  if (quality === "draft") return { detail: 0.28, speed: 0.72 }
  if (quality === "balanced") return { detail: 0.58, speed: 0.42 }
  if (quality === "quality") return { detail: 0.82, speed: 0.18 }
  return { detail: 0.93, speed: 0.07 }
}

export function chooseMalikImageModel(input: {
  requestedModelId?: unknown
  plan?: string | null
  quality: MalikImageQuality
  mode?: ImageMode
}): MalikImageRouteDecision {
  if (isMalikImageModelId(input.requestedModelId) && canUseMalikImageModel(input.requestedModelId, input.plan)) {
    return {
      modelId: input.requestedModelId,
      automatic: false,
      reason: "user-selected model",
    }
  }

  const mode = input.mode || "cinematic"
  const weights = qualityWeights(input.quality)
  const available = MALIK_IMAGE_MODELS.filter((model) => canUseMalikImageModel(model.id, input.plan))

  const scored = available.map((model) => {
    const capability = getMalikImageModelCapability(model.id)
    const modeBonus = capability.strengths.includes(mode) ? 20 : 0
    const premiumBonus = model.tier === "premium" && (input.quality === "quality" || input.quality === "ultra") ? 12 : 0
    const draftBonus = input.quality === "draft" && model.id === "flux-schnell" ? 45 : 0
    const designBonus = mode === "design" && model.id === "leonardo-phoenix" ? 18 : 0
    const realismBonus = mode === "realistic" && model.id === "leonardo-lucid" ? 14 : 0
    const score = capability.detailScore * weights.detail
      + capability.speedScore * weights.speed
      + modeBonus + premiumBonus + draftBonus + designBonus + realismBonus
    return { id: model.id, score }
  }).sort((a, b) => b.score - a.score)

  const winner = scored[0]?.id || "flux-klein-4b"
  return {
    modelId: winner,
    automatic: true,
    reason: `auto ${input.quality}/${mode}: quality-capability score`,
  }
}
