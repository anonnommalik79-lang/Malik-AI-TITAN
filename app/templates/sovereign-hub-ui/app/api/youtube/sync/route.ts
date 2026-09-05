import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig } from "@/lib/shorts/server"
import {
  fetchMyYouTubeChannel,
  fetchYouTubeUploads,
  getFreshYouTubeAccessToken,
  getStoredYouTubeConnection,
  materializeYouTubeCreatorVideos,
  storeYouTubeConnection,
} from "@/lib/shorts/youtube"
import { decryptShortsToken } from "@/lib/shorts/token-vault"

export const dynamic = "force-dynamic"

export async function POST() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  try {
    const connection = await getStoredYouTubeConnection(user.id)
    if (!connection) return NextResponse.json({ error: "YOUTUBE_NOT_CONNECTED" }, { status: 409 })
    const accessToken = await getFreshYouTubeAccessToken(user.id)
    const channel = await fetchMyYouTubeChannel(accessToken)
    const videos = await fetchYouTubeUploads(accessToken, channel, 300)
    let refreshToken = ""
    try { refreshToken = decryptShortsToken(connection.refresh_token_encrypted) } catch {}
    await storeYouTubeConnection({
      userKey: user.id,
      token: { access_token: accessToken, expires_in: 3600, scope: (connection.granted_scopes || []).join(" ") },
      channel,
      previousRefreshToken: refreshToken,
    })
    const rows = await materializeYouTubeCreatorVideos(user.id, videos)
    return NextResponse.json({ ok: true, imported: rows.length, channelId: channel.id })
  } catch (error) {
    console.error("[Malik Shorts] YouTube sync failed", error)
    return NextResponse.json({ error: "YOUTUBE_SYNC_FAILED" }, { status: 502 })
  }
}
