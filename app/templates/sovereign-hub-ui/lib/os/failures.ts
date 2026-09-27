import type { OsError } from "./types"

/**
 * Failures, in words a person can act on, and the retry policy that goes
 * with each kind.
 *
 * Every error inside Malik AI ends up here before it reaches the screen:
 * "Load failed", "Failed to fetch", "HTTP 502", a provider's JSON dump — none
 * of that is shown as the main message. The person sees what happened in
 * plain Russian and what they can do about it; the code travels alongside for
 * the logs and for the retry policy.
 */

/** Thrown by tools when they know exactly what went wrong. */
export class OsToolError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly action: OsError["action"]
  readonly provider?: string
  readonly retryAfterMs?: number

  constructor(code: string, message: string, options: { retryable?: boolean; action?: OsError["action"]; provider?: string; retryAfterMs?: number } = {}) {
    super(message)
    this.name = "OsToolError"
    this.code = code
    this.retryable = Boolean(options.retryable)
    this.action = options.action || (options.retryable ? "retry" : "none")
    this.provider = options.provider
    this.retryAfterMs = options.retryAfterMs
  }
}

const NETWORK = /failed to fetch|load failed|networkerror|network error|fetch failed|econnreset|econnrefused|eai_again|enotfound|socket hang up|socket|terminated|connection (?:reset|closed|refused)|err_(?:network|connection|internet)/i
const TIMEOUT = /timeout|timed out|aborted|abort|deadline|превышено время|too long/i
const RATE = /\b429\b|rate.?limit|too many requests|quota|overload|перегруж|занят|busy|resource_exhausted|capacity/i
const SERVER = /\b50[0-4]\b|bad gateway|service unavailable|internal server error|upstream|временно недоступ/i
const PARSE = /unexpected token|json|syntaxerror|is not valid json/i

function statusOf(error: unknown): number {
  const value = (error as { status?: unknown; statusCode?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  return typeof code === "string" ? code : ""
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === "string") return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

/** Turns any failure into an OsError with a human message and a retry verdict. */
export function classifyFailure(error: unknown, provider?: string): OsError {
  if (error instanceof OsToolError) {
    return { code: error.code, message: error.message, retryable: error.retryable, provider: error.provider || provider, action: error.action }
  }
  const status = statusOf(error)
  const code = codeOf(error)
  const raw = messageOf(error)
  const name = (error as { name?: string })?.name || ""

  if (code === "PRO_MODEL_REQUIRED" || status === 402) {
    return { code: "PLAN_REQUIRED", message: "Этот шаг доступен в MalikAI Plus.", retryable: false, provider, action: "upgrade" }
  }
  if (/CREDIT|QUOTA_EXCEEDED|LIMIT_REACHED/i.test(code) || /недостаточно кредит|кредиты закончил|лимит .*исчерпан/i.test(raw)) {
    return { code: "NO_CREDITS", message: "На сегодня закончились кредиты для этого шага. Они обновятся завтра.", retryable: false, provider, action: "upgrade" }
  }
  if (code === "MAX_ALL_LANES_BUSY" || code === "MAX_EMPTY") {
    return { code: "MODELS_BUSY", message: "Все модели сейчас заняты. Повторю через несколько секунд.", retryable: true, provider, action: "wait" }
  }
  if (status === 401 || code === "UNAUTHENTICATED") {
    return { code: "SIGN_IN_REQUIRED", message: "Войдите в аккаунт, чтобы выполнить этот шаг.", retryable: false, provider, action: "sign-in" }
  }
  if (status === 429 || RATE.test(raw)) {
    return { code: "RATE_LIMITED", message: "Сервис перегружен. Повторю чуть позже.", retryable: true, provider, action: "wait" }
  }
  if (name === "AbortError" || name === "TimeoutError" || TIMEOUT.test(raw)) {
    return { code: "TIMEOUT", message: "Сервис отвечал слишком долго. Повторю ещё раз.", retryable: true, provider, action: "retry" }
  }
  if (name === "TypeError" && NETWORK.test(raw) || NETWORK.test(raw)) {
    return { code: "NETWORK", message: "Пропала связь с сервисом. Повторю, как только он ответит.", retryable: true, provider, action: "retry" }
  }
  if (status >= 500 || SERVER.test(raw)) {
    return { code: "PROVIDER_UNAVAILABLE", message: "Сервис временно недоступен. Попробую другой маршрут.", retryable: true, provider, action: "fallback" }
  }
  if (status === 400 || status === 413 || status === 422) {
    return { code: "INVALID_REQUEST", message: "Сервис не принял этот запрос. Уточните задачу и попробуйте снова.", retryable: false, provider, action: "none" }
  }
  if (PARSE.test(raw)) {
    return { code: "BAD_RESPONSE", message: "Сервис вернул неполный ответ. Повторю ещё раз.", retryable: true, provider, action: "retry" }
  }
  return { code: code || "UNKNOWN", message: "Не получилось выполнить этот шаг. Можно повторить.", retryable: true, provider, action: "retry" }
}

/**
 * How long to wait before attempt `attempt` (1 = the first retry).
 * Exponential with jitter; a rate limit waits at least its own hint.
 */
export function retryDelayMs(attempt: number, error?: OsError, retryAfterMs?: number, random = Math.random) {
  const base = 1_500 * 2 ** Math.max(0, attempt - 1)
  const jittered = base * (0.7 + random() * 0.6)
  const floor = error?.code === "RATE_LIMITED" || error?.code === "MODELS_BUSY" ? 5_000 : 0
  return Math.round(Math.min(20_000, Math.max(floor, retryAfterMs || 0, jittered)))
}

/** Should attempt number `attempts` (already made) be followed by another? */
export function shouldRetry(error: OsError, attempts: number, maxAttempts: number) {
  return error.retryable && attempts < maxAttempts
}

/**
 * For the browser: a raw error string from fetch or a response body, turned
 * into one sentence and an action. "Load failed" never reaches the screen.
 */
export function humanizeError(raw: unknown, context: "chat" | "image" | "video" | "site" | "presentation" | "voice" | "general" = "general") {
  const error = classifyFailure(raw instanceof Error || typeof raw === "object" ? raw : new Error(String(raw || "")))
  const phrases: Record<typeof context, { lost: string; slow: string }> = {
    chat: { lost: "Ответ не пришёл", slow: "Ответ готовился" },
    image: { lost: "Изображение не пришло", slow: "Изображение готовилось" },
    video: { lost: "Видео не пришло", slow: "Видео готовилось" },
    site: { lost: "Сайт не пришёл", slow: "Сайт собирался" },
    presentation: { lost: "Презентация не пришла", slow: "Презентация готовилась" },
    voice: { lost: "Голосовой ответ не пришёл", slow: "Голосовой ответ готовился" },
    general: { lost: "Результат не пришёл", slow: "Результат готовился" },
  }
  const phrase = phrases[context]
  if (error.code === "NETWORK") return { ...error, message: `${phrase.lost}: пропала связь. Проверьте интернет и нажмите «Повторить».` }
  if (error.code === "TIMEOUT") return { ...error, message: `${phrase.slow} слишком долго. Нажмите «Повторить» — Malik выберет другой маршрут.` }
  return error
}
