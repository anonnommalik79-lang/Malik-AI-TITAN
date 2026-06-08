import type { AIRequest, AIResponse } from "./types"
import { imageProviderRouter } from "./providers/image"
import { videoProviderRouter } from "./providers/video"

export async function generateImageWithRouter(input: AIRequest): Promise<AIResponse> {
  return imageProviderRouter.generateImage({ ...input, task: "image" })
}

export async function generateVideoWithRouter(input: AIRequest): Promise<AIResponse> {
  return videoProviderRouter.generateVideo({ ...input, task: "video" })
}

export function getMediaProviderStatus() {
  return {
    image: imageProviderRouter.healthCheck(),
    video: videoProviderRouter.healthCheck(),
  }
}

