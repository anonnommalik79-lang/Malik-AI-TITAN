import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

export const deepSeekProvider: AIProvider = {
  id: "deepseek",
  title: "DeepSeek",
  supports: ["chat", "code", "debug", "general"],

  healthCheck() {
    return health("deepseek", hasEnv("DEEPSEEK_API_KEY"), this.supports, [modelFor("deepseek", "chat"), modelFor("deepseek", "debug")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.DEEPSEEK_API_KEY
    if (!key) throw new Error("DEEPSEEK_API_KEY not configured")

    const model = modelFor("deepseek", input.task || "chat", input.model)
    const response = await providerFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek returned ${response.status}`)

    return {
      success: true,
      provider: "deepseek",
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
    throw new Error("DeepSeek does not support image generation.")
  },

  async generateVideo() {
    throw new Error("DeepSeek does not support video generation.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
