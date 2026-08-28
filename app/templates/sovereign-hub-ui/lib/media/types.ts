import type { MalikImageModelId } from "./image-models"

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "4:3"
export type ImageMode = "cinematic" | "realistic" | "product" | "design"

export type ImageProviderId = "cloudflare" | "stability" | "pollinations" | "fal" | "aws-bedrock"

export type VideoProviderId = "pollo" | "runway" | "fal" | "luma" | "veo"

export type ImageGenerateInput = {
  prompt: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  modelId?: MalikImageModelId
  userId?: string
  plan?: string
}

export type ImageGenerateResult = {
  ok: boolean
  provider: ImageProviderId
  imageUrl: string
  modelId?: MalikImageModelId
  providerModel?: string
  base64?: string
  remainingDailyImages: number
  error?: string
  resetAt?: string
  storageUrl?: string
}

export type VideoJobStatus = "disabled" | "queued" | "generating" | "completed" | "failed"

export type VideoGenerateInput = {
  prompt: string
  imageUrl?: string
  length?: 5 | 10
  resolution?: "480p" | "720p" | "1080p"
  generateAudio?: boolean
  userId?: string
  plan?: string
}

export type VideoGenerateResult = {
  ok: boolean
  provider: VideoProviderId
  model: string
  taskId: string
  status: VideoJobStatus
  remainingDailyVideos: number
  videoUrl?: string
  error?: string
  resetAt?: string
}

export type MediaProviderHealth = {
  stability: "configured" | "missing"
  pollinations: "available" | "unavailable"
  pollo: "configured" | "missing" | "disabled"
  fal: "configured" | "missing"
  runway: "configured" | "missing"
  luma: "configured" | "missing"
  veo: "configured" | "missing"
  amazon: "configured" | "missing" | "disabled"
  storage: "configured" | "missing"
  chatPersistence: "configured" | "missing"
  limitsPersistence: "configured" | "missing"
  imageProviderPrimary: string
  imageProviderFallback: string
  videoProviderPrimary: string
  imageGodOrder: string[]
  videoGodOrder: string[]
  polloVideoEnabled: boolean
  godMode: boolean
  limits: {
    guest: { images: number; videos: number }
    free: { images: number; videos: number }
    premium: { images: number; videos: number }
    maxImagePromptLength: number
    maxVideoPromptLength: number
  }
}
