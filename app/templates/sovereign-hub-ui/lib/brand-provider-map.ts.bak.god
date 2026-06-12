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

const MALIK_CLEAN_RU_FALLBACK =
  "\u0413\u043e\u0442\u043e\u0432 \u043f\u043e\u043c\u043e\u0447\u044c. \u041d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 \u043e\u0442\u0432\u0435\u0447\u0443 \u043a\u043e\u0440\u043e\u0442\u043a\u043e \u0438 \u043f\u043e \u0434\u0435\u043b\u0443."

function looksMalformedAIText(text: string) {
  const trimmed = text.trim()
  const commaCount = (trimmed.match(/,/g) || []).length
  const perSpamCount = (trimmed.match(/\bper[-\w]*/gi) || []).length
  const mojibakeCount = (trimmed.match(/[ÐÑâ]/g) || []).length

  return (
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(trimmed) ||
    /^[,;:]/.test(trimmed) ||
    mojibakeCount >= 2 ||
    commaCount >= 35 ||
    perSpamCount >= 8
  )
}
export function sanitizePublicText(value: unknown, fallback = "MALIK AI is temporarily using backup mode.") {
  const text = String(value || "").trim()
  if (!text) return fallback
  if (looksMalformedAIText(text)) return MALIK_CLEAN_RU_FALLBACK
  
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
