import Anthropic from "@anthropic-ai/sdk"
import { AsyncLocalStorage } from "node:async_hooks"

/**
 * MalikLLM MAX answers owner and PRO accounts with Claude. Everyone else keeps
 * the free model pool.
 *
 * Configuration (Render → Environment):
 *   MALIK_MAX_CLAUDE_API_KEY   required; switches the premium answer on.
 *                              Deliberately not ANTHROPIC_API_KEY: two older
 *                              routers read that one and would send free
 *                              traffic to Claude (one to a retired model).
 *   MALIK_MAX_CLAUDE_MODEL     optional, default claude-opus-5-5
 *   MALIK_MAX_CLAUDE_PLANS     optional: "pro" (owner, pro, ultra; default),
 *                              "owner" (owner only) or "off".
 */

export const CLAUDE_PREMIUM_DEFAULT_MODEL = "claude-opus-5-5"

type PremiumAccess = { plan: string }
const access = new AsyncLocalStorage<PremiumAccess>()

const env = (name: string) => String(process.env[name] || "").trim()

/** Set once per chat request, where the account's plan is known. */
export function enterPremiumAccess(plan: string | undefined) {
  access.enterWith({ plan: String(plan || "free").toLowerCase() })
}

export function claudePremiumModel() {
  return env("MALIK_MAX_CLAUDE_MODEL") || CLAUDE_PREMIUM_DEFAULT_MODEL
}

/** True when this request's account gets the Claude answer. */
export function claudePremiumAllowed(plan = access.getStore()?.plan): boolean {
  if (!env("MALIK_MAX_CLAUDE_API_KEY") || !plan) return false
  const policy = (env("MALIK_MAX_CLAUDE_PLANS") || "pro").toLowerCase()
  if (policy === "off") return false
  if (policy === "owner") return plan === "owner"
  return plan === "owner" || plan === "pro" || plan === "ultra"
}

export type ClaudePremiumInput = {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  maxTokens: number
  effort: "low" | "medium" | "high"
  /** Receives the visible answer as it is written. */
  onText?: (delta: string) => void
  signal?: AbortSignal
  timeoutMs?: number
}

export type ClaudePremiumResult = {
  text: string
  model: string
  stopReason: string | null
  refused: boolean
  usage: Anthropic.Beta.BetaUsage
}

let shared: { key: string; client: Anthropic } | null = null
function clientFor(key: string) {
  if (!shared || shared.key !== key) shared = { key, client: new Anthropic({ apiKey: key, maxRetries: 1 }) }
  return shared.client
}

/**
 * One streamed answer. A refusal is re-run server-side on Anthropic's
 * recommended fallback model (`fallbacks: "default"`); when the whole chain
 * declines, `refused` is true and the caller must not hand the request to a
 * model without those safeguards.
 */
export async function runClaudePremium(input: ClaudePremiumInput, deps: { client?: Anthropic } = {}): Promise<ClaudePremiumResult> {
  const client = deps.client || clientFor(env("MALIK_MAX_CLAUDE_API_KEY"))
  const model = claudePremiumModel()
  const stream = client.beta.messages.stream({
    model,
    max_tokens: input.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // The system prompt is long and identical across a conversation: cached.
    system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
    messages: input.messages,
    output_config: { effort: input.effort },
  }, {
    signal: input.signal,
    // The SDK rejects a non-integer or explicitly undefined timeout.
    ...(Number.isFinite(input.timeoutMs) ? { timeout: Math.max(1_000, Math.floor(input.timeoutMs as number)) } : {}),
  })
  stream.on("text", (delta) => { if (delta) input.onText?.(delta) })
  const message = await stream.finalMessage()
  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
  return { text, model: message.model, stopReason: message.stop_reason, refused: message.stop_reason === "refusal", usage: message.usage }
}
