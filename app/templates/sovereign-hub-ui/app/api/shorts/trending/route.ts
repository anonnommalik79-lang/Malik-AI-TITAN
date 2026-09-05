import { NextRequest, NextResponse } from "next/server"
import { clampInt, getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const EVENT_WEIGHT: Record<string, number> = {
  view: 1,
  complete: 3,
  rewatch: 4,
  like: 5,
  comment: 7,
  comment_reply: 8,
  save: 8,
  repost: 9,
  share: 10,
  follow: 12,
  not_interested: -8,
  report: -20,
}

function creator(row: any) {
  return {
    id: String(row.creator_key || ""),
    username: String(row.username || "creator"),
    displayName: String(row.display_name || row.username || "Creator"),
    avatarUrl: row.avatar_url || undefined,
    verified: Boolean(row.verified),
  }
}

function item(row: any, score = 0) {
  return {
    id: String(row.id),
    source: String(row.source || "malik"),
    sourceId: row.source_id || undefined,
    sourceUrl: row.source_url || undefined,
    posterUrl: row.poster_url || undefined,
    creator: creator(row),
    caption: String(row.caption || ""),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    language: row.language || undefined,
    region: row.region || undefined,
    publishedAt: row.published_at || row.created_at || undefined,
    metrics: {
      views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0),
      reposts: Number(row.reposts || 0), saves: Number(row.saves || 0), shares: Number(row.shares || 0),
      external: {
        views: row.external_views == null ? undefined : Number(row.external_views),
        likes: row.external_likes == null ? undefined : Number(row.external_likes),
        comments: row.external_comments == null ? undefined : Number(row.external_comments),
      },
    },
    trendScore: Number(score.toFixed(2)),
  }
}

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ posts: [], topics: [], persistence: false })
  const region = String(request.nextUrl.searchParams.get("region") || "KZ").toUpperCase().slice(0, 8)
  const language = String(request.nextUrl.searchParams.get("lang") || "ru").toLowerCase().slice(0, 12)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 4, 40, 20)
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  const [events, topicRows] = await Promise.all([
    shortsSupabaseRequest<any[]>(
      `malik_shorts_event_stream_v2?select=post_id,event_type,created_at,region&post_id=not.is.null&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=5000`,
    ).catch(() => []),
    shortsSupabaseRequest<any[]>(
      `malik_shorts_topic_trends_v2?select=topic_id,slug,name,language,region,active_posts,trend_score,last_activity_at&order=trend_score.desc&limit=30`,
    ).catch(() => []),
  ])

  const scores = new Map<string, number>()
  const latest = new Map<string, number>()
  for (const event of events) {
    const postId = String(event.post_id || "")
    if (!postId) continue
    if (event.region && region && String(event.region).toUpperCase() !== region) continue
    const base = EVENT_WEIGHT[String(event.event_type)] || 0
    if (!base) continue
    const created = Date.parse(String(event.created_at || ""))
    const hours = Number.isFinite(created) ? Math.max(0, (Date.now() - created) / 3600_000) : 24
    const decay = Math.exp(-hours / 12)
    scores.set(postId, (scores.get(postId) || 0) + base * decay)
    latest.set(postId, Math.max(latest.get(postId) || 0, Number.isFinite(created) ? created : 0))
  }

  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (latest.get(b[0]) || 0) - (latest.get(a[0]) || 0))
    .slice(0, Math.max(limit * 2, 30))
    .map(([id]) => id)

  let rows: any[] = []
  if (rankedIds.length) {
    rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_feed_v1?select=*&id=in.(${rankedIds.join(",")})&status=eq.published&visibility=eq.public&limit=${Math.max(limit * 2, 30)}`,
    ).catch(() => [])
  }
  if (!rows.length) {
    rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_feed_v1?select=*&status=eq.published&visibility=eq.public&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`,
    ).catch(() => [])
  }

  const byId = new Map(rows.map((row) => [String(row.id), row]))
  const ordered = rankedIds.length
    ? rankedIds.flatMap((id) => byId.has(id) ? [byId.get(id)] : [])
    : rows
  const posts = ordered
    .filter((row) => !language || !row.language || String(row.language).toLowerCase() === language)
    .slice(0, limit)
    .map((row) => item(row, scores.get(String(row.id)) || 0))

  const topics = topicRows
    .filter((row) => (!row.region || String(row.region).toUpperCase() === region) && (!row.language || String(row.language).toLowerCase() === language))
    .slice(0, 15)
    .map((row) => ({
      id: row.topic_id,
      slug: row.slug,
      name: row.name,
      postCount: Number(row.active_posts || 0),
      trendScore: Number(row.trend_score || 0),
      lastActivityAt: row.last_activity_at || null,
    }))

  return NextResponse.json({ posts, topics, region, language, windowHours: 24, generatedAt: new Date().toISOString(), persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}
