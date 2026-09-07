import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { mirrorYouTubeViewerState, resolveUnifiedYouTubePost, youtubeChannelIdFromCreatorKey } from "@/lib/shorts/youtube-unified"
import type { MalikShortInteractionPayload } from "@/lib/shorts/types"
import { youtube } from "@/lib/youtube/client"
import { failure } from "@/lib/youtube/http"
import { setSaved, setSubscription } from "@/lib/youtube/resources"
import { videoIdValid, channelIdValid } from "@/lib/youtube/contracts"

export const dynamic = "force-dynamic"

const ALLOWED = new Set([
  "view", "like", "unlike", "save", "unsave", "repost", "unrepost", "share",
  "follow", "unfollow", "complete", "rewatch", "profile_view", "not_interested",
])

function intOrNull(value: unknown) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= 0 ? Math.min(number, 86_400_000) : null
}

/**
 * The answer when the database could not be reached.
 *
 * It used to return a `metrics` object - `{ likes: 1 }` after a like. But
 * `metrics` means absolute Malik-local counters everywhere else in this API,
 * and the client folds it in as such, so a post carrying 37 local likes on top
 * of 40,000 external ones fell to 40,001 the moment one RPC call failed. The
 * numbers were a delta wearing the name of an absolute.
 *
 * Deltas now travel under `metricDeltas`, and the two shapes never share a
 * field, so neither side can mistake one for the other. `persistence: false`
 * still marks the answer as unsaved. Viewer state is reported either way: the
 * heart should fill even when the write did not land.
 */
function optimisticResult(action: string) {
  const viewer: Record<string, boolean> = {}
  const metricDeltas: Record<string, number> = {}

  if (action === "like") { viewer.liked = true; metricDeltas.likes = 1 }
  if (action === "unlike") { viewer.liked = false; metricDeltas.likes = -1 }
  if (action === "save") { viewer.saved = true; metricDeltas.saves = 1 }
  if (action === "unsave") { viewer.saved = false; metricDeltas.saves = -1 }
  if (action === "repost") { viewer.reposted = true; metricDeltas.reposts = 1 }
  if (action === "unrepost") { viewer.reposted = false; metricDeltas.reposts = -1 }
  if (action === "share") metricDeltas.shares = 1
  if (action === "follow") viewer.following = true
  if (action === "unfollow") viewer.following = false

  return {
    ok: true,
    persistence: false,
    action,
    ...(Object.keys(viewer).length ? { viewer } : {}),
    ...(Object.keys(metricDeltas).length ? { metricDeltas } : {}),
  }
}

async function handleConnectedYouTubeAction(userKey: string, shortId: string, action: string) {
  if (!["like", "unlike", "save", "unsave", "follow", "unfollow"].includes(action)) return null

  const post = await resolveUnifiedYouTubePost(shortId)
  if (!post || !videoIdValid(post.sourceId)) return null

  try {
    if (action === "like" || action === "unlike") {
      const liked = action === "like"
      await youtube(userKey, "videos/rate", { id: post.sourceId, rating: liked ? "like" : "none" }, "POST")
      await mirrorYouTubeViewerState(userKey, post, liked ? "like" : "unlike")
      return NextResponse.json({
        ...optimisticResult(action),
        provider: "youtube",
        viewer: { liked },
      }, { headers: { "Cache-Control": "private, no-store" } })
    }

    if (action === "save" || action === "unsave") {
      const result = await setSaved(userKey, post.sourceId, action === "save")
      await mirrorYouTubeViewerState(userKey, post, result.saved ? "save" : "unsave")
      return NextResponse.json({
        ...optimisticResult(result.saved ? "save" : "unsave"),
        provider: "youtube",
        viewer: { saved: result.saved },
      }, { headers: { "Cache-Control": "private, no-store" } })
    }

    const channelId = youtubeChannelIdFromCreatorKey(post.creatorKey)
    if (!channelIdValid(channelId)) return NextResponse.json({ error: "YOUTUBE_CHANNEL_UNKNOWN" }, { status: 409 })
    const result = await setSubscription(userKey, channelId, action === "follow")
    await mirrorYouTubeViewerState(userKey, post, result.subscribed ? "follow" : "unfollow")
    return NextResponse.json({
      ...optimisticResult(result.subscribed ? "follow" : "unfollow"),
      provider: "youtube",
      viewer: { following: result.subscribed },
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    // Do not lie with an optimistic Malik-only success when the user explicitly
    // clicked a YouTube action. The connected YouTube API is authoritative.
    console.error("[Malik Shorts] connected YouTube action failed", error)
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })

  let input: MalikShortInteractionPayload & { sessionId?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const shortId = safeText(input.shortId, 80)
  const action = safeText(input.action, 40)
  if (!/^[0-9a-f-]{36}$/i.test(shortId) || !ALLOWED.has(action)) {
    return NextResponse.json({ error: "INVALID_INTERACTION" }, { status: 400 })
  }

  const source = input.source && ["malik", "youtube", "tiktok"].includes(input.source) ? input.source : null
  const sessionId = safeText(input.sessionId, 120) || null
  const positionMs = intOrNull(input.positionMs)
  const durationMs = intOrNull(input.durationMs)
  const fallback = optimisticResult(action)

  // The unified UI keeps its own buttons, but YouTube-owned mutations must go
  // through the connected YouTube API instead of pretending to be Malik likes.
  if (source === "youtube") {
    const connected = await handleConnectedYouTubeAction(user.id, shortId, action)
    if (connected) return connected
  }

  // Imported Shorts are still interactive when the optional social database is
  // not configured. TikTok/Malik-local actions keep the old optimistic path.
  if (!getShortsSupabaseConfig()) return NextResponse.json(fallback)

  try {
    const endpoint = action === "view" ? "rpc/malik_shorts_record_view" : "rpc/malik_shorts_interact"
    const body = action === "view"
      ? {
          p_user_key: user.id,
          p_post_id: shortId,
          p_position_ms: positionMs,
          p_duration_ms: durationMs,
          p_session_id: sessionId,
          p_source: source,
        }
      : {
          p_user_key: user.id,
          p_post_id: shortId,
          p_action: action,
          p_position_ms: positionMs,
          p_duration_ms: durationMs,
          p_session_id: sessionId,
          p_source: source,
        }
    const rows = await shortsSupabaseRequest<any>(endpoint, { method: "POST", body: JSON.stringify(body) })
    const result = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json({ ok: true, persistence: true, ...(result || {}) })
  } catch (error) {
    // TikTok may be visible while its optional persistence layer is unavailable.
    // YouTube mutations were already handled above and must never land here as a
    // fake success after a real Google API failure.
    if (source === "tiktok") {
      console.warn("[Malik Shorts] external interaction fell back to optimistic mode", error)
      return NextResponse.json(fallback)
    }
    console.error("[Malik Shorts] interaction failed", error)
    return NextResponse.json({ error: "INTERACTION_FAILED" }, { status: 500 })
  }
}
