import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getYouTubeShortsConfig, safeText } from "@/lib/shorts/server"
import { fetchYouTubeChannelById, fetchYouTubeUploads, getFreshYouTubeAccessToken } from "@/lib/shorts/youtube"

export const dynamic = "force-dynamic"

function n(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function isoDurationSeconds(value?: string) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return undefined
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

async function fetchPublicChannel(channelId: string) {
  const config = getYouTubeShortsConfig()
  if (!config) throw new Error("YOUTUBE_API_KEY_NOT_CONFIGURED")
  const url = new URL("https://www.googleapis.com/youtube/v3/channels")
  url.searchParams.set("part", "snippet,statistics,contentDetails")
  url.searchParams.set("id", channelId)
  url.searchParams.set("maxResults", "1")
  url.searchParams.set("key", config.apiKey)
  const response = await fetch(url, { cache: "no-store" })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.items?.[0]?.id) throw new Error("YOUTUBE_CHANNEL_FAILED")
  return json.items[0]
}

async function fetchPublicUploads(channel: any, maxVideos = 100) {
  const config = getYouTubeShortsConfig()
  if (!config) throw new Error("YOUTUBE_API_KEY_NOT_CONFIGURED")
  const playlistId = channel?.contentDetails?.relatedPlaylists?.uploads
  if (!playlistId) return [] as any[]
  const ids: string[] = []
  let pageToken = ""
  while (ids.length < maxVideos) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems")
    url.searchParams.set("part", "contentDetails")
    url.searchParams.set("playlistId", playlistId)
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("key", config.apiKey)
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const response = await fetch(url, { cache: "no-store" })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) break
    for (const item of Array.isArray(json?.items) ? json.items : []) {
      const id = String(item?.contentDetails?.videoId || "")
      if (id && !ids.includes(id)) ids.push(id)
      if (ids.length >= maxVideos) break
    }
    pageToken = String(json?.nextPageToken || "")
    if (!pageToken) break
  }

  const items: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("part", "snippet,statistics,contentDetails,status")
    url.searchParams.set("id", ids.slice(i, i + 50).join(","))
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("key", config.apiKey)
    const response = await fetch(url, { cache: "no-store" })
    const json = await response.json().catch(() => ({}))
    if (response.ok && Array.isArray(json?.items)) items.push(...json.items)
  }
  return items
}

export async function GET(request: NextRequest) {
  const channelId = safeText(request.nextUrl.searchParams.get("channelId"), 128)
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(channelId)) return NextResponse.json({ error: "INVALID_CHANNEL_ID" }, { status: 400 })

  const { user } = await getOptionalWorkOSAuth()
  try {
    let channel: any
    let videos: any[]
    if (user) {
      try {
        const accessToken = await getFreshYouTubeAccessToken(user.id)
        channel = await fetchYouTubeChannelById(accessToken, channelId)
        videos = await fetchYouTubeUploads(accessToken, channel, 200)
      } catch {
        channel = await fetchPublicChannel(channelId)
        videos = await fetchPublicUploads(channel, 200)
      }
    } else {
      channel = await fetchPublicChannel(channelId)
      videos = await fetchPublicUploads(channel, 200)
    }

    const avatar = channel?.snippet?.thumbnails?.high?.url || channel?.snippet?.thumbnails?.medium?.url || channel?.snippet?.thumbnails?.default?.url || null
    return NextResponse.json({
      profile: {
        channelId: channel.id,
        username: channel?.snippet?.customUrl || channel?.snippet?.title || channel.id,
        displayName: channel?.snippet?.title || "YouTube creator",
        avatarUrl: avatar,
        bio: channel?.snippet?.description || "",
        subscriberCount: n(channel?.statistics?.subscriberCount),
        hiddenSubscriberCount: Boolean(channel?.statistics?.hiddenSubscriberCount),
        viewCount: n(channel?.statistics?.viewCount),
        videoCount: n(channel?.statistics?.videoCount),
      },
      videos: videos.map((video) => ({
        id: String(video.id),
        title: String(video?.snippet?.title || ""),
        description: String(video?.snippet?.description || ""),
        publishedAt: video?.snippet?.publishedAt || null,
        posterUrl: video?.snippet?.thumbnails?.maxres?.url || video?.snippet?.thumbnails?.high?.url || video?.snippet?.thumbnails?.medium?.url || null,
        durationSeconds: isoDurationSeconds(video?.contentDetails?.duration),
        views: n(video?.statistics?.viewCount),
        likes: n(video?.statistics?.likeCount),
        comments: n(video?.statistics?.commentCount),
        embeddable: video?.status?.embeddable !== false,
        privacyStatus: video?.status?.privacyStatus || "public",
        sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[Malik Shorts] YouTube profile failed", error)
    return NextResponse.json({ error: "YOUTUBE_PROFILE_FAILED" }, { status: 502 })
  }
}
