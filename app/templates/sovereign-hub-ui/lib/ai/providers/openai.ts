import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

export const openAIProvider: AIProvider = {
  id: "openai",
  title: "OpenAI",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general"],

  healthCheck() {
    return health("openai", hasEnv("OPENAI_API_KEY"), this.supports, [modelFor("openai", "chat"), modelFor("openai", "code")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error("OPENAI_API_KEY not configured")

    const model = modelFor("openai", input.task || "chat", input.model)
    const response = await providerFetch("https://api.openai.com/v1/chat/completions", {
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
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`)

    return {
      success: true,
      provider: "openai",
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
    throw new Error("OpenAI image generation belongs to Stage 3 image jobs. Stage 2 only registers provider.")
  },

  async generateVideo() {
    throw new Error("OpenAI video generation is not supported in Stage 2.")
  },

  async analyzeFile(input) {
    const fileText = input.attachments?.map((file) => `${file.name}\n${file.text || file.url || ""}`).join("\n\n") || ""
    return this.sendMessage({ ...input, task: "file_analysis", prompt: `${input.prompt}\n\n${fileText}` })
  },
}

