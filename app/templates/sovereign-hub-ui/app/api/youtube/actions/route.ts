import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { safeText } from "@/lib/shorts/server"
import {
  getFreshYouTubeAccessToken,
  rateYouTubeVideo,
  subscribeYouTubeChannel,
  unsubscribeYouTubeChannel,
} from "@/lib/shorts/youtube"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })

  let input: { kind?: string; action?: string; videoId?: string; channelId?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const kind = safeText(input.kind, 40)
  const action = safeText(input.action, 40)
  const videoId = safeText(input.videoId, 128)
  const channelId = safeText(input.channelId, 128)

  try {
    const accessToken = await getFreshYouTubeAccessToken(user.id)
    if (kind === "rating") {
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(videoId)) return NextResponse.json({ error: "INVALID_VIDEO_ID" }, { status: 400 })
      const rating = action === "like" ? "like" : action === "dislike" ? "dislike" : action === "none" ? "none" : null
      if (!rating) return NextResponse.json({ error: "INVALID_RATING" }, { status: 400 })
      await rateYouTubeVideo(accessToken, videoId, rating)
      return NextResponse.json({ ok: true, kind, rating })
    }

    if (kind === "subscription") {
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(channelId)) return NextResponse.json({ error: "INVALID_CHANNEL_ID" }, { status: 400 })
      if (action === "subscribe") await subscribeYouTubeChannel(accessToken, channelId)
      else if (action === "unsubscribe") await unsubscribeYouTubeChannel(accessToken, channelId)
      else return NextResponse.json({ error: "INVALID_SUBSCRIPTION_ACTION" }, { status: 400 })
      return NextResponse.json({ ok: true, kind, subscribed: action === "subscribe" })
    }

    return NextResponse.json({ error: "INVALID_ACTION_KIND" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] YouTube action failed", error)
    return NextResponse.json({ error: "YOUTUBE_ACTION_FAILED" }, { status: 502 })
  }
}
