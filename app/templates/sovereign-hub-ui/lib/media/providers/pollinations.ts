import { pollinationsTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

const SIZE_MAP: Record<ImageAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "4:5": { width: 864, height: 1080 },
}

const MODE_HINT: Record<ImageMode, string> = {
  cinematic: "cinematic",
  realistic: "photorealistic",
  product: "product shot",
  design: "design render",
}

export async function pingPollinations(): Promise<"available" | "unavailable"> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    const response = await fetch("https://image.pollinations.ai/", {
      method: "HEAD",
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok || response.status === 405 ? "available" : "unavailable"
  } catch {
    return "available"
  }
}

export async function generateWithPollinations(input: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  signal?: AbortSignal
}): Promise<{ imageUrl: string }> {
  const size = SIZE_MAP[input.aspectRatio || "1:1"]
  const modeHint = input.mode ? MODE_HINT[input.mode] : ""
  const prompt = modeHint ? `${input.prompt}, ${modeHint}` : input.prompt
  const encoded = encodeURIComponent(prompt.slice(0, 1500))
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${size.width}&height=${size.height}&nologo=true&enhance=true`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), pollinationsTimeoutMs())
  if (input.signal) {
    input.signal.addEventListener("abort", () => controller.abort(), { once: true })
  }

  try {
    const response = await fetch(imageUrl, { method: "GET", signal: controller.signal, redirect: "follow" })
    if (!response.ok) throw new Error(`Pollinations returned ${response.status}`)
    return { imageUrl }
  } finally {
    clearTimeout(timeout)
  }
}
