import "server-only"

export type ShortsModerationAction = "allow" | "review" | "block"

export type ShortsModerationResult = {
  action: ShortsModerationAction
  score: number
  labels: string[]
  provider: "local" | "webhook" | "hybrid"
  reason?: string
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 24)
}

function localSignals(text: string): ShortsModerationResult {
  const raw = String(text || "")
  const normalized = raw.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
  if (!normalized) return { action: "allow", score: 0, labels: [], provider: "local" }

  const labels: string[] = []
  let score = 0
  const links = normalized.match(/https?:\/\/|www\./gi)?.length || 0
  const mentions = normalized.match(/@[\p{L}\p{N}._-]+/gu)?.length || 0
  const repeated = /(.)\1{11,}/u.test(normalized)
  const repeatedToken = /\b([\p{L}\p{N}_-]{2,})\b(?:\s+\1\b){5,}/iu.test(normalized)
  const invisibleRatio = raw.length ? Math.max(0, raw.length - normalized.length) / raw.length : 0
  const upperLetters = (normalized.match(/[A-ZА-ЯӘІҢҒҮҰҚӨҺ]/g) || []).length
  const letters = (normalized.match(/[\p{L}]/gu) || []).length
  const upperRatio = letters ? upperLetters / letters : 0

  if (links >= 4) { score += .45; labels.push("link_spam") }
  else if (links >= 2) { score += .2; labels.push("many_links") }
  if (mentions >= 10) { score += .28; labels.push("mention_spam") }
  if (repeated || repeatedToken) { score += .28; labels.push("repetition_spam") }
  if (invisibleRatio > .08) { score += .22; labels.push("hidden_unicode") }
  if (normalized.length > 120 && upperRatio > .82) { score += .12; labels.push("shouting_pattern") }
  if (/\b(?:free\s+money|guaranteed\s+profit|100%\s+profit|быстрые\s+деньги|гарантированн(?:ая|ый)\s+прибыль)\b/iu.test(normalized)) {
    score += .3
    labels.push("scam_pattern")
  }

  score = clamp(score)
  const action: ShortsModerationAction = score >= .82 ? "block" : score >= .46 ? "review" : "allow"
  return { action, score, labels: unique(labels), provider: "local" }
}

function parseRemote(value: unknown): ShortsModerationResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const rawAction = String(row.action || row.decision || "").toLowerCase()
  const action: ShortsModerationAction = rawAction === "block" ? "block" : rawAction === "review" ? "review" : "allow"
  const score = clamp(Number(row.score ?? row.risk ?? 0))
  const labels = Array.isArray(row.labels)
    ? row.labels.map((item) => String(item || "").slice(0, 80)).filter(Boolean)
    : []
  const reason = String(row.reason || "").slice(0, 500) || undefined
  return { action, score, labels: unique(labels), provider: "webhook", reason }
}

function stronger(a: ShortsModerationResult, b: ShortsModerationResult): ShortsModerationResult {
  const rank = { allow: 0, review: 1, block: 2 } as const
  const action = rank[b.action] > rank[a.action] ? b.action : a.action
  return {
    action,
    score: Math.max(a.score, b.score),
    labels: unique([...a.labels, ...b.labels]),
    provider: "hybrid",
    reason: b.reason || a.reason,
  }
}

export function shortsExternalModerationConfigured() {
  return Boolean(String(process.env.MALIK_SHORTS_MODERATION_WEBHOOK || "").trim())
}

export async function moderateShortsText(text: string, context: { kind?: string; userKey?: string; locale?: string } = {}): Promise<ShortsModerationResult> {
  const local = localSignals(text)
  const endpoint = String(process.env.MALIK_SHORTS_MODERATION_WEBHOOK || "").trim()
  if (!endpoint) return local

  try {
    const url = new URL(endpoint)
    if (url.protocol !== "https:") return local
    const token = String(process.env.MALIK_SHORTS_MODERATION_TOKEN || "").trim()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          product: "malik-shorts",
          text: String(text || "").slice(0, 6000),
          kind: String(context.kind || "post").slice(0, 40),
          userKey: context.userKey ? String(context.userKey).slice(0, 180) : undefined,
          locale: context.locale ? String(context.locale).slice(0, 20) : undefined,
        }),
        signal: controller.signal,
        cache: "no-store",
      })
      if (!response.ok) return local
      const remote = parseRemote(await response.json().catch(() => null))
      return remote ? stronger(local, remote) : local
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return local
  }
}
