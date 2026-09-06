import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function validUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

export async function GET(request: NextRequest) {
  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 80, 40)
  if (!validUuid(shortId)) return NextResponse.json({ error: "INVALID_SHORT_ID" }, { status: 400 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })

  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_comments?select=id,post_id,parent_id,body,like_count,created_at,user_key,malik_shorts_profiles!inner(username,display_name,avatar_url,verified)&post_id=eq.${encodeURIComponent(shortId)}&status=eq.visible&order=created_at.desc&limit=${limit}`,
  ).catch(() => [])

  const items = rows.map((row) => ({
    id: String(row.id),
    shortId: String(row.post_id),
    parentId: row.parent_id || undefined,
    body: String(row.body || ""),
    likes: Number(row.like_count || 0),
    createdAt: row.created_at,
    user: {
      id: String(row.user_key),
      username: String(row.malik_shorts_profiles?.username || "user"),
      displayName: String(row.malik_shorts_profiles?.display_name || row.malik_shorts_profiles?.username || "User"),
      avatarUrl: row.malik_shorts_profiles?.avatar_url || undefined,
      verified: Boolean(row.malik_shorts_profiles?.verified),
    },
  }))

  return NextResponse.json({ items, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
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
    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] comment failed", error)
    return NextResponse.json({ error: "COMMENT_FAILED" }, { status: 500 })
  }
}
