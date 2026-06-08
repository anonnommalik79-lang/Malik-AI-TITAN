import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

export const openRouterProvider: AIProvider = {
  id: "openrouter",
  title: "OpenRouter Multi-Model",
  supports: ["chat", "code", "debug", "project", "research", "general"],

  healthCheck() {
    return health("openrouter", hasEnv("OPENROUTER_API_KEY"), this.supports, [modelFor("openrouter", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.OPENROUTER_API_KEY
    if (!key) throw new Error("OPENROUTER_API_KEY not configured")

    const model = modelFor("openrouter", input.task || "chat", input.model)
    const response = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://malik.ai",
        "X-Title": "MALIK AI Sovereign Hub",
      },
      body: JSON.stringify({
        model,
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
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
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 4500) })
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

