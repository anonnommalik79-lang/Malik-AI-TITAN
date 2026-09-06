import { buildShortMetrics, type ShortMetricsShape } from "@/lib/shorts/metrics"
import { parseTikTokHandle } from "@/lib/shorts/tiktok-identity"

/**
 * One reading of a malik_shorts_feed_v1 row, shared by every route that returns
 * posts.
 *
 * The feed route got the counters right - display is external plus local - and
 * /api/shorts/profile and /api/shorts/library kept their own inline mapping
 * that read only the local columns. The same imported TikTok therefore showed
 * 40,007 likes in the feed and 7 in the library, which reads as data loss to
 * anyone who scrolls between the two. The formula was duplicated, so fixing it
 * in one place fixed one third of the product.
 *
 * These two helpers are the whole of that shared reading: nothing else about
 * the row shapes was unified, because the three routes legitimately return
 * different fields around them.
 *
 * Pure and free of runtime imports beyond the two helpers it composes, so the
 * verifier can assert that all three routes agree without a database.
 */

export type ShortsFeedRow = Record<string, any>

/** Display counters for a feed-view row: external plus local, one formula. */
export function rowMetrics(row: ShortsFeedRow): ShortMetricsShape {
  return buildShortMetrics(
    {
      views: row?.views,
      likes: row?.likes,
      comments: row?.comments,
      reposts: row?.reposts,
      saves: row?.saves,
      shares: row?.shares,
    },
    {
      views: row?.external_views,
      likes: row?.external_likes,
      comments: row?.external_comments,
      shares: row?.external_shares,
    },
  )
}

/**
 * The creator's real public handle for this row, or null.
 *
 * For an imported TikTok the stored username is a Malik row key (`tt.…`), and
 * the platform's own handle sits inside the share_url TikTok issued. Reading it
 * here, next to the counters, is what keeps `tt.*` from reaching a card in the
 * library or the profile grid the way it already cannot reach the feed.
 */
export function rowPublicHandle(row: ShortsFeedRow): string | null {
  return String(row?.source || "") === "tiktok" ? parseTikTokHandle(row?.source_url) : null
}
