import "server-only"
import { flashScopedId, FlashBrowserError } from "./malik-flash-browser-bridge"

const MAX_IMAGE_BYTES = 9 * 1024 * 1024
const MAX_WORKER_BODY_CHARS = 13 * 1024 * 1024

export type MalikFlashImageTask = "image_generate" | "image_edit"
export type MalikFlashImage = { dataUrl: string; width?: number; height?: number }

export function verifyMalikFlashImagePayload(payload: unknown, task: MalikFlashImageTask): MalikFlashImage {
  if (!payload || typeof payload !== "object") throw new FlashBrowserError("FLASH_IMAGE_EMPTY", "Сервис не вернул изображение.")
  const response = payload as Record<string, unknown>
  if (response.complete !== true || response.kind !== task)
    throw new FlashBrowserError("FLASH_IMAGE_INCOMPLETE", "Создание изображения не завершилось.")
  if (task === "image_edit" && response.imagesProcessed !== true)
    throw new FlashBrowserError("FLASH_SOURCE_NOT_PROCESSED", "Не удалось подтвердить обработку исходного фото.")
  const file = response.image
  if (!file || typeof file !== "object") throw new FlashBrowserError("FLASH_IMAGE_MISSING", "Готовое изображение отсутствует.")
  const obj = file as Record<string, unknown>
  const mime = obj.mime
  const base64 = obj.base64
  if ((mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp")
    || typeof base64 !== "string" || !base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8
    || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64))
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Получены повреждённые данные изображения.")
  const bytes = Buffer.from(base64, "base64")
  if (bytes.length < 1000 || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== base64)
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Получено повреждённое или слишком большое изображение.")
  const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp))
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Тип файла не совпадает с его содержимым.")
  const width = typeof obj.width === "number" && Number.isFinite(obj.width) && obj.width > 0 ? obj.width : undefined
  const height = typeof obj.height === "number" && Number.isFinite(obj.height) && obj.height > 0 ? obj.height : undefined
  return { dataUrl: "data:" + mime + ";base64," + base64, width, height }
}

export async function runMalikFlashImage(input: {
  task: MalikFlashImageTask
  question: string
  userId: string
  chatId: string
  source?: { mime: "image/png"; bytes: Uint8Array }
  signal?: AbortSignal
}): Promise<MalikFlashImage> {
  const urlText = process.env.MALIK_FLASH_WORKER_URL
  const secret = process.env.MALIK_FLASH_WORKER_SECRET
  if (process.env.MALIK_FLASH_ISOLATED_WORKER !== "1" || !urlText || !secret || secret.length < 24)
    throw new FlashBrowserError("FLASH_WORKER_NOT_READY", "Генерация изображений временно недоступна.")
  if (!input.userId || input.userId === "guest" || input.userId.startsWith("guest:"))
    throw new FlashBrowserError("FLASH_SIGN_IN_REQUIRED", "Войдите в MALIKII, чтобы пользоваться персональной сессией генерации.")
  if (!input.chatId || input.chatId.length > 150 || !/^[a-zA-Z0-9._:-]+$/.test(input.chatId))
    throw new FlashBrowserError("FLASH_CHAT_ID_REQUIRED", "Не удалось восстановить диалог. Повторите запрос в новом чате.")
  if (typeof input.question !== "string" || !input.question.trim() || input.question.length > 6000)
    throw new FlashBrowserError("FLASH_PROMPT_INVALID", "Некорректный запрос на изображение.")
  if (input.task === "image_edit" && !input.source?.bytes.length)
    throw new FlashBrowserError("FLASH_SOURCE_REQUIRED", "Для изменения изображения загрузите исходное фото.")
  if (input.task === "image_generate" && input.source)
    throw new FlashBrowserError("FLASH_UNEXPECTED_SOURCE", "Для создания новой картинки исходное фото не требуется.")
  const url = new URL(urlText)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback && url.protocol === "http:"))
    throw new FlashBrowserError("FLASH_WORKER_URL_INVALID", "Сервис изображений пока недоступен.")
  const images = input.source ? [{
    mime: input.source.mime,
    name: "malikii-source.png",
    base64: Buffer.from(input.source.bytes).toString("base64"),
  }] : []
  if (images.some(photo => photo.base64.length > 7_000_000))
    throw new FlashBrowserError("FLASH_SOURCE_TOO_LARGE", "Исходное изображение слишком большое.")

  const userScope = flashScopedId(secret, "user", input.userId)
  const chatScope = flashScopedId(secret, "chat:" + input.userId, input.chatId)
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(115_000)]) : AbortSignal.timeout(115_000)
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + secret },
      body: JSON.stringify({ protocol: "malik-flash-worker-v1", userScope, chatScope,
        task: input.task, question: input.question, images }),
      signal,
      cache: "no-store",
    })
  } catch {
    throw new FlashBrowserError("FLASH_WORKER_UNREACHABLE", "Соединение с генератором изображений прервалось.")
  }
  if (!response.ok) throw new FlashBrowserError("FLASH_WORKER_FAILED", "Генерация или редактирование не завершилось.")
  const raw = await response.text()
  if (raw.length > MAX_WORKER_BODY_CHARS)
    throw new FlashBrowserError("FLASH_IMAGE_TOO_LARGE", "Сервис вернул слишком большое изображение.")
  let payload: unknown
  try { payload = JSON.parse(raw) }
  catch { throw new FlashBrowserError("FLASH_WORKER_RESPONSE_INVALID", "Некорректный ответ сервиса изображений.") }
  return verifyMalikFlashImagePayload(payload, input.task)
}
