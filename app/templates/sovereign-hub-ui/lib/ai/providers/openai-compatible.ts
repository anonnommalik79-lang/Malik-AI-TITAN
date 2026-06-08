import type { AIProvider, AIProviderId, AIRequest, AIResponse, AITaskType } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

type CompatibleOptions = {
  id: AIProviderId
  title: string
  keyEnv: string
  baseUrl: string
  supports: AITaskType[]
  enabled?: () => boolean
}

export function createOpenAICompatibleProvider(options: CompatibleOptions): AIProvider {
  async function send(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env[options.keyEnv]
    if (!key) throw new Error(`${options.keyEnv} not configured`)
    const model = modelFor(options.id, input.task || "chat", input.model)
    const response = await providerFetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
    if (!response.ok) throw new Error(payload?.error?.message || `${options.id} returned ${response.status}`)
    return {
      success: true,
      provider: options.id,
      model,
      type: responseType(input.task),
      output: payload?.choices?.[0]?.message?.content || "",
      usage: payload?.usage,
      latencyMs: Date.now() - started,
    }
  }

  return {
    id: options.id,
    title: options.title,
    supports: options.supports,
    healthCheck() {
      const configured = hasEnv(options.keyEnv) && (options.enabled ? options.enabled() : true)
      return health(options.id, configured, this.supports, [modelFor(options.id, "chat")])
    },
    sendMessage: send,
    generateCode(input) {
      return send({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 4500) })
    },
    async generateImage() {
      throw new Error(`${options.id} image generation is not enabled.`)
    },
    async generateVideo() {
      throw new Error(`${options.id} video generation is not enabled.`)
    },
    analyzeFile(input) {
      return send({ ...input, task: "file_analysis" })
    },
  }
}
