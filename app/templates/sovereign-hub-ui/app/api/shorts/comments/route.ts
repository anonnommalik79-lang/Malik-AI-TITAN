import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { resolveUnifiedYouTubePost } from "@/lib/shorts/youtube-unified"
import { listPublicYouTubeComments } from "@/lib/shorts/youtube-public-comments"
import { youtube, type Resource } from "@/lib/youtube/client"
import { failure } from "@/lib/youtube/http"
import { connection } from "@/lib/youtube/store"
import { mapComment } from "@/lib/youtube/resources"
import { videoIdValid } from "@/lib/youtube/contracts"
import type { YouTubeComment } from "@/lib/youtube/contracts"

export const dynamic = "force-dynamic"

function validUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function unifiedYouTubeComment(shortId: string, row: YouTubeComment) {
  return {
    id: row.id,
    shortId,
    parentId: row.parentId || undefined,
    body: row.text,
    likes: Number(row.likes || 0),
    createdAt: row.publishedAt || new Date().toISOString(),
    viewerLiked: row.viewerRating === "like",
    user: {
      id: row.channelId ? `youtube:${row.channelId}` : `youtube-comment:${row.id}`,
      username: row.author || "youtube",
      displayName: row.author || "YouTube",
      avatarUrl: row.avatar || undefined,
      verified: false,
      external: true,
      claimed: false,
    },
  }
}

async function loadUnifiedYouTubeComments(shortId: string, videoId: string, limit: number) {
  const result = await listPublicYouTubeComments(videoId, limit)
  return {
    items: result.items.map((row) => unifiedYouTubeComment(shortId, row)),
    provider: "youtube",
    nextPageToken: result.nextPageToken,
    disabled: Boolean(result.disabled),
    persistence: true,
  }
}

export async function GET(request: NextRequest) {
  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 80, 40)
  if (!validUuid(shortId)) return NextResponse.json({ error: "INVALID_SHORT_ID" }, { status: 400 })

  const youtubePost = await resolveUnifiedYouTubePost(shortId)
  if (youtubePost && videoIdValid(youtubePost.sourceId)) {
    try {
      const result = await loadUnifiedYouTubeComments(shortId, youtubePost.sourceId, limit)
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
    } catch (error) {
      console.error("[Malik Shorts] YouTube public comments load failed", error)
      return failure(error)
    }
  }

  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })

  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_comments?select=id,post_id,parent_id,body,like_count,created_at,user_key,malik_shorts_profiles!inner(username,display_name,avatar_url,verified)&post_id=eq.${encodeURIComponent(shortId)}&status=eq.visible&order=created_at.desc&limit=${limit}`,
  ).catch(() => [])

  const items = rows.map((row) => ({
    id: String(row.id),
    shortId: String(row.post_id),
    parentId: row.parent_id || undefined,
    body: String(row.body || ""),
    likes: Number(row.like_count || 0),
    createdAt: row.created_at,
    user: {
      id: String(row.user_key),
      username: String(row.malik_shorts_profiles?.username || "user"),
      displayName: String(row.malik_shorts_profiles?.display_name || row.malik_shorts_profiles?.username || "User"),
      avatarUrl: row.malik_shorts_profiles?.avatar_url || undefined,
      verified: Boolean(row.malik_shorts_profiles?.verified),
    },
  }))

  return NextResponse.json({ items, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })

  let input: { shortId?: string; body?: string; parentId?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const shortId = safeText(input.shortId, 80)
  const parentId = safeText(input.parentId, 180)
  const body = safeText(input.body, 2200)
  if (!validUuid(shortId) || !body) {
    return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 })
  }

  const youtubePost = await resolveUnifiedYouTubePost(shortId)
  if (youtubePost && videoIdValid(youtubePost.sourceId)) {
    try {
      const own = await connection(user.id)
      let created: YouTubeComment

      if (parentId) {
        const resource = await youtube<Resource>(
          user.id,
          "comments",
          { part: "snippet" },
          "POST",
          { snippet: { parentId, textOriginal: body } },
        )
        created = mapComment(resource, own?.channel_id || "")
      } else {
        const resource = await youtube<Resource>(
          user.id,
          "commentThreads",
          { part: "snippet" },
          "POST",
          { snippet: { videoId: youtubePost.sourceId, topLevelComment: { snippet: { textOriginal: body } } } },
        )
        created = mapComment(resource.snippet?.topLevelComment as Resource, own?.channel_id || "")
      }

      return NextResponse.json({
        ok: true,
        id: created.id,
        item: unifiedYouTubeComment(shortId, created),
        provider: "youtube",
      }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
    } catch (error) {
      console.error("[Malik Shorts] YouTube comment publish failed", error)
      return failure(error)
    }
  }

  if (parentId && !validUuid(parentId)) return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  try {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_create_comment", {
      method: "POST",
      body: JSON.stringify({
        p_user_key: user.id,
        p_post_id: shortId,
        p_body: body,
        p_parent_id: parentId || null,
      }),
    })
    const id = typeof response === "string" ? response : Array.isArray(response) ? response[0] : response
    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] comment failed", error)
    return NextResponse.json({ error: "COMMENT_FAILED" }, { status: 500 })
  }
}
