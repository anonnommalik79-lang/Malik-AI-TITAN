import "server-only"

import sharp from "sharp"
import { FlashBrowserError, type FlashBrowserImage, readFlashTiming, requestMalikFlashWorker } from "./malik-flash-browser-bridge"

const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const allowedMimes = new Set(["image/png", "image/jpeg", "image/webp"])

export type MalikFlashImageTask = "image_generate" | "image_edit"
export type FlashImageBytes = { mime: string; bytes: Buffer; width: number; height: number }

export async function validateFlashImage(input: FlashBrowserImage): Promise<FlashImageBytes> {
  const { mime, base64 } = input
  if (!mime || !allowedMimes.has(mime) || typeof base64 !== "string" ||
      base64.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Используйте PNG, JPEG или WebP размером до 5 МБ.", 422)
  }
  const bytes = Buffer.from(base64, "base64")
  try {
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES || bytes.toString("base64") !== base64) throw new Error()
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" })
    const meta = await image.metadata()
    if (!meta.width || !meta.height || "image/" + meta.format !== mime || (meta.pages || 1) > 1) throw new Error()
    // Decode the pixels to reject truncated or corrupt files after a valid header.
    await image.resize(1, 1, { fit: "inside" }).toBuffer()
    return { bytes, mime, width: meta.width, height: meta.height }
  } catch {
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Не удалось декодировать PNG, JPEG или WebP.", 422)
  }
}

export async function verifyMalikFlashImagePayload(response: Record<string, unknown>, task: MalikFlashImageTask) {
  if (response.origin !== "google-ai-mode-browser" || response.complete !== true || response.kind !== task ||
      response.imageOrigin !== "confirmed-generated-output") {
    throw new FlashBrowserError("FLASH_IMAGE_INCOMPLETE", "Google AI Mode не подтвердил создание изображения.")
  }
  if (task === "image_edit" && response.imagesProcessed !== true) {
    throw new FlashBrowserError("FLASH_SOURCE_NOT_PROCESSED", "Google AI Mode не подтвердил обработку исходного фото.")
  }
  try {
    return await validateFlashImage((response.image || {}) as FlashBrowserImage)
  } catch {
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Google AI Mode вернул повреждённое или слишком большое изображение.")
  }
}

export async function runMalikFlashImage(input: {
  task: MalikFlashImageTask
  question: string
  userId: string
  chatId: string
  source?: FlashImageBytes
  requireExisting?: boolean
  isolatedTurn?: boolean
  signal?: AbortSignal
}) {
  if ((input.task === "image_edit") !== Boolean(input.source)) {
    throw new FlashBrowserError("FLASH_SOURCE_REQUIRED", "Прикрепите одно исходное фото для редактирования.", 422)
  }
  const images = input.source ? [{ mime: input.source.mime, name: "malikii-source", base64: input.source.bytes.toString("base64") }] : []
  const payload = await requestMalikFlashWorker({ ...input, images })
  const image = await verifyMalikFlashImagePayload(payload, input.task)
  return { ...image, flashTiming: readFlashTiming(payload.timing) }
}
