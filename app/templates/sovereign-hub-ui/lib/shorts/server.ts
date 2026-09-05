import "server-only"

const trim = (value?: string) => String(value || "").trim()

export function getShortsSupabaseConfig() {
  const url = trim(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "")
  const key = trim(process.env.SUPABASE_SERVICE_ROLE_KEY)
  return url && key ? { url, key } : null
}

export async function shortsSupabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getShortsSupabaseConfig()
  if (!config) throw new Error("MALIK_SHORTS_DB_NOT_CONFIGURED")

  const response = await fetch(`${config.url}/rest/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`MALIK_SHORTS_DB_${response.status}:${text.slice(0, 400)}`)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export function getYouTubeShortsConfig() {
  const apiKey = trim(process.env.YOUTUBE_API_KEY || process.env.GOOGLE_YOUTUBE_API_KEY)
  return apiKey ? { apiKey } : null
}

export function getTikTokShortsConfig() {
  const mode = trim(process.env.TIKTOK_ENV).toLowerCase() === "production" ? "production" : "sandbox"
  const clientKey = trim(
    mode === "sandbox"
      ? process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY
      : process.env.TIKTOK_CLIENT_KEY,
  )
  const clientSecret = trim(
    mode === "sandbox"
      ? process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET
      : process.env.TIKTOK_CLIENT_SECRET,
  )
  const redirectUri = trim(process.env.TIKTOK_REDIRECT_URI) || "https://malikaiworld.world/api/tiktok/callback"

  return clientKey && clientSecret
    ? { mode, clientKey, clientSecret, redirectUri }
    : null
}

export function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Math.floor(Number(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

export function safeText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max)
}

export function stableShortId(source: "malik" | "youtube" | "tiktok", id: string) {
  return `${source}:${String(id).replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 160)}`
}
