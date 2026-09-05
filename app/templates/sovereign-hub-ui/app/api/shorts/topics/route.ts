import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 30)
  const region = safeText(request.nextUrl.searchParams.get("region"), 12)
  const language = safeText(request.nextUrl.searchParams.get("lang"), 16)
  const filters = ["active=eq.true"]
  if (region) filters.push(`region=eq.${encodeURIComponent(region)}`)
  if (language) filters.push(`language=eq.${encodeURIComponent(language)}`)

  const { user } = await getOptionalWorkOSAuth()
  const [topics, interests] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_topics?select=*&${filters.join("&")}&order=post_count.desc,follower_count.desc&limit=${limit}`).catch(() => []),
    user ? shortsSupabaseRequest<any[]>(`malik_shorts_user_interests?select=topic_id,weight&user_key=eq.${encodeURIComponent(user.id)}&limit=500`).catch(() => []) : Promise.resolve([]),
  ])
  const followed = new Map(interests.map((row) => [String(row.topic_id), Number(row.weight || 0)]))
  return NextResponse.json({
    items: topics.map((topic) => ({
      id: String(topic.id), slug: String(topic.slug), name: String(topic.name), description: String(topic.description || ""),
      language: topic.language, region: topic.region, postCount: Number(topic.post_count || 0), followerCount: Number(topic.follower_count || 0),
      viewerWeight: followed.get(String(topic.id)) || 0,
    })),
    persistence: true,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { topicId?: string; action?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const topicId = safeText(input.topicId, 80)
  const action = safeText(input.action, 20)
  if (!/^[0-9a-f-]{36}$/i.test(topicId) || !new Set(["follow","unfollow","more","less"]).has(action)) {
    return NextResponse.json({ error: "INVALID_TOPIC_ACTION" }, { status: 400 })
  }

  try {
    if (action === "unfollow") {
      await shortsSupabaseRequest(`malik_shorts_user_interests?user_key=eq.${encodeURIComponent(user.id)}&topic_id=eq.${topicId}`, { method: "DELETE" })
      return NextResponse.json({ ok: true, weight: 0 })
    }
    const targetWeight = action === "follow" ? 6 : action === "more" ? 9 : -6
    await shortsSupabaseRequest("malik_shorts_user_interests?on_conflict=user_key,topic_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_key: user.id, topic_id: topicId, weight: targetWeight, evidence_count: 1, last_signal_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })
    return NextResponse.json({ ok: true, weight: targetWeight })
  } catch (error) {
    console.error("[Malik Shorts] topic action failed", error)
    return NextResponse.json({ error: "TOPIC_ACTION_FAILED" }, { status: 500 })
  }
}
