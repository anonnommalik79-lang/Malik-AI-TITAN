import "server-only"
import { SCOPE, seal, unseal, tokenKey } from "./security"
import { connection, locked, patchConnection } from "./store"
import { YouTubeError } from "./errors"

export function oauthConfig() {
  const clientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET?.trim()
  const redirectUri = process.env.GOOGLE_YOUTUBE_REDIRECT_URI?.trim()
  if (!clientId || !clientSecret || !redirectUri) throw new YouTubeError("YOUTUBE_CONFIGURATION_REQUIRED", 503)
  const url = new URL(redirectUri)
  if (url.pathname !== "/api/youtube/callback" || url.search || url.hash || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new YouTubeError("YOUTUBE_CONFIGURATION_REQUIRED", 503)
  try { tokenKey() } catch { throw new YouTubeError("YOUTUBE_CONFIGURATION_REQUIRED", 503) }
  return { clientId, clientSecret, redirectUri, origin: url.origin }
}
export type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
export async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const config = oauthConfig()
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ ...params, client_id: config.clientId, client_secret: config.clientSecret }),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  })
  const body = await response.json()
  if (!response.ok || !body.access_token) throw new YouTubeError(body.error === "invalid_grant" ? "YOUTUBE_RECONNECT_REQUIRED" : "API_UNAVAILABLE", 401)
  if (!Number.isFinite(body.expires_in) || body.expires_in <= 0 || typeof body.access_token !== "string") throw new YouTubeError("API_UNAVAILABLE")
  return body
}
const refreshing = new Map<string, Promise<string>>()
export async function accessToken(user: string, rejected?: string): Promise<string> {
  const pending = refreshing.get(user)
  if (pending) return pending
  const operation = resolveToken(user, rejected)
  refreshing.set(user, operation)
  try { return await operation } finally { if (refreshing.get(user) === operation) refreshing.delete(user) }
}
async function resolveToken(user: string, rejected?: string) {
  let row = await connection(user)
  if (!row) throw new YouTubeError("YOUTUBE_CONNECT_REQUIRED", 401)
  if (!row.scopes.includes(SCOPE)) throw new YouTubeError("insufficientPermissions", 403)
  let token = unseal(row.access_encrypted, user)
  if (Date.parse(row.expires_at) > Date.now() + 60000 && (!rejected || rejected !== token)) return token
  return locked(user, "refresh", async () => {
    row = await connection(user)
    if (!row) throw new YouTubeError("YOUTUBE_CONNECT_REQUIRED", 401)
    token = unseal(row.access_encrypted, user)
    if (Date.parse(row.expires_at) > Date.now() + 60000 && (!rejected || rejected !== token)) return token
    const result = await tokenRequest({ grant_type: "refresh_token", refresh_token: unseal(row.refresh_encrypted, user) })
    if (result.scope && !result.scope.split(" ").includes(SCOPE)) throw new YouTubeError("insufficientPermissions", 403)
    await patchConnection(user, { access_encrypted: seal(result.access_token, user), refresh_encrypted: result.refresh_token ? seal(result.refresh_token, user) : row.refresh_encrypted, expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString() })
    return result.access_token
  }).catch(async (error) => {
    if (!(error instanceof YouTubeError) || error.code !== "BUSY") throw error
    // Another server owns refresh: bounded wait for its token, never a second refresh loop.
    const deadline = Date.now() + 20000
    for (let attempt = 0; attempt < 20 && Date.now() < deadline; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const current = await connection(user)
      if (!current) throw new YouTubeError("YOUTUBE_CONNECT_REQUIRED", 401)
      const fresh = unseal(current.access_encrypted, user)
      if (fresh !== token && Date.parse(current.expires_at) > Date.now() + 60000) return fresh
    }
    throw error
  })
}
export type Resource = {
  id: string; snippet?: Record<string, unknown>; statistics?: Record<string, string>
  contentDetails?: Record<string, unknown>; status?: Record<string, unknown>
  replies?: { comments: Resource[] }
}
export type List = { items: Resource[]; nextPageToken?: string; pageInfo?: { totalResults?: number } }
export async function youtube<T = List>(user: string, path: string, params: Record<string, string> = {}, method = "GET", body?: unknown): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value) })
  let token = await accessToken(user)
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15000) })
    if (response.status === 401 && attempt === 0) { token = await accessToken(user, token); continue }
    if (response.status === 204) return undefined as T
    const result = await response.json()
    if (!response.ok) {
      const reason = String(result.error?.errors?.[0]?.reason || "")
      throw new YouTubeError(response.status === 401 ? "YOUTUBE_RECONNECT_REQUIRED" : reason || "API_UNAVAILABLE", response.status === 401 ? 401 : response.status === 404 ? 404 : response.status === 403 ? 403 : 502)
    }
    return result as T
  }
  throw new YouTubeError("YOUTUBE_RECONNECT_REQUIRED", 401)
}
