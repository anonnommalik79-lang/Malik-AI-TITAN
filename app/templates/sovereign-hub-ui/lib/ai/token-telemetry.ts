/**
 * Provider-reported token accounting for a single response.
 * Never estimate counts from text length: the number shown in chat is exact
 * only when upstream supplied official usage metadata.
 */
export type MalikTokenUsage = {
  totalTokens: number
  inputTokens?: number
  outputTokens?: number
  /** Provider-reported total minus known input/output; do not guess its cause. */
  unattributedTokens?: number
}

export type MalikResponseMetrics = {
  tookMs: number
  usage?: MalikTokenUsage
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function count(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) continue
    return value
  }
  return undefined
}

/** Providers may count categories that are absent from their prompt/completion fields. */
function withBreakdown(usage: MalikTokenUsage): MalikTokenUsage {
  if (usage.inputTokens === undefined || usage.outputTokens === undefined) return usage
  const accounted = usage.inputTokens + usage.outputTokens
  return accounted < usage.totalTokens
    ? { ...usage, unattributedTokens: usage.totalTokens - accounted }
    : usage
}

/** Recognizes OpenAI-compatible, Gemini and nested continuation receipts. */
export function normalizeProviderTokenUsage(value: unknown): MalikTokenUsage | undefined {
  const source = record(value)
  if (!source) return undefined

  const inputTokens = count(source, ["prompt_tokens", "input_tokens", "promptTokenCount", "inputTokens"])
  const outputTokens = count(source, ["completion_tokens", "output_tokens", "candidatesTokenCount", "outputTokens"])
  const reportedTotal = count(source, ["total_tokens", "totalTokenCount", "totalTokens"])
  const totalTokens = reportedTotal ?? (
    inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined
  )
  if (totalTokens !== undefined && Number.isSafeInteger(totalTokens)) {
    return withBreakdown({
      totalTokens,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    })
  }

  // Routers use {primary, continuation}; MAX chains use {previous,
  // continuation}. BOTH receipts must exist, including all nested stages:
  // showing only the final stage as the entire turn would underreport usage.
  const hasStages = "primary" in source || "previous" in source || "continuation" in source
  if (hasStages) {
    const first = source.previous ?? source.primary
    const second = source.continuation
    if (first === undefined || first === null || second === undefined || second === null) return undefined
    const metrics = [normalizeProviderTokenUsage(first), normalizeProviderTokenUsage(second)]
    if (metrics.every((item): item is MalikTokenUsage => Boolean(item))) {
      const sum = (key: keyof MalikTokenUsage) =>
        metrics.every((item) => item[key] !== undefined)
          ? metrics.reduce((total, item) => total + (item[key] || 0), 0)
          : undefined
      const total = sum("totalTokens")
      const input = sum("inputTokens")
      const output = sum("outputTokens")
      if (total !== undefined && Number.isSafeInteger(total)) {
        return withBreakdown({
          totalTokens: total,
          ...(input !== undefined && Number.isSafeInteger(input) ? { inputTokens: input } : {}),
          ...(output !== undefined && Number.isSafeInteger(output) ? { outputTokens: output } : {}),
        })
      }
    }
    return undefined
  }

  return source.usage ? normalizeProviderTokenUsage(source.usage) : undefined
}

/** Validate server event metrics again when restoring local/account chat history. */
export function readResponseMetrics(value: unknown): MalikResponseMetrics | undefined {
  const source = record(value)
  if (!source) return undefined
  const tookMs = source.tookMs
  if (typeof tookMs !== "number" || !Number.isFinite(tookMs) || tookMs < 0 || tookMs > 86_400_000) return undefined
  const usage = normalizeProviderTokenUsage(source.usage)
  return { tookMs: Math.round(tookMs), ...(usage ? { usage } : {}) }
}
