export type PublicEngineId =
  | "core"
  | "reasoning"
  | "code"
  | "vision"
  | "cinema"
  | "infrastructure"
  | "identity"
  | "backup"

export type PublicEngine = {
  id: PublicEngineId
  title: string
  group: "text" | "code" | "image" | "video" | "infrastructure" | "identity"
  configured: boolean
  ready: boolean
  status: "online" | "fallback"
}

const TITLES: Record<PublicEngineId, string> = {
  core: "MALIK Core",
  reasoning: "MALIK Reasoning",
  code: "MALIK Codex",
  vision: "MALIK Vision",
  cinema: "MALIK Cinema",
  infrastructure: "MALIK Infrastructure",
  identity: "Sovereign ID",
  backup: "MALIK Backup",
}

const INTERNAL_IDENTITY_PATTERN =
  /\b(openai|anthropic|claude|gemini|veo|runway|luma|fal(?:\.ai)?|stability|moonshot|kimi|groq|deepseek|openrouter|xai|grok|aws|bedrock|nvidia|nim|supabase|azure)\b/gi

const INTERNAL_ENV_PATTERN =
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|MODEL|DEPLOYMENT|REGION|URL|BUCKET|ACCESS_KEY_ID)\b/g

export function publicEngineTitle(id: PublicEngineId) {
  return TITLES[id]
}

export function publicEngineIdForProvider(provider?: string, kind?: string): PublicEngineId {
  const normalized = String(provider || "").trim().toLowerCase()
  if (!normalized || normalized === "local" || normalized.includes("fallback")) return "backup"
  if (kind === "image" || ["stability"].includes(normalized)) return "vision"
  if (kind === "video" || ["veo", "runway", "luma"].includes(normalized)) return "cinema"
  if (kind === "code" || kind === "project" || kind === "debug") return "code"
  if (normalized.includes("aws") || normalized.includes("nvidia") || normalized === "azure") return "infrastructure"
  if (normalized.includes("supabase")) return "identity"
  if (["kimi", "grok", "deepseek", "claude"].includes(normalized)) return "reasoning"
  return "core"
}

export function publicEngineForProvider(provider?: string, kind?: string) {
  const id = publicEngineIdForProvider(provider, kind)
  return { id, title: publicEngineTitle(id) }
}

export function sanitizePublicText(value: unknown, fallback = "MALIK AI is temporarily using backup mode.") {
  const text = String(value || "").trim()
  if (!text) return fallback
  
  // Only sanitize environment keys, secrets, and internal config
  // Do NOT replace provider names - that's handled by Identity Guard
  const INTERNAL_ENV_PATTERN =
    /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|MODEL|DEPLOYMENT|REGION|URL|BUCKET|ACCESS_KEY_ID)\b/g
  
  const withoutEnv = text.replace(INTERNAL_ENV_PATTERN, "server setting")
  return withoutEnv
}

export function publicErrorMessage(error?: unknown) {
  const text = String(error instanceof Error ? error.message : error || "").toLowerCase()
  if (text.includes("429") || text.includes("quota") || text.includes("rate limit")) {
    return "High-demand engine is busy. MALIK AI switched to backup mode."
  }
  if (text.includes("timeout") || text.includes("abort")) {
    return "The request took too long. MALIK AI switched to backup mode."
  }
  if (text.includes("401") || text.includes("403") || text.includes("missing") || text.includes("not configured")) {
    return "This feature is being prepared on the server."
  }
  return "MALIK AI switched to backup mode for this request."
}

export function buildPublicEngine(
  id: PublicEngineId,
  group: PublicEngine["group"],
  configured: boolean,
): PublicEngine {
  return {
    id,
    title: publicEngineTitle(id),
    group,
    configured,
    ready: configured,
    status: configured ? "online" : "fallback",
  }
}
