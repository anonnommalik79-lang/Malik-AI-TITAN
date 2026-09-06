import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig } from "@/lib/shorts/server"
import { fetchTikTokUser, fetchTikTokVideos, getFreshTikTokAccessToken, materializeTikTokVideos } from "@/lib/shorts/tiktok"

export const dynamic = "force-dynamic"

export async function POST() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  try {
    const accessToken = await getFreshTikTokAccessToken(user.id)
    // Re-reading the creator on a manual sync is the point: a rename, a new
    // avatar or a follower count that moved since connection day all land here,
    // and the profile row every other viewer sees is refreshed with them.
    const [creator, page] = await Promise.all([
      fetchTikTokUser(accessToken),
      fetchTikTokVideos(accessToken, 20),
    ])
    const rows = await materializeTikTokVideos(user.id, page.videos, creator)
    return NextResponse.json({ ok: true, imported: rows.length, hasMore: page.hasMore, cursor: page.cursor || null })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    const status = message.includes("NOT_CONNECTED") ? 409 : 502
    console.error("[Malik Shorts] TikTok sync failed", error)
    return NextResponse.json({ error: message.includes("NOT_CONNECTED") ? "TIKTOK_NOT_CONNECTED" : "TIKTOK_SYNC_FAILED" }, { status })
  }
}
