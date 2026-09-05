import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ blocked: [], muted: [], persistence: false })
  const encoded = encodeURIComponent(user.id)
  const [blocks, mutes] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_blocks?select=blocked_key&blocker_key=eq.${encoded}&limit=2000`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_mutes?select=muted_key&muter_key=eq.${encoded}&limit=2000`).catch(() => []),
  ])
  return NextResponse.json({
    blocked: blocks.map((row) => String(row.blocked_key)),
    muted: mutes.map((row) => String(row.muted_key)),
    persistence: true,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { targetKey?: string; action?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const targetKey = safeText(input.targetKey, 180)
  const action = safeText(input.action, 30)
  if (!targetKey || targetKey === user.id) return NextResponse.json({ error: "INVALID_TARGET" }, { status: 400 })
  if (!new Set(["block","unblock","mute","unmute"]).has(action)) return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })

  const target = encodeURIComponent(targetKey)
  const me = encodeURIComponent(user.id)
  try {
    if (action === "block") {
      await shortsSupabaseRequest("malik_shorts_blocks?on_conflict=blocker_key,blocked_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ blocker_key: user.id, blocked_key: targetKey }),
      })
      await Promise.all([
        shortsSupabaseRequest(`malik_shorts_follows?follower_key=eq.${me}&following_key=eq.${target}`, { method: "DELETE" }).catch(() => undefined),
        shortsSupabaseRequest(`malik_shorts_follows?follower_key=eq.${target}&following_key=eq.${me}`, { method: "DELETE" }).catch(() => undefined),
      ])
    } else if (action === "unblock") {
      await shortsSupabaseRequest(`malik_shorts_blocks?blocker_key=eq.${me}&blocked_key=eq.${target}`, { method: "DELETE" })
    } else if (action === "mute") {
      await shortsSupabaseRequest("malik_shorts_mutes?on_conflict=muter_key,muted_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ muter_key: user.id, muted_key: targetKey }),
      })
    } else {
      await shortsSupabaseRequest(`malik_shorts_mutes?muter_key=eq.${me}&muted_key=eq.${target}`, { method: "DELETE" })
    }
    return NextResponse.json({ ok: true, action, targetKey })
  } catch (error) {
    console.error("[Malik Shorts] relationship action failed", error)
    return NextResponse.json({ error: "RELATIONSHIP_ACTION_FAILED" }, { status: 500 })
  }
}
