import type { RecoveryPlan } from "./types"
import { createAbortTimeout } from "./timeout"
import { normalizeError } from "./error-normalizer"

export function ubApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_MALIK_API_BASE_URL ||
    ""
  ).trim().replace(/\/$/, "")
}

export function ubUrl(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`
  const base = ubApiBase()
  return base ? `${base}${clean}` : clean
}

export async function ubFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 45_000) {
  const started = Date.now()
  const timeout = createAbortTimeout(timeoutMs)

  try {
    const response = await fetch(ubUrl(path), {
      ...init,
      signal: timeout.signal,
      cache: init.cache || "no-store",
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    })

    const contentType = response.headers.get("content-type") || ""
    const payload = contentType.includes("application/json") ? await response.json() : await response.text()

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      data: response.ok ? (payload as T) : undefined,
      error: response.ok ? undefined : normalizeError(payload),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: normalizeError(error),
    }
  } finally {
    timeout.clear()
  }
}

export function recoveryForHttp(status: number, error = ""): RecoveryPlan {
  if (status === 401) return { ok: false, title: "Auth problem", steps: ["Check server runtime configuration", "Redeploy service"], canAutoRecover: false, risk: "manual" }
  if (status === 402) return { ok: false, title: "Runtime billing", steps: ["Review credits", "Use backup engine"], canAutoRecover: false, risk: "manual" }
  if (status === 429) return { ok: true, title: "Rate limited", steps: ["Retry with backoff", "Reduce concurrency"], canAutoRecover: true, risk: "safe" }
  if (status === 0) return { ok: true, title: "Network fallback", steps: ["Use local fallback", "Show human message"], canAutoRecover: true, risk: "safe" }
  return { ok: false, title: "Unknown failure", steps: [error || "Check logs"], canAutoRecover: false, risk: "medium" }
}

