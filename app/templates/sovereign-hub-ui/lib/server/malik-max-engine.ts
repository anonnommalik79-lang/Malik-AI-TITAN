import { missingBriefItems, briefMissingMarker } from "@/lib/ai/brief-quality"
import {
  getMalikModel,
  MALIK_MODELS,
  type MalikModelDefinition,
  type MalikModelId,
} from "@/lib/ai/malik-models"
import { analyzeMalikBrainV1 } from "@/lib/ai/brain-v1"
import {
  buildMessages,
  codeAnswerNeedsMore,
  contentFrom,
  contentPart,
  continuationPrompt,
  estimateProviderInputTokens,
  googleNativeBody,
  isCodeRequest,
  isFastChatRequest,
  longOutputContinuationPrompt,
  MalikModelRouteError,
  providerRuntime,
  providerSpecificBody,
  retryAfterMs,
  upstreamError,
  visibleFinalText,
  type HistoryMessage,
  type MalikAttachment,
  type ProviderMessage,
  type ProviderRuntime,
  type StrictMalikResult,
} from "@/lib/server/malik-model-router"

/**
 * MalikLLM MAX — one free model made of every model and API key Malik AI has.
 *
 * Each (provider, model, API key) is a lane. Lanes are ranked strongest
 * first, adjusted for the task and for how each lane has behaved lately.
 * The strongest lane starts; if it has not begun to write within a few
 * seconds the next one starts beside it, up to three at a time. The first
 * lane that writes real text wins, the others are cancelled, and its words
 * stream to the chat as they arrive.
 *
 * Every lane streams, so a slow lane is noticed in seconds, not minutes. If
 * the winner stalls or its connection drops half way, another lane continues
 * the answer from where it stopped. If it stops because it hit its output
 * limit, it is asked to continue until the answer's budget is spent.
 *
 * Lanes that fail are rested (rate limit → its retry-after, dead key → 30
 * min, unknown model → 1 h), so the next request goes straight to lanes that
 * work. Every configured key is its own lane: three LLM7 keys give three
 * times the quota.
 */

type Protocol = "openai" | "google" | "anthropic"

export type MaxLane = {
  id: string
  provider: string
  providerModel: string
  label: string
  protocol: Protocol
  keyIndex: number
  key: string
  def: MalikModelDefinition
  /** Direct APIs that are not in the model catalogue. */
  direct?: {
    url: string
    headers?: Record<string, string>
    outputCap: number
    tokenField?: "max_tokens" | "max_completion_tokens"
    fixedTemperature?: boolean
  }
  power: number
  vision: boolean
}

type LaneStats = { ok: number; fail: number; latency: number; lastFail: number; lastError: string }

type EngineGlobal = typeof globalThis & {
  __malikMaxCooldown?: Map<string, { until: number; reason: string }>
  __malikMaxStats?: Map<string, LaneStats>
  __malikMaxGoogleModels?: Map<string, { at: number; names: string[] | null }>
  __malikMaxRotation?: number
}

const scope = globalThis as EngineGlobal
const cooldowns = () => (scope.__malikMaxCooldown ||= new Map())
const statsMap = () => (scope.__malikMaxStats ||= new Map())

const MAX_PARALLEL = 3
const MAX_CONTINUATIONS = 5
const GOOGLE_DISCOVERY_MS = 60 * 60 * 1000
const QUOTA_TEXT = /accounts that have not been recharged|increase the free quota|topup|payment required|quota exceeded|insufficient (?:balance|credits?|quota)|exceeded your current quota|rate limit reached|you have reached|upgrade your plan/i

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

/** BASE, BASE_1 … BASE_9 and any aliases, without duplicates. */
function keysFor(base: string, aliases: string[] = []) {
  const names = [base, ...aliases, ...Array.from({ length: 9 }, (_, index) => `${base}_${index + 1}`)]
  return [...new Set(names.map(env).filter(Boolean))]
}

const CATALOG_KEY_ENV: Record<string, { base: string; aliases?: string[] }> = {
  groq: { base: "GROQ_API_KEY" },
  cerebras: { base: "CEREBRAS_API_KEY" },
  together: { base: "TOGETHER_API_KEY" },
  deepseek: { base: "DEEPSEEK_API_KEY" },
  modelscope: { base: "MODELSCOPE_API_KEY" },
  aihubmix: { base: "AIHUBMIX_API_KEY" },
  "nemotron-openrouter": { base: "NEMOTRON_OPENROUTER_API_KEY" },
  xkiro: { base: "XKIRO_API_KEY" },
  llm7: { base: "LLM7_API_KEY" },
  nara: { base: "NARA_API_KEY" },
  "google-ai": { base: "GOOGLE_AI_POOL_API_KEY" },
}

/* ------------------------------------------------------------------ power */

const POWER: Array<[RegExp, number]> = [
  [/claude-(?:opus|sonnet)-(?:4|5)|claude-opus/i, 96],
  [/gpt-5/i, 95],
  [/gemini-(?:[3-9](?:\.\d)?|2\.5)-pro|gemini-pro-latest/i, 94],
  [/\bo[34](?:-mini)?\b|grok-4/i, 92],
  [/gemini-(?:[3-9](?:\.\d)?)-flash(?!-lite)|gemini-flash-latest/i, 90],
  [/glm-5/i, 89],
  [/kimi-k[2-9]/i, 89],
  [/deepseek-v4|deepseek-flash|deepseek-chat|deepseek-reasoner|deepseek-v3/i, 88],
  [/qwen3\.[5-9]-397b|qwen3(?:\.\d)?-max|qwen3\.8-max/i, 88],
  [/nemotron-3-ultra|nemotron.*550b/i, 87],
  [/gemini-2\.5-flash(?!-lite)/i, 86],
  [/minimax-m(?:3|2\.7)/i, 86],
  [/gpt-4\.1(?!-(?:mini|nano))|gpt-4o(?!-mini)/i, 86],
  [/grok-3(?!-mini)/i, 84],
  [/mistral-large|mistral-medium/i, 83],
  [/gpt-oss-120b/i, 82],
  [/minimax-m2/i, 82],
  [/gpt-4\.1-mini|gpt-4o-mini/i, 80],
  [/qwen3(?:\.\d)?-(?:plus|coder-plus|vl-plus)|qwen-plus|qwen3\.5-omni-plus/i, 80],
  [/grok-3-mini/i, 78],
  [/nemotron-3-120b|nemotron.*super/i, 78],
  [/codestral|devstral/i, 76],
  [/ernie-4\.5-300b/i, 76],
  [/qwen3(?:\.\d)?-(?:27b|35b)|qwen3\.8-27b/i, 74],
  [/gemma-4-31b/i, 74],
  [/flash-lite/i, 72],
  [/glm-4\.7/i, 72],
  [/qwen3(?:\.\d)?-(?:omni-)?flash/i, 72],
  [/gemma/i, 70],
  [/ternary-bonsai/i, 70],
  [/^default$/i, 70],
  [/gpt-oss-20b/i, 66],
  [/qwen3-30b/i, 64],
  [/llama-3\.[13]-70b|llama-3\.3/i, 62],
  [/ministral-14b|sensenova|mistral-small/i, 60],
  [/ministral-8b|llama-3\.1-8b/i, 48],
  [/ministral-3b/i, 42],
]

export function lanePower(providerModel: string, label = "") {
  const text = `${providerModel} ${label}`
  for (const [pattern, score] of POWER) if (pattern.test(text)) return score
  return 65
}

const CODER = /coder|codestral|devstral|coding-|glm-5|kimi|claude|gpt-5|gpt-4\.1|deepseek|qwen3\.[5-9]-397b|minimax-m(?:3|2\.7)/i
const FAST_PROVIDERS = new Set(["groq", "cerebras"])

/* ------------------------------------------------------------ lane health */

function cooldownLeft(lane: MaxLane) {
  const entry = cooldowns().get(lane.id)
  if (!entry) return 0
  if (entry.until <= Date.now()) {
    cooldowns().delete(lane.id)
    return 0
  }
  return entry.until - Date.now()
}

function rest(lane: MaxLane, ms: number, reason: string) {
  const until = Date.now() + Math.max(1_000, Math.min(ms, 2 * 60 * 60 * 1000))
  cooldowns().set(lane.id, { until, reason })
  console.warn("[MALIK_MAX] rest", JSON.stringify({ lane: lane.id, ms, reason }))
}

function stats(lane: MaxLane) {
  let entry = statsMap().get(lane.id)
  if (!entry) {
    entry = { ok: 0, fail: 0, latency: 0, lastFail: 0, lastError: "" }
    statsMap().set(lane.id, entry)
  }
  return entry
}

function recordOk(lane: MaxLane, firstTokenMs: number) {
  const entry = stats(lane)
  entry.ok = Math.min(100, entry.ok + 1)
  entry.fail = Math.max(0, entry.fail - 1)
  entry.latency = entry.latency ? Math.round(entry.latency * 0.7 + firstTokenMs * 0.3) : firstTokenMs
}

function recordFail(lane: MaxLane, reason: string) {
  const entry = stats(lane)
  entry.fail = Math.min(100, entry.fail + 1)
  entry.lastFail = Date.now()
  entry.lastError = reason.slice(0, 200)
}

/* ------------------------------------------------------- google discovery */

async function googleModels(key: string): Promise<string[] | null> {
  const cache = (scope.__malikMaxGoogleModels ||= new Map())
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < GOOGLE_DISCOVERY_MS) return cached.names
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4_000)
  let names: string[] | null = null
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=300", {
      headers: { "x-goog-api-key": key },
      signal: controller.signal,
      cache: "no-store",
    })
    if (response.ok) {
      const payload = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
      names = (payload.models || [])
        .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
        .map((model) => String(model.name || "").replace(/^models\//, ""))
        .filter(Boolean)
    }
  } catch {
    names = null
  } finally {
    clearTimeout(timer)
  }
  // A failed lookup is retried in five minutes, a good one in an hour.
  cache.set(key, { at: names ? Date.now() : Date.now() - GOOGLE_DISCOVERY_MS + 5 * 60 * 1000, names })
  return names
}

/** The strongest text models a Google key can call, newest first. */
export function strongestGoogleModels(names: string[], limit = 4) {
  const blocked = /embedding|aqa|tts|image|imagen|veo|live|audio|robotics|computer-use|learnlm|thinking-exp|-exp-\d|vision$|nano|banana/i
  const score = (name: string) => {
    const version = Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0)
    const tier = /-pro/.test(name) ? 3 : /flash-lite/.test(name) ? 1 : /flash/.test(name) ? 2 : 0
    const latest = /-latest$/.test(name) ? 0.5 : 0
    return version * 10 + tier * 3 + latest - (/preview/.test(name) ? 0.2 : 0)
  }
  return names
    .filter((name) => /^gemini-\d/.test(name) && !blocked.test(name))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
}

/* --------------------------------------------------------------- lanes */

function pseudoDefinition(id: string, label: string, provider: string, providerModel: string, vision: boolean): MalikModelDefinition {
  return {
    id,
    label,
    description: "MalikLLM MAX lane",
    tier: "free",
    provider: provider as MalikModelDefinition["provider"],
    providerModel,
    capabilities: vision ? ["text", "vision", "code", "tools", "reasoning"] : ["text", "code", "tools", "reasoning"],
    brand: "router",
    hidden: true,
  }
}

function catalogLanes(allowCatalog: boolean): MaxLane[] {
  const seen = new Set<string>()
  const lanes: MaxLane[] = []
  for (const def of MALIK_MODELS) {
    if (def.id === "malik-max" || def.provider === "malik-orchestrator") continue
    if (def.access === "catalog" && !allowCatalog) continue
    const signature = `${def.provider}:${def.providerModel}`
    if (seen.has(signature)) continue
    let runtime: ProviderRuntime
    try {
      runtime = providerRuntime(def, 1_000, undefined, false, 0, allowCatalog)
    } catch {
      continue
    }
    seen.add(signature)
    const keyEnv = CATALOG_KEY_ENV[def.provider]
    const keys = keyEnv ? keysFor(keyEnv.base, keyEnv.aliases) : [runtime.key]
    const usable = keys.length ? keys : [runtime.key]
    usable.forEach((key, keyIndex) => {
      lanes.push({
        id: `${signature}#${keyIndex + 1}`,
        provider: def.provider,
        providerModel: def.providerModel,
        label: def.label,
        protocol: runtime.protocol === "google-native" ? "google" : "openai",
        keyIndex,
        key,
        def,
        power: lanePower(def.providerModel, def.label),
        vision: def.capabilities.includes("vision"),
      })
    })
  }
  return lanes
}

function openAiDirect(input: {
  provider: string
  keys: string[]
  url: string
  model: string
  label: string
  vision?: boolean
  headers?: (key: string) => Record<string, string>
  outputCap?: number
  tokenField?: "max_tokens" | "max_completion_tokens"
  fixedTemperature?: boolean
}): MaxLane[] {
  if (!input.model || !input.keys.length) return []
  const def = pseudoDefinition(`max:${input.provider}:${input.model}`, input.label, input.provider, input.model, Boolean(input.vision))
  return input.keys.map((key, keyIndex) => ({
    id: `${input.provider}:${input.model}#${keyIndex + 1}`,
    provider: input.provider,
    providerModel: input.model,
    label: input.label,
    protocol: "openai" as const,
    keyIndex,
    key,
    def,
    direct: {
      url: input.url,
      headers: input.headers?.(key),
      outputCap: input.outputCap || 16_000,
      tokenField: input.tokenField,
      fixedTemperature: input.fixedTemperature,
    },
    power: lanePower(input.model, input.label),
    vision: Boolean(input.vision),
  }))
}

async function directLanes(codeMode: boolean): Promise<MaxLane[]> {
  const lanes: MaxLane[] = []

  const openAiModel = env(codeMode ? "OPENAI_CODE_MODEL" : "OPENAI_MODEL") || env("OPENAI_MODEL") || "gpt-4.1-mini"
  const reasoningOpenAi = /^(?:gpt-5|o\d)/i.test(openAiModel)
  lanes.push(...openAiDirect({
    provider: "openai",
    keys: keysFor("OPENAI_API_KEY"),
    url: `${(env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`,
    model: openAiModel,
    label: openAiModel,
    vision: true,
    tokenField: "max_completion_tokens",
    fixedTemperature: reasoningOpenAi,
  }))

  const grokModel = env(codeMode ? "GROK_CODE_MODEL" : "GROK_MODEL") || env("GROK_MODEL") || "grok-3-mini"
  lanes.push(...openAiDirect({
    provider: "xai",
    keys: keysFor("XAI_API_KEY", ["GROK_API_KEY"]),
    url: `${(env("GROK_BASE_URL") || "https://api.x.ai/v1").replace(/\/+$/, "")}/chat/completions`,
    model: grokModel,
    label: grokModel,
  }))

  const kimiModel = env(codeMode ? "KIMI_CODE_MODEL" : "KIMI_MODEL") || env("KIMI_MODEL") || "kimi-k2.5"
  lanes.push(...openAiDirect({
    provider: "moonshot",
    keys: keysFor("MOONSHOT_API_KEY", ["KIMI_API_KEY"]),
    url: `${(env("KIMI_BASE_URL") || "https://api.moonshot.ai/v1").replace(/\/+$/, "")}/chat/completions`,
    model: kimiModel,
    label: kimiModel,
  }))

  const mistralModel = env(codeMode ? "MISTRAL_CODE_MODEL" : "MISTRAL_MODEL") || env("MISTRAL_MODEL") || "mistral-large-latest"
  lanes.push(...openAiDirect({
    provider: "mistral",
    keys: keysFor("MISTRAL_API_KEY"),
    url: `${(env("MISTRAL_BASE_URL") || "https://api.mistral.ai/v1").replace(/\/+$/, "")}/chat/completions`,
    model: mistralModel,
    label: mistralModel,
  }))

  const nimModel = env(codeMode ? "NVIDIA_NIM_CODE_MODEL" : "NVIDIA_NIM_MODEL") || env("NVIDIA_NIM_MODEL") || "meta/llama-3.3-70b-instruct"
  lanes.push(...openAiDirect({
    provider: "nvidia-nim",
    keys: keysFor("NVIDIA_NIM_API_KEY"),
    url: `${(env("NVIDIA_NIM_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "")}/chat/completions`,
    model: nimModel,
    label: nimModel,
    outputCap: 8_000,
  }))

  const routerModel = env(codeMode ? "OPENROUTER_CODE_MODEL" : "OPENROUTER_MODEL") || env("OPENROUTER_MODEL") || "deepseek/deepseek-v4-flash"
  lanes.push(...openAiDirect({
    provider: "openrouter",
    keys: keysFor("OPENROUTER_API_KEY"),
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: routerModel,
    label: routerModel,
    headers: () => ({ "HTTP-Referer": env("NEXT_PUBLIC_APP_URL") || "https://malikaiworld.world", "X-Title": "MALIK AI" }),
  }))

  const claudeKeys = keysFor("ANTHROPIC_API_KEY")
  const claudeModel = env(codeMode ? "ANTHROPIC_CODE_MODEL" : "ANTHROPIC_MODEL") || env("ANTHROPIC_MODEL") || "claude-sonnet-4-5"
  claudeKeys.forEach((key, keyIndex) => {
    lanes.push({
      id: `anthropic:${claudeModel}#${keyIndex + 1}`,
      provider: "anthropic",
      providerModel: claudeModel,
      label: claudeModel,
      protocol: "anthropic",
      keyIndex,
      key,
      def: pseudoDefinition(`max:anthropic:${claudeModel}`, claudeModel, "anthropic", claudeModel, true),
      direct: { url: "https://api.anthropic.com/v1/messages", outputCap: 16_000 },
      power: lanePower(claudeModel),
      vision: true,
    })
  })

  // Google keys: the catalogue's pool plus the direct Gemini key. Each key is
  // asked which models it can call, so a model Google has retired or not yet
  // released never costs a request, and new stronger ones join on their own.
  const googleKeys = [
    ...keysFor("GOOGLE_AI_POOL_API_KEY").map((key) => ({ key, pool: true })),
    ...keysFor("GEMINI_API_KEY", ["GOOGLE_GENERATIVE_AI_API_KEY"]).map((key) => ({ key, pool: false })),
  ].filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index)
  const discovered = await Promise.all(googleKeys.map(async (item) => ({ ...item, names: await googleModels(item.key) })))
  discovered.forEach((item, keyIndex) => {
    const configured = item.pool ? [] : [env(codeMode ? "GEMINI_CODE_MODEL" : "GEMINI_MODEL") || env("GEMINI_MODEL")].filter(Boolean)
    const models = item.names
      ? [...new Set([...configured.filter((name) => item.names?.includes(name)), ...strongestGoogleModels(item.names)])]
      : item.pool ? [] : [...new Set([...configured, "gemini-2.5-flash", "gemini-flash-latest"])]
    for (const model of models) {
      lanes.push({
        id: `google:${model}#${item.pool ? "pool" : "key"}${keyIndex + 1}`,
        provider: "google-direct",
        providerModel: model,
        label: model,
        protocol: "google",
        keyIndex,
        key: item.key,
        def: pseudoDefinition(`max:google:${model}`, model, "google-ai", model, true),
        direct: {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          outputCap: 32_000,
        },
        power: lanePower(model),
        vision: true,
      })
    }
  })
  return lanes
}

/** Every lane MAX can use right now, strongest first for this task. */
export async function buildMaxLanes(input: {
  prompt: string
  attachments?: MalikAttachment[]
  codeMode: boolean
  fastMode: boolean
  needsVision: boolean
}) {
  const allowCatalog = env("ALLOW_ROUTER_PAYG_MODELS").toLowerCase() === "true"
  const direct = await directLanes(input.codeMode)
  const googleDirect = new Set(direct.filter((lane) => lane.provider === "google-direct").map((lane) => `${lane.key}|${lane.providerModel}`))
  // A catalogue Google lane whose model the key does not list is dropped:
  // discovery already knows it would answer 404.
  const catalog = catalogLanes(allowCatalog).filter((lane) => {
    if (lane.provider !== "google-ai") return true
    const cached = scope.__malikMaxGoogleModels?.get(lane.key)
    if (cached?.names && !cached.names.includes(lane.providerModel)) return false
    return !googleDirect.has(`${lane.key}|${lane.providerModel}`)
  })
  const brain = analyzeMalikBrainV1({
    prompt: input.prompt,
    attachments: (input.attachments || []).map((item) => ({
      name: item.name || "attachment",
      mime: item.mime || "application/octet-stream",
      kind: item.kind as never,
      url: item.url,
      base64: item.base64,
    })),
  })
  const preferred = new Set(brain.preferredModels.map((id) => {
    try { return `${getMalikModel(id as MalikModelId).provider}:${getMalikModel(id as MalikModelId).providerModel}` } catch { return "" }
  }))
  const rotation = (scope.__malikMaxRotation = ((scope.__malikMaxRotation || 0) + 1) % 1_000_000)
  const promptChars = input.prompt.length
  const longContext = promptChars >= 80_000
  const hugeContext = promptChars >= 240_000

  const scored = [...direct, ...catalog]
    .filter((lane) => !input.needsVision || lane.vision)
    .map((lane) => {
      const entry = statsMap().get(lane.id)
      const total = entry ? entry.ok + entry.fail : 0
      const failureRate = total ? entry!.fail / total : 0
      let score = lane.power
      if (input.codeMode && CODER.test(`${lane.providerModel} ${lane.label}`)) score += 6
      if (input.fastMode && FAST_PROVIDERS.has(lane.provider)) score += 8
      if (input.fastMode && /reasoner|ultra|550b|-pro\b|opus/i.test(lane.providerModel)) score -= 6
      if (preferred.has(`${lane.provider}:${lane.providerModel}`)) score += 4
      if (longContext) {
        const longContextLane = lane.provider === "google-direct"
          || lane.provider === "google-ai"
          || lane.provider === "anthropic"
          || lane.provider === "openai"
        if (lane.provider === "google-direct" || lane.provider === "google-ai") score += hugeContext ? 36 : 18
        else if (longContextLane) score += hugeContext ? 12 : 6
        else score -= hugeContext ? 18 : 7
      }
      score -= failureRate * 20
      if (entry?.lastFail && Date.now() - entry.lastFail < 60_000) score -= 10
      if (entry?.latency && entry.latency > 8_000) score -= Math.min(10, (entry.latency - 8_000) / 1_000)
      // Spread load across keys of the same model and across equal lanes.
      score += ((lane.keyIndex + rotation) % 3) * 0.6 + Math.random() * 1.5
      if (cooldownLeft(lane) > 0) score -= 1_000
      return { lane, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.map((item) => item.lane)
}

/* ------------------------------------------------------- stream parsing */

/** Removes <think>…</think> and <reasoning>…</reasoning> from a live stream. */
export class ThinkFilter {
  private buffer = ""
  private inside: string | null = null

  push(text: string) {
    this.buffer += text
    let out = ""
    while (this.buffer) {
      if (this.inside) {
        const close = `</${this.inside}>`
        const end = this.buffer.toLowerCase().indexOf(close)
        if (end === -1) {
          this.buffer = this.buffer.slice(-(close.length - 1))
          return out
        }
        this.buffer = this.buffer.slice(end + close.length)
        this.inside = null
        continue
      }
      const open = this.buffer.match(/<(think|reasoning)>/i)
      if (open && open.index !== undefined) {
        out += this.buffer.slice(0, open.index)
        this.inside = open[1].toLowerCase()
        this.buffer = this.buffer.slice(open.index + open[0].length)
        continue
      }
      const lt = this.buffer.lastIndexOf("<")
      const tail = lt === -1 ? "" : this.buffer.slice(lt)
      if (tail && tail.length < 12 && /^<(?:t(?:h(?:i(?:n(?:k)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n(?:i(?:n(?:g)?)?)?)?)?)?)?)?)?$/i.test(tail)) {
        out += this.buffer.slice(0, lt)
        this.buffer = tail
        return out
      }
      out += this.buffer
      this.buffer = ""
    }
    return out
  }

  flush() {
    const rest = this.inside ? "" : this.buffer
    this.buffer = ""
    return rest
  }
}

type StreamEvent = { text: string; activity: boolean; finishReason?: string; usage?: unknown; error?: string }

/** One parsed line of a provider's stream, in any of the three protocols. */
export function parseStreamLine(protocol: Protocol, line: string): StreamEvent | null {
  const raw = line.trim().replace(/^data:\s*/, "")
  if (!raw || raw === "[DONE]" || raw.startsWith(":") || raw.startsWith("event:")) return null
  let event: any
  try { event = JSON.parse(raw) } catch { return null }
  if (protocol === "anthropic") {
    if (event?.type === "content_block_delta") {
      if (event.delta?.type === "text_delta") return { text: String(event.delta.text || ""), activity: true }
      return { text: "", activity: true }
    }
    if (event?.type === "message_delta") return { text: "", activity: true, finishReason: event.delta?.stop_reason ? String(event.delta.stop_reason) : undefined, usage: event.usage }
    if (event?.type === "error") return { text: "", activity: false, error: String(event.error?.message || "anthropic error") }
    return { text: "", activity: true }
  }
  if (protocol === "google") {
    const candidate = event?.candidates?.[0]
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    const text = parts.filter((part: any) => part && part.thought !== true && typeof part.text === "string").map((part: any) => part.text).join("")
    if (event?.error) return { text: "", activity: false, error: String(event.error?.message || "google error") }
    return { text, activity: true, finishReason: candidate?.finishReason ? String(candidate.finishReason) : undefined, usage: event?.usageMetadata }
  }
  if (event?.error) return { text: "", activity: false, error: String(event.error?.message || event.error) }
  const choice = event?.choices?.[0]
  const text = contentPart(choice?.delta?.content ?? choice?.message?.content ?? choice?.text)
  const reasoning = Boolean(choice?.delta?.reasoning_content || choice?.delta?.reasoning || choice?.delta?.reasoning_details)
  return {
    text,
    activity: Boolean(text) || reasoning || Boolean(choice),
    finishReason: choice?.finish_reason ? String(choice.finish_reason) : undefined,
    usage: event?.usage,
  }
}

function truncatedFinish(reason?: string) {
  return /^(?:length|max_tokens|MAX_TOKENS)$/.test(String(reason || ""))
}

export function structuredAnswerNeedsMore(prompt: string, content: string) {
  const request = String(prompt || "")
  const answer = String(content || "").trim()
  if (!request || !answer) return false
  if (missingBriefItems(request,answer).length > 0 || briefMissingMarker(request,answer)) return true

  // An unfinished Markdown/code fence is always a strong sign that the visible
  // answer ended before the deliverable did, even when the provider said "stop".
  if ((answer.match(/```/g) || []).length % 2 === 1) return true

  const numbered = [...request.matchAll(/^\s*(\d{1,2})[.)]\s+\S.*$/gmu)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
  const uniqueNumbers = [...new Set(numbered)]
  const requiresEverySection = /(выполни\s+вс[её]|сделай\s+вс[её]|не\s+пропускай|кажд(?:ый|ую|ое|ого)|all\s+(?:items|steps|requirements|sections)|do\s+not\s+skip|complete\s+every)/iu.test(request)
  if (requiresEverySection && uniqueNumbers.length >= 4) {
    const last = Math.max(...uniqueNumbers)
    const seen = uniqueNumbers.filter((value) =>
      new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?${value}[.)]\\s`, "mu").test(answer),
    )
    const hasLast = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?${last}[.)]\\s`, "mu").test(answer)
    const missing = uniqueNumbers.filter((value) => !seen.includes(value))
    if (seen.length >= 2 && (missing.length > 0 || !hasLast)) return true
  }

  // Preserve an explicitly required final marker such as TEST COMPLETE.
  const marker = request.match(
    /(?:в\s+(?:самом\s+)?конце\s+(?:выведи|напиши)|(?:finish|end)\s+with)\s*:?\s*\n+\s*([^\n]{2,120})/iu,
  )?.[1]?.trim()
  if (marker && !answer.includes(marker)) return true

  return false
}

/** The continuation must not repeat the end of what was already written. */
export function trimOverlap(previous: string, next: string) {
  const limit = Math.min(240, previous.length, next.length)
  for (let size = limit; size >= 12; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) return next.slice(size)
  }
  return next
}

/* ------------------------------------------------------------- requests */

type CallInput = {
  prompt: string
  systemPrompt: string
  history?: HistoryMessage[]
  attachments?: MalikAttachment[]
  maxTokens: number
  temperature?: number
  reasoningEffort?: "low" | "medium" | "high"
  codeMode: boolean
  fastMode: boolean
  /** The user's request without retrieved excerpts: decides the answer's shape. */
  taskPrompt?: string
  /** The model name the answer may give when asked which model it is. */
  publicLabel?: string
}

function anthropicBody(messages: ProviderMessage[], model: string, maxTokens: number, temperature: number) {
  const system = messages.filter((message) => message.role === "system").map((message) => contentPart(message.content)).join("\n\n")
  const turns = messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role,
    content: typeof message.content === "string"
      ? message.content
      : message.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text }
          const match = part.image_url.url.match(/^data:([^;,]+);base64,(.+)$/)
          return match
            ? { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }
            : { type: "image", source: { type: "url", url: part.image_url.url } }
        }),
  }))
  return { model, max_tokens: maxTokens, temperature, system, messages: turns, stream: true }
}

function laneRequest(lane: MaxLane, call: CallInput): { url: string; headers: Record<string, string>; body: unknown } {
  const messages = buildMessages({
    model: lane.def,
    prompt: call.prompt,
    systemPrompt: call.systemPrompt,
    history: call.history,
    attachments: call.attachments,
    publicModelLabel: call.publicLabel || "MalikLLM MAX",
    fastMode: call.fastMode,
    taskPrompt: call.taskPrompt,
  })
  const temperature = typeof call.temperature === "number" ? call.temperature : 0.4

  if (lane.direct) {
    const maxTokens = Math.max(64, Math.min(call.maxTokens, lane.direct.outputCap))
    if (lane.protocol === "anthropic") {
      return {
        url: lane.direct.url,
        headers: { "x-api-key": lane.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: anthropicBody(messages, lane.providerModel, maxTokens, temperature),
      }
    }
    if (lane.protocol === "google") {
      const runtime = { maxTokens, temperature } as ProviderRuntime
      return {
        url: lane.direct.url,
        headers: { "x-goog-api-key": lane.key, "content-type": "application/json" },
        body: googleNativeBody(messages, runtime),
      }
    }
    return {
      url: lane.direct.url,
      headers: { authorization: `Bearer ${lane.key}`, "content-type": "application/json", accept: "text/event-stream", ...(lane.direct.headers || {}) },
      body: {
        model: lane.providerModel,
        messages,
        [lane.direct.tokenField || "max_tokens"]: maxTokens,
        ...(lane.direct.fixedTemperature ? {} : { temperature }),
        stream: true,
      },
    }
  }

  const estimated = estimateProviderInputTokens(messages)
  const runtime = providerRuntime(lane.def, call.maxTokens, call.temperature, call.codeMode, estimated, true)
  runtime.key = lane.key
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream",
    ...(runtime.headers || {}),
  }
  if (headers["x-api-key"]) headers["x-api-key"] = lane.key
  if (runtime.protocol === "google-native") {
    headers["x-goog-api-key"] = lane.key
    return { url: runtime.url, headers, body: googleNativeBody(messages, runtime) }
  }
  headers.authorization = `Bearer ${lane.key}`
  return {
    url: runtime.url,
    headers,
    body: {
      model: runtime.model,
      messages,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      ...providerSpecificBody(lane.def, runtime, call.fastMode, call.reasoningEffort || "medium"),
      stream: true,
    },
  }
}

/* ----------------------------------------------------------------- race */

type RaceOptions = {
  lanes: MaxLane[]
  call: CallInput
  onToken: (chunk: string) => void
  hedgeMs: number
  firstTokenMs: number
  firstDeadlineMs: number
  idleMs: number
  totalMs: number
  /** Visible characters a lane must write before it is trusted as the winner. */
  minFlush: number
  /** Soft hedge budget. Standard/deep use 3, fast chat uses 2 lanes. */
  maxParallel?: number
  overlapWith?: string
  fetcher?: typeof fetch
  /** Cancels the whole race (the caller gave up); no lane is blamed. */
  signal?: AbortSignal
}

type RaceResult = {
  lane: MaxLane
  content: string
  finishReason?: string
  usage?: unknown
  interrupted: boolean
  firstTokenMs: number
}

function classify(status: number, detail: string) {
  if (status === 401 || status === 403) return { ms: 30 * 60 * 1000, reason: `http-${status}` }
  if (status === 402) return { ms: 60 * 60 * 1000, reason: "payment-required" }
  if (status === 404 || /model.{0,40}(?:not found|does not exist|not supported|unknown)|no such model|invalid model/i.test(detail)) return { ms: 60 * 60 * 1000, reason: "model-not-found" }
  if (status === 429) return { ms: 60_000, reason: "rate-limit" }
  if (status === 400 || status === 413 || status === 422) return { ms: 5 * 60 * 1000, reason: `http-${status}` }
  return { ms: 20_000, reason: `http-${status}` }
}

function abortError() {
  const error = new Error("MalikLLM MAX: запрос отменён.")
  error.name = "AbortError"
  return error
}

export function raceLanes(options: RaceOptions): Promise<RaceResult> {
  const fetcher = options.fetcher || fetch
  const maxParallel = Number.isFinite(options.maxParallel)
    ? Math.max(1, Math.min(MAX_PARALLEL, Math.floor(options.maxParallel!)))
    : MAX_PARALLEL
  return new Promise<RaceResult>((resolve, reject) => {
    const started = Date.now()
    let next = 0
    let settled = false
    let winner: Attempt | null = null
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setInterval> | null = null
    let totalTimer: ReturnType<typeof setTimeout> | null = null
    const running = new Set<Attempt>()
    const errors: string[] = []

    type Attempt = {
      lane: MaxLane
      controller: AbortController
      buffer: string
      full: string
      startedAt: number
      firstAt: number
      lastActivity: number
      thinking: boolean
      finishReason?: string
      usage?: unknown
      firstTimer: ReturnType<typeof setTimeout> | null
      done: boolean
    }

    const cleanup = () => {
      if (hedgeTimer) clearTimeout(hedgeTimer)
      if (idleTimer) clearInterval(idleTimer)
      if (totalTimer) clearTimeout(totalTimer)
      clearTimeout(firstDeadline)
      for (const attempt of running) {
        if (attempt.firstTimer) clearTimeout(attempt.firstTimer)
      }
    }

    // Stops an attempt that lost or is no longer needed, without counting it
    // as the lane's failure.
    const retire = (attempt: Attempt) => {
      attempt.done = true
      if (attempt.firstTimer) clearTimeout(attempt.firstTimer)
      running.delete(attempt)
      attempt.controller.abort()
    }

    const finish = (result: RaceResult) => {
      if (settled) return
      settled = true
      cleanup()
      for (const attempt of [...running]) if (attempt !== winner) retire(attempt)
      resolve(result)
    }

    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      for (const attempt of [...running]) retire(attempt)
      reject(new MalikModelRouteError(
        "MAX_ALL_LANES_BUSY",
        "MalikLLM MAX: все модели сейчас заняты. Повторите запрос через минуту.",
        503,
        "malik-max",
      ))
      console.warn("[MALIK_MAX] no lane answered", JSON.stringify({ tried: errors.length, errors: errors.slice(0, 12) }))
    }

    const firstDeadline = setTimeout(() => { if (!winner) fail() }, options.firstDeadlineMs)

    const cancel = () => {
      if (settled) return
      settled = true
      cleanup()
      for (const attempt of [...running]) retire(attempt)
      reject(abortError())
    }
    options.signal?.addEventListener("abort", cancel, { once: true })

    const scheduleHedge = () => {
      if (hedgeTimer) clearTimeout(hedgeTimer)
      hedgeTimer = setTimeout(() => {
        if (settled || winner) return
        // A lane that is visibly reasoning is given a little longer before a
        // second one is started beside it.
        const thinking = [...running].some((attempt) => attempt.thinking && Date.now() - attempt.startedAt < options.hedgeMs * 2)
        if (!thinking && running.size < maxParallel) launch()
        scheduleHedge()
      }, options.hedgeMs)
    }

    const drop = (attempt: Attempt, reason: string, restMs?: number) => {
      if (attempt.done) return
      attempt.done = true
      if (attempt.firstTimer) clearTimeout(attempt.firstTimer)
      running.delete(attempt)
      attempt.controller.abort()
      errors.push(`${attempt.lane.id}: ${reason}`)
      recordFail(attempt.lane, reason)
      if (restMs) rest(attempt.lane, restMs, reason)
      if (settled || winner) return
      if (!launch() && running.size === 0) fail()
    }

    const crown = (attempt: Attempt) => {
      if (winner || settled) return
      if (QUOTA_TEXT.test(attempt.buffer.slice(0, 400)) && attempt.buffer.length < 600) {
        drop(attempt, "quota-message", 30 * 60 * 1000)
        return
      }
      winner = attempt
      if (attempt.firstTimer) clearTimeout(attempt.firstTimer)
      if (hedgeTimer) clearTimeout(hedgeTimer)
      clearTimeout(firstDeadline)
      attempt.firstAt = Date.now()
      recordOk(attempt.lane, attempt.firstAt - attempt.startedAt)
      for (const other of [...running]) if (other !== attempt) retire(other)
      console.info("[MALIK_MAX] winner", JSON.stringify({ lane: attempt.lane.id, firstTokenMs: attempt.firstAt - attempt.startedAt, raced: errors.length + running.size }))
      let first = attempt.buffer
      if (options.overlapWith) first = trimOverlap(options.overlapWith, first)
      attempt.full = first
      if (first) options.onToken(first)
      idleTimer = setInterval(() => {
        if (Date.now() - attempt.lastActivity > options.idleMs) {
          rest(attempt.lane, 45_000, "stalled")
          attempt.controller.abort()
        }
      }, 2_000)
      totalTimer = setTimeout(() => attempt.controller.abort(), Math.max(10_000, options.totalMs - (Date.now() - started)))
    }

    const run = async (attempt: Attempt) => {
      const { lane } = attempt
      const filter = new ThinkFilter()
      let request: { url: string; headers: Record<string, string>; body: unknown }
      try {
        request = laneRequest(lane, options.call)
      } catch (error) {
        // "Too large for this lane's per-minute budget" is about this request,
        // not about the lane.
        const tooLarge = error instanceof MalikModelRouteError && error.code === "PROVIDER_REQUEST_TOO_LARGE"
        drop(attempt, error instanceof Error ? error.message : "request-build", tooLarge ? undefined : 5 * 60 * 1000)
        return
      }
      let response: Response
      try {
        response = await fetcher(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: attempt.controller.signal,
          cache: "no-store",
        } as RequestInit)
      } catch (error) {
        if (!attempt.done) drop(attempt, error instanceof Error ? error.message : "network", attempt.controller.signal.aborted ? undefined : 20_000)
        return
      }
      if (!response.ok) {
        const detail = await upstreamError(response)
        const verdict = classify(response.status, detail)
        const restMs = response.status === 429 ? Math.max(5_000, retryAfterMs(response, detail)) : verdict.ms
        drop(attempt, `${verdict.reason}: ${detail.slice(0, 160)}`, restMs)
        return
      }

      const receive = (text: string, activity: boolean) => {
        if (attempt.done) return
        if (activity) {
          attempt.lastActivity = Date.now()
          if (!text && !attempt.buffer) attempt.thinking = true
        }
        if (!text) return
        const visible = filter.push(text)
        if (!visible) return
        if (winner === attempt) {
          attempt.full += visible
          options.onToken(visible)
          return
        }
        if (winner) return
        attempt.buffer += visible
        if (attempt.buffer.replace(/\s+/g, "").length >= options.minFlush) crown(attempt)
      }

      const end = (interrupted: boolean) => {
        if (attempt.done) return
        const tail = filter.flush()
        if (tail) receive(tail, true)
        // A provider may close with one stray character. For deep/complex work,
        // do not crown that as a successful answer: let another lane try.
        const enoughText = options.minFlush < 24 || attempt.buffer.replace(/\s+/g, "").length >= options.minFlush
        if (!winner && !settled && enoughText && visibleFinalText(attempt.buffer)) crown(attempt)
        if (winner === attempt) {
          attempt.done = true
          running.delete(attempt)
          finish({
            lane,
            content: attempt.full,
            finishReason: attempt.finishReason,
            usage: attempt.usage,
            interrupted,
            firstTokenMs: attempt.firstAt - attempt.startedAt,
          })
          return
        }
        drop(attempt, interrupted ? "interrupted-before-text" : "empty-answer", interrupted ? 20_000 : 2 * 60 * 1000)
      }

      const type = response.headers.get("content-type") || ""
      try {
        if (!type.includes("event-stream") && response.body && lane.protocol === "openai" && type.includes("json")) {
          const payload = await response.json()
          attempt.finishReason = payload?.choices?.[0]?.finish_reason ? String(payload.choices[0].finish_reason) : undefined
          attempt.usage = payload?.usage
          receive(contentFrom(payload), true)
          end(false)
          return
        }
        if (!response.body) {
          end(false)
          return
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ""
        const consume = (line: string) => {
          const event = parseStreamLine(lane.protocol, line)
          if (!event) return
          if (event.error) throw new Error(event.error)
          if (event.finishReason) attempt.finishReason = event.finishReason
          if (event.usage) attempt.usage = event.usage
          receive(event.text, event.activity)
        }
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const lines = pending.split(/\r?\n/)
          pending = lines.pop() || ""
          for (const line of lines) consume(line)
          if (attempt.done) {
            await reader.cancel().catch(() => undefined)
            return
          }
        }
        pending += decoder.decode()
        if (pending.trim()) consume(pending)
        end(false)
      } catch (error) {
        if (attempt.done) return
        if (winner === attempt) {
          end(true)
          return
        }
        drop(attempt, error instanceof Error ? error.message : "stream-error", attempt.controller.signal.aborted ? undefined : 20_000)
      }
    }

    function launch(): boolean {
      if (settled || winner) return false
      while (next < options.lanes.length) {
        const lane = options.lanes[next++]
        if (cooldownLeft(lane) > 0) continue
        const attempt: Attempt = {
          lane,
          controller: new AbortController(),
          buffer: "",
          full: "",
          startedAt: Date.now(),
          firstAt: 0,
          lastActivity: Date.now(),
          thinking: false,
          firstTimer: null,
          done: false,
        }
        attempt.firstTimer = setTimeout(() => {
          if (winner === attempt || attempt.done) return
          drop(attempt, "no-text-in-time", 45_000)
        }, options.firstTokenMs)
        running.add(attempt)
        console.info("[MALIK_MAX] start", JSON.stringify({ lane: lane.id, power: lane.power, parallel: running.size }))
        void run(attempt)
        scheduleHedge()
        return true
      }
      return false
    }

    if (options.signal?.aborted) cancel()
    else if (!launch()) fail()
  })
}

/* ---------------------------------------------------------------- engine */

function estimateTokens(text: string) {
  return Math.ceil(String(text || "").length / 3.2)
}

export type MaxInput = {
  publicLabel?: string
  allowCatalog?: boolean
  prompt: string
  taskPrompt?: string
  systemPrompt: string
  history?: HistoryMessage[]
  attachments?: MalikAttachment[]
  maxTokens?: number
  temperature?: number
  reasoningEffort?: "low" | "medium" | "high"
  onToken?: (chunk: string) => void
  /** Stops every lane when the caller no longer needs the answer. */
  signal?: AbortSignal
}

export async function runMalikMax(input: MaxInput, deps: { fetcher?: typeof fetch; lanes?: MaxLane[] } = {}): Promise<StrictMalikResult> {
  const started = Date.now()
  const taskPrompt = input.taskPrompt || input.prompt
  const codeMode = isCodeRequest(taskPrompt)
  const fastMode = !codeMode && isFastChatRequest(taskPrompt, input.attachments)
  const needsVision = (input.attachments || []).some((item) => item?.kind === "image" || String(item?.mime || "").startsWith("image/"))
  const lanes = deps.lanes || await buildMaxLanes({ prompt: input.prompt, attachments: input.attachments, codeMode, fastMode, needsVision })
  if (!lanes.length) {
    throw new MalikModelRouteError(
      "MAX_NOT_CONFIGURED",
      needsVision ? "MalikLLM MAX: нет модели с поддержкой изображений." : "MalikLLM MAX: не настроен ни один API-ключ модели.",
      503,
      "malik-max",
    )
  }

  // The caller has already fitted the budget to the task and the account's
  // daily allowance.
  const budget = Math.max(256, Math.min(Number(input.maxTokens) || (codeMode ? 16_000 : 8_000), codeMode ? 48_000 : 32_000))
  const perCall = (spent: number) => Math.max(256, Math.min(fastMode ? 1_500 : 16_000, budget - spent + 200))
  const timing = fastMode
    ? { hedgeMs: 3_500, firstTokenMs: 30_000, firstDeadlineMs: 60_000, idleMs: 45_000 }
    : codeMode
      ? { hedgeMs: 12_000, firstTokenMs: 120_000, firstDeadlineMs: 180_000, idleMs: 90_000 }
      : { hedgeMs: 8_000, firstTokenMs: 75_000, firstDeadlineMs: 150_000, idleMs: 60_000 }
  const totalMs = 14 * 60 * 1000

  let content = ""
  const emit = (chunk: string) => {
    if (!chunk) return
    content += chunk
    input.onToken?.(chunk)
  }

  const base: CallInput = {
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    history: input.history,
    attachments: input.attachments,
    maxTokens: perCall(0),
    temperature: input.temperature,
    reasoningEffort: input.reasoningEffort,
    codeMode,
    fastMode,
    taskPrompt,
    publicLabel: input.publicLabel,
  }

  let result = await raceLanes({
    lanes,
    call: base,
    onToken: emit,
    ...timing,
    totalMs,
    minFlush: fastMode ? 2 : 24,
    maxParallel: fastMode ? 2 : MAX_PARALLEL,
    fetcher: deps.fetcher,
    signal: input.signal,
  })
  const used = [result.lane.id]
  let usage: unknown = result.usage

  for (let round = 0; round < MAX_CONTINUATIONS; round += 1) {
    const spent = estimateTokens(content)
    // Neither incomplete code nor missing items authorize spending beyond the
    // caller's budget or the account quota; keep an unfinished result honest.
    if (spent >= budget - 256) break
    const cutShort = truncatedFinish(result.finishReason) && spent < budget - 150
    const codeOpen = codeMode && (codeAnswerNeedsMore(content, input.prompt)
      || missingBriefItems(taskPrompt, content).length > 0
      || briefMissingMarker(taskPrompt, content))
    const structuredOpen = !codeMode && spent < budget - 256 && structuredAnswerNeedsMore(input.prompt, content)
    if (!result.interrupted && !cutShort && !codeOpen && !structuredOpen) break
    if (Date.now() - started > totalMs) break
    if (input.signal?.aborted) throw abortError()
    console.info("[MALIK_MAX] continue", JSON.stringify({
      round: round + 1,
      interrupted: result.interrupted,
      finishReason: result.finishReason,
      structuredOpen,
      spent,
      budget,
    }))
    const order = result.interrupted
      ? lanes.filter((lane) => lane.id !== result.lane.id)
      : [result.lane, ...lanes.filter((lane) => lane.id !== result.lane.id)]
    try {
      result = await raceLanes({
        lanes: order,
        call: {
          ...base,
          prompt: codeMode ? continuationPrompt(input.prompt, content) : longOutputContinuationPrompt(input.prompt, content),
          history: [],
          attachments: [],
          maxTokens: perCall(spent),
          temperature: Math.min(typeof input.temperature === "number" ? input.temperature : 0.3, 0.3),
        },
        onToken: emit,
        ...timing,
        totalMs: totalMs - (Date.now() - started),
        minFlush: 40,
        maxParallel: fastMode ? 2 : MAX_PARALLEL,
        overlapWith: content,
        fetcher: deps.fetcher,
        signal: input.signal,
      })
      used.push(result.lane.id)
      usage = { previous: usage, continuation: result.usage }
    } catch (error) {
      if (input.signal?.aborted) throw error
      break
    }
  }

  if (!visibleFinalText(content)) {
    throw new MalikModelRouteError("MAX_EMPTY", "MalikLLM MAX не получила ответ. Повторите запрос.", 503, "malik-max")
  }
  console.info("[MALIK_MAX] done", JSON.stringify({ lanes: used, ms: Date.now() - started, tokens: estimateTokens(content) }))
  return {
    content,
    provider: result.lane.provider,
    model: result.lane.providerModel,
    selectedModelId: "malik-max",
    latencyMs: Date.now() - started,
    usage,
  }
}

/**
 * A model picked by name in the selector (MalikAI Plus). Every configured key
 * of that model is raced the same way, so a slow key or a rate limit on one
 * key does not fail the request. Throws before writing anything when the
 * model cannot answer, so the caller can hand the request to MAX.
 */
export async function runSelectedModel(input: MaxInput, model: MalikModelDefinition, deps: { fetcher?: typeof fetch } = {}) {
  const lanes = catalogLanes(input.allowCatalog === true)
    .filter((lane) => lane.provider === model.provider && lane.providerModel === model.providerModel)
  if (!lanes.length) {
    throw new MalikModelRouteError("PROVIDER_NOT_CONFIGURED", `${model.label} сейчас не подключена.`, 503, model.id)
  }
  return runMalikMax({ ...input, publicLabel: input.publicLabel || model.label }, { ...deps, lanes })
}

/* ---------------------------------------------------------------- status */

export async function maxLaneStatus() {
  const lanes = await buildMaxLanes({ prompt: "status", codeMode: false, fastMode: false, needsVision: false })
  return lanes.map((lane) => {
    const entry = statsMap().get(lane.id)
    const rested = cooldowns().get(lane.id)
    return {
      id: lane.id,
      provider: lane.provider,
      model: lane.providerModel,
      key: lane.keyIndex + 1,
      power: lane.power,
      vision: lane.vision,
      restingMs: cooldownLeft(lane),
      restReason: rested && rested.until > Date.now() ? rested.reason : "",
      ok: entry?.ok || 0,
      fail: entry?.fail || 0,
      firstTokenMs: entry?.latency || 0,
      lastError: entry?.lastError || "",
    }
  })
}

/** Asks every lane for one word, a few at a time, and rests the ones that fail. */
export async function probeMaxLanes(options: { concurrency?: number; fetcher?: typeof fetch } = {}) {
  const lanes = await buildMaxLanes({ prompt: "ping", codeMode: false, fastMode: true, needsVision: false })
  const results: Array<{ id: string; ok: boolean; ms: number; error?: string; sample?: string }> = []
  const queue = [...lanes]
  const worker = async () => {
    while (queue.length) {
      const lane = queue.shift() as MaxLane
      const started = Date.now()
      try {
        let text = ""
        await raceLanes({
          lanes: [lane],
          call: { prompt: "Ответь одним словом: работаю", systemPrompt: "Answer with one word.", maxTokens: 32, codeMode: false, fastMode: true },
          onToken: (chunk) => { text += chunk },
          hedgeMs: 60_000,
          firstTokenMs: 25_000,
          firstDeadlineMs: 26_000,
          idleMs: 20_000,
          totalMs: 30_000,
          minFlush: 1,
          fetcher: options.fetcher,
        })
        results.push({ id: lane.id, ok: true, ms: Date.now() - started, sample: text.slice(0, 40) })
      } catch {
        const entry = statsMap().get(lane.id)
        results.push({ id: lane.id, ok: false, ms: Date.now() - started, error: entry?.lastError || "no answer" })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, options.concurrency || 6)) }, worker))
  return results
}
