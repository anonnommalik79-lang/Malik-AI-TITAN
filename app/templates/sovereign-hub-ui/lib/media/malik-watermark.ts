import "server-only"
import type { Metadata, Sharp } from "sharp"

export const MALIK_WATERMARK_VERSION = "malik-ai-wordmark-v1"
export const MALIK_WATERMARK_XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:malik="https://malikaiworld.world/ns/image/1.0/" malik:watermark="${MALIK_WATERMARK_VERSION}"/></rdf:RDF></x:xmpmeta>`

export class ImageWatermarkError extends Error {
  readonly code = "IMAGE_WATERMARK_FAILED"
  constructor() { super("Не удалось встроить MALIK AI в изображение. Повторите запрос.") }
}

// Outlined, original geometric lettering: M A L I K [space] A I.
// No system fonts, font downloads or fontconfig dependency on Render.
export const MALIK_WORDMARK_PATH = "M0 20V0h3l6 11L15 0h3v20h-3V5L9 16 3 5v15Z M25 20 33 0h3l8 20h-3.2l-2-5.4H30l-2 5.4Z M31 12h6.7L34.4 3Z M50 0h3v17h12v3H50Z M72 0h3v20h-3Z M83 0h3v9l9-9h4L89 10l11 10h-4L86 11v9h-3Z M112 20l8-20h3l8 20h-3.2l-2-5.4H117l-2 5.4Z M118 12h6.7l-3.3-9Z M139 0h3v20h-3Z"

export function malikWatermarkLayout(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new ImageWatermarkError()
  const marginX = Math.round(width * 0.025)
  const marginY = Math.round(height * 0.025)
  const markWidth = Math.max(1, Math.min(width - 2 * marginX, Math.round(Math.min(width, height) * 0.026 * 7.1)))
  const markHeight = Math.max(1, Math.round(markWidth / 7.1))
  return { width: markWidth, height: markHeight, left: width - marginX - markWidth, top: height - marginY - markHeight }
}

export function createMalikImageWatermarkSvg(imageWidth: number, imageHeight = imageWidth, color: "white" | "black" = "white") {
  const box = malikWatermarkLayout(imageWidth, imageHeight)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 142 20"><title>MALIK AI</title><path fill="${color === "black" ? "#000000" : "#ffffff"}" fill-opacity="0.60" fill-rule="evenodd" d="${MALIK_WORDMARK_PATH}"/></svg>`)
}

export function hasMalikImageWatermark(metadata: Pick<Metadata, "xmp">) {
  return Boolean(metadata.xmp?.toString("utf8").includes(`malik:watermark="${MALIK_WATERMARK_VERSION}"`))
}

export async function applyMalikImageWatermark(pipeline: Sharp, source: Buffer, metadata: Metadata, width: number, height: number): Promise<Sharp> {
  if (hasMalikImageWatermark(metadata)) return pipeline.withXmp(MALIK_WATERMARK_XMP)
  const sharp = (await import("sharp")).default
  const box = malikWatermarkLayout(width, height)
  const turned = Number(metadata.orientation || 0) >= 5
  const sourceWidth = Number(turned ? metadata.height : metadata.width)
  const sourceHeight = Number(turned ? metadata.width : metadata.height)
  const left = Math.min(sourceWidth - 1, Math.max(0, Math.floor(box.left * sourceWidth / width)))
  const top = Math.min(sourceHeight - 1, Math.max(0, Math.floor(box.top * sourceHeight / height)))
  // Sample a bounded corner derivative, never a full-resolution raw buffer.
  const sample = await sharp(source, { limitInputPixels: 280_000_000 }).rotate()
    .extract({ left, top, width: Math.max(1, Math.min(sourceWidth - left, Math.ceil(box.width * sourceWidth / width))), height: Math.max(1, Math.min(sourceHeight - top, Math.ceil(box.height * sourceHeight / height))) })
    .resize(24, 8, { fit: "fill" }).flatten({ background: "#ffffff" }).removeAlpha().toColourspace("srgb").raw().toBuffer()
  let luminance = 0
  for (let index = 0; index < sample.length; index += 3) {
    const linear = [sample[index], sample[index + 1], sample[index + 2]].map((value) => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4)
    luminance += linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const color = luminance / (sample.length / 3) > 0.179 ? "black" : "white"
  return pipeline.composite([{ input: createMalikImageWatermarkSvg(width, height, color), left: box.left, top: box.top, blend: "over" }]).withXmp(MALIK_WATERMARK_XMP)
}

/** Shared server boundary for native-size generated covers and legacy outputs. */
export async function watermarkImageBytes(buffer: Buffer, format?: "png" | "jpeg" | "webp") {
  try {
    const sharp = (await import("sharp")).default
    const metadata = await sharp(buffer, { limitInputPixels: 280_000_000 }).metadata()
    const outputFormat = format || (metadata.format === "jpeg" || metadata.format === "webp" ? metadata.format : "png")
    const turned = Number(metadata.orientation || 0) >= 5
    const width = Number(turned ? metadata.height : metadata.width)
    const height = Number(turned ? metadata.width : metadata.height)
    if (hasMalikImageWatermark(metadata) && metadata.format === outputFormat && !metadata.orientation) return { buffer, mime: `image/${outputFormat}`, width, height, watermarked: true as const }
    const pipeline = await applyMalikImageWatermark(sharp(buffer, { limitInputPixels: 280_000_000 }).rotate(), buffer, metadata, width, height)
    const data = outputFormat === "png" ? await pipeline.png().toBuffer() : outputFormat === "jpeg" ? await pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer() : await pipeline.webp({ quality: 96, effort: 2 }).toBuffer()
    return { buffer: data, mime: `image/${outputFormat}`, width, height, watermarked: true as const }
  } catch { throw new ImageWatermarkError() }
}
