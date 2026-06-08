import type { AIProvider, AIProviderId, AIRequest, AIResponse } from "./types"
import { normalizeProviderError, safeErrorMessage } from "./errors"
import { UnbreakableCircuitBreaker } from "../malik-unbreakable-ai/circuit-breaker"

type ProviderRunner = (provider: AIProvider, input: AIRequest) => Promise<AIResponse>
const circuits = new Map<AIProviderId, UnbreakableCircuitBreaker>()

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function circuitFor(provider: AIProvider) {
  const stored = circuits.get(provider.id)
  if (stored) return stored
  const created = new UnbreakableCircuitBreaker(provider.id)
  circuits.set(provider.id, created)
  return created
}

async function runAttempt(provider: AIProvider, input: AIRequest, run: ProviderRunner) {
  const timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS || 30_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`${provider.id} timed out after ${timeoutMs}ms`)), timeoutMs)
  const abortFromParent = () => controller.abort(input.signal?.reason)

  if (input.signal?.aborted) abortFromParent()
  else input.signal?.addEventListener("abort", abortFromParent, { once: true })

  try {
    return await run(provider, { ...input, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", abortFromParent)
  }
}

export async function runWithFallback(providers: AIProvider[], input: AIRequest, run: ProviderRunner): Promise<AIResponse> {
  const started = Date.now()
  const chain: AIProviderId[] = []
  const errors: Array<ReturnType<typeof safeErrorMessage>> = []

  for (const provider of providers) {
    const health = provider.healthCheck()
    const circuit = circuitFor(provider)
    if (!health.configured) {
      errors.push(safeErrorMessage(normalizeProviderError(provider.id, "missing api key")))
      continue
    }
    if (!circuit.canRun()) {
      errors.push(safeErrorMessage(normalizeProviderError(provider.id, "provider circuit breaker is open")))
      continue
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        chain.push(provider.id)
        const result = await runAttempt(provider, input, run)

        if (!result.success || !result.output) {
          throw new Error(result.error || "empty response")
        }

        circuit.success()
        return { ...result, fallbackChain: chain, fallbackUsed: chain.length > 1, latencyMs: result.latencyMs || Date.now() - started }
      } catch (error) {
        circuit.fail()
        const normalized = normalizeProviderError(provider.id, error)
        errors.push(safeErrorMessage(normalized))

        if (!normalized.retryable || attempt === 1) break
        await wait(450 * Math.pow(2, attempt) + Math.random() * 150)
      }
    }
  }

  return {
    success: false,
    provider: "local",
    model: "fallback",
    type: input.task === "file_analysis" ? "file" : input.task === "image" ? "image" : input.task === "video" ? "video" : input.task === "code" || input.task === "debug" || input.task === "project" ? "code" : "chat",
    output: "MALIK AI is using safe backup mode right now. The workspace remains available; please retry shortly.",
    error: JSON.stringify(errors.slice(-6)),
    fallbackChain: chain,
    fallbackUsed: true,
    latencyMs: Date.now() - started,
  }
}

