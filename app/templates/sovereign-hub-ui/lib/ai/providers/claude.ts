import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

export const claudeProvider: AIProvider = {
  id: "claude",
  title: "Anthropic Claude",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general"],

  healthCheck() {
    return health("claude", hasEnv("ANTHROPIC_API_KEY"), this.supports, [modelFor("claude", "chat"), modelFor("claude", "code")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured")

    const model = modelFor("claude", input.task || "chat", input.model)
    const messages = input.messages?.length
      ? input.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
      : [{ role: "user", content: input.prompt }]

    const system = input.messages?.find((m) => m.role === "system")?.content

    const response = await providerFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
        temperature: input.temperature ?? 0.35,
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Claude returned ${response.status}`)

    return {
      success: true,
      provider: "claude",
      model,
      type: responseType(input.task),
      output: payload?.content?.map((part: any) => part.text || "").join("") || "",
      usage: payload?.usage ? { inputTokens: payload.usage.input_tokens, outputTokens: payload.usage.output_tokens } : undefined,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000) })
  },

  async generateImage() {
    throw new Error("Claude does not support image generation.")
  },

  async generateVideo() {
    throw new Error("Claude does not support video generation.")
  },

  async analyzeFile(input) {
    const fileText = input.attachments?.map((file) => `${file.name}\n${file.text || file.url || ""}`).join("\n\n") || ""
    return this.sendMessage({ ...input, task: "file_analysis", prompt: `${input.prompt}\n\n${fileText}` })
  },
}

