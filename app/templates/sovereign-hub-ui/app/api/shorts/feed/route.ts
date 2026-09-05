import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import {
  clampInt,
  getShortsSupabaseConfig,
  getYouTubeShortsConfig,
  shortsSupabaseRequest,
  stableShortId,
} from "@/lib/shorts/server"
import type { MalikShortFeedResponse, MalikShortItem } from "@/lib/shorts/types"

export const dynamic = "force-dynamic"

type DbFeedRow = Record<string, any>
type YouTubeCandidate = {
  videoId: string
  channelId: string
  channelTitle: string
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

function compactNumber(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function extractHashtags(text: string) {
  return Array.from(new Set((text.match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 12)
}

function mapDbRow(row: DbFeedRow): MalikShortItem {
  const playback = row.playback_kind === "youtube"
    ? { kind: "youtube" as const, videoId: String(row.source_id || "") }
    : row.playback_kind === "tiktok"
      ? { kind: "tiktok" as const, videoId: String(row.source_id || ""), canonicalUrl: row.source_url || undefined }
      : { kind: "native" as const, url: String(row.media_url || ""), poster: row.poster_url || undefined }

  return {
    id: String(row.id),
    source: row.source,
    sourceId: row.source_id || undefined,
    sourceUrl: row.source_url || undefined,
    creator: {
      id: String(row.creator_key),
      username: String(row.username || "creator"),
      displayName: String(row.display_name || row.username || "Creator"),
      avatarUrl: row.avatar_url || undefined,
      bio: row.bio || undefined,
      verified: Boolean(row.verified),
      external: row.source !== "malik",
      claimed: row.source === "malik",
    },
    playback,
    caption: String(row.caption || ""),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    language: row.language || undefined,
    region: row.region || undefined,
    durationSeconds: row.duration_seconds == null ? undefined : Number(row.duration_seconds),
    publishedAt: row.published_at || undefined,
    createdAt: row.created_at || undefined,
    metrics: {
      views: compactNumber(row.views),
      likes: compactNumber(row.likes),
      comments: compactNumber(row.comments),
      reposts: compactNumber(row.reposts),
      saves: compactNumber(row.saves),
      shares: compactNumber(row.shares),
      external: {
        views: row.external_views == null ? undefined : compactNumber(row.external_views),
        likes: row.external_likes == null ? undefined : compactNumber(row.external_likes),
        comments: row.external_comments == null ? undefined : compactNumber(row.external_comments),
        shares: row.external_shares == null ? undefined : compactNumber(row.external_shares),
      },
    },
    viewer: { liked: false, saved: false, reposted: false, following: false },
    rights: {
      canRemix: Boolean(row.can_remix),
      canDownload: Boolean(row.can_download),
      canCrossPost: row.source === "malik",
      attributionRequired: Boolean(row.attribution_required),
    },
  }
}

async function fetchYouTubeCandidates(limit: number, language: string, region: string) {
  const config = getYouTubeShortsConfig()
  if (!config) return [] as YouTubeCandidate[]

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", String(Math.min(24, Math.max(8, limit))))
  searchUrl.searchParams.set("regionCode", region === "KZ" ? "KZ" : region.slice(0, 2).toUpperCase())
  searchUrl.searchParams.set("relevanceLanguage", language === "kk" ? "kk" : language === "en" ? "en" : "ru")
  searchUrl.searchParams.set("safeSearch", "moderate")
  searchUrl.searchParams.set("videoEmbeddable", "true")
  searchUrl.searchParams.set("videoSyndicated", "true")
  searchUrl.searchParams.set("videoDuration", "short")
  searchUrl.searchParams.set("order", "relevance")
  searchUrl.searchParams.set("q", language === "kk" ? "Қазақстан Алматы Астана қазақ" : language === "en" ? "Kazakhstan Almaty Astana" : "Казахстан Алматы Астана")
  searchUrl.searchParams.set("key", config.apiKey)

  const searchResponse = await fetch(searchUrl, { next: { revalidate: 180 } })
  if (!searchResponse.ok) return [] as YouTubeCandidate[]
  const searchJson = await searchResponse.json()
  const searchItems = Array.isArray(searchJson?.items) ? searchJson.items : []
  const ids = searchItems.map((item: any) => item?.id?.videoId).filter(Boolean).slice(0, 24)
  if (!ids.length) return [] as YouTubeCandidate[]

  const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos")
  videoUrl.searchParams.set("part", "snippet,statistics,contentDetails,status")
  videoUrl.searchParams.set("id", ids.join(","))
  videoUrl.searchParams.set("key", config.apiKey)
  const videoResponse = await fetch(videoUrl, { next: { revalidate: 180 } })
  if (!videoResponse.ok) return [] as YouTubeCandidate[]
  const videoJson = await videoResponse.json()
  const byId = new Map((videoJson?.items || []).map((item: any) => [item.id, item]))

  return ids.flatMap((videoId: string) => {
    const item: any = byId.get(videoId)
    if (!item || item?.status?.embeddable === false) return []
    const durationSeconds = isoDurationSeconds(item?.contentDetails?.duration)
    if (durationSeconds && durationSeconds > 240) return []
    const snippet = item?.snippet || {}
    const stats = item?.statistics || {}
    return [{
      videoId,
      channelId: String(snippet.channelId || "unknown"),
      channelTitle: decodeEntities(String(snippet.channelTitle || "YouTube creator")),
      title: decodeEntities(String(snippet.title || "")),
      description: decodeEntities(String(snippet.description || "")),
      publishedAt: snippet.publishedAt,
      thumbnail: snippet?.thumbnails?.maxres?.url || snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url,
      durationSeconds,
      views: compactNumber(stats.viewCount),
      likes: compactNumber(stats.likeCount),
      comments: compactNumber(stats.commentCount),
    } satisfies YouTubeCandidate]
  })
}

async function materializeYouTube(candidates: YouTubeCandidate[]) {
  if (!getShortsSupabaseConfig() || !candidates.length) return new Map<string, string>()

  const profiles = Array.from(new Map(candidates.map((item) => [item.channelId, {
    user_key: `youtube:${item.channelId}`,
    username: `yt.${item.channelId.replace(/[^A-Za-z0-9._]/g, "").slice(-24)}`.slice(0, 32),
    display_name: item.channelTitle,
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
    creator: {
      id: `youtube:${item.channelId}`,
      username: `yt.${item.channelId.replace(/[^A-Za-z0-9._]/g, "").slice(-24)}`.slice(0, 32),
      displayName: item.channelTitle,
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
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      reposts: 0,
      saves: 0,
      shares: 0,
      external: { views: item.views, likes: item.likes, comments: item.comments },
    },
    viewer: { liked: false, saved: false, reposted: false, following: false },
    rights: { canRemix: false, canDownload: false, canCrossPost: false, attributionRequired: true },
  }
}

async function hydrateViewerState(items: MalikShortItem[], userKey?: string) {
  if (!userKey || !getShortsSupabaseConfig()) return items
  const uuidIds = items.map((item) => item.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!uuidIds.length) return items
  const encodedIds = encodeURIComponent(`(${uuidIds.join(",")})`)

  const [likes, saves, reposts] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_likes?select=post_id&user_key=eq.${encodeURIComponent(userKey)}&post_id=in.${encodedIds}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_saves?select=post_id&user_key=eq.${encodeURIComponent(userKey)}&post_id=in.${encodedIds}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_reposts?select=post_id&user_key=eq.${encodeURIComponent(userKey)}&post_id=in.${encodedIds}`).catch(() => []),
  ])
  const liked = new Set(likes.map((row) => String(row.post_id)))
  const saved = new Set(saves.map((row) => String(row.post_id)))
  const reposted = new Set(reposts.map((row) => String(row.post_id)))
  return items.map((item) => ({
    ...item,
    viewer: { ...item.viewer, liked: liked.has(item.id), saved: saved.has(item.id), reposted: reposted.has(item.id) },
  }))
}

export async function GET(request: NextRequest) {
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 6, 30, 16)
  const language = request.nextUrl.searchParams.get("lang") || "ru"
  const region = request.nextUrl.searchParams.get("region") || "KZ"
  const { user } = await getOptionalWorkOSAuth()

  let malikItems: MalikShortItem[] = []
  if (getShortsSupabaseConfig()) {
    const rows = await shortsSupabaseRequest<DbFeedRow[]>(
      `malik_shorts_feed_v1?select=*&source=eq.malik&order=published_at.desc.nullslast,created_at.desc&limit=${Math.min(limit, 20)}`,
    ).catch(() => [])
    malikItems = rows.map(mapDbRow)
  }

  const youtubeCandidates = await fetchYouTubeCandidates(limit, language, region).catch(() => [])
  const youtubeIdMap = await materializeYouTube(youtubeCandidates).catch(() => new Map<string, string>())
  const youtubeItems = youtubeCandidates.map((item) => mapYouTubeCandidate(item, youtubeIdMap.get(item.videoId)))

  const mixed: MalikShortItem[] = []
  const max = Math.max(malikItems.length, youtubeItems.length)
  for (let index = 0; index < max && mixed.length < limit; index += 1) {
    if (malikItems[index]) mixed.push(malikItems[index])
    if (youtubeItems[index] && mixed.length < limit) mixed.push(youtubeItems[index])
  }

  const items = await hydrateViewerState(mixed, user?.id)
  const payload: MalikShortFeedResponse = {
    items,
    generatedAt: new Date().toISOString(),
    sources: {
      malik: malikItems.length > 0,
      youtube: youtubeItems.length > 0,
      tiktok: false,
    },
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}
