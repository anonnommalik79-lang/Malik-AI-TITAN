import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { commentId?: string; liked?: boolean }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const commentId = safeText(input.commentId, 80)
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) return NextResponse.json({ error: "INVALID_COMMENT_ID" }, { status: 400 })

  const me = encodeURIComponent(user.id)
  try {
    if (input.liked) {
      await shortsSupabaseRequest("malik_shorts_comment_likes?on_conflict=comment_id,user_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ comment_id: commentId, user_key: user.id }),
      })
    } else {
      await shortsSupabaseRequest(`malik_shorts_comment_likes?comment_id=eq.${commentId}&user_key=eq.${me}`, { method: "DELETE" })
    }
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_comment_likes?select=user_key&comment_id=eq.${commentId}&limit=5000`).catch(() => [])
    const likes = rows.length
    await shortsSupabaseRequest(`malik_shorts_comments?id=eq.${commentId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ like_count: likes, updated_at: new Date().toISOString() }),
    })
    return NextResponse.json({ ok: true, liked: Boolean(input.liked), likes })
  } catch (error) {
    console.error("[Malik Shorts] comment like failed", error)
    return NextResponse.json({ error: "COMMENT_LIKE_FAILED" }, { status: 500 })
  }
}
