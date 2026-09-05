import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getYouTubeShortsConfig, safeText } from "@/lib/shorts/server"
import {
  createYouTubeComment,
  fetchYouTubeCommentThreads,
  fetchYouTubeReplies,
  getFreshYouTubeAccessToken,
  replyYouTubeComment,
} from "@/lib/shorts/youtube"

export const dynamic = "force-dynamic"

function cleanVideoId(value: unknown) {
  const id = safeText(value, 128)
  return /^[A-Za-z0-9_-]{6,128}$/.test(id) ? id : ""
}

function mapReply(item: any) {
  const snippet = item?.snippet || {}
  return {
    id: String(item?.id || ""),
    parentId: snippet.parentId || undefined,
    body: String(snippet.textDisplay || snippet.textOriginal || ""),
    likes: Number(snippet.likeCount || 0),
    createdAt: snippet.publishedAt || new Date().toISOString(),
    updatedAt: snippet.updatedAt || undefined,
    user: {
      id: String(snippet.authorChannelId?.value || snippet.authorDisplayName || "youtube-user"),
      username: String(snippet.authorDisplayName || "YouTube user"),
      displayName: String(snippet.authorDisplayName || "YouTube user"),
      avatarUrl: snippet.authorProfileImageUrl || undefined,
      external: true,
      claimed: false,
    },
  }
}

function mapThread(item: any) {
  const top = item?.snippet?.topLevelComment
  const mappedTop = mapReply(top)
  const replies = Array.isArray(item?.replies?.comments) ? item.replies.comments.map(mapReply) : []
  return {
    ...mappedTop,
    threadId: String(item?.id || mappedTop.id),
    totalReplyCount: Number(item?.snippet?.totalReplyCount || replies.length),
    replies,
  }
}

async function publicComments(videoId: string, pageToken?: string) {
  const config = getYouTubeShortsConfig()
  if (!config) throw new Error("YOUTUBE_API_KEY_NOT_CONFIGURED")
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads")
  url.searchParams.set("part", "snippet,replies")
  url.searchParams.set("videoId", videoId)
  url.searchParams.set("maxResults", "100")
  url.searchParams.set("order", "relevance")
  url.searchParams.set("textFormat", "plainText")
  if (pageToken) url.searchParams.set("pageToken", pageToken)
  url.searchParams.set("key", config.apiKey)
  const response = await fetch(url, { cache: "no-store" })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`YOUTUBE_COMMENTS_${response.status}`)
  return { items: Array.isArray(json?.items) ? json.items : [], nextPageToken: json?.nextPageToken || undefined }
}

async function publicReplies(parentId: string, pageToken?: string) {
  const config = getYouTubeShortsConfig()
  if (!config) throw new Error("YOUTUBE_API_KEY_NOT_CONFIGURED")
  const url = new URL("https://www.googleapis.com/youtube/v3/comments")
  url.searchParams.set("part", "snippet")
  url.searchParams.set("parentId", parentId)
  url.searchParams.set("maxResults", "100")
  url.searchParams.set("textFormat", "plainText")
  if (pageToken) url.searchParams.set("pageToken", pageToken)
  url.searchParams.set("key", config.apiKey)
  const response = await fetch(url, { cache: "no-store" })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`YOUTUBE_REPLIES_${response.status}`)
  return { items: Array.isArray(json?.items) ? json.items : [], nextPageToken: json?.nextPageToken || undefined }
}

export async function GET(request: NextRequest) {
  const videoId = cleanVideoId(request.nextUrl.searchParams.get("videoId"))
  const parentId = safeText(request.nextUrl.searchParams.get("parentId"), 180)
  const pageToken = safeText(request.nextUrl.searchParams.get("pageToken"), 256) || undefined
  if (!videoId && !parentId) return NextResponse.json({ error: "VIDEO_OR_PARENT_REQUIRED" }, { status: 400 })

  const { user } = await getOptionalWorkOSAuth()
  try {
    let page: { items: any[]; nextPageToken?: string }
    if (user) {
      try {
        const accessToken = await getFreshYouTubeAccessToken(user.id)
        page = parentId
          ? await fetchYouTubeReplies(accessToken, parentId, pageToken, 100)
          : await fetchYouTubeCommentThreads(accessToken, videoId, pageToken, 100)
      } catch {
        page = parentId ? await publicReplies(parentId, pageToken) : await publicComments(videoId, pageToken)
      }
    } else {
      page = parentId ? await publicReplies(parentId, pageToken) : await publicComments(videoId, pageToken)
    }

    const items = parentId ? page.items.map(mapReply) : page.items.map(mapThread)
    return NextResponse.json({ items, nextPageToken: page.nextPageToken || null }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[Malik Shorts] YouTube comments read failed", error)
    return NextResponse.json({ error: "YOUTUBE_COMMENTS_FAILED", items: [] }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })

  let input: { videoId?: string; parentId?: string; body?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const videoId = cleanVideoId(input.videoId)
  const parentId = safeText(input.parentId, 180)
  const body = safeText(input.body, 10000)
  if (!body || (!videoId && !parentId)) return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 })

  try {
    const accessToken = await getFreshYouTubeAccessToken(user.id)
    const result = parentId
      ? await replyYouTubeComment(accessToken, parentId, body)
      : await createYouTubeComment(accessToken, videoId, body)
    return NextResponse.json({ ok: true, result }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] YouTube comment write failed", error)
    return NextResponse.json({ error: "YOUTUBE_COMMENT_WRITE_FAILED" }, { status: 502 })
  }
}
