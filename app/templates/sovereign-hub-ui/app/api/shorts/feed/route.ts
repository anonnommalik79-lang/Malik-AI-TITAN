import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import {
  clampInt,
  getShortsSupabaseConfig,
  getYouTubeShortsConfig,
  shortsSupabaseRequest,
  stableShortId,
} from "@/lib/shorts/server"
import type { MalikShortFeedResponse, MalikShortItem, MalikShortSource } from "@/lib/shorts/types"

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

function count(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function extractHashtags(text: string) {
  return Array.from(new Set((String(text || "").match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 12)
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
    metrics: {
      views: count(row.views),
      likes: count(row.likes),
      comments: count(row.comments),
      reposts: count(row.reposts),
      saves: count(row.saves),
      shares: count(row.shares),
      external: {
        views: row.external_views == null ? undefined : count(row.external_views),
        likes: row.external_likes == null ? undefined : count(row.external_likes),
        comments: row.external_comments == null ? undefined : count(row.external_comments),
        shares: row.external_shares == null ? undefined : count(row.external_shares),
      },
    },
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
  const byId = new Map<string, any>((videoJson?.items || []).map((item: any) => [String(item.id), item]))

  return ids.flatMap((videoId: string) => {
    const item = byId.get(videoId)
    if (!item || item?.status?.embeddable === false) return []
    const durationSeconds = isoDurationSeconds(item?.contentDetails?.duration)
    if (durationSeconds && durationSeconds > 240) return []
    const snippet = item?.snippet || {}
    const stats = item?.statistics || {}
    return [{
      videoId,
      channelId: String(snippet.channelId || "unknown"),
      channelTitle: decodeEntities(String(snippet.channelTitle || "Creator")),
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
    posterUrl: item.thumbnail,
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

function uniqueBySource(items: MalikShortItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.source}:${item.sourceId || item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mixSources(items: MalikShortItem[], limit: number) {
  const buckets: Record<MalikShortSource, MalikShortItem[]> = { malik: [], tiktok: [], youtube: [] }
  for (const item of items) buckets[item.source].push(item)
  const pattern: MalikShortSource[] = ["malik", "youtube", "malik", "tiktok", "youtube"]
  const output: MalikShortItem[] = []
  let guard = 0
  while (output.length < limit && guard < limit * 10) {
    const source = pattern[guard % pattern.length]
    const item = buckets[source].shift()
    if (item) output.push(item)
    else {
      const fallback = buckets.malik.shift() || buckets.tiktok.shift() || buckets.youtube.shift()
      if (fallback) output.push(fallback)
      else break
    }
    guard += 1
  }
  return output
}

export async function GET(request: NextRequest) {
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 6, 30, 16)
  const language = request.nextUrl.searchParams.get("lang") || "ru"
  const region = request.nextUrl.searchParams.get("region") || "KZ"
  const { user } = await getOptionalWorkOSAuth()

  let dbItems: MalikShortItem[] = []
  if (getShortsSupabaseConfig()) {
    const rows = await shortsSupabaseRequest<DbFeedRow[]>(
      `malik_shorts_feed_v1?select=*&source=in.(malik,tiktok)&order=published_at.desc.nullslast,created_at.desc&limit=${Math.min(limit * 2, 50)}`,
    ).catch(() => [] as DbFeedRow[])
    dbItems = rows.map(mapDbRow)
  }

  const youtubeCandidates: YouTubeCandidate[] = await fetchYouTubeCandidates(limit, language, region).catch(() => [] as YouTubeCandidate[])
  const youtubeIdMap = await materializeYouTube(youtubeCandidates).catch(() => new Map<string, string>())
  const youtubeItems: MalikShortItem[] = youtubeCandidates.map((item: YouTubeCandidate) => mapYouTubeCandidate(item, youtubeIdMap.get(item.videoId)))

  const mixed = mixSources(uniqueBySource([...dbItems, ...youtubeItems]), limit)
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
