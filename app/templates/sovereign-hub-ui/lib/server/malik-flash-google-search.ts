import "server-only"

import { geminiKeys, GeminiEngineError, runGemini, type GeminiSource } from "@/lib/business/gemini-engine"
import { flashImageOperation, isFlashCodingRequest } from "@/lib/ai/malik-flash-intent"
import { isExplicitVideoGenerationRequest } from "@/lib/ai/image-intent"
import { instantReply } from "@/lib/ai/instant-replies"
import { clockReply } from "@/lib/ai/premise-check"
import { selfCreatorReply } from "@/lib/ai/attribution-evidence"
import { FlashBrowserError } from "./malik-flash-browser-bridge"

/**
 * MalikLLM Flash answered by Gemini with Grounding with Google Search, through
 * the official Gemini API and the Gemini keys the server already has.
 *
 * This is not Google AI Mode and is never shown as AI Mode: automated access
 * to AI Mode is not permitted (see docs/malikllm-flash/BROWSER_WORKER_ROLLOUT.md).
 * Search grounding is billed by Google, so it runs only when the owner sets
 * MALIK_FLASH_GOOGLE_SEARCH=1. Without it, or when Gemini cannot answer before
 * any text reached the chat, Flash is answered by the native MALIKII engine.
 */

export const FLASH_GOOGLE_SEARCH_PROVIDER = "google-gemini-search"
/**
 * Models with a free daily Google Search allowance. Gemini 3 grounding is billed
 * from the first request on a project without a free search tier (production
 * answered 402 and 429), so it is never called from here unless the owner
 * names it in MALIK_FLASH_GEMINI_MODEL.
 */
export const FLASH_FREE_SEARCH_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const
/** Stays under Google's free 1 500 grounded requests a day for Gemini 2.5. */
const DEFAULT_DAILY_LIMIT = 1000
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
  flashSearch: { searched: boolean; keySource: string; firstTextMs?: number; totalMs: number }
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
  const { day: _day, used: _used, ...last } = searchHealth()
  return { switch: flashGoogleSearchSwitch(env), geminiKey: geminiKeys(env).length > 0, enabled: flashGoogleSearchEnabled(env),
    models: flashSearchModels(env), dailyUsed: usedToday(), dailyLimit: flashSearchDailyLimit(env), ...last }
}

/** The models Flash may search with: the owner's list, or the free-allowance ones. */
export function flashSearchModels(env: Env = process.env): string[] {
  const named = String(env.MALIK_FLASH_GEMINI_MODEL || "").split(",").map(value => value.trim().replace(/^models\//, "")).filter(value => /^gemini-[a-z0-9.-]{2,60}$/iu.test(value))
  return named.length ? [...new Set(named)] : [...FLASH_FREE_SEARCH_MODELS]
}

export function flashSearchDailyLimit(env: Env = process.env): number {
  const raw = String(env.MALIK_FLASH_GOOGLE_SEARCH_DAILY_LIMIT ?? "").trim()
  const value = Number(raw)
  // Unset or malformed means the default; an explicit 0 turns searching off.
  return raw && Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : DEFAULT_DAILY_LIMIT
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function usedToday() {
  const state = searchHealth()
  return state.day === today() ? state.used || 0 : 0
}

/** Counts one search for today, or false when today's allowance is spent. Per server process. */
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

/**
 * Streams one Flash answer from Gemini with Google Search. Text reaches the
 * chat as it arrives. If Gemini restarts the answer on another key after text
 * was shown, the stream stops there and the final text replaces it on `done`.
 * A failure before any text is a FlashSearchUnavailable the caller answers
 * natively; a failure after text is a retryable chat error.
 */
export class FlashSearchUnavailable extends Error {
  constructor(public readonly code: string) {
    super("Gemini with Google Search did not answer: " + code)
    this.name = "FlashSearchUnavailable"
  }
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
  let forwarded = "", restarted = false
  const env = input.env || process.env
  // Over today's free allowance MALIKII answers instead: nothing is billed.
  if (!takeDailySearch(env)) {
    searchHealth().lastFailure = { code: "DAILY_LIMIT", statuses: [], models: [], at: new Date().toISOString() }
    throw new FlashSearchUnavailable("DAILY_LIMIT")
  }
  const models = flashSearchModels(env)
  try {
    const result = await runGemini({
      system: SYSTEM,
      prompt: flashSearchPrompt(input.question, input.body),
      maxOutputTokens: Math.max(256, Math.min(input.maxOutputTokens ?? 4096, 8192)),
      search: true,
      thinkingLevel: "low",
      preferredModel: models[0],
      onlyModels: models,
      deadlineMs: 100_000,
      signal: input.signal,
      // The engine walks its configured list; Flash's list is the free-allowance models.
      env: { ...env, BUSINESS_GEMINI_MODELS: models.join(",") },
      fetchImpl: input.fetchImpl,
      onEvent: event => {
        if (event.type === "reset") { if (forwarded) restarted = true; return }
        if (event.type !== "delta" || restarted || !event.text) return
        forwarded += event.text
        input.onText?.(event.text)
      },
    })
    const sources = flashSearchSources(result.sources)
    searchHealth().lastSuccessAt = new Date().toISOString()
    return {
      content: result.content,
      provider: FLASH_GOOGLE_SEARCH_PROVIDER,
      model: result.model,
      selectedModelId: "malik-flash",
      usedWeb: result.searched && sources.length > 0,
      sources,
      attempts: [],
      flashSearch: { searched: result.searched, keySource: result.keySource, firstTextMs: result.timing.firstTextMs, totalMs: result.timing.totalMs },
    }
  } catch (error) {
    const code = error instanceof GeminiEngineError ? error.code : "FAILED"
    if (code === "ABORTED" || input.signal?.aborted) throw error
    const trail = error instanceof GeminiEngineError ? error.trail : []
    const statuses = [...new Set(trail.flatMap(step => typeof step.status === "number" ? [step.status] : []))].slice(0, 6)
    const seen = new Set<string>()
    const perModel = trail.flatMap(step => {
      const id = step.model + ":" + step.code + ":" + (step.status ?? "")
      if (seen.has(id)) return []
      seen.add(id)
      return [{ model: step.model, code: step.code, ...(typeof step.status === "number" ? { status: step.status } : {}) }]
    }).slice(0, 8)
    searchHealth().lastFailure = { code, statuses, models: perModel, at: new Date().toISOString() }
    if (!forwarded) throw new FlashSearchUnavailable(code)
    throw new FlashBrowserError("FLASH_GOOGLE_SEARCH_INTERRUPTED", "Ответ с поиском Google прервался. Нажмите «Перегенерировать», чтобы повторить.", 503)
  }
}
