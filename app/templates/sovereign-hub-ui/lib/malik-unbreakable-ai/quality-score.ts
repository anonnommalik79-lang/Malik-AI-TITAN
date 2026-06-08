export function qualityScore(input: { prompt?: string; providerConfigured?: boolean; hasFallback?: boolean; hasPreview?: boolean }) {
  let score = 20
  if ((input.prompt || "").length > 10) score += 20
  if (input.providerConfigured) score += 25
  if (input.hasFallback) score += 20
  if (input.hasPreview) score += 15
  return Math.min(100, score)
}

