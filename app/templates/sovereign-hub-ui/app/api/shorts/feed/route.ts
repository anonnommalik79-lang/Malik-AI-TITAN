import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import {
  clampInt,
  getShortsSupabaseConfig,
  getYouTubeShortsConfig,
  shortsSupabaseRequest,
  stableShortId,
} from "@/lib/shorts/server"
import { buildRotatedFeed } from "@/lib/shorts/feed-rotation"
import { buildShortMetrics } from "@/lib/shorts/metrics"
import {
  fetchTikTokUser,
  fetchTikTokVideos,
  getFreshTikTokAccessToken,
  materializeTikTokVideos,
  recordTikTokSyncResult,
  shouldSyncViewerTikTok,
} from "@/lib/shorts/tiktok"
import type { MalikShortFeedResponse, MalikShortItem, MalikShortSource } from "@/lib/shorts/types"

export const dynamic = "force-dynamic"

type DbFeedRow = Record<string, any>
type YouTubeCandidate = {
  videoId: string
  channelId: string
  channelTitle: string
  channelHandle?: string
  channelAvatar?: string
  title: string
  description: string
  publishedAt?: string
  thumbnail?: string
  durationSeconds?: number
  views: number
  likes: number
  comments: number
}

function decodeEntities(value: string) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function isoDurationSeconds(value?: string) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return undefined
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

function count(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function extractHashtags(text: string) {
  return Array.from(new Set((String(text || "").match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 12)
}

function youtubeUsername(channelId: string, channelHandle?: string) {
  const handle = String(channelHandle || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(0, 32)
  if (handle) return handle
  return `yt.${channelId.replace(/[^A-Za-z0-9._]/g, "").slice(-24)}`.slice(0, 32)
}

function mapDbRow(row: DbFeedRow): MalikShortItem {
  const source = (["malik", "youtube", "tiktok"].includes(row.source) ? row.source : "malik") as MalikShortSource
  const playback = row.playback_kind === "youtube"
    ? { kind: "youtube" as const, videoId: String(row.source_id || "") }
    : row.playback_kind === "tiktok"
      ? { kind: "tiktok" as const, videoId: String(row.source_id || ""), canonicalUrl: row.source_url || undefined }
      : { kind: "native" as const, url: String(row.media_url || ""), poster: row.poster_url || undefined }

  return {
    id: String(row.id),
    source,
    sourceId: row.source_id || undefined,
    sourceUrl: row.source_url || undefined,
    posterUrl: row.poster_url || undefined,
    creator: {
      id: String(row.creator_key),
      username: String(row.username || "creator"),
      displayName: String(row.display_name || row.username || "Creator"),
      avatarUrl: row.avatar_url || undefined,
      bio: row.bio || undefined,
      verified: Boolean(row.verified),
      external: source !== "malik",
      claimed: source === "malik" || source === "tiktok",
    },
    playback,
    caption: String(row.caption || ""),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    language: row.language || undefined,
    region: row.region || undefined,
    durationSeconds: row.duration_seconds == null ? undefined : Number(row.duration_seconds),
    publishedAt: row.published_at || undefined,
    createdAt: row.created_at || undefined,
    // Display is external plus local, and both halves travel with the item so
    // an interaction response can replace one without erasing the other.
    // buildShortMetrics is the only place that arithmetic lives - see
    // lib/shorts/metrics.ts for why it is not a per-source branch.
    metrics: buildShortMetrics(
      { views: row.views, likes: row.likes, comments: row.comments, reposts: row.reposts, saves: row.saves, shares: row.shares },
      { views: row.external_views, likes: row.external_likes, comments: row.external_comments, shares: row.external_shares },
    ),
    viewer: { liked: false, saved: false, reposted: false, following: false },
    rights: {
      canRemix: Boolean(row.can_remix),
      canDownload: Boolean(row.can_download),
      canCrossPost: source === "malik",
      attributionRequired: Boolean(row.attribution_required),
    },
  }
}

async function fetchYouTubeCandidates(limit: number, language: string, region: string): Promise<YouTubeCandidate[]> {
  const config = getYouTubeShortsConfig()
  if (!config) return []

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", String(Math.min(24, Math.max(8, limit))))
  searchUrl.searchParams.set("regionCode", region.slice(0, 2).toUpperCase() || "KZ")
  searchUrl.searchParams.set("relevanceLanguage", language === "kk" ? "kk" : language === "en" ? "en" : "ru")
  searchUrl.searchParams.set("safeSearch", "moderate")
  searchUrl.searchParams.set("videoEmbeddable", "true")
  searchUrl.searchParams.set("videoSyndicated", "true")
  searchUrl.searchParams.set("videoDuration", "short")
  searchUrl.searchParams.set("order", "relevance")
  searchUrl.searchParams.set("q", language === "kk" ? "Қазақстан Алматы Астана қазақ" : language === "en" ? "Kazakhstan Almaty Astana" : "Казахстан Алматы Астана")
  searchUrl.searchParams.set("key", config.apiKey)

  const searchResponse = await fetch(searchUrl, { next: { revalidate: 180 } })
  if (!searchResponse.ok) return []
  const searchJson = await searchResponse.json()
  const ids = (Array.isArray(searchJson?.items) ? searchJson.items : [])
    .map((item: any) => item?.id?.videoId)
    .filter(Boolean)
    .slice(0, 24)
  if (!ids.length) return []

  const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos")
  videoUrl.searchParams.set("part", "snippet,statistics,contentDetails,status")
  videoUrl.searchParams.set("id", ids.join(","))
  videoUrl.searchParams.set("key", config.apiKey)
  const videoResponse = await fetch(videoUrl, { next: { revalidate: 180 } })
  if (!videoResponse.ok) return []
  const videoJson = await videoResponse.json()
  const videos = Array.isArray(videoJson?.items) ? videoJson.items : []
  const byId = new Map<string, any>(videos.map((item: any) => [String(item.id), item]))

  // The videos endpoint does not include the channel avatar. The original Malik
  // Shorts prototype explicitly called channels.list for this; production had
  // dropped that call, so the UI fell back to initials such as "AS". Restore
  // the real YouTube channel identity in one batched request.
  const channelIds = Array.from(new Set(videos.map((item: any) => String(item?.snippet?.channelId || "")).filter(Boolean)))
  const channelById = new Map<string, any>()
  if (channelIds.length) {
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels")
    channelUrl.searchParams.set("part", "snippet")
    channelUrl.searchParams.set("id", channelIds.slice(0, 50).join(","))
    channelUrl.searchParams.set("key", config.apiKey)
    const channelResponse = await fetch(channelUrl, { next: { revalidate: 180 } }).catch(() => null)
    if (channelResponse?.ok) {
      const channelJson = await channelResponse.json().catch(() => null)
      for (const channel of Array.isArray(channelJson?.items) ? channelJson.items : []) {
        if (channel?.id) channelById.set(String(channel.id), channel)
      }
    }
  }

  return ids.flatMap((videoId: string) => {
    const item = byId.get(videoId)
    if (!item || item?.status?.embeddable === false) return []
    const durationSeconds = isoDurationSeconds(item?.contentDetails?.duration)
    if (durationSeconds && durationSeconds > 240) return []

    const snippet = item?.snippet || {}
    const stats = item?.statistics || {}
    const channelId = String(snippet.channelId || "unknown")
    const channel = channelById.get(channelId)
    const channelSnippet = channel?.snippet || {}
    const channelAvatar = channelSnippet?.thumbnails?.high?.url
      || channelSnippet?.thumbnails?.medium?.url
      || channelSnippet?.thumbnails?.default?.url
      || undefined
    const channelTitle = decodeEntities(String(channelSnippet?.title || snippet.channelTitle || "Creator"))
    const channelHandle = String(channelSnippet?.customUrl || "").replace(/^@/, "") || undefined

    return [{
      videoId,
      channelId,
      channelTitle,
      channelHandle,
      channelAvatar,
      title: decodeEntities(String(snippet.title || "")),
      description: decodeEntities(String(snippet.description || "")),
      publishedAt: snippet.publishedAt,
      thumbnail: snippet?.thumbnails?.maxres?.url || snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url,
      durationSeconds,
      views: count(stats.viewCount),
      likes: count(stats.likeCount),
      comments: count(stats.commentCount),
    } satisfies YouTubeCandidate]
  })
}

async function materializeYouTube(candidates: YouTubeCandidate[]) {
  if (!getShortsSupabaseConfig() || !candidates.length) return new Map<string, string>()

  const profiles = Array.from(new Map(candidates.map((item) => [item.channelId, {
    user_key: `youtube:${item.channelId}`,
    username: youtubeUsername(item.channelId, item.channelHandle),
    display_name: item.channelTitle,
    avatar_url: item.channelAvatar || null,
    bio: "",
    locale: "ru",
    region: "KZ",
  }])).values())
  await shortsSupabaseRequest("malik_shorts_profiles?on_conflict=user_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(profiles),
  })

  const posts = candidates.map((item) => ({
    creator_key: `youtube:${item.channelId}`,
    source: "youtube",
    source_id: item.videoId,
    source_url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`,
    playback_kind: "youtube",
    poster_url: item.thumbnail || null,
    caption: item.title,
    hashtags: extractHashtags(`${item.title} ${item.description}`),
    language: "ru",
    region: "KZ",
    duration_seconds: item.durationSeconds || null,
    status: "published",
    visibility: "public",
    can_remix: false,
    can_download: false,
    attribution_required: true,
    published_at: item.publishedAt || new Date().toISOString(),
  }))
  const saved = await shortsSupabaseRequest<any[]>("malik_shorts_posts?on_conflict=source,source_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(posts),
  })

  const idMap = new Map<string, string>()
  for (const row of saved || []) if (row?.source_id && row?.id) idMap.set(String(row.source_id), String(row.id))
  const counters = candidates.flatMap((item) => {
    const postId = idMap.get(item.videoId)
    return postId ? [{
      post_id: postId,
      external_views: item.views,
      external_likes: item.likes,
      external_comments: item.comments,
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
  return idMap
}

function mapYouTubeCandidate(item: YouTubeCandidate, dbId?: string): MalikShortItem {
  return {
    id: dbId || stableShortId("youtube", item.videoId),
    source: "youtube",
    sourceId: item.videoId,
    sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`,
    posterUrl: item.thumbnail,
    creator: {
      id: `youtube:${item.channelId}`,
      username: youtubeUsername(item.channelId, item.channelHandle),
      displayName: item.channelTitle,
      avatarUrl: item.channelAvatar,
      external: true,
      claimed: false,
    },
    playback: { kind: "youtube", videoId: item.videoId },
    caption: item.title,
    hashtags: extractHashtags(`${item.title} ${item.description}`),
    language: "ru",
    region: "KZ",
    durationSeconds: item.durationSeconds,
    publishedAt: item.publishedAt,
    // A candidate straight off the YouTube API has no Malik-local history yet -
    // if it is already materialised the database copy wins deduplication and
    // brings the local counters with it. Same builder either way, so the two
    // paths cannot drift into showing different numbers for one video.
    metrics: buildShortMetrics(null, { views: item.views, likes: item.likes, comments: item.comments }),
    viewer: { liked: false, saved: false, reposted: false, following: false },
    rights: { canRemix: false, canDownload: false, canCrossPost: false, attributionRequired: true },
  }
}

async function hydrateViewerState(items: MalikShortItem[], userKey?: string) {
  if (!userKey || !getShortsSupabaseConfig()) return items
  const ids = items.map((item) => item.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) return items
  const inIds = `(${ids.join(",")})`
  const encodedUser = encodeURIComponent(userKey)

  const [likes, saves, reposts, follows] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_likes?select=post_id&user_key=eq.${encodedUser}&post_id=in.${inIds}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_saves?select=post_id&user_key=eq.${encodedUser}&post_id=in.${inIds}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_reposts?select=post_id&user_key=eq.${encodedUser}&post_id=in.${inIds}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_follows?select=following_key&follower_key=eq.${encodedUser}&limit=500`).catch(() => []),
  ])
  const liked = new Set(likes.map((row) => String(row.post_id)))
  const saved = new Set(saves.map((row) => String(row.post_id)))
  const reposted = new Set(reposts.map((row) => String(row.post_id)))
  const following = new Set(follows.map((row) => String(row.following_key)))
  return items.map((item) => ({
    ...item,
    viewer: {
      liked: liked.has(item.id),
      saved: saved.has(item.id),
      reposted: reposted.has(item.id),
      following: following.has(item.creator.id),
    },
  }))
}

/*
 * Dedupe and provider rotation live in lib/shorts/feed-rotation.ts.
 *
 * They used to be here, built on Math.random - one of three hard-coded patterns
 * picked per request, with each bucket shuffled first. That made the order
 * unexplainable to a viewer refreshing the page and untestable for us. The
 * helper is deterministic round-robin and has its own test script; this route
 * just calls it.
 */

async function loadDbFeed(limit: number) {
  if (!getShortsSupabaseConfig()) return [] as MalikShortItem[]
  const rows = await shortsSupabaseRequest<DbFeedRow[]>(
    `malik_shorts_feed_v1?select=*&source=in.(malik,tiktok,youtube)&order=published_at.desc.nullslast,created_at.desc&limit=${Math.min(limit * 4, 100)}`,
  ).catch(() => [] as DbFeedRow[])
  return rows.map(mapDbRow)
}

/**
 * Opportunistic import of the viewer's own TikTok.
 *
 * Whether to run at all is decided by shouldSyncViewerTikTok, which asks about
 * this creator's materialised posts directly and honours a freshness window and
 * an error cooldown. Two earlier versions of that question were wrong: "does
 * the pool contain any TikTok" stopped importing everyone after the first
 * creator connected, and "is a TikTok in the loaded feed page" depended on
 * `limit` and re-hit the API on every page load.
 *
 * Failures are recorded, not just logged. The stamp is what stops a revoked app
 * or an expired refresh token from producing one doomed TikTok call per
 * request, and the viewer keeps getting YouTube and Malik posts throughout -
 * both are already loaded before this runs.
 */
async function pullOwnTikTok(userKey: string, creatorKey: string) {
  try {
    const accessToken = await getFreshTikTokAccessToken(userKey)
    const [creator, page] = await Promise.all([
      fetchTikTokUser(accessToken),
      fetchTikTokVideos(accessToken, 20),
    ])
    if (!page.videos.length) {
      // An empty account is a successful sync. Without the stamp it would look
      // never-synced forever and call TikTok on every single request.
      await recordTikTokSyncResult(userKey, { ok: true, imported: 0 })
      return 0
    }
    const rows = await materializeTikTokVideos(userKey, page.videos, creator)
    await recordTikTokSyncResult(userKey, { ok: true, imported: rows.length })
    return rows.length
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 200)
    console.warn(`[Malik Shorts] tiktok import failed provider=tiktok user=${userKey} creator=${creatorKey}: ${message}`)
    await recordTikTokSyncResult(userKey, { ok: false, error: message })
    return 0
  }
}

export async function GET(request: NextRequest) {
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 6, 30, 16)
  const language = request.nextUrl.searchParams.get("lang") || "ru"
  const region = request.nextUrl.searchParams.get("region") || "KZ"
  const { user } = await getOptionalWorkOSAuth()

  let dbItems = await loadDbFeed(limit)

  if (user?.id && getShortsSupabaseConfig()) {
    // Ask about this viewer's own connection and its freshness, never about
    // what happens to be in the loaded page: another creator's TikToks being
    // present says nothing about whether this viewer's are, and a page of 18
    // rows says nothing about what is materialised.
    const { state, decision } = await shouldSyncViewerTikTok(user.id)
    if (decision.sync && state.creatorKey) {
      const imported = await pullOwnTikTok(user.id, state.creatorKey)
      if (imported > 0) dbItems = await loadDbFeed(limit)
    }
  }

  const youtubeCandidates: YouTubeCandidate[] = await fetchYouTubeCandidates(limit, language, region).catch(() => [] as YouTubeCandidate[])
  const youtubeIdMap = await materializeYouTube(youtubeCandidates).catch(() => new Map<string, string>())
  const youtubeItems: MalikShortItem[] = youtubeCandidates.map((item: YouTubeCandidate) => mapYouTubeCandidate(item, youtubeIdMap.get(item.videoId)))

  const mixed = buildRotatedFeed([...dbItems, ...youtubeItems], limit)
  const items = await hydrateViewerState(mixed, user?.id)
  const payload: MalikShortFeedResponse = {
    items,
    generatedAt: new Date().toISOString(),
    sources: {
      malik: items.some((item) => item.source === "malik"),
      youtube: items.some((item) => item.source === "youtube"),
      tiktok: items.some((item) => item.source === "tiktok"),
    },
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
}
