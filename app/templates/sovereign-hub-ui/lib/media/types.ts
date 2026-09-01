import type { MalikImageModelId } from "./image-models"
import type { MalikImageDeliveryResolution, MalikImageQuality } from "./image-quality-presets"

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "4:3"
export type ImageMode = "cinematic" | "realistic" | "product" | "design"

export type ImageProviderId = "cloudflare" | "stability" | "pollinations" | "fal" | "aws-bedrock"
export type VideoProviderId = "h3" | "dashscope" | "pollo" | "runway" | "fal" | "luma" | "veo"
export type VideoAspectRatio = "16:9" | "9:16" | "1:1"
export type VideoResolution = "480p" | "720p" | "1080p" | "2k"

export type ImageGenerateInput = {
  prompt: string
  /** Description already shown to the user by the understand step. */
  understood?: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  modelId?: MalikImageModelId
  quality?: MalikImageQuality
  /** Optional advanced overrides are clamped to the selected model's capability envelope. */
  steps?: number
  guidance?: number
  seed?: number
  detailBoost?: boolean
  artifactCleanup?: boolean
  preserveFaces?: boolean
  userId?: string
  plan?: string
}

export type ImageGenerateResult = {
  ok: boolean
  provider: ImageProviderId
  imageUrl: string
  /** What Malik understood the request to be, echoed back to the chat card. */
  understood?: string
  /** Final prompt actually given to the image provider. */
  enhancedPrompt?: string
  negativePrompt?: string
  modelId?: MalikImageModelId
  providerModel?: string
  base64?: string
  remainingDailyImages: number
  quality?: MalikImageQuality
  steps?: number
  guidance?: number
  width?: number
  height?: number
  sourceWidth?: number
  sourceHeight?: number
  deliveryResolution?: MalikImageDeliveryResolution
  postProcessed?: boolean
  upscaleApplied?: boolean
  processor?: "sharp" | "passthrough"
  routeReason?: string
  error?: string
  resetAt?: string
  storageUrl?: string
}

export type VideoJobStatus = "disabled" | "queued" | "generating" | "completed" | "failed"

export type VideoGenerateInput = {
  prompt: string
  imageUrl?: string
  length?: 5 | 10
  resolution?: VideoResolution
  ratio?: VideoAspectRatio
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
  /** Internal MalikVideo stage such as generating, source_ready, enhancing. */
  stage?: string
  /** Final requested delivery resolution, not the H3 base render resolution. */
  outputResolution?: VideoResolution | "raw768"
  error?: string
  resetAt?: string
}

export type MediaProviderHealth = {
  stability: "configured" | "missing"
  pollinations: "available" | "unavailable"
  h3?: "configured" | "missing"
  dashscope?: "configured" | "missing"
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
