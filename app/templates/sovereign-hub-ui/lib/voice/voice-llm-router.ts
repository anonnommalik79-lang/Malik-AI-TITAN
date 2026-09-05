import { routeAI } from "@/lib/ai/router"
import type { VoiceMessage, VoiceTier } from "./conversation"

type VoiceLlmResult = {
  content: string
  provider: string
  model: string
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function contentFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .join("")
      .trim()
    if (joined) return joined
  }

  const native = payload?.result?.response ?? payload?.response ?? payload?.result?.text ?? payload?.text
  return typeof native === "string" ? native.trim() : ""
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

function requestBody(system: string, text: string, model?: string, history: VoiceMessage[] = [], temperature?: number) {
  return {
    ...(model ? { model } : {}),
    messages: [
      { role: "system", content: system },
      // Without these the assistant answers every turn as if it were the
      // first, which is what made follow-up questions land on nothing.
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: text },
    ],
    // Speech is generated only after the whole answer exists, so every extra
    // sentence is paid for twice: once to write it, once to say it aloud.
    max_tokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 320),
    temperature: temperature ?? Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
    stream: false,
  }
}

async function callGroq(system: string, text: string, history: VoiceMessage[], temperature?: number): Promise<VoiceLlmResult | null> {
  // Important: try BOTH keys. A stale dedicated Voice key must never block a
  // working generic Groq key that already exists in Render.
  const keys = unique([env("GROQ_VOICE_API_KEY"), env("GROQ_API_KEY")])
  if (!keys.length) return null

  const model = env("GROQ_VOICE_LLM_MODEL") || env("VOICE_LLM_GROQ_MODEL") || "openai/gpt-oss-20b"
  const baseUrl = (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")
  const timeoutMs = Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000)

  for (const key of keys) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(requestBody(system, text, model, history, temperature)),
        },
        timeoutMs,
      )

      if (!response.ok) {
        console.error("[VOICE_LLM_GROQ]", response.status, (await response.text().catch(() => "")).slice(0, 240))
        continue
      }

      const payload = await response.json().catch(() => null)
      const content = contentFrom(payload)
      if (content) return { content, provider: "groq", model }
    } catch (error) {
      console.error("[VOICE_LLM_GROQ]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

type CfCredential = { token: string; accountId: string }

function cloudflareCredentials(): CfCredential[] {
  const voiceToken = env("CLOUDFLARE_VOICE_API_TOKEN")
  const genericToken = env("CLOUDFLARE_API_TOKEN") || env("CF_API_TOKEN")
  const voiceAccount = env("CLOUDFLARE_VOICE_ACCOUNT_ID")
  const genericAccount = env("CLOUDFLARE_ACCOUNT_ID") || env("CF_ACCOUNT_ID")

  const candidates: CfCredential[] = [
    { token: voiceToken, accountId: voiceAccount || genericAccount },
    { token: genericToken, accountId: genericAccount || voiceAccount },
    { token: voiceToken, accountId: genericAccount },
    { token: genericToken, accountId: voiceAccount },
  ].filter((item) => item.token && item.accountId)

  const seen = new Set<string>()
  return candidates.filter((item) => {
    const id = `${item.accountId}:${item.token}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function callCloudflare(system: string, text: string, history: VoiceMessage[], temperature?: number): Promise<VoiceLlmResult | null> {
  const credentials = cloudflareCredentials()
  if (!credentials.length) return null

  const model = env("CLOUDFLARE_VOICE_LLM_MODEL") || env("VOICE_LLM_CLOUDFLARE_MODEL") || "@cf/meta/llama-3.1-8b-instruct-fast"
  const timeoutMs = Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000)

  for (const { token, accountId } of credentials) {
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    }

    // First try Cloudflare's OpenAI-compatible endpoint.
    try {
      const response = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody(system, text, model, history, temperature)),
        },
        timeoutMs,
      )

      if (response.ok) {
        const payload = await response.json().catch(() => null)
        const content = contentFrom(payload)
        if (content) return { content, provider: "cloudflare", model }
      } else {
        console.error("[VOICE_LLM_CLOUDFLARE_COMPAT]", response.status, (await response.text().catch(() => "")).slice(0, 240))
      }
    } catch (error) {
      console.error("[VOICE_LLM_CLOUDFLARE_COMPAT]", error instanceof Error ? error.message : error)
    }

    // Native Workers AI endpoint is a second Cloudflare path. This makes Voice
    // resilient if the OpenAI-compatible path/model combination is unavailable.
    try {
      const response = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody(system, text, undefined, history, temperature)),
        },
        timeoutMs,
      )

      if (!response.ok) {
        console.error("[VOICE_LLM_CLOUDFLARE_NATIVE]", response.status, (await response.text().catch(() => "")).slice(0, 240))
        continue
      }

      const payload = await response.json().catch(() => null)
      const content = contentFrom(payload)
      if (content) return { content, provider: "cloudflare", model }
    } catch (error) {
      console.error("[VOICE_LLM_CLOUDFLARE_NATIVE]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

/**
 * The main router, which every other feature in the app already uses. It knows
 * which providers are actually configured and falls back across them, so Voice
 * stops being pinned to whichever one it was written against.
 *
 * Every turn goes to the head of that chain, which is the largest configured
 * model. `tier` rides along as metadata for logs only - it does not pick a
 * model, and an earlier comment here claiming it did was wrong. Answering a
 * Kazakh greeting correctly matters more than shaving a second off "спасибо",
 * and low-resource languages are exactly where the small models fail.
 */
async function callSharedRouter(
  system: string,
  text: string,
  history: VoiceMessage[],
  tier: VoiceTier,
  temperature: number | undefined,
  signal?: AbortSignal,
  languageCode?: string,
): Promise<VoiceLlmResult | null> {
  // Kazakh is the exception to "whatever is fastest". The head of the chain is
  // an open-weights model that has seen very little of it, and what comes back
  // is grammatical mush - which is the whole "тупой especially in Kazakh"
  // complaint, and nothing in the recognizer or the speech engine can repair an
  // answer that was written badly. Gemini speaks it properly, so Kazakh asks
  // for Gemini and falls back to the usual chain if it is not there.
  const kazakh = String(languageCode || "").toLowerCase().startsWith("kk")
    && process.env.VOICE_LLM_KAZAKH_PROVIDER !== "off"

  try {
    const result = await routeAI({
      prompt: text,
      task: "chat",
      // Nothing is pinned except for Kazakh; everything else keeps the fast chain.
      ...(kazakh ? { provider: process.env.VOICE_LLM_KAZAKH_PROVIDER || "gemini" } : {}),
      userId: "voice",
      maxTokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 320),
      temperature: temperature ?? Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
      messages: [
        { role: "system", content: system },
        ...history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content: text },
      ],
      signal,
      metadata: { lane: "voice", tier },
    })

    if (!result?.success) return null
    const content = typeof result.output === "string" ? result.output.trim() : ""
    if (!content) return null

    return { content, provider: String(result.provider || "router"), model: String(result.model || "auto") }
  } catch (error) {
    console.error("[VOICE_LLM_ROUTER]", error instanceof Error ? error.message : error)
    return null
  }
}

export async function voiceLlmAnswer(input: {
  text: string
  instruction: string
  history?: VoiceMessage[]
  tier?: VoiceTier
  temperature?: number
  signal?: AbortSignal
  /** Which language the answer has to be in. Kazakh changes who is asked. */
  languageCode?: string
}): Promise<VoiceLlmResult> {
  const history = input.history || []
  const tier = input.tier || "fast"

  const routed = await callSharedRouter(input.instruction, input.text, history, tier, input.temperature, input.signal, input.languageCode)
  if (routed) return routed

  // Direct provider calls stay as the safety net, so Voice still answers if the
  // shared router is rate-limited or misconfigured.
  const groq = await callGroq(input.instruction, input.text, history, input.temperature)
  if (groq) return groq

  const cloudflare = await callCloudflare(input.instruction, input.text, history, input.temperature)
  if (cloudflare) return cloudflare

  throw new Error("VOICE_LLM_UNAVAILABLE")
}
