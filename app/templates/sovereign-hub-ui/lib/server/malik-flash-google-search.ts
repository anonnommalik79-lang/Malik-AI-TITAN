import "server-only"

import { geminiKeys, GeminiEngineError, runGemini, type GeminiSource } from "@/lib/business/gemini-engine"
import { flashImageOperation, isFlashCodingRequest } from "@/lib/ai/malik-flash-intent"
import { isExplicitVideoGenerationRequest } from "@/lib/ai/image-intent"
import { instantReply } from "@/lib/ai/instant-replies"
import { clockReply } from "@/lib/ai/premise-check"
import { selfCreatorReply } from "@/lib/ai/attribution-evidence"
import { normalizeProviderTokenUsage, type MalikTokenUsage } from "@/lib/ai/token-telemetry"
import { FlashBrowserError } from "./malik-flash-browser-bridge"

/**
 * MalikLLM Flash answered by Gemini with Grounding with Google Search, through
 * the official Gemini API and the Gemini keys the server already has.
 *
 * This is not Google AI Mode and is never shown as AI Mode: automated access
 * to AI Mode is not permitted (see docs/malikllm-flash/BROWSER_WORKER_ROLLOUT.md).
 * Search grounding is billed by Google, so it runs only when the owner sets
 * MALIK_FLASH_GOOGLE_SEARCH=1. The chat route handles ordinary turns with its
 * native engine when this service is unavailable and reports explicit Google
 * requests as unavailable.
 */

export const FLASH_GOOGLE_SEARCH_PROVIDER = "google-gemini-search"
/**
 * Models with a free daily Google Search allowance. Gemini 3 grounding is billed
 * from the first request on a project without a free search tier (production
 * answered 402 and 429), so it is never called from here unless the owner
 * names it in MALIK_FLASH_GEMINI_MODEL.
 */
export const FLASH_FREE_SEARCH_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const
const DEFAULT_DAILY_LIMIT = 500
const MAX_IN_FLIGHT = 3
const GOOGLE_DEADLINE_MS = 15_000
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", dateStyle: "short" })
const MAX_QUESTION_CHARS = 6000
const HISTORY_TURNS = 6
const HISTORY_CHARS = 1500

export type FlashSearchSource = { url: string; title: string; domain: string; provider: typeof FLASH_GOOGLE_SEARCH_PROVIDER }

export type FlashSearchAnswer = {
  content: string
  provider: typeof FLASH_GOOGLE_SEARCH_PROVIDER
  model: string
  selectedModelId: "malik-flash"
  usedWeb: boolean
  sources: FlashSearchSource[]
  attempts: []
  usage?: MalikTokenUsage
  flashSearch: { searched: true; firstTextMs?: number; totalMs: number }
}

type Env = Record<string, string | undefined>

/** The owner's switch, read the way people type it in a dashboard: 1, true, on or yes. */
export function flashGoogleSearchSwitch(env: Env = process.env): boolean {
  return /^(?:1|true|on|yes)$/iu.test(String(env.MALIK_FLASH_GOOGLE_SEARCH ?? "").trim())
}

/** Search grounding is on only when the owner turned it on and a Gemini key exists. */
export function flashGoogleSearchEnabled(env: Env = process.env): boolean {
  return flashGoogleSearchSwitch(env) && geminiKeys(env).length > 0
}

type FlashSearchHealth = {
  lastFailure?: { code: string; statuses: number[]; models: Array<{ model: string; code: string; status?: number }>; at: string }
  lastSuccessAt?: string
  cooldown?: { until: number; code: string }
  active?: number
  day?: string
  used?: number
}
const health = globalThis as typeof globalThis & { __malikFlashSearchHealth?: FlashSearchHealth }
function searchHealth(): FlashSearchHealth {
  return health.__malikFlashSearchHealth ||= {}
}

/**
 * For the public health check: whether the switch and a key are seen, and how
 * the last call ended. Codes and HTTP statuses only; never a key or its name.
 */
export function flashGoogleSearchStatus(env: Env = process.env) {
  const { lastFailure, lastSuccessAt } = searchHealth()
  const enabled = flashGoogleSearchEnabled(env)
  const dailyLimit = flashSearchDailyLimit(env)
  const status = !enabled || dailyLimit === 0 ? "disabled"
    : lastSuccessAt && (!lastFailure || lastSuccessAt >= lastFailure.at) ? "ready"
    : lastFailure ? "unavailable" : "unverified"
  return { switch: flashGoogleSearchSwitch(env), geminiKey: geminiKeys(env).length > 0, enabled, status,
    models: flashSearchModels(env), dailyUsed: usedToday(), dailyLimit,
    lastFailure, lastSuccessAt }
}

/** The models Flash may search with: the owner's list, or the free-allowance ones. */
export function flashSearchModels(env: Env = process.env, now = Date.now()): string[] {
  const named = String(env.MALIK_FLASH_GEMINI_MODEL || "").split(",").map(value => value.trim().replace(/^models\//, "")).filter(value => /^gemini-[a-z0-9.-]{2,60}$/iu.test(value))
  if (named.length) return [...new Set(named)]
  // Google will reroute this ID to a differently billed model at shutdown.
  return now < Date.UTC(2026, 11, 1) ? [...FLASH_FREE_SEARCH_MODELS] : ["gemini-2.5-flash-lite"]
}

export function flashSearchDailyLimit(env: Env = process.env): number {
  const raw = String(env.MALIK_FLASH_GOOGLE_SEARCH_DAILY_LIMIT ?? "").trim()
  const value = Number(raw)
  // Unset or malformed means the default; an explicit 0 turns searching off.
  return raw && Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : DEFAULT_DAILY_LIMIT
}

function today() {
  return PACIFIC_DAY.format(new Date())
}

function usedToday() {
  const state = searchHealth()
  return state.day === today() ? state.used || 0 : 0
}

/** Counts one generation request, including a retry, against this process's daily budget. */
function takeDailySearch(env: Env): boolean {
  const state = searchHealth()
  if (state.day !== today()) { state.day = today(); state.used = 0 }
  if ((state.used || 0) >= flashSearchDailyLimit(env)) return false
  state.used = (state.used || 0) + 1
  return true
}

/**
 * The turns Gemini with Google Search answers: a text question. Code, sites,
 * games, images, video, attachments and skills keep their own MALIKII paths.
 */
export function flashGoogleSearchEligible(prompt: string, input: { attachments?: unknown; codeOrBuild?: boolean; history?: unknown } = {}): boolean {
  const text = String(prompt || "").trim()
  if (!text || text.length > MAX_QUESTION_CHARS || input.codeOrBuild) return false
  if (Array.isArray(input.attachments) && input.attachments.length) return false
  // A greeting, «который час», «кто тебя создал» are answered locally in well
  // under a second. A Google search would only make them slower.
  if (flashLocalReply(text, input.history)) return false
  return !isFlashCodingRequest(text) && !flashImageOperation(text, false) && !isExplicitVideoGenerationRequest(text)
}

/** The instant MALIKII reply for this turn, or "" when it needs a model. Same rules as the native router. */
export function flashLocalReply(prompt: string, history?: unknown): string {
  const earlier = Array.isArray(history) ? history.filter((item: unknown) => {
    const message = item as { role?: unknown; content?: unknown }
    return (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string" && message.content.trim() && message.content.trim() !== prompt.trim()
  }) : []
  return clockReply(prompt) || selfCreatorReply(prompt) || (earlier.length ? "" : instantReply(prompt))
}

const SYSTEM = [
  "You are MALIK AI, answering as MalikLLM Flash inside the MALIKII chat. MALIK AI was founded, created and developed by one solo founder, Abdumalik; the company behind it is Sovereign Hub.",
  "Answer in the language of the user's last message. Use Markdown. Answer everyday questions directly and briefly; give detail only when it is asked for.",
  "Use Google Search for anything that may have changed: news, prices, rates, versions, schedules, people in office, today's date-dependent facts. Do not invent sources, links, figures or quotes.",
  "Never say you are Google, Gemini or Google AI Mode, and never name a model vendor as your creator.",
].join("\n")

function historyMessages(body: Record<string, unknown>): Array<{ role: string; content: string }> {
  const raw = Array.isArray(body.history) ? body.history : Array.isArray(body.messages) ? body.messages : []
  return raw.flatMap((item: unknown) => {
    const message = item as { role?: unknown; content?: unknown }
    if ((message?.role !== "user" && message?.role !== "assistant") || typeof message.content !== "string" || !message.content.trim()) return []
    return [{ role: message.role, content: message.content.trim() }]
  }).slice(-HISTORY_TURNS)
}

/** The question with a bounded excerpt of the same chat, so a follow-up keeps its subject. */
export function flashSearchPrompt(question: string, body: Record<string, unknown>): string {
  if (body.flashContextEnabled === false) return question.trim()
  const history = historyMessages(body)
  if (history.length && history.at(-1)?.role === "user" && history.at(-1)?.content === question.trim()) history.pop()
  if (!history.length) return question.trim()
  const excerpt = history.map(message => (message.role === "user" ? "User: " : "Assistant: ") +
    (message.content.length > HISTORY_CHARS ? message.content.slice(0, HISTORY_CHARS) + " …" : message.content)).join("\n\n")
  return "Earlier in this chat (context only, do not repeat it):\n\n" + excerpt + "\n\nThe user's message now:\n\n" + question.trim()
}

/** Gemini's own grounding links, as the chat's source cards. */
export function flashSearchSources(items: GeminiSource[]): FlashSearchSource[] {
  const sources = new Map<string, FlashSearchSource>()
  for (const item of items) {
    try {
      const url = new URL(item.uri)
      if (url.protocol !== "https:" || url.username || url.password) continue
      if (sources.has(url.href)) continue
      const title = String(item.title || "").trim().slice(0, 160)
      sources.set(url.href, { url: url.href, title: title || url.hostname, domain: /^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(title) ? title : url.hostname, provider: FLASH_GOOGLE_SEARCH_PROVIDER })
      if (sources.size >= 16) break
    } catch { /* malformed grounding link */ }
  }
  return [...sources.values()]
}

export class FlashSearchUnavailable extends Error {
  constructor(public readonly code: string) {
    super("Gemini with Google Search did not answer: " + code)
    this.name = "FlashSearchUnavailable"
  }
}

export function flashGoogleModeUnavailable(): FlashBrowserError {
  return new FlashBrowserError("FLASH_GOOGLE_AI_MODE_UNAVAILABLE", "Google AI Mode через браузер сейчас недоступен в MalikLLM Flash.")
}

export function flashGoogleSearchError(error: FlashSearchUnavailable): FlashBrowserError {
  if (error.code === "BILLING_REQUIRED") {
    return new FlashBrowserError("FLASH_GOOGLE_SEARCH_BILLING_REQUIRED", "Для поиска Google текущему подключению нужен доступ к платному тарифу. Запрос остановлен.")
  }
  if (["QUOTA", "DAILY_LIMIT", "BUSY"].includes(error.code)) {
    return new FlashBrowserError("FLASH_GOOGLE_SEARCH_LIMIT", "Поиск Google сейчас ограничен. Попробуйте повторить запрос позже.", 429)
  }
  return new FlashBrowserError("FLASH_GOOGLE_SEARCH_UNAVAILABLE", "Не удалось получить подтверждённый ответ от поиска Google. Попробуйте повторить запрос позже.")
}

export async function runFlashGoogleSearch(input: {
  question: string
  body: Record<string, unknown>
  maxOutputTokens?: number
  signal?: AbortSignal
  onText?: (chunk: string) => void
  env?: Env
  fetchImpl?: typeof fetch
}): Promise<FlashSearchAnswer> {
  const env = input.env || process.env
  input.signal?.throwIfAborted()
  if (!flashGoogleSearchEnabled(env)) throw new FlashSearchUnavailable("DISABLED")
  if (usedToday() >= flashSearchDailyLimit(env)) throw new FlashSearchUnavailable("DAILY_LIMIT")
  const state = searchHealth()
  if (state.cooldown && Date.now() < state.cooldown.until) throw new FlashSearchUnavailable(state.cooldown.code)
  if ((state.active ?? 0) >= MAX_IN_FLIGHT) throw new FlashSearchUnavailable("BUSY")
  const models = flashSearchModels(env)
  const deadline = AbortSignal.timeout(GOOGLE_DEADLINE_MS)
  const signal = input.signal ? AbortSignal.any([deadline, input.signal]) : deadline
  state.active = (state.active ?? 0) + 1
  try {
    const result = await runGemini({
      system: SYSTEM,
      prompt: flashSearchPrompt(input.question, input.body),
      maxOutputTokens: Math.min(input.maxOutputTokens ?? 4096, 8192),
      search: true,
      strictSearch: true,
      thinkingLevel: models.every(model => model.startsWith("gemini-2.5-")) ? "default" : "low",
      preferredModel: models[0],
      onlyModels: models,
      deadlineMs: GOOGLE_DEADLINE_MS,
      stallMs: { firstMs: 8_000, nextMs: 5_000 },
      signal,
      // The Flash lane talks to the official endpoint using the approved models.
      env: { ...env, GEMINI_API_BASE_URL: undefined, BUSINESS_GEMINI_MODELS: models.join(",") },
      fetchImpl: input.fetchImpl,
      onEvent: event => {
        if (event.type === "attempt" && !takeDailySearch(env)) throw new FlashSearchUnavailable("DAILY_LIMIT")
      },
    })
    signal.throwIfAborted()
    const sources = flashSearchSources(result.sources)
    if (result.finishReason !== "STOP") throw new FlashSearchUnavailable("INCOMPLETE")
    if (!result.searched || !sources.length) throw new FlashSearchUnavailable("NO_SOURCES")
    // Citations can arrive in the last SSE frame. Release the real answer only
    // after Google confirms both completion and grounding for this response.
    input.onText?.(result.content)
    state.lastSuccessAt = new Date().toISOString()
    return {
      content: result.content,
      provider: FLASH_GOOGLE_SEARCH_PROVIDER,
      model: result.modelVersion || result.model,
      selectedModelId: "malik-flash",
      usedWeb: true,
      sources,
      attempts: [],
      usage: normalizeProviderTokenUsage({ ...result.usage, inputTokens: result.usage?.promptTokens }),
      flashSearch: { searched: true, firstTextMs: result.timing.firstTextMs, totalMs: result.timing.totalMs },
    }
  } catch (error) {
    if (input.signal?.aborted) throw error
    const trail = error instanceof GeminiEngineError ? error.trail : []
    const statuses = [...new Set(trail.flatMap(step => typeof step.status === "number" ? [step.status] : []))].slice(0, 6)
    const code = deadline.aborted ? "TIMEOUT" : statuses.includes(402) ? "BILLING_REQUIRED"
      : error instanceof GeminiEngineError || error instanceof FlashSearchUnavailable ? error.code : "FAILED"
    const seen = new Set<string>()
    const perModel = trail.flatMap(step => {
      const id = step.model + ":" + step.code + ":" + (step.status ?? "")
      if (seen.has(id)) return []
      seen.add(id)
      return [{ model: step.model, code: step.code, ...(typeof step.status === "number" ? { status: step.status } : {}) }]
    }).slice(0, 8)
    state.lastFailure = { code, statuses, models: perModel, at: new Date().toISOString() }
    const backoff = code === "QUOTA" ? (error instanceof GeminiEngineError ? error.retryAfterMs : undefined) ?? 30_000
      : ["BILLING_REQUIRED", "MODEL_MISSING", "KEY_REJECTED"].includes(code) ? 5 * 60_000
      : code === "TIMEOUT" || code === "UNAVAILABLE" ? 15_000 : 0
    if (backoff) state.cooldown = { until: Date.now() + backoff, code }
    throw new FlashSearchUnavailable(code)
  } finally {
    state.active -= 1
  }
}
