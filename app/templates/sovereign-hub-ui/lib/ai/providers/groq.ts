import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

export const groqProvider: AIProvider = {
  id: "groq",
  title: "Groq Fast",
  supports: ["chat", "code", "general", "research"],

  healthCheck() {
    return health("groq", hasEnv("GROQ_API_KEY"), this.supports, [modelFor("groq", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.GROQ_API_KEY
    if (!key) throw new Error("GROQ_API_KEY not configured")

    const model = modelFor("groq", input.task || "chat", input.model)
    const response = await providerFetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1200),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Groq returned ${response.status}`)

    return {
      success: true,
      provider: "groq",
      model,
      type: responseType(input.task),
      output: payload?.choices?.[0]?.message?.content || "",
      usage: payload?.usage,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 3500) })
  },

  async generateImage() {
    throw new Error("Groq does not support image generation.")
  },

  async generateVideo() {
    throw new Error("Groq does not support video generation.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}

