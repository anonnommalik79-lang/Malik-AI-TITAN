import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, getYouTubeShortsConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function count(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function dbItem(row: any) {
  const source = ["malik", "youtube", "tiktok"].includes(row.source) ? row.source : "malik"
  return {
    id: String(row.id), source, sourceId: row.source_id || undefined, sourceUrl: row.source_url || undefined, posterUrl: row.poster_url || undefined,
    creator: { id: String(row.creator_key), username: String(row.username || "creator"), displayName: String(row.display_name || row.username || "Creator"), avatarUrl: row.avatar_url || undefined, bio: row.bio || undefined, verified: Boolean(row.verified), external: source !== "malik", claimed: source === "malik" || !String(row.creator_key || "").startsWith(`${source}:`) },
    playback: row.playback_kind === "youtube" ? { kind: "youtube", videoId: String(row.source_id || "") } : row.playback_kind === "tiktok" ? { kind: "tiktok", videoId: String(row.source_id || ""), canonicalUrl: row.source_url || undefined } : { kind: "native", url: String(row.media_url || ""), poster: row.poster_url || undefined },
    caption: String(row.caption || ""), hashtags: Array.isArray(row.hashtags) ? row.hashtags : [], language: row.language || undefined, region: row.region || undefined,
    durationSeconds: row.duration_seconds == null ? undefined : Number(row.duration_seconds), publishedAt: row.published_at || undefined, createdAt: row.created_at || undefined,
    metrics: { views: count(row.views), likes: count(row.likes), comments: count(row.comments), reposts: count(row.reposts), saves: count(row.saves), shares: count(row.shares), external: { views: row.external_views == null ? undefined : count(row.external_views), likes: row.external_likes == null ? undefined : count(row.external_likes), comments: row.external_comments == null ? undefined : count(row.external_comments), shares: row.external_shares == null ? undefined : count(row.external_shares) } },
    viewer: { liked: false, saved: false, reposted: false, following: false }, rights: { canRemix: Boolean(row.can_remix), canDownload: Boolean(row.can_download), canCrossPost: source === "malik", attributionRequired: Boolean(row.attribution_required) },
  }
}

export async function GET(request: NextRequest) {
  const source = safeText(request.nextUrl.searchParams.get("source"), 20)
  const id = safeText(request.nextUrl.searchParams.get("id"), 180)
  if (!["malik", "youtube", "tiktok"].includes(source) || !id) return NextResponse.json({ error: "INVALID_SHORT_REFERENCE" }, { status: 400 })

  if (getShortsSupabaseConfig()) {
    const filter = source === "malik" && /^[0-9a-f-]{36}$/i.test(id) ? `id=eq.${id}` : `source=eq.${source}&source_id=eq.${encodeURIComponent(id)}`
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_feed_v1?select=*&${filter}&limit=1`).catch(() => [])
    if (rows[0]) return NextResponse.json({ item: dbItem(rows[0]) }, { headers: { "Cache-Control": "private, no-store" } })
  }

  if (source === "youtube") {
    const config = getYouTubeShortsConfig()
    if (!config) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("part", "snippet,statistics,contentDetails,status")
    url.searchParams.set("id", id)
    url.searchParams.set("key", config.apiKey)
    const response = await fetch(url, { cache: "no-store" })
    const json = await response.json().catch(() => ({}))
    const video = json?.items?.[0]
    if (!response.ok || !video?.id || video?.status?.embeddable === false) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    const snippet = video.snippet || {}
    return NextResponse.json({ item: {
      id: `youtube:${video.id}`, source: "youtube", sourceId: video.id, sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
      posterUrl: snippet?.thumbnails?.maxres?.url || snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url,
      creator: { id: `youtube:${snippet.channelId}`, username: `yt.${String(snippet.channelId || "").slice(-24)}`, displayName: snippet.channelTitle || "YouTube creator", external: true, claimed: false },
      playback: { kind: "youtube", videoId: video.id }, caption: snippet.title || "", hashtags: [], language: snippet.defaultAudioLanguage || snippet.defaultLanguage || undefined, region: undefined, publishedAt: snippet.publishedAt,
      metrics: { views: 0, likes: 0, comments: 0, reposts: 0, saves: 0, shares: 0, external: { views: count(video?.statistics?.viewCount), likes: count(video?.statistics?.likeCount), comments: count(video?.statistics?.commentCount) } },
      viewer: { liked: false, saved: false, reposted: false, following: false }, rights: { canRemix: false, canDownload: false, canCrossPost: false, attributionRequired: true },
    } }, { headers: { "Cache-Control": "private, no-store" } })
  }

  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
}
