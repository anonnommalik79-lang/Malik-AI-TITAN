import "server-only"

import { decodeDataUrl } from "./asset-store"
import type { MalikImageQuality } from "./image-quality-presets"
import { getMalikImageQualityProfile } from "./image-quality-presets"

const MAX_SOURCE_BYTES = 24 * 1024 * 1024
const REMOTE_IMAGE_TIMEOUT_MS = 20_000

export type ImagePostProcessResult = {
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
  deliveryResolution: "native" | "2k"
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
 * Models can stay inside their safe native size while Malik delivers a clean
 * 2048px long edge using Lanczos resampling plus a restrained detail pass.
 * This does not pretend to invent missing content: metadata says exactly when
 * the final file was post-processed and when it remained native.
 */
export async function postProcessGeneratedImage(input: {
  imageUrl: string
  quality: MalikImageQuality
}): Promise<ImagePostProcessResult> {
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
    const source = sharp(bytes.buffer, { animated: false, failOn: "none" }).rotate()
    const metadata = await source.metadata()
    const sourceWidth = Number(metadata.width || 0)
    const sourceHeight = Number(metadata.height || 0)
    const longEdge = Math.max(sourceWidth, sourceHeight)
    const target = profile.targetLongEdge
    const shouldUpscale = target > 0 && longEdge > 0 && longEdge < target

    let pipeline = sharp(bytes.buffer, { animated: false, failOn: "none" }).rotate()
    if (shouldUpscale) {
      const landscape = sourceWidth >= sourceHeight
      pipeline = pipeline.resize({
        width: landscape ? target : undefined,
        height: landscape ? undefined : target,
        fit: "inside",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
    }

    if (profile.sharpen > 0) {
      pipeline = pipeline.sharpen(Math.max(0.35, Math.min(1.2, profile.sharpen)))
    }

    const { data, info } = await pipeline
      .webp({ quality: input.quality === "ultra" ? 96 : 94, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })

    const dataUrl = `data:image/webp;base64,${data.toString("base64")}`
    return {
      imageUrl: dataUrl,
      buffer: data,
      mime: "image/webp",
      width: info.width,
      height: info.height,
      sourceWidth: sourceWidth || undefined,
      sourceHeight: sourceHeight || undefined,
      postProcessed: true,
      upscaleApplied: shouldUpscale,
      processor: "sharp",
      deliveryResolution: shouldUpscale || Math.max(info.width, info.height) >= 2000 ? "2k" : "native",
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
    }
  }
}
