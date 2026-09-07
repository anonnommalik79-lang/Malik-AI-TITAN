import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest, stableShortId } from "@/lib/shorts/server"
import { rowMetrics, rowPublicHandle } from "@/lib/shorts/feed-row"
import { parseTikTokHandle, resolvePublicHandle } from "@/lib/shorts/tiktok-identity"
import { channelIdValid, durationSeconds, videoIdValid } from "@/lib/youtube/contracts"

export const dynamic = "force-dynamic"

type YouTubeResource = {
  id: string
  snippet?: Record<string, any>
  statistics?: Record<string, any>
  contentDetails?: Record<string, any>
  status?: Record<string, any>
}

type YouTubeList = {
  items?: YouTubeResource[]
  nextPageToken?: string
}

function count(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function youtubeApiKey() {
  return String(process.env.YOUTUBE_API_KEY || process.env.GOOGLE_YOUTUBE_API_KEY || "").trim()
}

async function youtubePublic(path: string, params: Record<string, string>) {
  const key = youtubeApiKey()
  if (!key) throw new Error("YOUTUBE_API_NOT_CONFIGURED")
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  for (const [name, value] of Object.entries({ ...params, key })) {
    if (value) url.searchParams.set(name, value)
  }
  const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(15_000) })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(json?.error?.errors?.[0]?.reason || json?.error?.message || `YOUTUBE_${response.status}`))
  return json as YouTubeList
}

function youtubeAvatar(snippet: Record<string, any>) {
  return snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || null
}

function youtubeHandle(snippet: Record<string, any>) {
  const value = String(snippet?.customUrl || "").trim().replace(/^@+/, "")
  return value || null
}

function youtubeUsername(channelId: string, handle: string | null) {
  if (handle) return handle.replace(/[^A-Za-z0-9._]/g, "").slice(0, 32) || `yt.${channelId.slice(-24)}`.slice(0, 32)
  return `yt.${channelId.replace(/[^A-Za-z0-9._]/g, "").slice(-24)}`.slice(0, 32)
}

async function channelIdFromVideo(videoId: string) {
  if (!videoIdValid(videoId)) return null
  const result = await youtubePublic("videos", { part: "snippet", id: videoId })
  const channelId = String(result.items?.[0]?.snippet?.channelId || "")
  return channelIdValid(channelId) ? channelId : null
}

async function resolveTarget(request: NextRequest) {
  const userKey = safeText(request.nextUrl.searchParams.get("userKey"), 180)
  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  const videoId = safeText(request.nextUrl.searchParams.get("videoId"), 40)

  if (userKey.startsWith("youtube:")) {
    const channelId = userKey.slice("youtube:".length)
    if (channelIdValid(channelId)) return { kind: "youtube" as const, channelId, userKey }
  }

  if (videoIdValid(videoId)) {
    const channelId = await channelIdFromVideo(videoId).catch(() => null)
    if (channelId) return { kind: "youtube" as const, channelId, userKey: `youtube:${channelId}` }
  }

  if (shortId && getShortsSupabaseConfig()) {
    const rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_posts?select=id,creator_key,source,source_id&id=eq.${encodeURIComponent(shortId)}&limit=1`,
    ).catch(() => [])
    const post = rows?.[0]
    if (post) {
      const creatorKey = String(post.creator_key || "")
      if (String(post.source) === "youtube") {
        const embeddedChannelId = creatorKey.startsWith("youtube:") ? creatorKey.slice("youtube:".length) : ""
        if (channelIdValid(embeddedChannelId)) return { kind: "youtube" as const, channelId: embeddedChannelId, userKey: creatorKey }
        const sourceId = String(post.source_id || "")
        const channelId = await channelIdFromVideo(sourceId).catch(() => null)
        if (channelId) return { kind: "youtube" as const, channelId, userKey: `youtube:${channelId}` }
      }
      return { kind: "database" as const, userKey: creatorKey }
    }
  }

  if (userKey) return { kind: "database" as const, userKey }
  return null
}

async function youtubeAuthor(channelId: string, cursor: string) {
  const channelResult = await youtubePublic("channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId,
    maxResults: "1",
  })
  const channel = channelResult.items?.[0]
  if (!channel) return null

  const snippet = channel.snippet || {}
  const statistics = channel.statistics || {}
  const uploads = String(channel.contentDetails?.relatedPlaylists?.uploads || "")
  const handle = youtubeHandle(snippet)
  const userKey = `youtube:${channelId}`

  let page: YouTubeList = { items: [] }
  if (uploads) {
    page = await youtubePublic("playlistItems", {
      part: "contentDetails,snippet",
      playlistId: uploads,
      maxResults: "50",
      pageToken: cursor,
    })
  }

  const ids = (page.items || [])
    .map((item) => String(item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || ""))
    .filter(videoIdValid)
  const details = ids.length
    ? await youtubePublic("videos", { part: "snippet,statistics,contentDetails,status", id: ids.join(",") })
    : { items: [] as YouTubeResource[] }
  const byId = new Map<string, YouTubeResource>((details.items || []).map((item) => [String(item.id), item]))

  const videos = ids.flatMap((id) => {
    const item = byId.get(id)
    if (!item) return []
    const videoSnippet = item.snippet || {}
    const videoStats = item.statistics || {}
    const thumbnail = videoSnippet?.thumbnails?.maxres?.url
      || videoSnippet?.thumbnails?.standard?.url
      || videoSnippet?.thumbnails?.high?.url
      || videoSnippet?.thumbnails?.medium?.url
      || null
    return [{
      id: stableShortId("youtube", id),
      source: "youtube",
      sourceId: id,
      sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      posterUrl: thumbnail,
      mediaUrl: null,
      caption: String(videoSnippet.title || ""),
      description: String(videoSnippet.description || ""),
      publishedAt: String(videoSnippet.publishedAt || ""),
      durationSeconds: durationSeconds(String(item.contentDetails?.duration || "")),
      embeddable: item.status?.embeddable !== false,
      metrics: {
        views: count(videoStats.viewCount),
        likes: count(videoStats.likeCount),
        comments: count(videoStats.commentCount),
        reposts: 0,
        saves: 0,
        shares: 0,
      },
    }]
  })

  const profile = {
    userKey,
    username: youtubeUsername(channelId, handle),
    handle,
    displayName: String(snippet.title || "YouTube"),
    avatarUrl: youtubeAvatar(snippet),
    bio: String(snippet.description || ""),
    verified: false,
    followerCount: statistics.hiddenSubscriberCount ? undefined : count(statistics.subscriberCount),
    followingCount: undefined,
    totalLikes: undefined,
    postCount: count(statistics.videoCount),
    source: "youtube",
    channelId,
  }

  if (getShortsSupabaseConfig()) {
    await shortsSupabaseRequest(`malik_shorts_profiles?user_key=eq.${encodeURIComponent(userKey)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        display_name: profile.displayName.slice(0, 80),
        avatar_url: profile.avatarUrl,
        bio: profile.bio.slice(0, 240),
      }),
    }).catch(() => null)
  }

  return {
    profile,
    viewer: { isSelf: false, following: false },
    private: false,
    videos,
    nextCursor: page.nextPageToken || null,
  }
}

function profileShape(row: any, handle: string | null, source: string) {
  return {
    userKey: String(row.user_key),
    username: String(row.username),
    handle,
    displayName: String(row.display_name || row.username),
    avatarUrl: row.avatar_url || null,
    bio: String(row.bio || ""),
    verified: Boolean(row.verified),
    followerCount: count(row.follower_count),
    followingCount: count(row.following_count),
    totalLikes: count(row.total_likes),
    postCount: count(row.post_count),
    source,
  }
}

async function databaseAuthor(userKey: string, cursor: string, viewerKey?: string) {
  if (!getShortsSupabaseConfig()) return { status: 503, body: { error: "SHORTS_DB_NOT_CONFIGURED" } }
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_profiles?select=*&user_key=eq.${encodeURIComponent(userKey)}&limit=1`,
  ).catch(() => [])
  const row = rows?.[0]
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } }

  const offset = Math.max(0, Math.min(10_000, Math.floor(Number(cursor) || 0)))
  if (row.private_account && viewerKey !== row.user_key) {
    const following = viewerKey
      ? await shortsSupabaseRequest<any[]>(`malik_shorts_follows?select=follower_key&follower_key=eq.${encodeURIComponent(viewerKey)}&following_key=eq.${encodeURIComponent(row.user_key)}&limit=1`).catch(() => [])
      : []
    if (!following.length) {
      const source = String(row.user_key).startsWith("tiktok:") ? "tiktok" : "malik"
      return {
        status: 200,
        body: { profile: profileShape(row, null, source), viewer: { isSelf: false, following: false }, private: true, videos: [], nextCursor: null },
      }
    }
  }

  const posts = await shortsSupabaseRequest<any[]>(
    `malik_shorts_feed_v1?select=*&creator_key=eq.${encodeURIComponent(row.user_key)}&order=published_at.desc.nullslast,created_at.desc&limit=60&offset=${offset}`,
  ).catch(() => [])
  const followRows = viewerKey && viewerKey !== row.user_key
    ? await shortsSupabaseRequest<any[]>(`malik_shorts_follows?select=follower_key&follower_key=eq.${encodeURIComponent(viewerKey)}&following_key=eq.${encodeURIComponent(row.user_key)}&limit=1`).catch(() => [])
    : []
  const source = String(posts[0]?.source || (String(row.user_key).startsWith("tiktok:") ? "tiktok" : "malik"))
  const handle = resolvePublicHandle({
    handle: posts.map((post) => parseTikTokHandle(post.source_url)).find(Boolean) || null,
    username: row.username,
  })

  return {
    status: 200,
    body: {
      profile: profileShape(row, handle, source),
      viewer: { isSelf: viewerKey === row.user_key, following: followRows.length > 0 },
      private: false,
      videos: posts.map((post) => ({
        id: String(post.id),
        source: String(post.source || "malik"),
        sourceId: post.source_id || null,
        sourceUrl: post.source_url || null,
        mediaUrl: post.media_url || null,
        posterUrl: post.poster_url || null,
        caption: String(post.caption || ""),
        description: String(post.caption || ""),
        publishedAt: post.published_at || null,
        durationSeconds: post.duration_seconds == null ? undefined : Number(post.duration_seconds),
        embeddable: true,
        metrics: rowMetrics(post),
        creatorHandle: rowPublicHandle(post),
      })),
      nextCursor: posts.length === 60 ? String(offset + 60) : null,
    },
  }
}

export async function GET(request: NextRequest) {
  const cursor = safeText(request.nextUrl.searchParams.get("cursor"), 1024)
  const { user } = await getOptionalWorkOSAuth()
  const target = await resolveTarget(request).catch(() => null)
  if (!target) return NextResponse.json({ error: "AUTHOR_REQUIRED" }, { status: 400 })

  if (target.kind === "youtube") {
    try {
      const result = await youtubeAuthor(target.channelId, cursor)
      if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error)
      console.error("[Malik Shorts] author YouTube load failed", message)
      return NextResponse.json({ error: message === "YOUTUBE_API_NOT_CONFIGURED" ? message : "AUTHOR_YOUTUBE_UNAVAILABLE" }, { status: message === "YOUTUBE_API_NOT_CONFIGURED" ? 503 : 502 })
    }
  }

  const result = await databaseAuthor(target.userKey, cursor, user?.id)
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } })
}
