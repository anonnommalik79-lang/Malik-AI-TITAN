import { getStabilityApiKey, imageProviderTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

const ASPECT_MAP: Record<ImageAspectRatio, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "4:5": "4:5",
}

const MODE_HINT: Record<ImageMode, string> = {
  cinematic: "cinematic lighting, dramatic composition, film still",
  realistic: "photorealistic, natural lighting, high detail",
  product: "product photography, clean background, studio lighting",
  design: "modern design, crisp edges, premium UI aesthetic",
}

export function stabilityConfigured(): boolean {
  return Boolean(getStabilityApiKey())
}

export async function generateWithStability(input: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  signal?: AbortSignal
}): Promise<{ imageUrl: string; base64: string }> {
  const key = getStabilityApiKey()
  if (!key) throw new Error("STABILITY_API_KEY not configured")

  const modeHint = input.mode ? MODE_HINT[input.mode] : ""
  const prompt = modeHint ? `${input.prompt}. Style: ${modeHint}` : input.prompt
  const aspect = ASPECT_MAP[input.aspectRatio || "1:1"]

  const form = new FormData()
  form.append("prompt", prompt.slice(0, 1500))
  form.append("output_format", "png")
  form.append("aspect_ratio", aspect)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), imageProviderTimeoutMs())
  if (input.signal) input.signal.addEventListener("abort", () => controller.abort(), { once: true })

  let response: Response
  try {
    response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
      body: form,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.errors?.[0] || payload?.message || `Stability returned ${response.status}`
    throw new Error(String(message))
  }

  const base64 = typeof payload?.image === "string" ? payload.image : ""
  if (!base64) throw new Error("Stability returned no image payload")

  const dataUrl = `data:image/png;base64,${base64}`
  return { imageUrl: dataUrl, base64 }
}

export async function pingStability(): Promise<"configured" | "missing"> {
  return stabilityConfigured() ? "configured" : "missing"
}