import sharp from "sharp"
import { RequestSafetyError } from "../server/request-safety"
import type { ImageGenerateInput } from "./types"

const MAX_PIXELS = 40_000_000

export function imageAttachments(body: { attachments?: unknown }) {
  return Array.isArray(body.attachments)
    ? body.attachments.filter((item) => item && typeof item === "object" &&
      (item.kind === "image" || (typeof item.mime === "string" && item.mime.startsWith("image/"))))
    : []
}

export async function prepareImageEditSource(body: { attachments?: unknown }): Promise<NonNullable<ImageGenerateInput["editSource"]>> {
  const files = imageAttachments(body)
  if (files.length !== 1) throw new RequestSafetyError(
    files.length ? "Для редактирования прикрепите одно исходное фото." : "Прикрепите фото, которое нужно изменить.",
    400, "IMAGE_EDIT_SOURCE_REQUIRED",
  )
  const file = files[0]
  // Do not fetch client-provided URLs: no SSRF, expired blob URLs or silent
  // replacement of an inaccessible original with text-to-image generation.
  let encoded = typeof file.base64 === "string" ? file.base64 : ""
  if (!encoded && typeof file.url === "string" && file.url.startsWith("data:")) encoded = file.url
  if (!encoded) throw new RequestSafetyError("Загрузите оригинал фото файлом ещё раз.", 400, "IMAGE_EDIT_UPLOAD_REQUIRED")
  const dataUrl = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(encoded)
  const mime = dataUrl?.[1]?.toLowerCase() || String(file.mime || "").toLowerCase()
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new RequestSafetyError("Используйте фото PNG, JPEG или WebP.", 415, "IMAGE_EDIT_FORMAT")
  if (dataUrl) encoded = encoded.slice(dataUrl[0].length)
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new RequestSafetyError("Не удалось прочитать фото. Загрузите его ещё раз.", 400, "IMAGE_EDIT_INVALID")
  const bytes = Buffer.from(encoded, "base64")
  try {
    const decoder = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" })
    const meta = await decoder.metadata()
    if (!meta.width || !meta.height || !["png", "jpeg", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error("Unsupported image")
    const rotated = (meta.orientation || 1) >= 5
    const width = rotated ? meta.height : meta.width
    const height = rotated ? meta.width : meta.height
    if (Math.max(width, height) / Math.min(width, height) > 4) throw new Error("Aspect ratio")
    // Workers AI reference inputs are limited to 512px per side. Fit inside:
    // preserve the whole uploaded frame and orientation, never crop it.
    const reference = await decoder.rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).png().toBuffer()
    const scale = 1024 / Math.max(width, height)
    return { bytes: reference, mime: "image/png", width: Math.max(256, Math.round(width * scale / 16) * 16), height: Math.max(256, Math.round(height * scale / 16) * 16) }
  } catch {
    throw new RequestSafetyError("Не удалось прочитать фото. Используйте PNG, JPEG или WebP до 40 Мп с соотношением сторон не больше 4:1.", 400, "IMAGE_EDIT_INVALID")
  }
}
