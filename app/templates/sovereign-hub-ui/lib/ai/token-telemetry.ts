/**
 * Provider-reported token accounting for a single response.
 * Never estimate counts from text length: the number shown in chat is exact
 * only when upstream supplied official usage metadata.
 */
export type MalikTokenUsage = {
  totalTokens: number
  inputTokens?: number
  outputTokens?: number
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
    return {
      totalTokens,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    }
  }

  // Some providers return two separate, authoritative receipts after a
  // continuation. Add them only if EVERY reported stage has exact metadata.
  const parts = [source.primary, source.continuation].filter((part) => part !== undefined && part !== null)
  if (parts.length) {
    const metrics = parts.map(normalizeProviderTokenUsage)
    if (metrics.every((item): item is MalikTokenUsage => Boolean(item))) {
      const sum = (key: keyof MalikTokenUsage) =>
        metrics.every((item) => item[key] !== undefined)
          ? metrics.reduce((total, item) => total + (item[key] || 0), 0)
          : undefined
      const total = sum("totalTokens")
      const input = sum("inputTokens")
      const output = sum("outputTokens")
      if (total !== undefined && Number.isSafeInteger(total)) {
        return {
          totalTokens: total,
          ...(input !== undefined && Number.isSafeInteger(input) ? { inputTokens: input } : {}),
          ...(output !== undefined && Number.isSafeInteger(output) ? { outputTokens: output } : {}),
        }
      }
    }
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
