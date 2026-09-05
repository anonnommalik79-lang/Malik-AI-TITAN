import { NextRequest, NextResponse } from "next/server"
import { clampInt, getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function cleanTag(value: string) {
  return value.replace(/^#/, "").trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 50)
}

function mapPost(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    posterUrl: row.poster_url,
    caption: row.caption,
    hashtags: row.hashtags || [],
    language: row.language,
    region: row.region,
    publishedAt: row.published_at || row.created_at,
    creator: {
      id: row.creator_key,
      username: row.username || "creator",
      displayName: row.display_name || row.username || "Creator",
      avatarUrl: row.avatar_url,
      verified: Boolean(row.verified),
    },
    metrics: {
      views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0),
      reposts: Number(row.reposts || 0), saves: Number(row.saves || 0), shares: Number(row.shares || 0),
    },
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = await params
  const tag = cleanTag(rawTag)
  if (!tag) return NextResponse.json({ error: "INVALID_HASHTAG" }, { status: 400 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ tag, items: [], persistence: false })
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 4, 80, 30)
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_feed_v1?select=*&hashtags=cs.${encodeURIComponent(`{${tag}}`)}&status=eq.published&visibility=eq.public&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`,
  ).catch(() => [])
  return NextResponse.json({ tag, items: rows.map(mapPost), count: rows.length, persistence: true }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } })
}
