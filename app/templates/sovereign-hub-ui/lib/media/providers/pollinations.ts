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

// The prompt arrives ready to render. This provider used to re-cut it and
// staple "One coherent image. Exact subject and action. No collage, no
// unrelated subject." onto the end — words flux then drew into the picture as
// text. It now sends the description verbatim, and every prohibition travels in
// the negative field where a diffusion model can actually act on it.

function stableSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0) || 1
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

  // The router owns prompt semantics. Pollinations renders it as given.
  const prompt = String(input.prompt || "").replace(/\s+/g, " ").trim().slice(0, 700)
  const encoded = encodeURIComponent(prompt)
  const negative = encodeURIComponent(String(input.negativePrompt || "").trim().slice(0, 500))
  const model = encodeURIComponent(pollinationsModel())
  const seed = stableSeed(prompt)

  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${size.width}&height=${size.height}&model=${model}&seed=${seed}&nologo=true&private=true&enhance=false&negative_prompt=${negative}`

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
