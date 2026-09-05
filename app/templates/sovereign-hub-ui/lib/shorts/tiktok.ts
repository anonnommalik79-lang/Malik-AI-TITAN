import "server-only"

import { getTikTokShortsConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import { decryptShortsToken, encryptShortsToken } from "@/lib/shorts/token-vault"

const TIKTOK_API = "https://open.tiktokapis.com"

export type TikTokTokenResponse = {
  access_token: string
  expires_in: number
  open_id: string
  refresh_expires_in: number
  refresh_token: string
  scope: string
  token_type?: string
}

export type TikTokUser = {
  open_id: string
  union_id?: string
  avatar_url?: string
  avatar_url_100?: string
  avatar_large_url?: string
  display_name?: string
  profile_deep_link?: string
  bio_description?: string
  is_verified?: boolean
  follower_count?: number
  following_count?: number
  likes_count?: number
  video_count?: number
}

export type TikTokVideo = {
  id: string
  create_time?: number
  cover_image_url?: string
  share_url?: string
  video_description?: string
  duration?: number
  height?: number
  width?: number
  title?: string
  embed_html?: string
  embed_link?: string
  like_count?: number
  comment_count?: number
  share_count?: number
  view_count?: number
  is_aigc?: boolean
}

async function readJson(response: Response) {
  const text = await response.text()
  try { return text ? JSON.parse(text) : {} } catch { return { raw: text.slice(0, 500) } }
}

function assertTikTokOk(response: Response, json: any, label: string) {
  if (!response.ok || (json?.error?.code && json.error.code !== "ok")) {
    const code = json?.error?.code || json?.error || response.status
    throw new Error(`${label}:${String(code).slice(0, 120)}`)
  }
}

export async function exchangeTikTokCode(code: string) {
  const config = getTikTokShortsConfig()
  if (!config) throw new Error("TIKTOK_NOT_CONFIGURED")
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  })
  const response = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
    body,
    cache: "no-store",
  })
  const json = await readJson(response)
  if (!response.ok || json?.error || !json?.access_token || !json?.refresh_token || !json?.open_id) {
    throw new Error(`TIKTOK_TOKEN_EXCHANGE_FAILED:${String(json?.error_description || json?.error || response.status).slice(0, 180)}`)
  }
  return json as TikTokTokenResponse
}

export async function refreshTikTokToken(refreshToken: string) {
  const config = getTikTokShortsConfig()
  if (!config) throw new Error("TIKTOK_NOT_CONFIGURED")
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  const response = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
    body,
    cache: "no-store",
  })
  const json = await readJson(response)
  if (!response.ok || json?.error || !json?.access_token || !json?.refresh_token) {
    throw new Error(`TIKTOK_TOKEN_REFRESH_FAILED:${String(json?.error_description || json?.error || response.status).slice(0, 180)}`)
  }
  return json as TikTokTokenResponse
}

export async function fetchTikTokUser(accessToken: string) {
  const fields = [
    "open_id", "union_id", "avatar_url", "avatar_url_100", "avatar_large_url", "display_name",
    "profile_deep_link", "bio_description", "is_verified", "follower_count", "following_count",
    "likes_count", "video_count",
  ].join(",")
  const response = await fetch(`${TIKTOK_API}/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const json = await readJson(response)
  assertTikTokOk(response, json, "TIKTOK_USER_INFO_FAILED")
  if (!json?.data?.user?.open_id) throw new Error("TIKTOK_USER_INFO_MISSING")
  return json.data.user as TikTokUser
}

export async function fetchTikTokVideos(accessToken: string, maxCount = 20, cursor?: number) {
  const fields = [
    "id", "create_time", "cover_image_url", "share_url", "video_description", "duration", "height", "width",
    "title", "embed_link", "like_count", "comment_count", "share_count", "view_count", "is_aigc",
  ].join(",")
  const body: Record<string, number> = { max_count: Math.max(1, Math.min(20, Math.floor(maxCount))) }
  if (cursor) body.cursor = cursor
  const response = await fetch(`${TIKTOK_API}/v2/video/list/?fields=${encodeURIComponent(fields)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const json = await readJson(response)
  assertTikTokOk(response, json, "TIKTOK_VIDEO_LIST_FAILED")
  return {
    videos: (Array.isArray(json?.data?.videos) ? json.data.videos : []) as TikTokVideo[],
    cursor: Number(json?.data?.cursor || 0) || undefined,
    hasMore: Boolean(json?.data?.has_more),
  }
}

function hashtags(text: string) {
  return Array.from(new Set((String(text || "").match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 12)
}

export async function storeTikTokConnection(args: {
  userKey: string
  token: TikTokTokenResponse
  user: TikTokUser
}) {
  const now = Date.now()
  const accessEncrypted = encryptShortsToken(args.token.access_token)
  const refreshEncrypted = encryptShortsToken(args.token.refresh_token)
  if (!accessEncrypted || !refreshEncrypted) throw new Error("TIKTOK_TOKEN_ENCRYPTION_FAILED")

  const accessExpiresAt = new Date(now + Math.max(60, Number(args.token.expires_in || 86400)) * 1000).toISOString()
  const refreshExpiresAt = new Date(now + Math.max(3600, Number(args.token.refresh_expires_in || 31536000)) * 1000).toISOString()
  const scopes = String(args.token.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean)

  await shortsSupabaseRequest("malik_shorts_external_accounts?on_conflict=user_key,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_key: args.userKey,
      provider: "tiktok",
      provider_user_id: args.user.open_id,
      username: args.user.display_name || null,
      display_name: args.user.display_name || null,
      avatar_url: args.user.avatar_large_url || args.user.avatar_url || null,
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      granted_scopes: scopes,
      token_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      metadata: {
        union_id: args.user.union_id || null,
        profile_deep_link: args.user.profile_deep_link || null,
        bio_description: args.user.bio_description || null,
        is_verified: Boolean(args.user.is_verified),
        follower_count: Number(args.user.follower_count || 0),
        following_count: Number(args.user.following_count || 0),
        likes_count: Number(args.user.likes_count || 0),
        video_count: Number(args.user.video_count || 0),
      },
      updated_at: new Date().toISOString(),
    }),
  })
}

export async function materializeTikTokVideos(userKey: string, videos: TikTokVideo[]) {
  if (!videos.length) return [] as any[]
  const posts = videos.map((video) => ({
    creator_key: userKey,
    source: "tiktok",
    source_id: video.id,
    source_url: video.share_url || null,
    playback_kind: "tiktok",
    poster_url: video.cover_image_url || null,
    caption: String(video.video_description || video.title || "").slice(0, 2200),
    hashtags: hashtags(`${video.video_description || ""} ${video.title || ""}`),
    duration_seconds: video.duration == null ? null : Math.max(0, Math.floor(video.duration)),
    status: "published",
    visibility: "public",
    can_remix: false,
    can_download: false,
    attribution_required: true,
    published_at: video.create_time ? new Date(Number(video.create_time) * 1000).toISOString() : new Date().toISOString(),
  }))
  const rows = await shortsSupabaseRequest<any[]>("malik_shorts_posts?on_conflict=source,source_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(posts),
  })
  const postBySourceId = new Map((rows || []).map((row) => [String(row.source_id), String(row.id)]))
  const counters = videos.flatMap((video) => {
    const postId = postBySourceId.get(video.id)
    return postId ? [{
      post_id: postId,
      external_views: Number(video.view_count || 0),
      external_likes: Number(video.like_count || 0),
      external_comments: Number(video.comment_count || 0),
      external_shares: Number(video.share_count || 0),
      updated_at: new Date().toISOString(),
    }] : []
  })
  if (counters.length) {
    await shortsSupabaseRequest("malik_shorts_counters?on_conflict=post_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(counters),
    })
  }
  return rows || []
}

export async function getStoredTikTokConnection(userKey: string) {
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_external_accounts?select=*&user_key=eq.${encodeURIComponent(userKey)}&provider=eq.tiktok&limit=1`,
  )
  return rows?.[0] || null
}

export async function getFreshTikTokAccessToken(userKey: string) {
  const connection = await getStoredTikTokConnection(userKey)
  if (!connection) throw new Error("TIKTOK_NOT_CONNECTED")
  const expiresAt = Date.parse(String(connection.token_expires_at || ""))
  const accessToken = decryptShortsToken(connection.access_token_encrypted)
  if (accessToken && Number.isFinite(expiresAt) && expiresAt - Date.now() > 5 * 60 * 1000) return accessToken

  const refreshToken = decryptShortsToken(connection.refresh_token_encrypted)
  if (!refreshToken) throw new Error("TIKTOK_REFRESH_TOKEN_MISSING")
  const refreshed = await refreshTikTokToken(refreshToken)
  const user = await fetchTikTokUser(refreshed.access_token)
  await storeTikTokConnection({ userKey, token: refreshed, user })
  return refreshed.access_token
}
