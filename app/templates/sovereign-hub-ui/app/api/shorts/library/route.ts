import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const KINDS = new Set(["saved", "liked", "reposted", "mine"])

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  const kind = String(request.nextUrl.searchParams.get("kind") || "saved")
  if (!KINDS.has(kind)) return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 })

  let postIds: string[] = []
  if (kind === "mine") {
    const rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_posts?select=id&creator_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=120`,
    ).catch(() => [])
    postIds = rows.map((row) => String(row.id))
  } else {
    const table = kind === "saved" ? "malik_shorts_saves" : kind === "liked" ? "malik_shorts_likes" : "malik_shorts_reposts"
    const rows = await shortsSupabaseRequest<any[]>(
      `${table}?select=post_id&user_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=120`,
    ).catch(() => [])
    postIds = rows.map((row) => String(row.post_id))
  }

  if (!postIds.length) return NextResponse.json({ kind, items: [] })
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_feed_v1?select=*&id=in.(${postIds.join(",")})&limit=120`,
  ).catch(() => [])
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  const ordered = postIds.map((id) => byId.get(id)).filter(Boolean)

  return NextResponse.json({
    kind,
    items: ordered.map((row: any) => ({
      id: row.id,
      source: row.source,
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      playbackKind: row.playback_kind,
      mediaUrl: row.media_url,
      posterUrl: row.poster_url,
      caption: row.caption,
      creator: {
        userKey: row.creator_key,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        verified: Boolean(row.verified),
      },
      metrics: {
        views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0),
        reposts: Number(row.reposts || 0), saves: Number(row.saves || 0), shares: Number(row.shares || 0),
      },
      publishedAt: row.published_at,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
