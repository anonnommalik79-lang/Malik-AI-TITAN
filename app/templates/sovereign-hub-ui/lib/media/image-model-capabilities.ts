import {
  MALIK_IMAGE_MODELS,
  type MalikImageModelId,
} from "./image-models"
import type { ImageMode } from "./types"

export type MalikImageModelCapability = {
  id: MalikImageModelId
  maxSteps: number
  minSteps: number
  defaultGuidance: number
  maxGuidance: number
  supportsNegativePrompt: boolean
  supportsSeed: boolean
  supportsCustomDimensions: boolean
  nativeMaxLongEdge: number
  strengths: readonly ImageMode[]
  detailScore: number
  speedScore: number
}

/**
 * One source of truth for what each currently shipped Malik image engine can
 * safely accept. The router uses this before it ever builds provider payloads,
 * so an "Ultra" request cannot accidentally send unsupported knobs to a model.
 */
export const MALIK_IMAGE_MODEL_CAPABILITIES: Record<MalikImageModelId, MalikImageModelCapability> = {
  "flux-klein-4b": {
    id: "flux-klein-4b",
    minSteps: 0,
    maxSteps: 0,
    defaultGuidance: 7.5,
    maxGuidance: 10,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsCustomDimensions: true,
    nativeMaxLongEdge: 1344,
    strengths: ["cinematic", "realistic", "product"],
    detailScore: 82,
    speedScore: 84,
  },
  "flux-schnell": {
    id: "flux-schnell",
    minSteps: 1,
    maxSteps: 8,
    defaultGuidance: 0,
    maxGuidance: 0,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsCustomDimensions: false,
    nativeMaxLongEdge: 1024,
    strengths: ["cinematic", "realistic", "design"],
    detailScore: 68,
    speedScore: 100,
  },
  "leonardo-phoenix": {
    id: "leonardo-phoenix",
    minSteps: 1,
    maxSteps: 50,
    defaultGuidance: 8.5,
    maxGuidance: 10,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsCustomDimensions: true,
    nativeMaxLongEdge: 1344,
    strengths: ["design", "product", "cinematic"],
    detailScore: 90,
    speedScore: 68,
  },
  "leonardo-lucid": {
    id: "leonardo-lucid",
    minSteps: 1,
    maxSteps: 40,
    defaultGuidance: 8.5,
    maxGuidance: 10,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsCustomDimensions: true,
    nativeMaxLongEdge: 1344,
    strengths: ["realistic", "cinematic", "product"],
    detailScore: 94,
    speedScore: 58,
  },
  "malik-image-1-premium": {
    id: "malik-image-1-premium",
    minSteps: 1,
    maxSteps: 50,
    defaultGuidance: 7,
    maxGuidance: 10,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsCustomDimensions: true,
    nativeMaxLongEdge: 1344,
    strengths: ["realistic", "cinematic", "product", "design"],
    detailScore: 100,
    speedScore: 44,
  },
}

export function getMalikImageModelCapability(modelId: MalikImageModelId) {
  return MALIK_IMAGE_MODEL_CAPABILITIES[modelId]
}

export function assertImageCapabilityRegistryComplete() {
  const registered = new Set(Object.keys(MALIK_IMAGE_MODEL_CAPABILITIES))
  return MALIK_IMAGE_MODELS.every((model) => registered.has(model.id))
}
