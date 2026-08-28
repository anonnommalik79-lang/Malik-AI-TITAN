import { pollinationsTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

const SIZE_MAP: Record<ImageAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "4:3": { width: 1152, height: 864 },
  "4:5": { width: 864, height: 1080 },
}

function pollinationsModel() {
  return process.env.POLLINATIONS_IMAGE_MODEL?.trim() || "flux"
}

function fallbackNegativePrompt(prompt: string) {
  const lower = prompt.toLowerCase()
  if (/(?:transformer|robot|mecha|android|трансформ|робот)/iu.test(lower)) {
    return "unrelated person, woman, girl, man, boy, human portrait, random portrait, unrelated scene, wrong subject, blurry, watermark, text"
  }
  return "unrelated subject, random scene, wrong subject, blurry, watermark, unwanted text"
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
  negativePrompt?: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  signal?: AbortSignal
}): Promise<{ imageUrl: string }> {
  const size = SIZE_MAP[input.aspectRatio || "1:1"]

  // The router owns prompt semantics. Pollinations receives that exact strict
  // prompt and is explicitly forbidden from doing a second AI rewrite.
  const prompt = input.prompt
  const encoded = encodeURIComponent(prompt.slice(0, 1800))
  const negative = encodeURIComponent(input.negativePrompt?.trim() || fallbackNegativePrompt(prompt))
  const model = encodeURIComponent(pollinationsModel())

  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${size.width}&height=${size.height}&model=${model}&seed=-1&nologo=true&private=true&enhance=false&negative_prompt=${negative}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), pollinationsTimeoutMs())
  const abort = () => controller.abort(input.signal?.reason)
  if (input.signal) {
    if (input.signal.aborted) abort()
    else input.signal.addEventListener("abort", abort, { once: true })
  }

  try {
    const response = await fetch(imageUrl, { method: "GET", signal: controller.signal, redirect: "follow", cache: "no-store" })
    if (!response.ok) throw new Error(`Pollinations returned ${response.status}`)

    // Freeze the exact bytes returned by the server. The browser must not issue
    // a second prompt URL request that could yield a different random image.
    const contentType = response.headers.get("content-type") || "image/jpeg"
    const bytes = Buffer.from(await response.arrayBuffer())
    return { imageUrl: `data:${contentType};base64,${bytes.toString("base64")}` }
  } finally {
    clearTimeout(timeout)
    input.signal?.removeEventListener("abort", abort)
  }
}
