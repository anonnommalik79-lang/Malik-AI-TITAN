import type { AIPlan } from "@/lib/ai/types"

export type MalikImageModelId =
  | "flux-klein-4b"
  | "flux-schnell"
  | "leonardo-phoenix"
  | "leonardo-lucid"
  | "malik-image-1-premium"

export type MalikImageBrand = "bfl" | "leonardo" | "malik"
export type MalikImageTier = "free" | "premium"
export type MalikImageRequestKind = "json" | "multipart"

export type MalikImageModelDefinition = {
  id: MalikImageModelId
  label: string
  shortLabel: string
  description: string
  brand: MalikImageBrand
  tier: MalikImageTier
  providerModel: string
  requestKind: MalikImageRequestKind
}

export const MALIK_IMAGE_MODEL_STORAGE_KEY = "malik_image_model_v1"
export const MALIK_IMAGE_MODE_STORAGE_KEY = "malik_image_mode_v1"
export const MALIK_IMAGE_MODEL_COOKIE = "malik_image_model_v1"

export const MALIK_IMAGE_MODELS = [
  {
    id: "flux-klein-4b",
    label: "FLUX.2 Klein 4B",
    shortLabel: "Klein 4B",
    description: "Основная · качество + скорость",
    brand: "bfl",
    tier: "free",
    providerModel: "@cf/black-forest-labs/flux-2-klein-4b",
    requestKind: "multipart",
  },
  {
    id: "flux-schnell",
    label: "FLUX.1 Schnell 12B",
    shortLabel: "Schnell",
    description: "FAST · максимум генераций",
    brand: "bfl",
    tier: "free",
    providerModel: "@cf/black-forest-labs/flux-1-schnell",
    requestKind: "json",
  },
  {
    id: "leonardo-phoenix",
    label: "Leonardo Phoenix 1.0",
    shortLabel: "Phoenix 1.0",
    description: "Текст · дизайн · точный промпт",
    brand: "leonardo",
    tier: "free",
    providerModel: "@cf/leonardo/phoenix-1.0",
    requestKind: "json",
  },
  {
    id: "leonardo-lucid",
    label: "Leonardo Lucid Origin",
    shortLabel: "Lucid Origin",
    description: "Реализм · арт · детали",
    brand: "leonardo",
    tier: "free",
    providerModel: "@cf/leonardo/lucid-origin",
    requestKind: "json",
  },
  {
    id: "malik-image-1-premium",
    label: "MalikImage 1.0 Premium",
    shortLabel: "MalikImage 1.0",
    description: "ULTRA · FLUX.2 Dev · максимум качества",
    brand: "malik",
    tier: "premium",
    providerModel: "@cf/black-forest-labs/flux-2-dev",
    requestKind: "multipart",
  },
] as const satisfies readonly MalikImageModelDefinition[]

export const DEFAULT_MALIK_IMAGE_MODEL_ID: MalikImageModelId = "flux-klein-4b"

export function isMalikImageModelId(value: unknown): value is MalikImageModelId {
  return typeof value === "string" && MALIK_IMAGE_MODELS.some((model) => model.id === value)
}

export function getMalikImageModel(modelId: MalikImageModelId): MalikImageModelDefinition {
  return MALIK_IMAGE_MODELS.find((model) => model.id === modelId) as MalikImageModelDefinition
}

export function hasMalikImagePremiumAccess(plan: AIPlan | string | null | undefined): boolean {
  return plan === "pro" || plan === "ultra" || plan === "owner"
}

export function canUseMalikImageModel(
  modelId: MalikImageModelId,
  plan: AIPlan | string | null | undefined,
): boolean {
  const model = getMalikImageModel(modelId)
  return model.tier === "free" || hasMalikImagePremiumAccess(plan)
}

export function loadMalikImageModelSelection(): MalikImageModelId {
  if (typeof window === "undefined") return DEFAULT_MALIK_IMAGE_MODEL_ID
  try {
    const saved = window.localStorage.getItem(MALIK_IMAGE_MODEL_STORAGE_KEY)
    return isMalikImageModelId(saved) ? saved : DEFAULT_MALIK_IMAGE_MODEL_ID
  } catch {
    return DEFAULT_MALIK_IMAGE_MODEL_ID
  }
}

export function saveMalikImageModelSelection(modelId: MalikImageModelId): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MALIK_IMAGE_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Best-effort UI preference; live React state remains authoritative.
  }
  try {
    document.cookie = `${MALIK_IMAGE_MODEL_COOKIE}=${encodeURIComponent(modelId)}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {
    // Cookie is used only to carry the selected image model into server routes.
  }
}

export function loadMalikImageModeActive(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(MALIK_IMAGE_MODE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function saveMalikImageModeActive(active: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MALIK_IMAGE_MODE_STORAGE_KEY, active ? "1" : "0")
  } catch {
    // Best effort.
  }
}
