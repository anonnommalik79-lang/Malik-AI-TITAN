import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

function cerebrasBaseUrl() {
  return (process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/$/, "")
}

function isCodeTask(input: AIRequest) {
  return input.task === "code" || input.task === "debug" || input.task === "project"
}

function isSitesRequest(input: AIRequest) {
  return input.metadata?.requestedKind === "website" || input.metadata?.lane === "sites-skill-engine"
}

function apiKeyFor(input: AIRequest) {
  if (isSitesRequest(input)) {
    return process.env.CEREBRAS_SITES_API_KEY || process.env.CEREBRAS_API_KEY
  }
  return process.env.CEREBRAS_API_KEY
}

function completionBudget(input: AIRequest) {
  const fallback = isCodeTask(input)
    ? Number(process.env.MAX_CODE_OUTPUT_TOKENS || 16000)
    : Number(process.env.MAX_OUTPUT_TOKENS || 1200)
  const requested = Number(input.maxTokens || fallback)
  return Number.isFinite(requested) ? Math.max(1, requested) : fallback
}

export const cerebrasProvider: AIProvider = {
  id: "cerebras",
  title: "Cerebras Fast",
  supports: ["chat", "code", "debug", "project", "general", "research"],

  healthCheck() {
    return health("cerebras", hasEnv("CEREBRAS_API_KEY"), this.supports, [modelFor("cerebras", "chat"), modelFor("cerebras", "code")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = apiKeyFor(input)
    if (!key) {
      throw new Error(isSitesRequest(input)
        ? "CEREBRAS_SITES_API_KEY or CEREBRAS_API_KEY not configured"
        : "CEREBRAS_API_KEY not configured")
    }

    const model = modelFor("cerebras", input.task || "chat", input.model)
    const glm47 = model === "zai-glm-4.7"
    const budget = completionBudget(input)

    const body: Record<string, unknown> = {
      model,
      messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
      temperature: input.temperature ?? (glm47 ? 1 : 0.35),
    }

    if (glm47) {
      // Sites use GLM only as a planner. Long output remains available for
      // other coding tasks, while the Sites route normally requests a compact
      // structured WebsitePlan instead of raw HTML.
      body.top_p = 0.95
      body.max_completion_tokens = Math.min(40_000, budget)
      body.clear_thinking = false
    } else {
      body.max_tokens = budget
    }

    const response = await providerFetch(`${cerebrasBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
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
      maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 16000),
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
