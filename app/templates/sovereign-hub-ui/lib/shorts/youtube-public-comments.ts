import "server-only"
import { getYouTubeShortsConfig } from "@/lib/shorts/server"
import type { YouTubeComment } from "@/lib/youtube/contracts"

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function count(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined
}

function mapPublicComment(row: any, parentId?: string): YouTubeComment {
  const snippet = row?.snippet || {}
  const channelId = text(snippet?.authorChannelId?.value) || undefined
  return {
    id: text(row?.id),
    parentId: parentId || text(snippet?.parentId) || undefined,
    author: text(snippet?.authorDisplayName) || "YouTube",
    channelId,
    avatar: text(snippet?.authorProfileImageUrl) || undefined,
    text: text(snippet?.textOriginal || snippet?.textDisplay),
    publishedAt: text(snippet?.publishedAt),
    updatedAt: text(snippet?.updatedAt),
    likes: count(snippet?.likeCount),
    replyCount: 0,
    own: false,
  }
}

export type PublicYouTubeCommentsResult = {
  items: YouTubeComment[]
  nextPageToken?: string
  disabled?: boolean
}

/**
 * Read public YouTube comments with the server API key, not the viewer's OAuth.
 *
 * Malik Shorts can show a public YouTube video before the viewer has ever linked
 * a YouTube account. Requiring that personal OAuth connection just to read the
 * video's public discussion made the drawer look empty for almost everyone.
 * Writes still go through OAuth in /api/shorts/comments; this helper is read-only.
 */
export async function listPublicYouTubeComments(videoId: string, limit = 50): Promise<PublicYouTubeCommentsResult> {
  const config = getYouTubeShortsConfig()
  if (!config) throw new Error("YOUTUBE_CONFIGURATION_REQUIRED")

  const wanted = Math.max(1, Math.min(100, Math.floor(limit || 50)))
  const items: YouTubeComment[] = []
  let pageToken = ""

  for (let page = 0; page < 3 && items.length < wanted; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads")
    url.searchParams.set("part", "snippet,replies")
    url.searchParams.set("videoId", videoId)
    url.searchParams.set("order", "relevance")
    url.searchParams.set("textFormat", "plainText")
    url.searchParams.set("maxResults", String(Math.min(100, Math.max(20, wanted - items.length))))
    url.searchParams.set("key", config.apiKey)
    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const reason = text(payload?.error?.errors?.[0]?.reason) || text(payload?.error?.status) || `HTTP_${response.status}`
      if (reason === "commentsDisabled") return { items: [], disabled: true }
      throw new Error(`YOUTUBE_COMMENTS_${response.status}:${reason}`)
    }

    for (const thread of Array.isArray(payload?.items) ? payload.items : []) {
      const top = thread?.snippet?.topLevelComment
      if (top?.id) items.push(mapPublicComment(top))
      const replies = Array.isArray(thread?.replies?.comments) ? thread.replies.comments : []
      for (const reply of replies) {
        if (items.length >= wanted) break
        if (reply?.id) items.push(mapPublicComment(reply, text(top?.id) || undefined))
      }
      if (items.length >= wanted) break
    }

    pageToken = text(payload?.nextPageToken)
    if (!pageToken) break
  }

  return { items: items.slice(0, wanted), nextPageToken: pageToken || undefined }
}
