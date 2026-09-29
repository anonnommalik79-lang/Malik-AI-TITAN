/**
 * Gemini, and only Gemini, for Autonomous Company.
 *
 * The section used to go through the shared provider chain. On Render that
 * chain answered with six opaque "Engine is temporarily unavailable" objects,
 * which reached the screen as raw JSON: none of the providers it tried was
 * working, and nothing said which one or why. The owner has Gemini keys, and
 * Gemini is what speaks Russian and Kazakh well enough to write a company, so
 * this section now talks to Gemini directly, the way Voice does.
 *
 * What that buys, concretely:
 *
 *   - Every Gemini key the server has is a lane: GOOGLE_AI_POOL_API_KEY,
 *     GEMINI_API_KEY, the voice key and so on. A key that hits its minute
 *     quota does not stop the run; the next key answers.
 *   - The model is the newest Flash that the key can actually see. The list
 *     is asked from Google (ListModels) instead of trusted from this file, so
 *     a retired id is skipped, and a newer Flash is used the day it appears.
 *   - The answer streams. Thought summaries arrive while the model is still
 *     thinking, so the person watches the agent work instead of a spinner.
 *   - Research can search Google (grounding), with real links. A key that is
 *     not allowed to search falls back to answering without it.
 *   - A failure is a sentence in Russian with the reason - which key, which
 *     limit, when to retry - never a JSON dump.
 *
 * Nothing here pretends. An empty answer is an error, a truncated one is
 * retried with room to finish, and a key or model is never reported as
 * working until Google has answered with text.
 */

export type GeminiKey = { source: string; key: string }

export type GeminiSource = { title: string; uri: string }

export type GeminiUsage = {
  promptTokens?: number
  outputTokens?: number
  thoughtTokens?: number
  totalTokens?: number
}

export type GeminiEvent =
  | { type: "attempt"; model: string; attempt: number }
  | { type: "thought"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset"; reason: string }
  | { type: "sources"; items: GeminiSource[] }

export type GeminiResult = {
  content: string
  model: string
  modelVersion?: string
  keySource: string
  usage?: GeminiUsage
  sources: GeminiSource[]
  searched: boolean
  finishReason?: string
  attempts: number
  ms: number
}

export type GeminiErrorCode =
  | "NO_KEY"
  | "KEY_REJECTED"
  | "QUOTA"
  | "MODEL_MISSING"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "SAFETY"
  | "EMPTY"
  | "BAD_REQUEST"
  | "ABORTED"

export class GeminiEngineError extends Error {
  code: GeminiErrorCode
  retryAfterMs?: number
  trail: Array<{ model: string; key: string; code: GeminiErrorCode; status?: number }>
  constructor(code: GeminiErrorCode, message: string, options: { retryAfterMs?: number; trail?: GeminiEngineError["trail"] } = {}) {
    super(message)
    this.name = "GeminiEngineError"
    this.code = code
    this.retryAfterMs = options.retryAfterMs
    this.trail = options.trail || []
  }
}

type Env = Record<string, string | undefined>

/** The order keys are tried in. The section's own key first, the voice key last. */
export const GEMINI_KEY_NAMES = [
  "BUSINESS_GEMINI_API_KEY",
  "GOOGLE_AI_POOL_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GEMINI_API_KEYS",
  "GEMINI_VOICE_API_KEY",
  "MALIK_VOICE_GEMINI_KEY",
] as const

/**
 * Newest Flash first. Gemini 2.5 is closed to new projects and 2.0 is shut
 * down (Gemini API changelog, 2026), so neither is here. Discovery below adds
 * anything newer than this list and drops anything the key cannot see.
 */
export const DEFAULT_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
] as const

const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{2,80}$/

function envValue(env: Env, name: string) {
  const value = env[name]
  return typeof value === "string" ? value.trim() : ""
}

export function geminiKeys(env: Env = process.env): GeminiKey[] {
  const seen = new Set<string>()
  const keys: GeminiKey[] = []
  for (const name of GEMINI_KEY_NAMES) {
    const raw = envValue(env, name)
    if (!raw) continue
    const parts = raw.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean)
    parts.forEach((key, index) => {
      if (seen.has(key) || key.length < 20) return
      seen.add(key)
      keys.push({ source: parts.length > 1 ? `${name}#${index + 1}` : name, key })
    })
  }
  return keys
}

export function geminiBaseUrl(env: Env = process.env) {
  return (envValue(env, "GEMINI_API_BASE_URL") || "https://generativelanguage.googleapis.com").replace(/\/+$/, "")
}

export function configuredGeminiModels(env: Env = process.env): string[] {
  const configured = envValue(env, "BUSINESS_GEMINI_MODELS")
    .split(",")
    .map((value) => value.trim().replace(/^models\//, ""))
    .filter((value) => MODEL_ID.test(value))
  return configured.length ? [...new Set(configured)] : [...DEFAULT_GEMINI_MODELS]
}

/* ------------------------------------------------------------ discovery */

const TEXT_MODEL = /^gemini-(\d+)(?:\.(\d+))?-(flash|pro)(-lite)?(?:-preview(?:-[a-z0-9-]+)?)?$/
const NOT_TEXT = /image|tts|audio|live|embedding|robotics|computer|customtools|native|veo|imagen|learnlm|aqa/

/** A sortable rank for a Gemini text model id, or null for everything else. */
export function geminiModelRank(id: string): number | null {
  if (NOT_TEXT.test(id)) return null
  const match = id.match(TEXT_MODEL)
  if (!match) return null
  const major = Number(match[1])
  const minor = Number(match[2] || 0)
  const family = match[3] === "flash" ? (match[4] ? 10 : 30) : 20
  const preview = id.includes("-preview") ? -5 : 0
  return major * 1000 + minor * 100 + family + preview
}

type DiscoveryEntry = { at: number; models: Set<string> | null }
type EngineGlobal = typeof globalThis & {
  __malikGeminiDiscovery?: Map<string, DiscoveryEntry>
  __malikGeminiCooldown?: Map<string, { until: number; code: GeminiErrorCode }>
  __malikGeminiFeatures?: Map<string, { thinking?: boolean; search?: boolean }>
  __malikGeminiWorking?: { model: string; at: number }
}

const store = globalThis as EngineGlobal
const discovery = (store.__malikGeminiDiscovery ??= new Map())
const cooldowns = (store.__malikGeminiCooldown ??= new Map())
const features = (store.__malikGeminiFeatures ??= new Map())

const DISCOVERY_TTL_MS = 30 * 60_000

export function resetGeminiEngineState() {
  discovery.clear()
  cooldowns.clear()
  features.clear()
  store.__malikGeminiWorking = undefined
}

async function listModels(base: string, key: GeminiKey, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<Set<string> | null> {
  const cached = discovery.get(key.source)
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.models
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  const onAbort = () => controller.abort()
  signal?.addEventListener("abort", onAbort, { once: true })
  try {
    const response = await fetchImpl(`${base}/v1beta/models?pageSize=1000`, {
      headers: { "x-goog-api-key": key.key },
      signal: controller.signal,
    })
    if (!response.ok) {
      // A key that cannot even list models will not generate either; the
      // generate call reports why. Remember "unknown", not "empty".
      discovery.set(key.source, { at: Date.now(), models: null })
      return null
    }
    const payload = await response.json().catch(() => ({})) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
    const models = new Set(
      (payload.models || [])
        .filter((item) => !item.supportedGenerationMethods || item.supportedGenerationMethods.includes("generateContent"))
        .map((item) => String(item.name || "").replace(/^models\//, ""))
        .filter(Boolean),
    )
    const entry = { at: Date.now(), models: models.size ? models : null }
    discovery.set(key.source, entry)
    return entry.models
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

/**
 * The models to try for one key, best first.
 *
 * Configured order is kept, filtered to what the key can see. Anything newer
 * than the best configured Flash goes in front. If the key sees none of the
 * configured names (Google renamed them all), its own best text models are
 * used instead of failing on a list of ghosts.
 */
export function chainForKey(configured: string[], visible: Set<string> | null, preferred?: string): string[] {
  const head = preferred && MODEL_ID.test(preferred) ? [preferred] : []
  if (!visible) return [...new Set([...head, ...configured])]

  const bestConfigured = Math.max(0, ...configured.map((id) => geminiModelRank(id) ?? 0))
  const ranked = [...visible]
    .map((id) => ({ id, rank: geminiModelRank(id) }))
    .filter((item): item is { id: string; rank: number } => item.rank !== null)
    .sort((a, b) => b.rank - a.rank)

  const newer = ranked.filter((item) => item.rank > bestConfigured && !item.id.includes("-preview")).map((item) => item.id)
  const known = configured.filter((id) => visible.has(id))
  const chain = [...head.filter((id) => visible.has(id)), ...newer, ...known]
  if (chain.length) return [...new Set(chain)]
  return ranked.slice(0, 5).map((item) => item.id)
}

/* ------------------------------------------------------------- errors */

type Classified = { code: GeminiErrorCode; status?: number; retryAfterMs?: number; detail: string; feature?: "thinking" | "search" }

function retryDelayFrom(payload: any, header: string | null): number | undefined {
  const details = Array.isArray(payload?.error?.details) ? payload.error.details : []
  for (const item of details) {
    const delay = typeof item?.retryDelay === "string" ? item.retryDelay : ""
    const seconds = Number(delay.replace(/s$/, ""))
    if (delay && Number.isFinite(seconds)) return Math.ceil(seconds * 1000)
  }
  const fromHeader = Number(header || "")
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader * 1000)
  const inText = String(payload?.error?.message || "").match(/retry in\s+([\d.]+)\s*s/i)
  return inText ? Math.ceil(Number(inText[1]) * 1000) : undefined
}

/** Google's message, trimmed, with anything shaped like a key removed. */
function safeDetail(message: string) {
  return message.replace(/AIza[0-9A-Za-z_\-]{10,}/g, "[key]").replace(/key=[^&\s]+/g, "key=[key]").slice(0, 300)
}

export function classifyGeminiFailure(status: number, payload: any, header: string | null, sent: { thinking: boolean; search: boolean }): Classified {
  const message = String(payload?.error?.message || payload?.message || "")
  const reason = String(payload?.error?.status || "")
  const detail = safeDetail(message || `HTTP ${status}`)
  const text = `${reason} ${message}`.toLowerCase()

  if (sent.search && /google_search|googlesearch|grounding|search tool|tool.*not (?:supported|enabled|allowed)/.test(text)) {
    return { code: "BAD_REQUEST", status, detail, feature: "search" }
  }
  if (sent.thinking && status === 400 && /thinking|thought/.test(text)) {
    return { code: "BAD_REQUEST", status, detail, feature: "thinking" }
  }
  if (status === 429 || reason === "RESOURCE_EXHAUSTED") {
    return { code: "QUOTA", status, detail, retryAfterMs: retryDelayFrom(payload, header) }
  }
  if (/api key not valid|api_key_invalid|api key expired|invalid api key/.test(text) || status === 401) {
    return { code: "KEY_REJECTED", status, detail }
  }
  if (status === 403 || reason === "PERMISSION_DENIED") {
    return { code: "KEY_REJECTED", status, detail }
  }
  if (status === 404 || /not found|is not supported|no longer available|not available|unsupported model|deprecated|retired/.test(text)) {
    return { code: "MODEL_MISSING", status, detail }
  }
  if (status >= 500 || status === 408) {
    return { code: "UNAVAILABLE", status, detail, retryAfterMs: retryDelayFrom(payload, header) }
  }
  return { code: "BAD_REQUEST", status, detail }
}

function cooldownKey(key: GeminiKey, model: string) {
  return `${key.source}::${model}`
}

function coolingFor(key: GeminiKey, model: string) {
  const now = Date.now()
  for (const name of [cooldownKey(key, model), `${key.source}::*`]) {
    const entry = cooldowns.get(name)
    if (entry && entry.until > now) return entry
    if (entry) cooldowns.delete(name)
  }
  return null
}

/** Cooldowns worth overriding when nothing else is left to try. */
const SOFT_COOLDOWN = new Set<GeminiErrorCode>(["UNAVAILABLE", "TIMEOUT", "EMPTY"])

function cool(name: string, ms: number, code: GeminiErrorCode) {
  cooldowns.set(name, { until: Date.now() + Math.max(1_000, Math.min(ms, 30 * 60_000)), code })
}

/* --------------------------------------------------------------- stream */

type AttemptOutcome = {
  text: string
  thoughts: number
  finishReason?: string
  blockReason?: string
  sources: GeminiSource[]
  usage?: GeminiUsage
  modelVersion?: string
}

function usageFrom(meta: any): GeminiUsage | undefined {
  if (!meta || typeof meta !== "object") return undefined
  return {
    promptTokens: Number(meta.promptTokenCount) || undefined,
    outputTokens: Number(meta.candidatesTokenCount) || undefined,
    thoughtTokens: Number(meta.thoughtsTokenCount) || undefined,
    totalTokens: Number(meta.totalTokenCount) || undefined,
  }
}

function sourcesFrom(meta: any): GeminiSource[] {
  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : []
  const out: GeminiSource[] = []
  for (const chunk of chunks) {
    const uri = String(chunk?.web?.uri || "")
    if (!/^https?:\/\//.test(uri)) continue
    const title = String(chunk?.web?.title || chunk?.web?.domain || uri).slice(0, 160)
    if (!out.some((item) => item.uri === uri)) out.push({ title, uri })
  }
  return out.slice(0, 12)
}

async function readSse(
  response: Response,
  onChunk: (payload: any) => void,
  stall: { firstMs: number; nextMs: number },
  abort: () => void,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader()
  if (!reader) throw new GeminiEngineError("EMPTY", "Gemini вернул пустой поток.")
  // An aborted fetch should end its body, but not every runtime (or proxy)
  // does it promptly; cancelling the reader makes the stop immediate.
  const cancel = () => { reader.cancel().catch(() => {}) }
  if (signal.aborted) cancel()
  else signal.addEventListener("abort", cancel, { once: true })
  const decoder = new TextDecoder()
  let buffer = ""
  let first = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let stalled = false
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { stalled = true; abort() }, first ? stall.firstMs : stall.nextMs)
  }
  const flush = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()
    if (!data || data === "[DONE]") return
    try { onChunk(JSON.parse(data)) } catch { /* a keep-alive or partial frame */ }
  }
  arm()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      first = false
      arm()
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, index)
        buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, "")
        flush(block)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) flush(buffer)
  } catch (error) {
    if (stalled) throw new GeminiEngineError("TIMEOUT", "Gemini перестал отвечать посреди ответа.")
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
  if (stalled) throw new GeminiEngineError("TIMEOUT", "Gemini перестал отвечать посреди ответа.")
  if (signal.aborted) throw new GeminiEngineError("ABORTED", "Остановлено.")
}

export type GeminiRunInput = {
  system: string
  prompt: string
  maxOutputTokens: number
  /** Ground the answer in Google Search. Falls back to no search when refused. */
  search?: boolean
  /** Put this model first; the rest of the chain still backs it up. */
  preferredModel?: string
  signal?: AbortSignal
  onEvent?: (event: GeminiEvent) => void
  env?: Env
  fetchImpl?: typeof fetch
  /** Hard stop for the whole call, all attempts included. */
  deadlineMs?: number
  stallMs?: { firstMs: number; nextMs: number }
}

function requestBody(input: GeminiRunInput, maxOutputTokens: number, thinking: boolean, search: boolean) {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    generationConfig: {
      maxOutputTokens,
      // Thought summaries stream while the model is still thinking, so the
      // card is alive from the first second. The level is left to the model.
      ...(thinking ? { thinkingConfig: { includeThoughts: true } } : {}),
    },
    ...(search ? { tools: [{ google_search: {} }] } : {}),
  }
}

/**
 * One answer from Gemini, streamed, with every key and model as a backup.
 */
export async function runGemini(input: GeminiRunInput): Promise<GeminiResult> {
  const env = input.env || process.env
  const fetchImpl = input.fetchImpl || fetch
  const started = Date.now()
  const deadline = started + (input.deadlineMs ?? 240_000)
  const keys = geminiKeys(env)
  if (!keys.length) {
    throw new GeminiEngineError("NO_KEY", "На сервере нет ключа Gemini.")
  }
  const base = geminiBaseUrl(env)
  const configured = configuredGeminiModels(env)
  const stall = input.stallMs || { firstMs: 90_000, nextMs: 45_000 }
  const trail: GeminiEngineError["trail"] = []
  let attempts = 0
  let emitted = false
  let quotaWait: number | undefined

  // Model-major: the best model on every key before a weaker model on any.
  const chains = await Promise.all(keys.map(async (key) => ({
    key,
    chain: chainForKey(configured, await listModels(base, key, fetchImpl, input.signal), input.preferredModel),
  })))
  const models = [...new Set(chains.flatMap((item) => item.chain))]

  // A lane that was overloaded a moment ago is skipped first. If every lane
  // was skipped that way, they are tried anyway: "overloaded 10 seconds ago"
  // is a hint, not a verdict, and the person just pressed «Продолжить».
  for (let pass = 0; pass < 2; pass += 1) {
    const attemptsBefore = attempts
    let skippedSoft = false
    for (const model of models) {
      for (const { key, chain } of chains) {
        if (!chain.includes(model)) continue
        if (input.signal?.aborted) throw new GeminiEngineError("ABORTED", "Остановлено.")
        if (Date.now() > deadline || attempts >= 14) break
        const cooling = coolingFor(key, model)
        if (cooling && !(pass === 1 && SOFT_COOLDOWN.has(cooling.code))) {
          trail.push({ model, key: key.source, code: cooling.code })
          if (cooling.code === "QUOTA") {
            const left = Math.max(1_000, cooling.until - Date.now())
            quotaWait = quotaWait === undefined ? left : Math.min(quotaWait, left)
          }
          if (SOFT_COOLDOWN.has(cooling.code)) skippedSoft = true
          continue
        }

        const featureKey = cooldownKey(key, model)
        const known = features.get(featureKey) || {}
        let thinking = known.thinking !== false
        let search = Boolean(input.search) && known.search !== false && features.get(`${key.source}::search`)?.search !== false
        let budget = Math.max(512, Math.min(65_536, Math.round(input.maxOutputTokens)))
        let grownOnce = false

        // Up to three tries on one key+model: without a refused feature, and
        // once more with room when thinking ate the whole budget.
        for (let local = 0; local < 3; local += 1) {
          attempts += 1
          input.onEvent?.({ type: "attempt", model, attempt: attempts })
          const controller = new AbortController()
          const onAbort = () => controller.abort()
          input.signal?.addEventListener("abort", onAbort, { once: true })
          const remaining = Math.max(5_000, deadline - Date.now())
          const hardTimer = setTimeout(() => controller.abort(), remaining)
          const outcome: AttemptOutcome = { text: "", thoughts: 0, sources: [] }
          let classified: Classified | null = null

          try {
            const response = await fetchImpl(`${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
              method: "POST",
              headers: {
                "content-type": "application/json; charset=utf-8",
                accept: "text/event-stream",
                "x-goog-api-key": key.key,
              },
              body: JSON.stringify(requestBody(input, budget, thinking, search)),
              signal: controller.signal,
            })

            if (!response.ok) {
              const payload = await response.json().catch(() => ({}))
              classified = classifyGeminiFailure(response.status, payload, response.headers.get("retry-after"), { thinking, search })
            } else {
              await readSse(response, (chunk) => {
                const candidate = chunk?.candidates?.[0]
                const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
                for (const part of parts) {
                  const text = typeof part?.text === "string" ? part.text : ""
                  if (!text) continue
                  if (part.thought) {
                    outcome.thoughts += 1
                    input.onEvent?.({ type: "thought", text })
                  } else {
                    outcome.text += text
                    emitted = true
                    input.onEvent?.({ type: "delta", text })
                  }
                }
                if (candidate?.finishReason) outcome.finishReason = String(candidate.finishReason)
                if (candidate?.groundingMetadata) {
                  const found = sourcesFrom(candidate.groundingMetadata)
                  if (found.length) outcome.sources = found
                }
                if (chunk?.promptFeedback?.blockReason) outcome.blockReason = String(chunk.promptFeedback.blockReason)
                if (chunk?.usageMetadata) outcome.usage = usageFrom(chunk.usageMetadata)
                if (chunk?.modelVersion) outcome.modelVersion = String(chunk.modelVersion)
              }, stall, () => controller.abort(), controller.signal)
            }
          } catch (error) {
            if (input.signal?.aborted) throw new GeminiEngineError("ABORTED", "Остановлено.")
            classified = error instanceof GeminiEngineError
              ? { code: error.code, detail: error.message }
              : { code: controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE", detail: safeDetail(error instanceof Error ? error.message : String(error)) }
          } finally {
            clearTimeout(hardTimer)
            input.signal?.removeEventListener("abort", onAbort)
          }

          if (!classified) {
            const content = outcome.text.trim()
            if (outcome.blockReason || outcome.finishReason === "SAFETY" || outcome.finishReason === "PROHIBITED_CONTENT" || outcome.finishReason === "BLOCKLIST") {
              classified = { code: "SAFETY", detail: outcome.blockReason || outcome.finishReason || "SAFETY" }
            } else if (!content && outcome.finishReason === "MAX_TOKENS" && !grownOnce) {
              // Thinking spent the budget before a word was written.
              grownOnce = true
              budget = Math.min(65_536, budget * 2)
              continue
            } else if (!content) {
              classified = { code: "EMPTY", detail: outcome.finishReason || "no text" }
            } else {
              store.__malikGeminiWorking = { model, at: Date.now() }
              if (outcome.sources.length) input.onEvent?.({ type: "sources", items: outcome.sources })
              return {
                content,
                model,
                modelVersion: outcome.modelVersion,
                keySource: key.source,
                usage: outcome.usage,
                sources: outcome.sources,
                searched: search,
                finishReason: outcome.finishReason,
                attempts,
                ms: Date.now() - started,
              }
            }
          }

          trail.push({ model, key: key.source, code: classified.code, status: classified.status })
          console.warn("[BUSINESS_GEMINI]", JSON.stringify({ model, key: key.source, code: classified.code, status: classified.status, detail: classified.detail }))

          if (classified.feature === "thinking") {
            thinking = false
            features.set(featureKey, { ...features.get(featureKey), thinking: false })
            continue
          }
          if (classified.feature === "search") {
            search = false
            features.set(`${key.source}::search`, { search: false })
            continue
          }

          if (emitted) {
            emitted = false
            input.onEvent?.({ type: "reset", reason: classified.code })
          }

          if (classified.code === "QUOTA") {
            const wait = classified.retryAfterMs ?? 30_000
            quotaWait = quotaWait === undefined ? wait : Math.min(quotaWait, wait)
            cool(featureKey, wait, "QUOTA")
          } else if (classified.code === "KEY_REJECTED") {
            cool(`${key.source}::*`, 10 * 60_000, "KEY_REJECTED")
          } else if (classified.code === "MODEL_MISSING") {
            cool(featureKey, 30 * 60_000, "MODEL_MISSING")
          } else if (classified.code === "UNAVAILABLE" || classified.code === "TIMEOUT") {
            cool(featureKey, classified.retryAfterMs ?? 20_000, classified.code)
          }
          break
        }
      }
    }
    if (attempts > attemptsBefore || !skippedSoft) break
  }

  throw summarizeFailure(trail, quotaWait)
}

function summarizeFailure(trail: GeminiEngineError["trail"], quotaWait?: number) {
  const codes = new Set(trail.map((item) => item.code))
  const within = (...allowed: GeminiErrorCode[]) => trail.length > 0 && trail.every((item) => allowed.includes(item.code))
  if (within("KEY_REJECTED")) {
    return new GeminiEngineError("KEY_REJECTED", "Google не принял ключи Gemini (ключ неверный или для него не включён Gemini API).", { trail })
  }
  if (within("MODEL_MISSING", "KEY_REJECTED")) {
    return new GeminiEngineError("MODEL_MISSING", "Ни одна из моделей Gemini не доступна этому ключу.", { trail })
  }
  if (within("SAFETY")) {
    return new GeminiEngineError("SAFETY", "Gemini отказался отвечать на этот запрос по правилам безопасности. Переформулируй идею.", { trail })
  }
  // Any lane over its quota while the rest are refused, missing or briefly
  // overloaded: the honest answer is "wait this long", not "broken".
  if (codes.has("QUOTA") && within("QUOTA", "KEY_REJECTED", "MODEL_MISSING", "UNAVAILABLE", "TIMEOUT")) {
    const seconds = Math.max(5, Math.round((quotaWait ?? 30_000) / 1000))
    return new GeminiEngineError("QUOTA", `Gemini упёрся в лимит запросов. Можно продолжить через ${seconds} с.`, { trail, retryAfterMs: seconds * 1000 })
  }
  if (codes.has("TIMEOUT") && !codes.has("UNAVAILABLE")) {
    return new GeminiEngineError("TIMEOUT", "Gemini отвечал слишком долго. Нажми «Продолжить» — агент начнёт заново.", { trail, retryAfterMs: 8_000 })
  }
  if (within("EMPTY")) {
    return new GeminiEngineError("EMPTY", "Gemini вернул пустой ответ.", { trail, retryAfterMs: 5_000 })
  }
  return new GeminiEngineError("UNAVAILABLE", "Gemini сейчас перегружен. Нажми «Продолжить» через минуту.", { trail, retryAfterMs: quotaWait ?? 15_000 })
}

/** What an operator is told: the key names and models involved, never a key. */
export function describeTrail(trail: GeminiEngineError["trail"]) {
  return trail.slice(-8).map((item) => `${item.model} · ${item.key} · ${item.code}${item.status ? ` ${item.status}` : ""}`)
}

/** A human label for a model id: "gemini-3.8-flash" → "Gemini 3.8 Flash". */
export function geminiLabel(model: string) {
  const id = model.replace(/^models\//, "")
  if (id === "gemini-flash-latest") return "Gemini Flash (latest)"
  if (id === "gemini-flash-lite-latest") return "Gemini Flash-Lite (latest)"
  return id
    .split("-")
    .map((part) => (part === "gemini" ? "Gemini" : part === "flash" ? "Flash" : part === "pro" ? "Pro" : part === "lite" ? "Lite" : part === "preview" ? "Preview" : part))
    .join(" ")
    .replace("Flash Lite", "Flash-Lite")
}
