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
 * Pollinations is the emergency free route used when Cloudflare's account-wide
 * daily neuron allowance is gone. Reliability matters more than drawing two
 * simultaneous candidates there, because two public requests double the load
 * and are more likely to hit the provider timeout/rate limit. Production now
 * defaults to one render; operators can opt back into 2-4 with IMAGE_CANDIDATES.
 */
function candidateCount() {
  const value = Number(process.env.IMAGE_CANDIDATES || 1)
  return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.round(value))) : 1
}

/**
 * Picks the most detailed of several renders of the same prompt when an
 * operator explicitly enables more than one candidate.
 */
function mostDetailed(candidates: Array<{ bytes: Buffer; contentType: string }>) {
  return candidates.reduce((best, candidate) => (candidate.bytes.byteLength > best.bytes.byteLength ? candidate : best))
}

function isTransientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function retryAfterMs(response: Response, attempt: number) {
  const raw = String(response.headers.get("retry-after") || "").trim()
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(5_000, Math.round(seconds * 1000))
  const date = raw ? Date.parse(raw) : NaN
  if (Number.isFinite(date)) return Math.min(5_000, Math.max(0, date - Date.now()))
  return Math.min(4_000, 900 * (2 ** attempt))
}

async function wait(ms: number, signal: AbortSignal) {
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"))
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      reject(signal.reason || new DOMException("Aborted", "AbortError"))
    }
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
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
  const timeout = setTimeout(() => controller.abort(new Error("POLLINATIONS_TIMEOUT")), pollinationsTimeoutMs())
  const abort = () => controller.abort(input.signal?.reason)
  if (input.signal) {
    if (input.signal.aborted) abort()
    else input.signal.addEventListener("abort", abort, { once: true })
  }

  const draw = async (seed: number) => {
    let lastError: Error | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const attemptSeed = seed + attempt * 271
      const url = pollinationsUrl({ ...input, prompt, seed: attemptSeed })
      const response = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow", cache: "no-store" })
      if (response.ok) {
        // Freeze the exact bytes returned by the server. The browser must not issue
        // a second prompt URL request that could yield a different random image.
        return {
          contentType: response.headers.get("content-type") || "image/jpeg",
          bytes: Buffer.from(await response.arrayBuffer()),
        }
      }

      lastError = new Error(`Pollinations returned ${response.status}`)
      if (!isTransientStatus(response.status) || attempt >= 2) throw lastError
      await wait(retryAfterMs(response, attempt), controller.signal)
    }
    throw lastError || new Error("Pollinations returned no image")
  }

  try {
    const seeds = Array.from({ length: candidateCount() }, (_, index) => base + index * 104_729)
    const draws = await Promise.allSettled(seeds.map(draw))
    const ok = draws.flatMap((result) => (
      result.status === "fulfilled" && result.value.bytes.byteLength > 1024 ? [result.value] : []
    ))

    // One good draw is enough; extra candidates are an optional improvement,
    // never a requirement, so a partial failure must not fail the whole request.
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
