import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

function cerebrasBaseUrl() {
  return (process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/$/, "")
}

export const cerebrasProvider: AIProvider = {
  id: "cerebras",
  title: "Cerebras Fast",
  supports: ["chat", "code", "debug", "project", "general", "research"],

  healthCheck() {
    return health("cerebras", hasEnv("CEREBRAS_API_KEY"), this.supports, [modelFor("cerebras", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.CEREBRAS_API_KEY
    if (!key) throw new Error("CEREBRAS_API_KEY not configured")

    const model = modelFor("cerebras", input.task || "chat", input.model)
    const response = await providerFetch(`${cerebrasBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1200),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Cerebras returned ${response.status}`)
    }

    return {
      success: true,
      provider: "cerebras",
      model,
      type: responseType(input.task),
      output: payload?.choices?.[0]?.message?.content || "",
      usage: payload?.usage,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input) {
    return this.sendMessage({
      ...input,
      task: input.task || "code",
      maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 3500),
    })
  },

  async generateImage() {
    throw new Error("Cerebras does not support image generation in Malik FAST.")
  },

  async generateVideo() {
    throw new Error("Cerebras does not support video generation in Malik FAST.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
