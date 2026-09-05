import "server-only"

import { getYouTubeOAuthConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import { decryptShortsToken, encryptShortsToken } from "@/lib/shorts/token-vault"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3"

export type YouTubeTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

export type YouTubeChannel = {
  id: string
  snippet?: {
    title?: string
    description?: string
    customUrl?: string
    thumbnails?: Record<string, { url?: string }>
  }
  statistics?: {
    viewCount?: string
    subscriberCount?: string
    hiddenSubscriberCount?: boolean
    videoCount?: string
  }
  contentDetails?: {
    relatedPlaylists?: { uploads?: string; likes?: string }
  }
}

export type YouTubeVideo = {
  id: string
  snippet?: {
    channelId?: string
    channelTitle?: string
    title?: string
    description?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string }>
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
  }
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean; privacyStatus?: string }
}

function text(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max)
}

function number(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function isoDurationSeconds(value?: string) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return undefined
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

function hashtags(value: string) {
  return Array.from(new Set((String(value || "").match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 12)
}

async function readJson(response: Response) {
  const raw = await response.text()
  try { return raw ? JSON.parse(raw) : {} } catch { return { raw: raw.slice(0, 400) } }
}

function assertOk(response: Response, json: any, label: string) {
  if (!response.ok || json?.error) {
    const reason = json?.error?.message || json?.error_description || json?.error || response.status
    throw new Error(`${label}:${String(reason).slice(0, 180)}`)
  }
}

export async function exchangeYouTubeCode(code: string) {
  const config = getYouTubeOAuthConfig()
  if (!config) throw new Error("YOUTUBE_OAUTH_NOT_CONFIGURED")
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  })
  const json = await readJson(response)
  assertOk(response, json, "YOUTUBE_TOKEN_EXCHANGE_FAILED")
  if (!json?.access_token) throw new Error("YOUTUBE_TOKEN_MISSING")
  return json as YouTubeTokenResponse
}

export async function refreshYouTubeToken(refreshToken: string) {
  const config = getYouTubeOAuthConfig()
  if (!config) throw new Error("YOUTUBE_OAUTH_NOT_CONFIGURED")
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  })
  const json = await readJson(response)
  assertOk(response, json, "YOUTUBE_TOKEN_REFRESH_FAILED")
  if (!json?.access_token) throw new Error("YOUTUBE_REFRESH_TOKEN_MISSING_ACCESS")
  return json as YouTubeTokenResponse
}

async function youtubeGet(path: string, accessToken: string) {
  const response = await fetch(`${YOUTUBE_API}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const json = await readJson(response)
  assertOk(response, json, "YOUTUBE_API_FAILED")
  return json
}

async function youtubeWrite(path: string, accessToken: string, init: RequestInit) {
  const response = await fetch(`${YOUTUBE_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  })
  const json = response.status === 204 ? {} : await readJson(response)
  assertOk(response, json, "YOUTUBE_WRITE_FAILED")
  return json
}

export async function fetchMyYouTubeChannel(accessToken: string) {
  const json = await youtubeGet("channels?part=snippet,statistics,contentDetails&mine=true&maxResults=1", accessToken)
  const channel = Array.isArray(json?.items) ? json.items[0] : null
  if (!channel?.id) throw new Error("YOUTUBE_CHANNEL_NOT_FOUND")
  return channel as YouTubeChannel
}

export async function fetchYouTubeChannelById(accessToken: string, channelId: string) {
  const json = await youtubeGet(`channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}&maxResults=1`, accessToken)
  const channel = Array.isArray(json?.items) ? json.items[0] : null
  if (!channel?.id) throw new Error("YOUTUBE_CHANNEL_NOT_FOUND")
  return channel as YouTubeChannel
}

export async function fetchYouTubeUploads(accessToken: string, channel: YouTubeChannel, maxVideos = 200) {
  const playlistId = channel.contentDetails?.relatedPlaylists?.uploads
  if (!playlistId) return [] as YouTubeVideo[]

  const ids: string[] = []
  let pageToken = ""
  while (ids.length < Math.max(1, Math.min(500, maxVideos))) {
    const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
    const json = await youtubeGet(`playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${token}`, accessToken)
    for (const item of Array.isArray(json?.items) ? json.items : []) {
      const id = text(item?.contentDetails?.videoId, 128)
      if (id && !ids.includes(id)) ids.push(id)
      if (ids.length >= maxVideos) break
    }
    pageToken = text(json?.nextPageToken, 256)
    if (!pageToken) break
  }

  const videos: YouTubeVideo[] = []
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50)
    const json = await youtubeGet(`videos?part=snippet,statistics,contentDetails,status&id=${encodeURIComponent(batch.join(","))}&maxResults=50`, accessToken)
    for (const item of Array.isArray(json?.items) ? json.items : []) if (item?.id) videos.push(item as YouTubeVideo)
  }
  return videos
}

export async function storeYouTubeConnection(args: {
  userKey: string
  token: YouTubeTokenResponse
  channel: YouTubeChannel
  previousRefreshToken?: string | null
}) {
  const encryptedAccess = encryptShortsToken(args.token.access_token)
  const refreshPlain = args.token.refresh_token || args.previousRefreshToken || ""
  const encryptedRefresh = refreshPlain ? encryptShortsToken(refreshPlain) : null
  if (!encryptedAccess) throw new Error("YOUTUBE_TOKEN_ENCRYPTION_FAILED")

  const avatar = args.channel.snippet?.thumbnails?.high?.url || args.channel.snippet?.thumbnails?.medium?.url || args.channel.snippet?.thumbnails?.default?.url || null
  const scopes = String(args.token.scope || "").split(/[ ,]+/).map((scope) => scope.trim()).filter(Boolean)
  const expiresAt = new Date(Date.now() + Math.max(60, Number(args.token.expires_in || 3600)) * 1000).toISOString()

  await shortsSupabaseRequest("malik_shorts_external_accounts?on_conflict=user_key,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_key: args.userKey,
      provider: "youtube",
      provider_user_id: args.channel.id,
      username: args.channel.snippet?.customUrl || args.channel.snippet?.title || null,
      display_name: args.channel.snippet?.title || null,
      avatar_url: avatar,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      granted_scopes: scopes,
      token_expires_at: expiresAt,
      refresh_expires_at: null,
      metadata: {
        description: args.channel.snippet?.description || "",
        custom_url: args.channel.snippet?.customUrl || null,
        uploads_playlist: args.channel.contentDetails?.relatedPlaylists?.uploads || null,
        likes_playlist: args.channel.contentDetails?.relatedPlaylists?.likes || null,
        subscriber_count: number(args.channel.statistics?.subscriberCount),
        hidden_subscriber_count: Boolean(args.channel.statistics?.hiddenSubscriberCount),
        video_count: number(args.channel.statistics?.videoCount),
        view_count: number(args.channel.statistics?.viewCount),
      },
      updated_at: new Date().toISOString(),
    }),
  })
}

export async function materializeYouTubeCreatorVideos(userKey: string, videos: YouTubeVideo[]) {
  if (!videos.length) return [] as any[]
  const posts = videos.map((video) => ({
    creator_key: userKey,
    source: "youtube",
    source_id: video.id,
    source_url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    playback_kind: "youtube",
    poster_url: video.snippet?.thumbnails?.maxres?.url || video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.medium?.url || null,
    caption: text(video.snippet?.title || video.snippet?.description, 2200),
    hashtags: hashtags(`${video.snippet?.title || ""} ${video.snippet?.description || ""}`),
    duration_seconds: isoDurationSeconds(video.contentDetails?.duration) || null,
    status: video.status?.privacyStatus === "public" ? "published" : "limited",
    visibility: video.status?.privacyStatus === "public" ? "public" : "private",
    can_remix: false,
    can_download: false,
    attribution_required: true,
    published_at: video.snippet?.publishedAt || new Date().toISOString(),
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
      external_views: number(video.statistics?.viewCount),
      external_likes: number(video.statistics?.likeCount),
      external_comments: number(video.statistics?.commentCount),
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

export async function getStoredYouTubeConnection(userKey: string) {
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_external_accounts?select=*&user_key=eq.${encodeURIComponent(userKey)}&provider=eq.youtube&limit=1`,
  )
  return rows?.[0] || null
}

export async function getFreshYouTubeAccessToken(userKey: string) {
  const connection = await getStoredYouTubeConnection(userKey)
  if (!connection) throw new Error("YOUTUBE_NOT_CONNECTED")
  const expiresAt = Date.parse(String(connection.token_expires_at || ""))
  const accessToken = decryptShortsToken(connection.access_token_encrypted)
  if (accessToken && Number.isFinite(expiresAt) && expiresAt - Date.now() > 5 * 60 * 1000) return accessToken

  const refreshToken = decryptShortsToken(connection.refresh_token_encrypted)
  if (!refreshToken) throw new Error("YOUTUBE_REFRESH_TOKEN_MISSING")
  const refreshed = await refreshYouTubeToken(refreshToken)
  const channel = await fetchMyYouTubeChannel(refreshed.access_token)
  await storeYouTubeConnection({ userKey, token: refreshed, channel, previousRefreshToken: refreshToken })
  return refreshed.access_token
}

export async function fetchYouTubeCommentThreads(accessToken: string, videoId: string, pageToken?: string, maxResults = 100) {
  const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
  const json = await youtubeGet(`commentThreads?part=snippet,replies&videoId=${encodeURIComponent(videoId)}&maxResults=${Math.max(1, Math.min(100, maxResults))}&order=relevance&textFormat=plainText${token}`, accessToken)
  return {
    items: Array.isArray(json?.items) ? json.items : [],
    nextPageToken: text(json?.nextPageToken, 256) || undefined,
  }
}

export async function fetchYouTubeReplies(accessToken: string, parentId: string, pageToken?: string, maxResults = 100) {
  const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
  const json = await youtubeGet(`comments?part=snippet&parentId=${encodeURIComponent(parentId)}&maxResults=${Math.max(1, Math.min(100, maxResults))}&textFormat=plainText${token}`, accessToken)
  return {
    items: Array.isArray(json?.items) ? json.items : [],
    nextPageToken: text(json?.nextPageToken, 256) || undefined,
  }
}

export async function createYouTubeComment(accessToken: string, videoId: string, body: string) {
  return youtubeWrite("commentThreads?part=snippet", accessToken, {
    method: "POST",
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text(body, 10000) } } } }),
  })
}

export async function replyYouTubeComment(accessToken: string, parentId: string, body: string) {
  return youtubeWrite("comments?part=snippet", accessToken, {
    method: "POST",
    body: JSON.stringify({ snippet: { parentId, textOriginal: text(body, 10000) } }),
  })
}

export async function rateYouTubeVideo(accessToken: string, videoId: string, rating: "like" | "dislike" | "none") {
  const response = await fetch(`${YOUTUBE_API}/videos/rate?id=${encodeURIComponent(videoId)}&rating=${rating}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`YOUTUBE_RATE_FAILED:${response.status}`)
}

export async function findMyYouTubeSubscription(accessToken: string, channelId: string) {
  const json = await youtubeGet(`subscriptions?part=id,snippet&mine=true&forChannelId=${encodeURIComponent(channelId)}&maxResults=50`, accessToken)
  return Array.isArray(json?.items) ? json.items[0] || null : null
}

export async function subscribeYouTubeChannel(accessToken: string, channelId: string) {
  const existing = await findMyYouTubeSubscription(accessToken, channelId)
  if (existing?.id) return existing
  return youtubeWrite("subscriptions?part=snippet", accessToken, {
    method: "POST",
    body: JSON.stringify({ snippet: { resourceId: { kind: "youtube#channel", channelId } } }),
  })
}

export async function unsubscribeYouTubeChannel(accessToken: string, channelId: string) {
  const existing = await findMyYouTubeSubscription(accessToken, channelId)
  if (!existing?.id) return
  const response = await fetch(`${YOUTUBE_API}/subscriptions?id=${encodeURIComponent(existing.id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!response.ok && response.status !== 404) throw new Error(`YOUTUBE_UNSUBSCRIBE_FAILED:${response.status}`)
}
