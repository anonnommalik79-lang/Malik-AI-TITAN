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

  try {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_comment_like_atomic", {
      method: "POST",
      body: JSON.stringify({ p_user_key: user.id, p_comment_id: commentId, p_like: Boolean(input.liked) }),
    })
    const row = Array.isArray(response) ? response[0] : response
    return NextResponse.json({ ok: true, liked: Boolean(row?.liked), likes: Number(row?.likes || 0) })
  } catch (error) {
    console.error("[Malik Shorts] comment like failed", error)
    return NextResponse.json({ error: "COMMENT_LIKE_FAILED" }, { status: 500 })
  }
}
