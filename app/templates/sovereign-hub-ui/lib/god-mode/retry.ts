import "server-only"

import { classifyProviderFailure, providerAvailable, recordProviderAttempt } from "./provider-health"
import { rankProviders } from "./provider-policy"

export type ProviderLane<T> = {
  id: string
  run: (signal: AbortSignal) => Promise<T>
}

export type RetryResult<T> = {
  value: T
  provider: string
  attempts: Array<{ provider: string; ok: boolean; latencyMs: number; code?: string }>
}

function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = () => { clearTimeout(timer); reject(signal?.reason || new DOMException("Aborted", "AbortError")) }
    if (signal?.aborted) abort()
    else signal?.addEventListener("abort", abort, { once: true })
  })
}

export async function runProviderChain<T>(
  lanes: ProviderLane<T>[],
  options: {
    timeoutMs?: number
    maxAttempts?: number
    signal?: AbortSignal
    retryDelayMs?: number
    validate?: (value: T) => boolean
    preferEconomical?: boolean
  } = {},
): Promise<RetryResult<T>> {
  const unique = lanes.filter((lane, index, all) => lane?.id && all.findIndex((item) => item.id === lane.id) === index)
  const ranked = rankProviders(unique.map((lane) => lane.id), { preferEconomical: options.preferEconomical })
  const usable = ranked.map((item) => unique.find((lane) => lane.id === item.provider)).filter((lane): lane is ProviderLane<T> => Boolean(lane))
  if (!usable.length) throw new Error("NO_PROVIDER_LANES")

  const attempts: RetryResult<T>["attempts"] = []
  const maxAttempts = Math.max(1, Math.min(12, Math.floor(options.maxAttempts || usable.length)))
  let lastError: unknown = new Error("NO_PROVIDER_SUCCEEDED")

  for (let index = 0; index < maxAttempts; index++) {
    const lane = usable[index % usable.length]
    if (!providerAvailable(lane.id) && usable.some((item) => providerAvailable(item.id))) continue
    if (options.signal?.aborted) throw options.signal.reason || new DOMException("Aborted", "AbortError")

    const controller = new AbortController()
    const forwardAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener("abort", forwardAbort, { once: true })
    const timer = setTimeout(() => controller.abort(new DOMException("Provider timed out", "TimeoutError")), Math.max(1_000, options.timeoutMs || 20_000))
    const startedAt = Date.now()
    try {
      const value = await lane.run(controller.signal)
      const valid = options.validate ? options.validate(value) : value !== undefined && value !== null
      if (!valid) throw new Error("INVALID_PROVIDER_RESULT")
      const latencyMs = Date.now() - startedAt
      recordProviderAttempt(lane.id, { ok: true, latencyMs })
      attempts.push({ provider: lane.id, ok: true, latencyMs })
      return { value, provider: lane.id, attempts }
    } catch (error) {
      lastError = error
      const latencyMs = Date.now() - startedAt
      const failure = classifyProviderFailure({
        provider: lane.id,
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof DOMException ? error.name : undefined,
      })
      recordProviderAttempt(lane.id, { ok: false, latencyMs, failureClass: failure.failureClass })
      attempts.push({ provider: lane.id, ok: false, latencyMs, code: failure.failureClass })
      if (!failure.retryable && failure.failureClass !== "execution_failed") break
      if (index + 1 < maxAttempts) {
        const delay = Math.min(5_000, Math.max(0, Number(options.retryDelayMs || 250)) * (index + 1))
        await sleep(delay, options.signal)
      }
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", forwardAbort)
    }
  }

  const error = lastError instanceof Error ? lastError : new Error(String(lastError || "NO_PROVIDER_SUCCEEDED"))
  Object.assign(error, { attempts })
  throw error
}
