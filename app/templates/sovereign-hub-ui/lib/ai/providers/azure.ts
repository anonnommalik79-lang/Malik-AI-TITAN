import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

function isAzureConfigured() {
  return hasEnv("AZURE_OPENAI_ENDPOINT") && hasEnv("AZURE_OPENAI_KEY") && hasEnv("AZURE_OPENAI_DEPLOYMENT")
}

export const azureProvider: AIProvider = {
  id: "azure",
  title: "Azure OpenAI / AI Foundry",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general", "enterprise"],

  healthCheck() {
    return health("azure", isAzureConfigured(), this.supports, [modelFor("azure", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "")
    const key = process.env.AZURE_OPENAI_KEY
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview"

    if (!endpoint || !key || !deployment) throw new Error("Azure OpenAI env not configured")

    const response = await providerFetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": key },
      body: JSON.stringify({
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
        temperature: input.temperature ?? 0.35,
        max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Azure OpenAI returned ${response.status}`)

    return {
      success: true,
      provider: "azure",
      model: input.model || deployment,
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
    throw new Error("Azure image generation belongs to Stage 3 image jobs.")
  },

  async generateVideo() {
    throw new Error("Azure video generation is not supported in Stage 2.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}

