import "server-only"

/**
 * Chat cards do not need to decode an 8K/16K master just to show a 680px image.
 * Keep the original master untouched for download/storage and make one small,
 * high-quality display derivative for the browser. A 1600px preview is still
 * comfortably above 2x density for the largest in-chat card while cutting
 * decoded GPU/RAM use by an order of magnitude on phones.
 */
export const MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE = 1600

export type MalikImageDisplayPreview = {
  buffer: Buffer
  mime: "image/webp"
  width: number
  height: number
}

export async function createMalikImageDisplayPreview(input: {
  buffer?: Buffer
  width?: number
  height?: number
}): Promise<MalikImageDisplayPreview | null> {
  const source = input.buffer
  if (!source?.length) return null

  const knownLongEdge = Math.max(Number(input.width || 0), Number(input.height || 0))
  if (knownLongEdge > 0 && knownLongEdge <= MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE) return null

  try {
    const sharpModule = await import("sharp")
    const sharp = sharpModule.default
    const { data, info } = await sharp(source, {
      animated: false,
      failOn: "none",
      limitInputPixels: false,
    })
      .rotate()
      .resize({
        width: MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE,
        height: MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
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
