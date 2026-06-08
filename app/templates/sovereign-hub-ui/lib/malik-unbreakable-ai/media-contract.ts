export type MediaContract = {
  prompt: string
  style: string
  aspectRatio: "1:1" | "16:9" | "9:16"
  duration: 5 | 8 | 12
  negativePrompt: string
}

export function createMediaContract(input: Partial<MediaContract> & { prompt: string }): MediaContract {
  return {
    prompt: input.prompt,
    style: input.style || "cinematic, premium, high detail",
    aspectRatio: input.aspectRatio || "16:9",
    duration: input.duration || 5,
    negativePrompt: input.negativePrompt || "low quality, blurry, distorted, watermark, unreadable text, flicker",
  }
}

