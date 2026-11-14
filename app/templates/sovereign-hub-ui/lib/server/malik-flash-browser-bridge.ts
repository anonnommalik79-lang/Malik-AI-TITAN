import { createHmac, randomUUID } from "node:crypto"
import { readJsonBodyLimited } from "./request-safety"

const FLASH_ORIGIN = "google-ai-mode-browser"
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_IMAGE_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_QUESTION_CHARS = 6000

export type FlashTask = "chat" | "image_generate" | "image_edit"
export type FlashBrowserImage = { mime?: string; base64?: string; name?: string }
export type FlashBrowserSource = { url: string; title: string; domain: string; provider: typeof FLASH_ORIGIN }
type FlashTiming = { queueMs?: number; browserPreparationMs?: number; submitMs?: number; firstContentMs?: number; completedMs?: number }
export type FlashBrowserAnswer = {
  content: string
  provider: typeof FLASH_ORIGIN
  model: "Google AI Mode"
  selectedModelId: "malik-flash"
  usedWeb: boolean
  sources: FlashBrowserSource[]
  attempts: []
  flashTiming: FlashTiming
}

export class FlashBrowserError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 503) {
    super(message)
    this.name = "FlashBrowserError"
  }
}

export function flashScopedId(secret: string, scope: string, identifier: string): string {
  return createHmac("sha256", secret).update(scope).update("\0").update(identifier).digest("hex")
}

export function isFlashChatId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._:-]{1,150}$/iu.test(value)
}

export function flashSources(input: unknown): FlashBrowserSource[] {
  if (!Array.isArray(input)) return []
  const sources = new Map<string, FlashBrowserSource>()
  for (const entry of input) {
    if (!entry || typeof entry.url !== "string" || entry.url.length > 2048) continue
    try {
      const url = new URL(entry.url)
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue
      url.hash = ""
      if (!sources.has(url.href)) sources.set(url.href, {
        url: url.href,
        title: typeof entry.title === "string" ? entry.title.slice(0, 160) : url.hostname,
        domain: url.hostname,
        provider: FLASH_ORIGIN,
      })
      if (sources.size >= 16) break
    } catch { /* malformed citation */ }
  }
  return [...sources.values()]
}

export function readFlashTiming(input: unknown): FlashTiming {
  const timing: FlashTiming = {}
  if (!input || typeof input !== "object") return timing
  const data = input as Record<string, unknown>
  for (const key of ["queueMs", "browserPreparationMs", "submitMs", "firstContentMs", "completedMs"] as const) {
    const value = data[key]
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 180_000) timing[key] = Math.round(value)
  }
  return timing
}

export function readFlashWorkerAnswer(payload: Record<string, unknown>, hasImages = false): FlashBrowserAnswer {
  if (payload.origin !== FLASH_ORIGIN || payload.complete !== true || payload.kind !== "chat") {
    throw new FlashBrowserError("FLASH_INCOMPLETE", "Google AI Mode не подтвердил завершение ответа.")
  }
  if (hasImages && payload.imagesProcessed !== true) {
    throw new FlashBrowserError("FLASH_IMAGE_UNVERIFIED", "Google AI Mode не подтвердил обработку фотографии.")
  }
  if (typeof payload.answer !== "string" || !payload.answer.trim() || payload.answer.length > 200_000) {
    throw new FlashBrowserError("FLASH_EMPTY_OR_TOO_LARGE", "Не удалось получить полный ответ Google AI Mode.")
  }
  const sources = flashSources(payload.sources)
  return {
    content: payload.answer,
    provider: FLASH_ORIGIN,
    model: "Google AI Mode",
    selectedModelId: "malik-flash",
    usedWeb: sources.length > 0,
    sources,
    attempts: [],
    flashTiming: readFlashTiming(payload.timing),
  }
}

function workerSettings() {
  const endpoint = process.env.MALIK_FLASH_WORKER_URL
  const secret = process.env.MALIK_FLASH_WORKER_SECRET
  if (process.env.NEXT_PUBLIC_MALIK_FLASH_PREVIEW !== "1" || process.env.MALIK_FLASH_ISOLATED_WORKER !== "1" ||
      !endpoint || !secret || secret.length < 24) return null
  try {
    const url = new URL(endpoint)
    const localDev = process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.username || url.password || url.hash || url.search || url.pathname !== "/v1/ask") return null
    if (url.protocol === "https:" || localDev) return { url, secret }
  } catch { /* invalid configuration */ }
  return null
}

/** Checks local configuration. Readiness and Google access are confirmed by the worker. */
export function isMalikFlashBrowserReady() {
  return workerSettings() !== null
}

export function requireMalikFlashBrowser() {
  if (!isMalikFlashBrowserReady()) {
    throw new FlashBrowserError("FLASH_WORKER_NOT_READY", "Google AI Mode в MalikLLM Flash пока недоступен. Попробуйте позже.")
  }
}

const publicWorkerErrors: Record<string, [string, number]> = {
  GOOGLE_AUTOMATION_RESTRICTED: ["Google AI Mode в MalikLLM Flash пока недоступен.", 503],
  GOOGLE_LOGIN_REQUIRED: ["Для Flash нужна подтверждённая сессия Google этого аккаунта.", 409],
  GOOGLE_VERIFICATION_REQUIRED: ["Google требует подтвердить доступ в браузере.", 409],
  GOOGLE_CONVERSATION_UNAVAILABLE: ["Сессия Google для этого чата недоступна. История MALIKII сохранена.", 409],
  GOOGLE_ANSWER_INCOMPLETE: ["Google AI Mode не подтвердил завершение ответа. Попробуйте ещё раз.", 503],
  GOOGLE_IMAGE_UPLOAD_UNVERIFIED: ["Google AI Mode не подтвердил загрузку фотографии. Прикрепите её повторно.", 422],
  IMAGE_MIME_MISMATCH: ["Тип фотографии не совпадает с содержимым.", 422],
  HOURLY_LIMIT: ["Достигнут часовой лимит Flash. Повторите позже.", 429],
  WORKER_CAPACITY: ["Flash сейчас занят. Повторите немного позже.", 429],
  WORKER_TIMEOUT: ["Google AI Mode не успел завершить запрос. Попробуйте ещё раз.", 504],
  USER_BUSY: ["Дождитесь завершения другого запроса Flash в вашем аккаунте.", 409],
  REQUEST_ABORTED: ["Запрос Flash остановлен.", 499],
}

function workerError(value: unknown) {
  const code = typeof value === "string" && Object.hasOwn(publicWorkerErrors, value) ? value : "FLASH_WORKER_FAILED"
  const [message, status] = publicWorkerErrors[code] || ["Не удалось завершить запрос к Google AI Mode. Попробуйте позже.", 503]
  return new FlashBrowserError(code, message, status)
}

type WorkerInput = {
  task: FlashTask
  question: string
  userId: string
  chatId: string
  images?: FlashBrowserImage[]
  context?: string
  requireExisting?: boolean
  isolatedTurn?: boolean
  signal?: AbortSignal
  onText?: (chunk: string) => void
}

async function readChatEvents(response: Response, requestId: string, onText: WorkerInput["onText"]) {
  if (!response.body) throw workerError(undefined)
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let remaining = "", bytes = 0, streamed = ""
  let final: Record<string, unknown> | undefined
  const consume = (line: string) => {
    if (!line.trim()) return
    if (final) throw workerError(undefined)
    const event = JSON.parse(line)
    if (!event || event.requestId !== requestId) throw workerError(undefined)
    if (event.type === "error") throw workerError(event.error)
    if (event.type === "done") {
      if (!event.result || typeof event.result !== "object" ||
          (streamed && (typeof event.result.answer !== "string" || !event.result.answer.startsWith(streamed)))) throw workerError(undefined)
      final = event.result
      return
    }
    if (event.type !== "delta" || typeof event.text !== "string" ||
        streamed.length + event.text.length > 200_000) throw workerError(undefined)
    streamed += event.text
    onText?.(event.text)
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (value) bytes += value.byteLength
      if (bytes > MAX_TEXT_BYTES) throw workerError(undefined)
      remaining += decoder.decode(value, { stream: !done })
      const lines = remaining.split("\n")
      remaining = lines.pop() || ""
      for (const line of lines) consume(line)
      if (done) break
    }
    consume(remaining)
    if (!final) throw new FlashBrowserError("FLASH_INCOMPLETE", "Соединение прервалось до подтверждения ответа Google AI Mode.")
    return final
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function requestMalikFlashWorker(input: WorkerInput): Promise<Record<string, unknown>> {
  const settings = workerSettings()
  if (!settings) {
    throw new FlashBrowserError("FLASH_WORKER_NOT_READY", "Google AI Mode в MalikLLM Flash пока недоступен. Попробуйте позже.")
  }
  if (!input.userId || input.userId === "guest" || input.userId.startsWith("guest:")) {
    throw new FlashBrowserError("FLASH_SIGN_IN_REQUIRED", "Войдите в MALIKII для доступа к персональной сессии Flash.", 401)
  }
  if (!isFlashChatId(input.chatId)) throw new FlashBrowserError("FLASH_CHAT_ID_REQUIRED", "Не удалось определить чат.", 400)
  if (!input.question.trim() || input.question.length > MAX_QUESTION_CHARS) {
    throw new FlashBrowserError("FLASH_PROMPT_INVALID", "Введите запрос длиной до 6000 символов.", 422)
  }
  const images = input.images || []
  if (images.length > 4 || images.some((image) => !image || !/^image\/(?:png|jpeg|webp)$/.test(image.mime || "") ||
    typeof image.base64 !== "string" || image.base64.length > 6_990_508 || !/^[a-z0-9+/]+={0,2}$/i.test(image.base64))) {
    throw new FlashBrowserError("FLASH_IMAGE_INVALID", "Используйте до четырёх изображений PNG, JPEG или WebP по 5 МБ.", 422)
  }

  const { url, secret } = settings
  const requestId = randomUUID()
  const userScope = flashScopedId(secret, "user", input.userId)
  const chatScope = flashScopedId(secret, "chat:" + input.userId, input.isolatedTurn ? requestId : input.chatId)
  const timeout = AbortSignal.timeout(115_000)
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + secret,
        "accept": input.onText ? "application/x-ndjson" : "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        protocol: "malik-flash-worker-v1", requestId, userScope, chatScope,
        task: input.task, question: input.question, images,
        requireExisting: input.requireExisting === true && !input.isolatedTurn,
        isolatedTurn: input.isolatedTurn === true,
        context: input.isolatedTurn ? undefined : input.context,
      }),
      redirect: "error",
      cache: "no-store",
      signal,
    })
    if (response.headers.get("x-request-id") !== requestId) {
      void response.body?.cancel().catch(() => {})
      throw workerError(undefined)
    }
    if (response.ok && response.headers.get("content-type")?.includes("application/x-ndjson")) {
      return await readChatEvents(response, requestId, input.onText)
    }
    const raw = await readJsonBodyLimited<Record<string, unknown>>(
      new Request(url, { method: "POST", body: response.body, duplex: "half" } as RequestInit),
      !response.ok ? 16_384 : input.task === "chat" ? MAX_TEXT_BYTES : MAX_IMAGE_RESPONSE_BYTES,
    )
    if (!raw || typeof raw !== "object" || raw.requestId !== requestId) throw workerError(undefined)
    if (!response.ok) throw workerError(raw.error)
    return raw
  } catch (error) {
    if (error instanceof FlashBrowserError) throw error
    if (input.signal?.aborted) throw workerError("REQUEST_ABORTED")
    throw new FlashBrowserError("FLASH_WORKER_UNREACHABLE", "Не удалось получить ответ Google AI Mode. Попробуйте позже.")
  }
}

export async function runMalikFlashBrowser(input: Omit<WorkerInput, "task">): Promise<FlashBrowserAnswer> {
  const result = await requestMalikFlashWorker({ ...input, task: "chat" })
  return readFlashWorkerAnswer(result, Boolean(input.images?.length))
}
