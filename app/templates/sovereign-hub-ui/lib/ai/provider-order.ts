const PROVIDER_ALIASES: Record<string, string> = {
  anthropic: "claude",
  moonshot: "kimi",
  xai: "grok",
  nvidia: "nvidia-nim",
  nim: "nvidia-nim",
  aws: "aws-bedrock",
  awsbedrock: "aws-bedrock",
  "aws-bedrock": "aws-bedrock",
  google: "gemini",
  googleveo: "veo",
  "google-veo": "veo",
  runwayml: "runway",
}

export function normalizeProviderId(value?: string) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return ""
  return PROVIDER_ALIASES[normalized] || normalized
}

export function providerOrder(envName: string, fallback: string[], requested?: string) {
  const configured = String(process.env[envName] || "")
    .split(",")
    .map(normalizeProviderId)
    .filter(Boolean)
  const preferred = normalizeProviderId(requested)

  return [...new Set([
    ...(preferred && preferred !== "auto" ? [preferred] : []),
    ...configured,
    ...fallback.map(normalizeProviderId),
  ])]
}
