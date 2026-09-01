import "server-only"

// A namespace import, not a default one: `import os from "node:os"` resolves to
// `os.default` wherever esModuleInterop is off, and the two try/catch guards
// below would silently swallow that and fall back to a 2GB guess on a machine
// with 8. It was doing exactly that under the verification harness.
import * as os from "node:os"

import { decodeDataUrl } from "./asset-store"
import type { MalikImageDeliveryResolution, MalikImageQuality } from "./image-quality-presets"
import { getMalikImageQualityProfile } from "./image-quality-presets"

const MAX_SOURCE_BYTES = 24 * 1024 * 1024
const REMOTE_IMAGE_TIMEOUT_MS = 20_000

const HOST_MEMORY_BYTES = (() => {
  try { return os.totalmem() } catch { return 2 * 1024 * 1024 * 1024 }
})()

const HOST_CPUS = (() => {
  try { return Math.max(1, os.cpus().length) } catch { return 1 }
})()

/**
 * The hard ceiling on what may be produced, in megapixels.
 *
 * 16K is 15360x8640, about 133 megapixels. This repo already carries commits
 * titled "prevent OOM" and "stop generation from freezing Chromium", so the
 * limit is not theoretical: exceeding it takes the whole server down rather than
 * returning a smaller picture.
 *
 * The ceiling is derived from the host rather than hardcoded, because the same
 * code runs on a small Render instance and on a workstation. The bytes-per-pixel
 * figure is measured, not guessed: a full 15360x8640 run peaked at 1107MB of RSS
 * for 132.7 megapixels, which is 8.7 bytes per output pixel. Ten is used here to
 * keep some headroom. A quarter of the machine is the most one request may spend
 * without starving every other request on the box, so a 2GB instance tops out
 * around 50 megapixels and clamps 16K down to roughly 9600px - which it then
 * reports as 8K rather than claiming a size the file does not have.
 * IMAGE_MAX_MEGAPIXELS overrides it in both directions for a host that knows
 * better than this arithmetic does.
 */
const MEMORY_MEGAPIXEL_CEILING = Math.max(4, Math.floor((HOST_MEMORY_BYTES * 0.25) / 10 / 1_000_000))
const MAX_OUTPUT_MEGAPIXELS = Math.max(
  4,
  Number(process.env.IMAGE_MAX_MEGAPIXELS || 0) || Math.min(140, MEMORY_MEGAPIXEL_CEILING),
)

/**
 * Above this, the output is JPEG rather than WebP.
 *
 * WebP is the better web format and it is kept for everything up to 2K, where
 * it halves the file. Past that it stops being worth it: measured here, a
 * 3840px frame took 5.1s to encode as WebP against 0.46s as JPEG - eleven times
 * the cost, on a picture that is going to be downloaded and printed rather than
 * loaded in a feed, and that browsers are slow to decode at that size anyway.
 */
const JPEG_ABOVE_LONG_EDGE = 2600

/**
 * Chroma is subsampled below this, and not above it.
 *
 * 4:2:0 averages colour over a 2x2 block. On a 7680px frame that block is
 * 0.026% of the width - invisible at any viewing distance, including 1:1 - and
 * it is measured below at roughly half the encode time of 4:4:4. Under this
 * size the frame is small enough that the difference can be found by pixel
 * peeping, so full chroma is kept.
 */
const FULL_CHROMA_UP_TO = 6000

/**
 * Sharpening is skipped above this size.
 *
 * Measured on a two-core box: a 0.5 sharpen costs ~2.6s at 5760px and ~20s at
 * 15360px, and against a real high-resolution original it moves PSNR by 0.05dB.
 * At a 10x enlargement there is no real detail left to sharpen - every edge is
 * interpolated - so past this point it is twenty seconds spent on a difference
 * nobody can see. Below it, sharpening is cheap enough to be worth having.
 */
const SHARPEN_UP_TO = 12_000

export type ImagePostProcessResult = {
  /** Original provider URL. Processed bytes live in `buffer` until persistence. */
  imageUrl: string
  buffer?: Buffer
  mime?: string
  width?: number
  height?: number
  sourceWidth?: number
  sourceHeight?: number
  postProcessed: boolean
  upscaleApplied: boolean
  processor: "sharp" | "passthrough"
  deliveryResolution: MalikImageDeliveryResolution
  /** What the delivery actually cost, so a slow tier can be seen rather than guessed at. */
  elapsedMs?: number
}

/**
 * libvips defaults to one thread inside a container, whatever the box has.
 *
 * That was measured here: `sharp.concurrency()` reported 1 on a two-core host,
 * and every stage of the pipeline ran about twice as long as it needed to.
 * Setting it explicitly is the single cheapest speed-up in this file.
 * SHARP_CONCURRENCY caps it for a host that shares cores with other work.
 */
let concurrencyApplied = false
function applyConcurrency(sharp: typeof import("sharp")) {
  if (concurrencyApplied) return
  concurrencyApplied = true
  try {
    const requested = Number(process.env.SHARP_CONCURRENCY || 0)
    const threads = requested > 0 ? Math.min(requested, HOST_CPUS) : HOST_CPUS
    if (sharp.concurrency() !== threads) sharp.concurrency(threads)
  } catch {
    // A host that refuses the setting still works, just at the default.
  }
}

async function sourceBytes(imageUrl: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const inline = decodeDataUrl(imageUrl)
  if (inline) return inline
  if (!/^https:\/\//i.test(imageUrl)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS)
  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
    })
    if (!response.ok) return null
    const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!mime.startsWith("image/")) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > MAX_SOURCE_BYTES) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) return null
    return { buffer: bytes, mime }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Provider render and delivery resolution are deliberately separate.
 *
 * Models render at their own native size - asking a diffusion model for more
 * pixels than it was trained on produces duplicated faces and limbs, not detail
 * - so everything above that size is an enlargement, and this function is about
 * doing that enlargement well and quickly.
 *
 * It is one Lanczos3 pass, not a ladder of doublings, and that is a measured
 * choice rather than an inherited one. Stepped enlargement is standard advice,
 * but it comes from the bicubic era. Scored against a real high-resolution
 * original - shrink it to what a model would render, enlarge it back, compare -
 * a single Lanczos3 jump from 1440 to 5760 scored 33.84dB against the ladder's
 * 31.01dB, and took a quarter of the time. Lanczos3's support scales with the
 * ratio, so it already does in one pass what the ladder was approximating; the
 * intermediate sharpen passes only accumulated error. The ladder was three
 * decibels and four times the wall clock, spent to make the picture worse.
 *
 * Important memory invariant: Sharp returns a Buffer, not a base64 data URI.
 * Turning a large result into base64 before it is persisted creates an extra
 * ~33% payload plus large JS strings. The route converts bytes to base64 only in
 * the exceptional case where every durable store is unavailable.
 */
export async function postProcessGeneratedImage(input: {
  imageUrl: string
  quality: MalikImageQuality
}): Promise<ImagePostProcessResult> {
  const startedAt = Date.now()
  const profile = getMalikImageQualityProfile(input.quality)
  const bytes = await sourceBytes(input.imageUrl)
  if (!bytes) {
    return {
      imageUrl: input.imageUrl,
      postProcessed: false,
      upscaleApplied: false,
      processor: "passthrough",
      deliveryResolution: "native",
    }
  }

  try {
    const sharpModule = await import("sharp")
    const sharp = sharpModule.default
    applyConcurrency(sharp)

    // Metadata is read from the header, without decoding a single pixel, so the
    // target size is decided before any work is done.
    const probe = sharp(bytes.buffer, { animated: false, failOn: "none", limitInputPixels: false })
    const metadata = await probe.metadata()

    // Orientations 5-8 are the quarter turns: after .rotate() bakes them in, the
    // width and height reported by the header have swapped places.
    const quarterTurned = Number(metadata.orientation || 0) >= 5
    const headerWidth = Number(metadata.width || 0)
    const headerHeight = Number(metadata.height || 0)
    const sourceWidth = quarterTurned ? headerHeight : headerWidth
    const sourceHeight = quarterTurned ? headerWidth : headerHeight

    const longEdge = Math.max(sourceWidth, sourceHeight)
    const landscape = sourceWidth >= sourceHeight
    const aspect = sourceHeight > 0 ? sourceWidth / sourceHeight : 1
    const target = profile.targetLongEdge
    const shouldUpscale = target > 0 && longEdge > 0 && longEdge < target

    // Clamp to what can actually be produced without taking the process down.
    const safeLongEdge = shouldUpscale ? clampToMegapixels(target, aspect, landscape) : 0
    const upscaling = safeLongEdge > longEdge
    const finalLong = upscaling ? safeLongEdge : longEdge

    // One pipeline, one decode, one encode. Everything below is a description of
    // the work; libvips streams it in a single pass when toBuffer is awaited.
    let pipeline = sharp(bytes.buffer, { animated: false, failOn: "none", limitInputPixels: false }).rotate()

    if (upscaling) {
      pipeline = pipeline.resize({
        width: landscape ? safeLongEdge : undefined,
        height: landscape ? undefined : safeLongEdge,
        fit: "inside",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
    }

    if (profile.sharpen > 0 && finalLong <= SHARPEN_UP_TO) {
      pipeline = pipeline.sharpen(Math.max(0.35, Math.min(1.2, profile.sharpen)))
    }

    const heavy = finalLong > JPEG_ABOVE_LONG_EDGE
    let encoded
    if (heavy) {
      // Plain JPEG rather than mozjpeg. mozjpeg's trellis quantisation was
      // measured at 10.8s for a 7680px frame against 0.6s plain - seventeen
      // times the cost - and the plain encode at q95 produces a *larger* file,
      // so it is keeping more of the picture, not less.
      if (Number(metadata.channels || 3) === 4 || metadata.hasAlpha) {
        pipeline = pipeline.flatten({ background: "#ffffff" })
      }
      encoded = pipeline.jpeg({
        quality: 95,
        mozjpeg: false,
        chromaSubsampling: finalLong <= FULL_CHROMA_UP_TO ? "4:4:4" : "4:2:0",
      })
    } else {
      // effort 2 rather than 4: measured at 1.45s against 1.89s for a 2048px
      // frame, for 1.7% more bytes. The last two effort levels are where WebP
      // spends most of its time and almost none of its compression.
      encoded = pipeline.webp({
        quality: input.quality === "draft" ? 90 : 96,
        effort: 2,
        smartSubsample: true,
      })
    }

    const { data, info } = await encoded.toBuffer({ resolveWithObject: true })

    return {
      // Keep only the provider reference here. The processed master is the
      // Buffer below and will be written directly to storage by the route.
      imageUrl: input.imageUrl,
      buffer: data,
      mime: info.format === "jpeg" ? "image/jpeg" : "image/webp",
      width: info.width,
      height: info.height,
      sourceWidth: sourceWidth || undefined,
      sourceHeight: sourceHeight || undefined,
      postProcessed: true,
      upscaleApplied: upscaling,
      processor: "sharp",
      deliveryResolution: deliveredTier(Math.max(info.width, info.height)),
      elapsedMs: Date.now() - startedAt,
    }
  } catch {
    // Native optional dependencies can be unavailable on a new platform. A
    // post-processing failure must never throw away a successfully generated image.
    return {
      imageUrl: input.imageUrl,
      buffer: bytes.buffer,
      mime: bytes.mime,
      postProcessed: false,
      upscaleApplied: false,
      processor: "passthrough",
      deliveryResolution: "native",
      elapsedMs: Date.now() - startedAt,
    }
  }
}

/**
 * The largest long edge whose full frame stays inside the megapixel budget.
 * Returns the request unchanged when it already fits.
 */
export function clampToMegapixels(longEdge: number, aspect: number, landscape: boolean) {
  if (!(longEdge > 0)) return 0
  const ratio = landscape ? (aspect || 1) : 1 / (aspect || 1)
  const pixels = (longEdge * longEdge) / Math.max(0.1, Math.abs(ratio))
  const budget = MAX_OUTPUT_MEGAPIXELS * 1_000_000
  if (pixels <= budget) return longEdge
  return Math.max(1, Math.floor(longEdge * Math.sqrt(budget / pixels)))
}

/** The ceiling actually in force on this host, in megapixels. */
export function outputMegapixelBudget() {
  return MAX_OUTPUT_MEGAPIXELS
}

/** What the delivered file honestly is, by its long edge. */
export function deliveredTier(longEdge: number): ImagePostProcessResult["deliveryResolution"] {
  if (longEdge >= 14000) return "16k"
  if (longEdge >= 7000) return "8k"
  if (longEdge >= 3500) return "4k"
  if (longEdge >= 2000) return "2k"
  return "native"
}
