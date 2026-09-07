import "server-only"

import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export type UnifiedYouTubePost = {
  id: string
  sourceId: string
  creatorKey: string
}

export async function resolveUnifiedYouTubePost(shortId: string): Promise<UnifiedYouTubePost | null> {
  if (!getShortsSupabaseConfig() || !/^[0-9a-f-]{36}$/i.test(shortId)) return null

  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_posts?select=id,source,source_id,creator_key&id=eq.${encodeURIComponent(shortId)}&limit=1`,
  ).catch(() => [])
  const row = rows[0]
  if (!row || row.source !== "youtube" || !row.source_id) return null

  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    creatorKey: String(row.creator_key || ""),
  }
}

export function youtubeChannelIdFromCreatorKey(creatorKey: string) {
  return creatorKey.startsWith("youtube:") ? creatorKey.slice("youtube:".length) : ""
}

/**
 * Keep viewer state in Malik without touching Malik-local counters.
 *
 * YouTube remains the source of truth for the actual like/save/subscription.
 * These rows only let the unified Malik UI remember which controls are active,
 * populate its Library/Following sections, and hydrate state after reload.
 * Updating malik_shorts_counters here would double-count YouTube likes because
 * external_likes already contains the platform's authoritative count.
 */
export async function mirrorYouTubeViewerState(
  userKey: string,
  post: UnifiedYouTubePost,
  action: "like" | "unlike" | "save" | "unsave" | "follow" | "unfollow",
) {
  if (!getShortsSupabaseConfig()) return

  try {
    if (action === "like") {
      await shortsSupabaseRequest("malik_shorts_likes?on_conflict=post_id,user_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ post_id: post.id, user_key: userKey }),
      })
      return
    }
    if (action === "unlike") {
      await shortsSupabaseRequest(
        `malik_shorts_likes?post_id=eq.${encodeURIComponent(post.id)}&user_key=eq.${encodeURIComponent(userKey)}`,
        { method: "DELETE" },
      )
      return
    }
    if (action === "save") {
      await shortsSupabaseRequest("malik_shorts_saves?on_conflict=post_id,user_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ post_id: post.id, user_key: userKey }),
      })
      return
    }
    if (action === "unsave") {
      await shortsSupabaseRequest(
        `malik_shorts_saves?post_id=eq.${encodeURIComponent(post.id)}&user_key=eq.${encodeURIComponent(userKey)}`,
        { method: "DELETE" },
      )
      return
    }

    const followingKey = post.creatorKey
    if (!followingKey || followingKey === userKey) return
    if (action === "follow") {
      await shortsSupabaseRequest("malik_shorts_follows?on_conflict=follower_key,following_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ follower_key: userKey, following_key: followingKey }),
      })
      return
    }
    if (action === "unfollow") {
      await shortsSupabaseRequest(
        `malik_shorts_follows?follower_key=eq.${encodeURIComponent(userKey)}&following_key=eq.${encodeURIComponent(followingKey)}`,
        { method: "DELETE" },
      )
    }
  } catch (error) {
    // The YouTube mutation already succeeded. A local mirror failure must never
    // be reported as a failed YouTube action; the next interaction can repair it.
    console.warn("[Malik Shorts] YouTube viewer-state mirror failed", error)
  }
}
