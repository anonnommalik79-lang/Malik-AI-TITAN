import "server-only"

import { providerHealth } from "./provider-health"

export type ProviderCost = {
  provider: string
  inputUsdPerMillion?: number
  outputUsdPerMillion?: number
  source: "env" | "unknown"
}

function providerKey(value: string) {
  return String(value || "unknown").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80) || "unknown"
}

function envSuffix(provider: string) {
  return providerKey(provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
}

function rate(value: string | undefined) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function providerCost(provider: string): ProviderCost {
  const key = providerKey(provider)
  const suffix = envSuffix(key)
  const input = rate(process.env[`MALIK_PROVIDER_COST_${suffix}_INPUT_PER_1M_USD`])
  const output = rate(process.env[`MALIK_PROVIDER_COST_${suffix}_OUTPUT_PER_1M_USD`])
  return {
    provider: key,
    inputUsdPerMillion: input,
    outputUsdPerMillion: output,
    source: input !== undefined || output !== undefined ? "env" : "unknown",
  }
}

export function estimateProviderCostUsd(provider: string, inputTokens: number, outputTokens: number) {
  const pricing = providerCost(provider)
  if (pricing.inputUsdPerMillion === undefined && pricing.outputUsdPerMillion === undefined) return null
  const input = Math.max(0, Number(inputTokens || 0))
  const output = Math.max(0, Number(outputTokens || 0))
  const total =
    input / 1_000_000 * (pricing.inputUsdPerMillion || 0)
    + output / 1_000_000 * (pricing.outputUsdPerMillion || 0)
  return Number(total.toFixed(8))
}

function configuredCostIndex(provider: string) {
  const pricing = providerCost(provider)
  if (pricing.source === "unknown") return .5
  const blended = (pricing.inputUsdPerMillion || 0) + (pricing.outputUsdPerMillion || 0)
  // This is a relative policy input, never displayed as an invented price.
  return Math.min(1, blended / 50)
}

export function providerPolicyScore(provider: string, options: { preferEconomical?: boolean; qualityWeight?: number } = {}) {
  const health = providerHealth(provider)
  if (health.disabled || health.cooldownUntil) return 0
  const economical = options.preferEconomical ? 1 - configuredCostIndex(provider) : .5
  const healthWeight = Math.max(.4, Math.min(.9, Number(options.qualityWeight || .72)))
  return Number((health.score * healthWeight + economical * (1 - healthWeight)).toFixed(4))
}

export function rankProviders(providers: string[], options: { preferEconomical?: boolean; qualityWeight?: number } = {}) {
  return [...new Set(providers.map(providerKey))]
    .map((provider, index) => ({ provider, score: providerPolicyScore(provider, options), originalIndex: index, cost: providerCost(provider), health: providerHealth(provider) }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
}
