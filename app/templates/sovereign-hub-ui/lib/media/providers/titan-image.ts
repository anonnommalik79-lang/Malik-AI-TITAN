import { awsBedrockProvider } from "@/lib/ai/providers/aws-bedrock"
import type { ImageAspectRatio, ImageMode } from "../types"

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY
}

export function falImageConfigured() {
  return Boolean(falKey()?.trim())
}

export function awsImageConfigured() {
  return awsBedrockProvider.healthCheck().configured
}

export async function generateFalImage(input: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  signal?: AbortSignal
}): Promise<{ imageUrl: string }> {
  const key = falKey()
  if (!key) throw new Error("FAL_KEY not configured")
  const model = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell"
  const size = input.aspectRatio === "16:9" ? "landscape_16_9" : input.aspectRatio === "9:16" ? "portrait_16_9" : "square_hd"

  const response = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt.slice(0, 1500), image_size: size, num_images: 1 }),
    signal: input.signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `FAL returned ${response.status}`)
  const imageUrl = payload?.images?.[0]?.url || payload?.image?.url
  if (!imageUrl) throw new Error("FAL returned no image URL")
  return { imageUrl }
}

export async function generateAwsImage(input: {
  prompt: string
  mode?: ImageMode
  signal?: AbortSignal
}): Promise<{ imageUrl: string; base64?: string }> {
  const result = await awsBedrockProvider.generateImage({
    prompt: input.prompt,
    task: "image",
    signal: input.signal,
  })
  if (!result.success) throw new Error(result.error || "AWS Bedrock image failed")
  const output = result.output as { resultUrl?: string }
  const imageUrl = output?.resultUrl || ""
  if (!imageUrl) throw new Error("AWS Bedrock returned no image")
  return { imageUrl, base64: imageUrl.startsWith("data:") ? imageUrl.split(",")[1] : undefined }
}
