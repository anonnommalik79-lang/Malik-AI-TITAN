import "server-only"
import { decodeDataUrl } from "./asset-store"

/**
 * Chat cards do not need to decode an 8K/16K master just to show a 680px image.
 * Keep the original master untouched for download/storage and make one small,
 * high-quality display derivative for the browser. A 1600px preview is still
 * comfortably above 2x density for the largest in-chat card while cutting
 * decoded GPU/RAM use by an order of magnitude on phones.
 */
export const MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE = 1600
const PREVIEW_SOURCE_TIMEOUT_MS = 4_000
const MAX_PREVIEW_SOURCE_BYTES = 24 * 1024 * 1024

export type MalikImageDisplayPreview = {
  buffer: Buffer
  mime: "image/webp"
  width: number
  height: number
}

type PreviewSource = {
  buffer: Buffer
  width?: number
  height?: number
}

async function sourceForPreview(input: {
  sourceUrl?: string
  buffer?: Buffer
  width?: number
  height?: number
}): Promise<PreviewSource | null> {
  const sourceUrl = String(input.sourceUrl || "").trim()

  // Prefer the provider's native render. It is normally around 1-2K and is far
  // cheaper to decode than the finished 8K delivery master. This is only a UI
  // derivative; the master itself is still produced and stored unchanged.
  if (sourceUrl) {
    const inline = decodeDataUrl(sourceUrl)
    if (inline?.buffer.length && inline.buffer.length <= MAX_PREVIEW_SOURCE_BYTES) {
      return { buffer: inline.buffer }
    }

    if (/^https:\/\//i.test(sourceUrl)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PREVIEW_SOURCE_TIMEOUT_MS)
      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          cache: "no-store",
          redirect: "follow",
          headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
        })
        if (response.ok) {
          const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
          const declared = Number(response.headers.get("content-length") || 0)
          if (mime.startsWith("image/") && (!declared || declared <= MAX_PREVIEW_SOURCE_BYTES)) {
            const bytes = Buffer.from(await response.arrayBuffer())
            if (bytes.length && bytes.length <= MAX_PREVIEW_SOURCE_BYTES) return { buffer: bytes }
          }
        }
      } catch {
        // Fall through to the already-produced master buffer below.
      } finally {
        clearTimeout(timer)
      }
    }
  }

  if (!input.buffer?.length) return null
  return {
    buffer: input.buffer,
    width: input.width,
    height: input.height,
  }
}

export async function createMalikImageDisplayPreview(input: {
  sourceUrl?: string
  buffer?: Buffer
  width?: number
  height?: number
}): Promise<MalikImageDisplayPreview | null> {
  const source = await sourceForPreview(input)
  if (!source?.buffer.length) return null

  try {
    const sharpModule = await import("sharp")
    const sharp = sharpModule.default
    const knownLongEdge = Math.max(Number(source.width || 0), Number(source.height || 0))

    // Native provider renders are usually already near the ideal UI size. Sharp
    // still normalises orientation/format, but without enlargement.
    const pipeline = sharp(source.buffer, {
      animated: false,
      failOn: "none",
      limitInputPixels: false,
    }).rotate()

    const resized = knownLongEdge > 0 && knownLongEdge <= MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE
      ? pipeline
      : pipeline.resize({
          width: MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE,
          height: MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE,
          fit: "inside",
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        })

    const { data, info } = await resized
      .webp({
        quality: 92,
        effort: 1,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true })

    if (!data.length || !info.width || !info.height) return null
    return {
      buffer: data,
      mime: "image/webp",
      width: info.width,
      height: info.height,
    }
  } catch {
    // Preview creation is an optimisation only. Never throw away a generated
    // master because the optional native image processor is unavailable.
    return null
  }
}
