export const UNBREAKABLE_VERSION = "MALIK AI Unbreakable Final v1"

export const UNBREAKABLE_LIMITS = {
  maxPromptChars: 12_000,
  maxHistoryItems: 120,
  maxIncidents: 80,
  maxArtifacts: 50,
  maxRetries: 3,
  maxProviderTimeoutMs: 190_000,
  maxLocalStorageBytes: 4_000_000,
} as const

export const UNBREAKABLE_STORAGE_KEYS = {
  checks: "malik_unbreakable_checks_v1",
  incidents: "malik_unbreakable_incidents_v1",
  generations: "malik_unbreakable_generations_v1",
  providers: "malik_unbreakable_providers_v1",
  health: "malik_unbreakable_health_v1",
} as const

export const UNBREAKABLE_LAYERS = [
  "ui",
  "auth",
  "chat",
  "media",
  "code",
  "storage",
  "network",
  "provider",
  "render",
  "security",
] as const

