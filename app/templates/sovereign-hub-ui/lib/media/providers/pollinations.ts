import { pollinationsTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

/**
 * Detail has nowhere to live below about 1440 on the long edge - a face at
 * 720 tall simply has no pixels for eyelashes or fabric weave. These are the
 * same aspect ratios, rendered larger.
 */
const SIZE_MAP: Record<ImageAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1440, height: 1440 },
  "16:9": { width: 1792, height: 1008 },
  "9:16": { width: 1008, height: 1792 },
  "4:3": { width: 1600, height: 1200 },
  "4:5": { width: 1200, height: 1500 },
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

/**
 * How many candidates to draw before keeping one.
 *
 * A diffusion model's output varies enormously with the seed; the same prompt
 * gives a masterpiece and a mess on consecutive numbers. Drawing a couple and
 * keeping the better one is the cheapest real quality gain available here,
 * because it costs nothing but time.
 */
function candidateCount() {
  const value = Number(process.env.IMAGE_CANDIDATES || 2)
  return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.round(value))) : 2
}

/**
 * Picks the most detailed of several renders of the same prompt.
 *
 * At identical dimensions and quality settings, a JPEG's size tracks how much
 * high-frequency information survived: a crisp face with fabric texture does
 * not compress as small as a soft, smeared one. It is a proxy rather than a
 * judgement of composition, but it reliably rejects the blurred and washed-out
 * draws, which is what the seed lottery actually produces.
 */
function mostDetailed(candidates: Array<{ bytes: Buffer; contentType: string }>) {
  return candidates.reduce((best, candidate) => (candidate.bytes.byteLength > best.bytes.byteLength ? candidate : best))
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

export function pollinationsUrl(input: {
  prompt: string
  negativePrompt?: string
  aspectRatio?: ImageAspectRatio
  seed: number
}) {
  const size = SIZE_MAP[input.aspectRatio || "1:1"]
  // The router owns prompt semantics. Pollinations renders it as given.
  const prompt = String(input.prompt || "").replace(/\s+/g, " ").trim().slice(0, 1200)
  const encoded = encodeURIComponent(prompt)
  const negative = encodeURIComponent(String(input.negativePrompt || "").trim().slice(0, 800))
  const model = encodeURIComponent(pollinationsModel())

  return `https://image.pollinations.ai/prompt/${encoded}`
    + `?width=${size.width}&height=${size.height}&model=${model}&seed=${input.seed}`
    + `&nologo=true&private=true&enhance=false&negative_prompt=${negative}`
}

export async function generateWithPollinations(input: {
  prompt: string
  negativePrompt?: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  /**
   * Bumped when the user asks for another take. The seed used to be derived
   * from the prompt alone, so "regenerate" redrew the identical picture and
   * there was no way to escape a bad draw except by editing the words.
   */
  variant?: number
  signal?: AbortSignal
}): Promise<{ imageUrl: string }> {
  const prompt = String(input.prompt || "").replace(/\s+/g, " ").trim()
  const base = stableSeed(prompt) + (Number(input.variant) || 0) * 7919

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), pollinationsTimeoutMs())
  const abort = () => controller.abort(input.signal?.reason)
  if (input.signal) {
    if (input.signal.aborted) abort()
    else input.signal.addEventListener("abort", abort, { once: true })
  }

  const draw = async (seed: number) => {
    const url = pollinationsUrl({ ...input, prompt, seed })
    const response = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow", cache: "no-store" })
    if (!response.ok) throw new Error(`Pollinations returned ${response.status}`)
    // Freeze the exact bytes returned by the server. The browser must not issue
    // a second prompt URL request that could yield a different random image.
    return {
      contentType: response.headers.get("content-type") || "image/jpeg",
      bytes: Buffer.from(await response.arrayBuffer()),
    }
  }

  try {
    const seeds = Array.from({ length: candidateCount() }, (_, index) => base + index * 104_729)
    const draws = await Promise.allSettled(seeds.map(draw))
    const ok = draws.flatMap((result) => (
      result.status === "fulfilled" && result.value.bytes.byteLength > 1024 ? [result.value] : []
    ))

    // One good draw is enough; the extra candidates are an improvement, never a
    // requirement, so a partial failure must not fail the whole request.
    if (!ok.length) {
      const failure = draws.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined
      throw failure?.reason instanceof Error ? failure.reason : new Error("Pollinations returned no image")
    }

    const best = mostDetailed(ok)
    return { imageUrl: `data:${best.contentType};base64,${best.bytes.toString("base64")}` }
  } finally {
    clearTimeout(timeout)
    input.signal?.removeEventListener("abort", abort)
  }
}
