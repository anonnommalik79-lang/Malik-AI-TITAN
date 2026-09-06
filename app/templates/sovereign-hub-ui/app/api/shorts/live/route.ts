import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const liveId = safeText(request.nextUrl.searchParams.get("liveId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 50)
  if (liveId) {
    if (!/^[0-9a-f-]{36}$/i.test(liveId)) return NextResponse.json({ error: "INVALID_LIVE_ID" }, { status: 400 })
    const [sessions, chat] = await Promise.all([
      shortsSupabaseRequest<any[]>(`malik_shorts_live_sessions?select=id,creator_key,title,status,playback_url,viewer_count,peak_viewers,started_at,ended_at,metadata,created_at,malik_shorts_profiles!inner(username,display_name,avatar_url,verified)&id=eq.${liveId}&limit=1`).catch(() => []),
      shortsSupabaseRequest<any[]>(`malik_shorts_live_chat?select=id,live_id,user_key,body,status,created_at,malik_shorts_profiles(username,display_name,avatar_url,verified)&live_id=eq.${liveId}&status=eq.visible&order=created_at.desc&limit=${limit}`).catch(() => []),
    ])
    return NextResponse.json({ session: sessions[0] || null, chat: chat.reverse(), persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
  }
  const items = await shortsSupabaseRequest<any[]>(`malik_shorts_live_sessions?select=id,creator_key,title,status,playback_url,viewer_count,peak_viewers,started_at,metadata,created_at,malik_shorts_profiles!inner(username,display_name,avatar_url,verified)&status=in.(live,scheduled)&order=viewer_count.desc,started_at.desc.nullslast&limit=${limit}`).catch(() => [])
  return NextResponse.json({ items, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { action?: string; liveId?: string; title?: string; body?: string; playbackUrl?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const action = safeText(input.action, 30)
  const liveId = safeText(input.liveId, 80)

  try {
    if (action === "create") {
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_live_sessions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ creator_key: user.id, title: safeText(input.title, 180), status: "scheduled", playback_url: safeText(input.playbackUrl, 2000) || null }),
      })
      return NextResponse.json({ ok: true, session: rows?.[0] || null }, { status: 201 })
    }

    if (!/^[0-9a-f-]{36}$/i.test(liveId)) return NextResponse.json({ error: "INVALID_LIVE_ID" }, { status: 400 })

    if (action === "chat") {
      const body = safeText(input.body, 1000)
      if (!body) return NextResponse.json({ error: "MESSAGE_REQUIRED" }, { status: 400 })
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_live_chat", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ live_id: liveId, user_key: user.id, body }),
      })
      return NextResponse.json({ ok: true, message: rows?.[0] || null }, { status: 201 })
    }

    const owned = await shortsSupabaseRequest<any[]>(`malik_shorts_live_sessions?select=id,status&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${liveId}&limit=1`).catch(() => [])
    if (!owned[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    if (action === "start") {
      await shortsSupabaseRequest(`malik_shorts_live_sessions?id=eq.${liveId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "live", started_at: new Date().toISOString(), playback_url: safeText(input.playbackUrl, 2000) || null }) })
      return NextResponse.json({ ok: true, status: "live" })
    }
    if (action === "end") {
      await shortsSupabaseRequest(`malik_shorts_live_sessions?id=eq.${liveId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }) })
      return NextResponse.json({ ok: true, status: "ended" })
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] live action failed", error)
    return NextResponse.json({ error: "LIVE_ACTION_FAILED" }, { status: 500 })
  }
}
