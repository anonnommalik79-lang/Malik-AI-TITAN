import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

function geminiContents(input: AIRequest) {
  const messages = input.messages?.length ? input.messages : [{ role: "user" as const, content: input.prompt }]
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  title: "Google Gemini",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general"],

  healthCheck() {
    return health("gemini", hasEnv("GEMINI_API_KEY") || hasEnv("GOOGLE_GENERATIVE_AI_API_KEY"), this.supports, [modelFor("gemini", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!key) throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY not configured")

    const model = modelFor("gemini", input.task || "chat", input.model)
    const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents(input),
        generationConfig: {
          temperature: input.temperature ?? 0.35,
          maxOutputTokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
        },
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini returned ${response.status}`)

    const output = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || ""
    return {
      success: true,
      provider: "gemini",
      model,
      type: responseType(input.task),
      output,
      usage: payload?.usageMetadata,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 4000) })
  },

  async generateImage() {
    throw new Error("Gemini image generation is not enabled in Stage 1 core.")
  },

  async generateVideo() {
    throw new Error("Gemini video generation is not enabled in Stage 1 core.")
  },

  async analyzeFile(input) {
    const fileText = input.attachments?.map((file) => `${file.name}\n${file.text || file.url || ""}`).join("\n\n") || ""
    return this.sendMessage({ ...input, task: "file_analysis", prompt: `${input.prompt}\n\n${fileText}` })
  },
}

