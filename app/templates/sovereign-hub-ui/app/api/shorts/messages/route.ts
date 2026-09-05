import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

async function ensureProfile(user: any) {
  const email = String(user.email || "").trim().toLowerCase()
  const display = String(user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Malik user")
  const base = email.split("@")[0]?.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) || "malik"
  const suffix = String(user.id).replace(/[^A-Za-z0-9]/g, "").slice(-7).toLowerCase() || "user"
  await shortsSupabaseRequest("malik_shorts_profiles?on_conflict=user_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_key: user.id, username: `${base}.${suffix}`.slice(0, 32), display_name: display, avatar_url: user.profilePictureUrl || null, locale: "ru", region: "KZ" }),
  })
}

async function isMember(conversationId: string, userKey: string) {
  const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_conversation_members?select=user_key&conversation_id=eq.${conversationId}&user_key=eq.${encodeURIComponent(userKey)}&limit=1`).catch(() => [])
  return Boolean(rows[0])
}

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })

  const conversationId = safeText(request.nextUrl.searchParams.get("conversationId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 50)
  if (conversationId) {
    if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !(await isMember(conversationId, user.id))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    const rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_messages?select=id,conversation_id,sender_key,body,shared_post_id,reply_to_id,status,created_at,edited_at,malik_shorts_profiles!malik_shorts_messages_sender_key_fkey(username,display_name,avatar_url,verified)&conversation_id=eq.${conversationId}&status=eq.visible&order=created_at.desc&limit=${limit}`,
    ).catch(() => [])
    return NextResponse.json({ items: rows.reverse(), persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
  }

  const memberships = await shortsSupabaseRequest<any[]>(`malik_shorts_conversation_members?select=conversation_id,role,muted,last_read_at,joined_at&user_key=eq.${encodeURIComponent(user.id)}&order=joined_at.desc&limit=200`).catch(() => [])
  const ids = memberships.map((row) => String(row.conversation_id)).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) return NextResponse.json({ items: [], persistence: true })
  const conversations = await shortsSupabaseRequest<any[]>(`malik_shorts_conversations?select=id,kind,title,created_by,created_at,updated_at&id=in.(${ids.join(",")})&order=updated_at.desc&limit=200`).catch(() => [])
  return NextResponse.json({ items: conversations.map((conversation) => ({ ...conversation, membership: memberships.find((row) => row.conversation_id === conversation.id) || null })), persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  await ensureProfile(user)

  let input: { action?: string; conversationId?: string; targetKey?: string; memberKeys?: string[]; title?: string; body?: string; sharedPostId?: string; replyToId?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const action = safeText(input.action, 30)

  try {
    if (action === "create") {
      const targets = Array.from(new Set([safeText(input.targetKey, 180), ...(Array.isArray(input.memberKeys) ? input.memberKeys.map((value) => safeText(value, 180)) : [])].filter(Boolean))).filter((key) => key !== user.id).slice(0, 49)
      if (!targets.length) return NextResponse.json({ error: "MEMBER_REQUIRED" }, { status: 400 })
      const kind = targets.length === 1 ? "direct" : "group"
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_conversations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ kind, title: safeText(input.title, 120), created_by: user.id, updated_at: new Date().toISOString() }),
      })
      const conversation = rows?.[0]
      if (!conversation?.id) throw new Error("CONVERSATION_CREATE_FAILED")
      const members = [user.id, ...targets].map((userKey, index) => ({ conversation_id: conversation.id, user_key: userKey, role: index === 0 ? "owner" : "member" }))
      await shortsSupabaseRequest("malik_shorts_conversation_members?on_conflict=conversation_id,user_key", {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(members),
      })
      return NextResponse.json({ ok: true, conversation }, { status: 201 })
    }

    const conversationId = safeText(input.conversationId, 80)
    if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !(await isMember(conversationId, user.id))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

    if (action === "read") {
      await shortsSupabaseRequest(`malik_shorts_conversation_members?conversation_id=eq.${conversationId}&user_key=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_read_at: new Date().toISOString() }),
      })
      return NextResponse.json({ ok: true })
    }

    if (action === "send") {
      const body = safeText(input.body, 8000)
      const sharedPostId = safeText(input.sharedPostId, 80)
      const replyToId = safeText(input.replyToId, 80)
      if (!body && !/^[0-9a-f-]{36}$/i.test(sharedPostId)) return NextResponse.json({ error: "MESSAGE_REQUIRED" }, { status: 400 })
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          conversation_id: conversationId,
          sender_key: user.id,
          body,
          shared_post_id: /^[0-9a-f-]{36}$/i.test(sharedPostId) ? sharedPostId : null,
          reply_to_id: /^[0-9a-f-]{36}$/i.test(replyToId) ? replyToId : null,
        }),
      })
      await shortsSupabaseRequest(`malik_shorts_conversations?id=eq.${conversationId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() }) }).catch(() => undefined)
      return NextResponse.json({ ok: true, message: rows?.[0] || null }, { status: 201 })
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] messaging failed", error)
    return NextResponse.json({ error: "MESSAGING_FAILED" }, { status: 500 })
  }
}
