import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], unread: 0, persistence: false })

  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 40)
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_notifications?select=id,type,post_id,comment_id,payload,read_at,created_at,actor_key,malik_shorts_profiles!malik_shorts_notifications_actor_key_fkey(username,display_name,avatar_url,verified)&recipient_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=${limit}`,
  ).catch(() => [])
  const unreadRows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_notifications?select=id&recipient_key=eq.${encodeURIComponent(user.id)}&read_at=is.null&limit=500`,
  ).catch(() => [])

  return NextResponse.json({
    unread: unreadRows.length,
    items: rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      postId: row.post_id || null,
      commentId: row.comment_id || null,
      payload: row.payload || {},
      read: Boolean(row.read_at),
      createdAt: row.created_at,
      actor: row.actor_key ? {
        userKey: row.actor_key,
        username: row.malik_shorts_profiles?.username || "user",
        displayName: row.malik_shorts_profiles?.display_name || row.malik_shorts_profiles?.username || "User",
        avatarUrl: row.malik_shorts_profiles?.avatar_url || null,
        verified: Boolean(row.malik_shorts_profiles?.verified),
      } : null,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PATCH(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { ids?: Array<string | number>; all?: boolean }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const now = new Date().toISOString()
  if (input.all) {
    await shortsSupabaseRequest(`malik_shorts_notifications?recipient_key=eq.${encodeURIComponent(user.id)}&read_at=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ read_at: now }),
    })
    return NextResponse.json({ ok: true })
  }

  const ids = (input.ids || []).map((id) => String(id).replace(/[^0-9]/g, "")).filter(Boolean).slice(0, 100)
  if (!ids.length) return NextResponse.json({ error: "IDS_REQUIRED" }, { status: 400 })
  await shortsSupabaseRequest(`malik_shorts_notifications?recipient_key=eq.${encodeURIComponent(user.id)}&id=in.(${ids.join(",")})`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ read_at: now }),
  })
  return NextResponse.json({ ok: true })
}
