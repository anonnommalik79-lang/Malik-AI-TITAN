import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { moderateShortsText } from "@/lib/shorts/moderation"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function validUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

type CommentItem = {
  id: string
  shortId: string
  parentId?: string
  body: string
  likes: number
  createdAt: string
  viewerLiked?: boolean
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl?: string
    verified?: boolean
  }
  replies: CommentItem[]
}

export async function GET(request: NextRequest) {
  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 40)
  const offset = clampInt(request.nextUrl.searchParams.get("offset"), 0, 5000, 0)
  if (!validUuid(shortId)) return NextResponse.json({ error: "INVALID_SHORT_ID" }, { status: 400 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })

  const { user } = await getOptionalWorkOSAuth()
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_comments?select=id,post_id,parent_id,body,like_count,created_at,user_key,malik_shorts_profiles!inner(username,display_name,avatar_url,verified)&` +
    `post_id=eq.${encodeURIComponent(shortId)}&status=eq.visible&order=created_at.asc&limit=1000`,
  ).catch(() => [])

  const ids = rows.map((row) => String(row.id)).filter(validUuid)
  const viewerLikes = new Set<string>()
  if (user?.id && ids.length) {
    const likedRows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_comment_likes?select=comment_id&user_key=eq.${encodeURIComponent(user.id)}&comment_id=in.(${ids.join(",")})`,
    ).catch(() => [])
    for (const row of likedRows) viewerLikes.add(String(row.comment_id))
  }

  const map = new Map<string, CommentItem>()
  for (const row of rows) {
    const id = String(row.id)
    map.set(id, {
      id,
      shortId: String(row.post_id),
      parentId: row.parent_id || undefined,
      body: String(row.body || ""),
      likes: Number(row.like_count || 0),
      createdAt: row.created_at,
      viewerLiked: viewerLikes.has(id),
      user: {
        id: String(row.user_key),
        username: String(row.malik_shorts_profiles?.username || "user"),
        displayName: String(row.malik_shorts_profiles?.display_name || row.malik_shorts_profiles?.username || "User"),
        avatarUrl: row.malik_shorts_profiles?.avatar_url || undefined,
        verified: Boolean(row.malik_shorts_profiles?.verified),
      },
      replies: [],
    })
  }

  const roots: CommentItem[] = []
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.replies.push(item)
    else roots.push(item)
  }

  const sortReplies = (items: CommentItem[]) => {
    items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    for (const item of items) sortReplies(item.replies)
  }
  roots.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  for (const root of roots) sortReplies(root.replies)

  const items = roots.slice(offset, offset + limit)
  return NextResponse.json({
    items,
    persistence: true,
    nextOffset: offset + limit < roots.length ? offset + limit : null,
    rootCount: roots.length,
    loadedCommentCount: rows.length,
    truncated: rows.length >= 1000,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { shortId?: string; body?: string; parentId?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const shortId = safeText(input.shortId, 80)
  const parentId = safeText(input.parentId, 80)
  const body = safeText(input.body, 2200)
  if (!validUuid(shortId) || !body || (parentId && !validUuid(parentId))) {
    return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 })
  }

  const moderation = await moderateShortsText(body, { kind: "comment", userKey: user.id })
  if (moderation.action === "block") {
    return NextResponse.json({ error: "COMMENT_BLOCKED", moderation: { labels: moderation.labels, score: moderation.score } }, { status: 422 })
  }

  try {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_create_comment", {
      method: "POST",
      body: JSON.stringify({
        p_user_key: user.id,
        p_post_id: shortId,
        p_body: body,
        p_parent_id: parentId || null,
      }),
    })
    const id = typeof response === "string" ? response : Array.isArray(response) ? response[0] : response

    if (moderation.action === "review" && validUuid(String(id || ""))) {
      await shortsSupabaseRequest("malik_shorts_moderation_cases", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          post_id: shortId,
          comment_id: String(id),
          profile_key: user.id,
          source: "automated",
          severity: moderation.score >= .72 ? "high" : "medium",
          labels: { text: moderation.labels, score: moderation.score, provider: moderation.provider },
          status: "open",
          notes: moderation.reason || "Automated comment preflight queued this comment for review.",
        }),
      }).catch(() => undefined)
    }

    return NextResponse.json({ ok: true, id, moderation: { action: moderation.action, labels: moderation.labels, score: moderation.score } }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] comment failed", error)
    return NextResponse.json({ error: "COMMENT_FAILED" }, { status: 500 })
  }
}
