import "server-only"

import type { GodFailureClass, ProviderFailure, ProviderHealth } from "./contracts"

type Attempt = {
  ok: boolean
  latencyMs: number
  at: number
  failureClass?: GodFailureClass
}

type ProviderState = {
  attempts: Attempt[]
  consecutiveFailures: number
  cooldownUntil: number
}

type HealthGlobal = typeof globalThis & {
  __malikGodProviderHealth?: Map<string, ProviderState>
}

const MAX_ATTEMPTS = 80

function healthStore() {
  const scope = globalThis as HealthGlobal
  if (!scope.__malikGodProviderHealth) scope.__malikGodProviderHealth = new Map()
  return scope.__malikGodProviderHealth
}

function providerKey(value: string) {
  return String(value || "unknown").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80) || "unknown"
}

function boolEnv(name: string) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ""))
}

export function providerDisabled(provider: string) {
  const key = providerKey(provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
  return boolEnv("MALIK_DISABLE_PROVIDER_" + key)
}

export function classifyProviderFailure(input: { status?: number; code?: string; message?: string; provider?: string }): ProviderFailure {
  const status = Number(input.status || 0)
  const raw = `${input.code || ""} ${input.message || ""}`.toLowerCase()
  let failureClass: GodFailureClass = "unknown"
  if (status === 429 || /rate.?limit|too many requests/.test(raw)) failureClass = "rate_limited"
  else if (status === 401 || status === 403 || /unauthoriz|forbidden|api.?key/.test(raw)) failureClass = "auth"
  else if (status === 402 || /quota|credit|balance|billing/.test(raw)) failureClass = "quota"
  else if (status === 408 || status === 504 || /timeout|timed out|abort/.test(raw)) failureClass = "timeout"
  else if (status >= 500 || /unavailable|overloaded|capacity/.test(raw)) failureClass = "provider_unavailable"
  else if (status >= 400 && status < 500) failureClass = "invalid_input"
  else if (/cancel/.test(raw)) failureClass = "cancelled"
  else if (raw.trim()) failureClass = "execution_failed"

  return {
    provider: providerKey(input.provider || "unknown"),
    failureClass,
    status: status || undefined,
    code: input.code,
    retryable: ["rate_limited", "timeout", "provider_unavailable"].includes(failureClass),
  }
}

export function recordProviderAttempt(provider: string, input: {
  ok: boolean
  latencyMs: number
  failureClass?: GodFailureClass
  retryAfterMs?: number
}) {
  const key = providerKey(provider)
  const current = healthStore().get(key) || { attempts: [], consecutiveFailures: 0, cooldownUntil: 0 }
  current.attempts.push({
    ok: Boolean(input.ok),
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    at: Date.now(),
    failureClass: input.failureClass,
  })
  if (current.attempts.length > MAX_ATTEMPTS) current.attempts.splice(0, current.attempts.length - MAX_ATTEMPTS)

  if (input.ok) {
    current.consecutiveFailures = 0
    current.cooldownUntil = Math.min(current.cooldownUntil, Date.now())
  } else {
    current.consecutiveFailures += 1
    const rateLimited = input.failureClass === "rate_limited"
    const retry = Math.max(
      Number(input.retryAfterMs || 0),
      rateLimited ? 60_000 : Math.min(60_000, 2_000 * 2 ** Math.min(5, current.consecutiveFailures - 1)),
    )
    if (input.failureClass === "rate_limited" || input.failureClass === "provider_unavailable" || input.failureClass === "timeout") {
      current.cooldownUntil = Math.max(current.cooldownUntil, Date.now() + retry)
    }
  }
  healthStore().set(key, current)
}

function p95(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)]
}

export function providerHealth(provider: string): ProviderHealth {
  const key = providerKey(provider)
  const state = healthStore().get(key) || { attempts: [], consecutiveFailures: 0, cooldownUntil: 0 }
  const attempts = state.attempts
  const success = attempts.filter((item) => item.ok).length
  const successRate = attempts.length ? success / attempts.length : 1
  const averageLatencyMs = attempts.length
    ? attempts.reduce((sum, item) => sum + item.latencyMs, 0) / attempts.length
    : 0
  const cooldown = state.cooldownUntil > Date.now()
  const disabled = providerDisabled(key)
  const latencyPenalty = Math.min(.35, averageLatencyMs / 120_000)
  const failurePenalty = Math.min(.45, state.consecutiveFailures * .08)
  const score = disabled || cooldown
    ? 0
    : Math.max(0, Math.min(1, successRate - latencyPenalty - failurePenalty))

  return {
    provider: key,
    samples: attempts.length,
    successRate: Number(successRate.toFixed(4)),
    averageLatencyMs: Math.round(averageLatencyMs),
    p95LatencyMs: Math.round(p95(attempts.map((item) => item.latencyMs))),
    consecutiveFailures: state.consecutiveFailures,
    cooldownUntil: cooldown ? new Date(state.cooldownUntil).toISOString() : undefined,
    disabled,
    score: Number(score.toFixed(4)),
  }
}

export function providerHealthSnapshot() {
  return [...healthStore().keys()].map(providerHealth).sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider))
}

export function providerAvailable(provider: string) {
  const health = providerHealth(provider)
  return !health.disabled && !health.cooldownUntil
}
