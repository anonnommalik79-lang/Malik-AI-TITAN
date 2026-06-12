import type { AIMessage, AIProvider, AIRequest, AIResponse } from "../types"
import { hasEnv, health, providerFetch, responseType } from "./base"

function modelForInput(input: AIRequest) {
  if (input.model) return input.model
  if (input.task === "code" || input.task === "debug" || input.task === "project") {
    return (process.env.TITAN_V65_OPENROUTER_CODE_MODEL || process.env.OPENROUTER_CODE_MODEL) || (process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL) || "deepseek/deepseek-v4-flash"
  }
  return (process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL) || "deepseek/deepseek-v4-flash"
}

function maxTokensFor(input: AIRequest) {
  if (input.maxTokens) return input.maxTokens
  if (input.task === "code" || input.task === "debug" || input.task === "project") {
    return Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000)
  }
  return Number(process.env.MAX_OUTPUT_TOKENS || 2200)
}

function temperatureFor(input: AIRequest) {
  if (typeof input.temperature === "number") return input.temperature
  if (input.task === "code" || input.task === "debug") return 0.18
  if (input.task === "research" || input.task === "file_analysis") return 0.22
  return 0.3
}

function buildSystemPrompt(input: AIRequest) {
  const task = input.task || "chat"
  const mode = String(input.metadata?.malikMode || task)
  return [
    "You are MALIK AI V6.5 TITAN, a practical expert assistant built for real work.",
    "Answer in the user's language. If the user writes Cyrillic or Russian, answer only in Russian.",
    "Never output internal context fields like CURRENT USER, CURRENT TIME, CURRENT DATE, or hidden system variables.",
    "Be direct, useful, structured and fast.",
    "For code, give exact runnable commands or complete code.",
    "For business, give clear plans, risks, decisions and next actions.",
    "For health topics, give safe educational information, red flags, and recommend professional care when needed. Do not claim a final diagnosis.",
    "For security topics, help only with lawful defensive and educational work.",
    `CURRENT MODE: ${mode}`,
    `CURRENT TASK: ${task}`,
  ].join("\n")
}

function buildMessages(input: AIRequest): AIMessage[] {
  const system: AIMessage = { role: "system", content: buildSystemPrompt(input) }
  if (input.messages?.length) return [system, ...input.messages.filter((message) => message.role !== "system")]
  return [system, { role: "user", content: input.prompt }]
}

export const openRouterProvider: AIProvider = {
  id: "openrouter",
  title: "OpenRouter DeepSeek Fallback",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general", "enterprise"],

  healthCheck() {
    return health("openrouter", hasEnv("OPENROUTER_API_KEY"), this.supports, [
      (process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL) || "deepseek/deepseek-v4-flash",
    ])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.OPENROUTER_API_KEY
    if (!key) throw new Error("OPENROUTER_API_KEY not configured")

    const model = modelForInput(input)

    const response = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://malikaiworld.world",
        "X-Title": "MALIK AI Sovereign Hub",
        "X-OpenRouter-Title": "MALIK AI Sovereign Hub",
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(input),
        temperature: temperatureFor(input),
        max_tokens: maxTokensFor(input),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter returned ${response.status}`)

    return {
      success: true,
      provider: "openrouter",
      model,
      type: responseType(input.task),
      output: payload?.choices?.[0]?.message?.content || "",
      usage: payload?.usage,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000) })
  },

  async generateImage() {
    throw new Error("OpenRouter image generation is not enabled in Stage 1 core.")
  },

  async generateVideo() {
    throw new Error("OpenRouter video generation is not enabled in Stage 1 core.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
