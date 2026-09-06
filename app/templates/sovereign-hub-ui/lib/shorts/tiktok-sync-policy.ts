/**
 * When the feed is allowed to call TikTok.
 *
 * The first version asked "does the loaded page of the feed contain a TikTok".
 * That was wrong twice over. It depended on `limit`, so a creator whose posts
 * sat past row 18 looked un-imported and triggered a fresh API call on every
 * single page load; and it was a question about the whole pool rather than
 * about this viewer, so once anyone had connected TikTok, nobody else's videos
 * were ever pulled.
 *
 * The decision here is per creator and time-based, and it is pure so the
 * policy can be tested without a database or a clock.
 */

export type TikTokSyncState = {
  /** Does this Malik user have a TikTok connection at all. */
  connected: boolean
  /** `tiktok:<open_id>`, or null when not connected. */
  creatorKey: string | null
  /** ISO timestamp of the last successful import, from the connection metadata. */
  lastSyncAt?: string | null
  /** ISO timestamp of the last failed import. Throttles retries after an outage. */
  lastErrorAt?: string | null
  /** Whether this creator already has materialised posts, asked independently of the feed page. */
  hasPosts: boolean
  /** Newest materialised post for this creator, used when metadata predates this policy. */
  newestPostAt?: string | null
}

export type SyncDecision = {
  sync: boolean
  reason:
    | "not-connected"
    | "never-synced"
    | "stale"
    | "fresh"
    | "error-cooldown"
}

/** Imports older than this are refreshed. A creator's back catalogue does not move fast. */
export const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000

/**
 * After a failure, wait this long before trying again.
 *
 * Without it a revoked app or an expired refresh token means every feed request
 * makes a doomed TikTok call - the retry loop the brief asks to avoid. The
 * viewer still gets YouTube and Malik posts throughout.
 */
export const ERROR_COOLDOWN_MS = 30 * 60 * 1000

function parsed(value?: string | null): number | null {
  if (!value) return null
  const time = Date.parse(String(value))
  return Number.isFinite(time) ? time : null
}

export function decideTikTokSync(state: TikTokSyncState, now: number = Date.now()): SyncDecision {
  if (!state.connected || !state.creatorKey) return { sync: false, reason: "not-connected" }

  const lastError = parsed(state.lastErrorAt)
  if (lastError != null && now - lastError < ERROR_COOLDOWN_MS) {
    return { sync: false, reason: "error-cooldown" }
  }

  // A connection stamped by an older build has no lastSyncAt, so the newest
  // materialised post stands in for it. Without that fallback every existing
  // connection would look never-synced and re-import once on upgrade.
  const lastSuccess = parsed(state.lastSyncAt) ?? (state.hasPosts ? parsed(state.newestPostAt) : null)
  if (lastSuccess == null) return { sync: true, reason: "never-synced" }

  return now - lastSuccess >= FRESH_WINDOW_MS
    ? { sync: true, reason: "stale" }
    : { sync: false, reason: "fresh" }
}

/** How the providers endpoint labels a connection's freshness, without exposing anything private. */
export function freshnessLabel(state: TikTokSyncState, now: number = Date.now()): "never" | "fresh" | "stale" | "failing" {
  const lastError = parsed(state.lastErrorAt)
  const lastSuccess = parsed(state.lastSyncAt) ?? (state.hasPosts ? parsed(state.newestPostAt) : null)
  if (lastError != null && (lastSuccess == null || lastError > lastSuccess)) return "failing"
  if (lastSuccess == null) return "never"
  return now - lastSuccess >= FRESH_WINDOW_MS ? "stale" : "fresh"
}
