import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig } from "@/lib/shorts/server"
import { fetchTikTokUser, fetchTikTokVideos, getFreshTikTokAccessToken, materializeTikTokVideos, recordTikTokSyncResult } from "@/lib/shorts/tiktok"

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
    // Stamping here is what keeps the feed's opportunistic import quiet: a
    // manual sync counts as a sync, and the freshness window starts now.
    await recordTikTokSyncResult(user.id, { ok: true, imported: rows.length })
    return NextResponse.json({ ok: true, imported: rows.length, hasMore: page.hasMore, cursor: page.cursor || null })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    const status = message.includes("NOT_CONNECTED") ? 409 : 502
    console.error(`[Malik Shorts] tiktok sync failed provider=tiktok user=${user.id}: ${message.slice(0, 200)}`)
    // A missing connection is not a provider failure, so it must not start the
    // error cooldown - there is nothing to back off from.
    if (status !== 409) await recordTikTokSyncResult(user.id, { ok: false, error: message })
    return NextResponse.json({ error: message.includes("NOT_CONNECTED") ? "TIKTOK_NOT_CONNECTED" : "TIKTOK_SYNC_FAILED" }, { status })
  }
}
