import type { AIRequest, AIResponse } from "./types"
import { imageProviderRouter } from "./providers/image"
import { videoProviderRouter } from "./providers/video"
import { ensure8KQualityPrompt } from "@/lib/media/visual-prompt"

export async function generateImageWithRouter(input: AIRequest): Promise<AIResponse> {
  return imageProviderRouter.generateImage({ ...input, prompt: ensure8KQualityPrompt(input.prompt), task: "image" })
}

export async function generateVideoWithRouter(input: AIRequest): Promise<AIResponse> {
  return videoProviderRouter.generateVideo({ ...input, prompt: ensure8KQualityPrompt(input.prompt), task: "video" })
}

export function getMediaProviderStatus() {
  return {
    image: imageProviderRouter.healthCheck(),
    video: videoProviderRouter.healthCheck(),
  }
}

