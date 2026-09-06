import "server-only"

import { getTikTokShortsConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import { parseTikTokHandle, tiktokCreatorKey, tiktokUsernameCandidates } from "@/lib/shorts/tiktok-identity"
import { decideTikTokSync, type TikTokSyncState } from "@/lib/shorts/tiktok-sync-policy"
import { decryptShortsToken, encryptShortsToken } from "@/lib/shorts/token-vault"

export { tiktokCreatorKey }

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

/**
 * Pick the username this creator will keep.
 *
 * Two rules make it safe. A profile that already exists keeps the username it
 * has - resolution runs once, on first import, and never churns afterwards.
 * And a name already owned by somebody else is skipped rather than written,
 * because malik_shorts_profiles.username is unique and a clash would fail the
 * whole import over a name that nobody sees.
 *
 * The candidate list is deterministic (lib/shorts/tiktok-identity.ts) and its
 * last entry is derived from the open id alone, so this cannot run out.
 */
export async function resolveTikTokUsername(creatorKey: string, openId: string, handle?: string | null) {
  const existing = await shortsSupabaseRequest<any[]>(
    `malik_shorts_profiles?select=username&user_key=eq.${encodeURIComponent(creatorKey)}&limit=1`,
  ).catch(() => [] as any[])
  if (existing?.[0]?.username) return String(existing[0].username)

  const candidates = tiktokUsernameCandidates(openId, handle)
  const taken = await shortsSupabaseRequest<any[]>(
    `malik_shorts_profiles?select=username,user_key&username=in.(${candidates.map((name) => `"${name}"`).join(",")})`,
  ).catch(() => [] as any[])

  const owners = new Map((taken || []).map((row) => [String(row.username), String(row.user_key)]))
  for (const candidate of candidates) {
    const owner = owners.get(candidate)
    if (!owner || owner === creatorKey) return candidate
  }
  // Unreachable in practice - the hash candidate is unique per open id - but a
  // name is still needed if it ever happens, and this one is deterministic too.
  return candidates[candidates.length - 1]
}

/**
 * Give the TikTok creator a profile row before their videos reference it.
 *
 * malik_shorts_posts.creator_key is a foreign key into malik_shorts_profiles,
 * so importing videos without this insert fails the whole batch - and it failed
 * quietly, because the import path only logged. The row also carries what other
 * viewers see: a TikTok in the shared feed shows the TikTok creator's name and
 * avatar, not the Malik account that happened to connect it.
 *
 * follower_count, following_count and total_likes are deliberately NOT written
 * here. malik_shorts_interact and the follow RPC increment those same columns
 * for the Malik social graph, so writing TikTok's numbers into them would make
 * every sync silently undo every follow and like earned inside Malik. TikTok's
 * own figures live in the connection's metadata, which nothing else mutates.
 */
export async function materializeTikTokProfile(user: TikTokUser) {
  const key = tiktokCreatorKey(user.open_id)
  const handle = parseTikTokHandle(user.profile_deep_link)
  const username = await resolveTikTokUsername(key, user.open_id, handle)

  await shortsSupabaseRequest("malik_shorts_profiles?on_conflict=user_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_key: key,
      username,
      // The real @handle, when TikTok gave one, is shown here rather than in
      // the username - the username is a Malik-namespaced key, the display name
      // is what a person reads.
      display_name: String(user.display_name || handle || "TikTok").slice(0, 120),
      avatar_url: user.avatar_large_url || user.avatar_url_100 || user.avatar_url || null,
      bio: String(user.bio_description || "").slice(0, 500),
      verified: Boolean(user.is_verified),
      updated_at: new Date().toISOString(),
    }]),
  })
  return key
}

/**
 * The profile key this Malik user's TikToks are filed under, or null when the
 * account is not connected. One cheap read; no TikTok call.
 */
export async function getTikTokCreatorKey(userKey: string): Promise<string | null> {
  const connection = await getStoredTikTokConnection(userKey).catch(() => null)
  return connection?.provider_user_id ? tiktokCreatorKey(String(connection.provider_user_id)) : null
}

/**
 * Rebuild the creator from what the connection row already stored.
 *
 * The import path is reached from the feed too, where re-calling user/info on
 * every request would spend a TikTok rate-limit slot to learn something that is
 * sitting in our own table.
 */
export async function tiktokCreatorFromConnection(userKey: string): Promise<TikTokUser | null> {
  const connection = await getStoredTikTokConnection(userKey).catch(() => null)
  if (!connection?.provider_user_id) return null
  const meta = connection.metadata || {}
  return {
    open_id: String(connection.provider_user_id),
    union_id: meta.union_id || undefined,
    avatar_url: connection.avatar_url || undefined,
    avatar_large_url: connection.avatar_url || undefined,
    display_name: connection.display_name || connection.username || undefined,
    profile_deep_link: meta.profile_deep_link || undefined,
    bio_description: meta.bio_description || undefined,
    is_verified: Boolean(meta.is_verified),
    follower_count: Number(meta.follower_count || 0),
    following_count: Number(meta.following_count || 0),
    likes_count: Number(meta.likes_count || 0),
    video_count: Number(meta.video_count || 0),
  }
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

/**
 * Import a creator's public TikToks into the shared Malik Shorts pool.
 *
 * `creator` is optional: pass it right after an OAuth exchange, when the fresh
 * user/info response is already in hand, and leave it out anywhere else - the
 * stored connection row has everything needed.
 *
 * The posts land in malik_shorts_posts as public, published rows exactly like
 * imported YouTube videos, which is what puts them in every viewer's feed. Only
 * the creator needs a TikTok connection; nobody needs one to watch. Rights stay
 * closed - no remix, no download, attribution required - because these are
 * somebody else's videos being shown under TikTok's terms, not ours to reuse.
 */
export async function materializeTikTokVideos(userKey: string, videos: TikTokVideo[], creator?: TikTokUser) {
  if (!videos.length) return [] as any[]

  const owner = creator || await tiktokCreatorFromConnection(userKey)
  if (!owner?.open_id) throw new Error("TIKTOK_CREATOR_UNKNOWN")

  // The profile has to exist first: posts.creator_key is a foreign key into it.
  const creatorKey = await materializeTikTokProfile(owner)

  const posts = videos.map((video) => ({
    creator_key: creatorKey,
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

/**
 * Everything the sync policy needs, in two reads and no TikTok call.
 *
 * The post lookup is by creator key with `limit=1`, so the answer does not
 * depend on how many rows the feed happened to load - the old check searched
 * the current page of the feed and concluded "not imported" whenever a
 * creator's videos sat past row 18.
 */
export async function readTikTokSyncState(userKey: string): Promise<TikTokSyncState> {
  const connection = await getStoredTikTokConnection(userKey).catch(() => null)
  if (!connection?.provider_user_id) {
    return { connected: false, creatorKey: null, hasPosts: false }
  }

  const creatorKey = tiktokCreatorKey(String(connection.provider_user_id))
  const meta = connection.metadata || {}

  const newest = await shortsSupabaseRequest<any[]>(
    `malik_shorts_posts?select=created_at&source=eq.tiktok&creator_key=eq.${
      encodeURIComponent(creatorKey)
    }&order=created_at.desc&limit=1`,
  ).catch(() => [] as any[])

  return {
    connected: true,
    creatorKey,
    lastSyncAt: meta.last_sync_at || null,
    lastErrorAt: meta.last_sync_error_at || null,
    hasPosts: Boolean(newest?.length),
    newestPostAt: newest?.[0]?.created_at || null,
  }
}

/**
 * Stamp the outcome of an import onto the connection's metadata.
 *
 * Read-modify-write because PostgREST cannot merge jsonb in a PATCH body, and
 * the whole object is small. A failure timestamp is what stops a revoked app
 * from producing one doomed TikTok call per feed request.
 */
export async function recordTikTokSyncResult(userKey: string, outcome: { ok: boolean; error?: string; imported?: number }) {
  const connection = await getStoredTikTokConnection(userKey).catch(() => null)
  if (!connection) return
  const now = new Date().toISOString()
  const metadata = {
    ...(connection.metadata || {}),
    ...(outcome.ok
      ? { last_sync_at: now, last_sync_error_at: null, last_sync_error: null, last_sync_imported: Number(outcome.imported || 0) }
      : { last_sync_error_at: now, last_sync_error: String(outcome.error || "unknown").slice(0, 200) }),
  }
  await shortsSupabaseRequest(
    `malik_shorts_external_accounts?user_key=eq.${encodeURIComponent(userKey)}&provider=eq.tiktok`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ metadata, updated_at: now }) },
  ).catch((error) => {
    console.warn("[Malik Shorts] TikTok sync stamp failed", String(error instanceof Error ? error.message : error).slice(0, 160))
  })
}

/** Should the feed import this viewer's TikTok right now, and why. */
export async function shouldSyncViewerTikTok(userKey: string, now = Date.now()) {
  const state = await readTikTokSyncState(userKey).catch(() => ({ connected: false, creatorKey: null, hasPosts: false } as TikTokSyncState))
  return { state, decision: decideTikTokSync(state, now) }
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
