/**
 * Server-only boundary for a future PER-USER Google AI Mode browser worker.
 *
 * This is deliberately not a generic proxy to the owner's local Chromium.
 * Enabling the public Flash selector requires a separately deployed worker
 * that isolates Google sessions/cookies by user and conversations by chat.
 * Never put the worker secret or Google cookies in browser code.
 */
import { createHmac } from "node:crypto"

export type FlashBrowserImage = { mime?: string; base64?: string; name?: string }
export type FlashBrowserSource = { url: string; title: string; domain: string; provider: "google-ai-mode-browser" }
export type FlashBrowserAnswer = {
  content: string
  provider: "malik-flash-browser"
  model: "MalikLLM Flash"
  selectedModelId: "malik-flash"
  usedWeb: true
  sources: FlashBrowserSource[]
  attempts: []
}

export class FlashBrowserError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "FlashBrowserError"
  }
}

export function flashScopedId(secret: string, scope: string, identifier: string): string {
  if (!secret || !scope || !identifier) throw new FlashBrowserError("FLASH_SCOPE_INVALID", "Невозможно изолировать сессию браузера.")
  return createHmac("sha256", secret).update(scope).update("\0").update(identifier).digest("hex")
}

export function flashSources(input: unknown): FlashBrowserSource[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: FlashBrowserSource[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const entry = item as { url?: unknown; title?: unknown }
    if (typeof entry.url !== "string") continue
    try {
      const url = new URL(entry.url)
      if (!["https:", "http:"].includes(url.protocol)) continue
      url.hash = ""
      if (seen.has(url.href)) continue
      seen.add(url.href)
      result.push({ url: url.href, title: typeof entry.title === "string" ? entry.title.slice(0, 160) : url.hostname, domain: url.hostname, provider: "google-ai-mode-browser" })
      if (result.length >= 16) break
    } catch { /* malformed source */ }
  }
  return result
}

export function readFlashWorkerAnswer(payload: unknown, hasImages = false): { answer: string; sources: FlashBrowserSource[] } {
  if (!payload || typeof payload !== "object") throw new FlashBrowserError("FLASH_INVALID_RESPONSE", "Сервис поиска вернул неверный ответ.")
  const body = payload as { answer?: unknown; complete?: unknown; sources?: unknown; imagesProcessed?: unknown }
  if (body.complete !== true) throw new FlashBrowserError("FLASH_INCOMPLETE", "Google AI Mode ещё не закончил ответ. Незавершённый результат не показывается как полный.")
  if (hasImages && body.imagesProcessed !== true) throw new FlashBrowserError("FLASH_IMAGE_UNVERIFIED", "Не удалось подтвердить, что Google обработал прикреплённую фотографию.")
  if (typeof body.answer !== "string" || !body.answer.trim() || body.answer.length > 200_000)
    throw new FlashBrowserError("FLASH_EMPTY_OR_TOO_LARGE", "Нет полного текстового ответа Google AI Mode.")
  return { answer: body.answer, sources: flashSources(body.sources) }
}

export async function runMalikFlashBrowser(input: {
  question: string
  userId: string
  chatId: string
  images?: FlashBrowserImage[]
  signal?: AbortSignal
}): Promise<FlashBrowserAnswer> {
  const endpoint = process.env.MALIK_FLASH_WORKER_URL
  const secret = process.env.MALIK_FLASH_WORKER_SECRET
  if (process.env.MALIK_FLASH_ISOLATED_WORKER !== "1" || !endpoint || !secret || secret.length < 24)
    throw new FlashBrowserError("FLASH_WORKER_NOT_READY", "MalikLLM Flash пока не подключён к изолированному браузерному сервису.")
  const url = new URL(endpoint)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback && url.protocol === "http:"))
    throw new FlashBrowserError("FLASH_WORKER_URL_INVALID", "Для браузерного сервиса требуется защищённое соединение.")
  if (!input.chatId || !input.userId) throw new FlashBrowserError("FLASH_SESSION_MISSING", "Неизвестен пользователь или идентификатор чата.")

  const providedImages = input.images || []
  const images = providedImages.filter((item) => item && typeof item.base64 === "string")
  if (providedImages.length !== images.length) throw new FlashBrowserError("FLASH_IMAGE_MISSING", "Одна или несколько фотографий не были переданы в браузерный сервис.")
  if (images.length > 4 || images.some((image) =>
    !/^image\/(?:png|jpeg|webp)$/i.test(image.mime || "") ||
    !/^[a-zA-Z0-9+/]+={0,2}$/.test(image.base64 || "") ||
    (image.base64 || "").length > 7_000_000))
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Поддерживается до четырёх изображений PNG/JPEG/WebP размером до 5 МБ каждое.")

  const userScope = flashScopedId(secret, "user", input.userId)
  const chatScope = flashScopedId(secret, "chat:" + input.userId, input.chatId)
  // The worker MUST ensure browser profiles/cookies are isolated by userScope,
  // and conversations isolated by chatScope. The current local lab DOES NOT.
  const timeout = AbortSignal.timeout(95_000)
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + secret },
      body: JSON.stringify({
        protocol: "malik-flash-worker-v1",
        userScope,
        chatScope,
        question: input.question,
        images: images.map(({ mime, base64, name }) => ({ mime, base64, name })),
      }),
      cache: "no-store",
      signal,
    })
  } catch {
    throw new FlashBrowserError("FLASH_WORKER_UNREACHABLE", "Браузерный сервис сейчас недоступен. Попробуйте позже.")
  }
  if (!response.ok) throw new FlashBrowserError("FLASH_WORKER_FAILED", "Google AI Mode не завершил обработку запроса.")
  const raw = await response.text()
  if (raw.length > 1_000_000) throw new FlashBrowserError("FLASH_RESPONSE_TOO_LARGE", "Сервис вернул слишком большой ответ.")
  let json: unknown
  try { json = JSON.parse(raw) } catch { throw new FlashBrowserError("FLASH_INVALID_JSON", "Сервис вернул некорректный формат ответа.") }
  const verified = readFlashWorkerAnswer(json, images.length > 0)
  return {
    content: verified.answer,
    provider: "malik-flash-browser",
    model: "MalikLLM Flash",
    selectedModelId: "malik-flash",
    usedWeb: true,
    sources: verified.sources,
    attempts: [],
  }
}
