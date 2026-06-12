import type { MalikAIMode } from "./config"
import { routeStepsForMode } from "./modes"
import type { AIRequest, AIResponse } from "./types"
import { routeAI } from "./router"
import { sanitizePublicError } from "./safety"

const unavailableUntil = new Map<string, number>()

function cacheKey(provider: string, model?: string) {
  return `${provider}:${model || "default"}`
}

function isCachedOut(key: string) {
  const until = unavailableUntil.get(key)
  if (!until) return false
  if (Date.now() > until) {
    unavailableUntil.delete(key)
    return false
  }
  return true
}

function markUnavailable(key: string, ms: number) {
  unavailableUntil.set(key, Date.now() + ms)
}

export async function routeModeAI(mode: MalikAIMode, input: AIRequest): Promise<AIResponse> {
  const steps = routeStepsForMode(mode)
  const started = Date.now()
  const errors: string[] = []

  if (!steps.length) {
    return {
      success: false,
      provider: "local",
      model: "unconfigured",
      type: mode === "photo" ? "image" : mode === "video" ? "video" : mode === "code" ? "code" : "chat",
      output: `Mode "${mode}" is not configured. Set Render environment variables for this mode.`,
      error: "MODE_NOT_CONFIGURED",
      latencyMs: 0,
    }
  }

  for (const step of steps) {
    const key = cacheKey(step.provider, step.model)
    if (isCachedOut(key)) {
      errors.push(`${key} temporarily unavailable`)
      continue
    }

    const result = await routeAI({
      ...input,
      task: step.task,
      provider: step.provider,
      model: step.model,
      metadata: {
        ...input.metadata,
        malikMode: mode,
        routeStep: key,
        allowedProviders: [step.provider],
      },
    })

    if (result.success && result.output) {
      return {
        ...result,
        fallbackUsed: step.provider !== "deepseek" || Boolean(result.fallbackUsed),
        latencyMs: result.latencyMs || Date.now() - started,
      }
    }

    const message = sanitizePublicError(result.error || "empty response")
    errors.push(`${key}: ${message}`)
    if (/accessdenied|validation|401|403|429|timeout|unavailable|empty|invalid|not found|model/i.test(message)) {
      markUnavailable(key, Number(process.env.PROVIDER_UNAVAILABLE_CACHE_MS || 600_000))
    }
  }

  return {
    success: false,
    provider: "local",
    model: "fallback",
    type: mode === "photo" ? "image" : mode === "video" ? "video" : mode === "code" ? "code" : "chat",
    output: errors.join(" | ") || "All providers failed for this mode.",
    error: "ALL_PROVIDERS_FAILED",
    latencyMs: Date.now() - started,
  }
}
