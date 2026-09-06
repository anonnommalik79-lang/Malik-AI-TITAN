export type MalikShortSource = "malik" | "youtube" | "tiktok"

export type MalikShortPlayback =
  | { kind: "native"; url: string; poster?: string }
  | { kind: "youtube"; videoId: string }
  | { kind: "tiktok"; videoId: string; canonicalUrl?: string }

export type MalikShortCreator = {
  id: string
  /**
   * The row key in malik_shorts_profiles. For an imported creator this is a
   * Malik-internal, collision-safe name (`tt.cristiano`) - not something to
   * render as an @.
   */
  username: string
  /**
   * The platform's real public handle, parsed from a TikTok-issued URL, or null
   * when unknown. lib/shorts/tiktok-identity.ts#resolvePublicHandle decides
   * what to display; it is never guessed from the username or display name.
   */
  handle?: string | null
  displayName: string
  avatarUrl?: string
  bio?: string
  verified?: boolean
  external?: boolean
  claimed?: boolean
}

/**
 * Top-level counters are what the UI shows: external plus local.
 *
 * `local` and `external` are the two halves, kept apart so neither can
 * overwrite the other - malik_shorts_interact answers with the local half only,
 * and spreading that answer over the item is what used to drop a TikTok from
 * 40,000 likes to 1. lib/shorts/metrics.ts owns every operation on this shape.
 */
export type MalikShortMetrics = {
  views: number
  likes: number
  comments: number
  reposts: number
  saves: number
  shares: number
  watchTimeMs?: number
  completionRate?: number
  /** Malik's own counters for this post. Zero for a freshly imported video. */
  local?: {
    views: number
    likes: number
    comments: number
    reposts: number
    saves: number
    shares: number
  }
  /** What the source platform reports. Absent for Malik-native posts. */
  external?: {
    views?: number
    likes?: number
    comments?: number
    shares?: number
  }
}

export type MalikShortViewerState = {
  liked: boolean
  saved: boolean
  reposted: boolean
  following: boolean
}

export type MalikShortItem = {
  id: string
  source: MalikShortSource
  sourceId?: string
  sourceUrl?: string
  posterUrl?: string
  creator: MalikShortCreator
  playback: MalikShortPlayback
  caption: string
  hashtags: string[]
  language?: "kk" | "ru" | "en" | string
  region?: string
  durationSeconds?: number
  publishedAt?: string
  createdAt?: string
  metrics: MalikShortMetrics
  viewer: MalikShortViewerState
  rights: {
    canRemix: boolean
    canDownload: boolean
    canCrossPost: boolean
    attributionRequired: boolean
  }
}

export type MalikShortFeedResponse = {
  items: MalikShortItem[]
  cursor?: string
  generatedAt: string
  sources: {
    malik: boolean
    youtube: boolean
    tiktok: boolean
  }
}

export type MalikShortInteractionAction =
  | "view"
  | "like"
  | "unlike"
  | "save"
  | "unsave"
  | "repost"
  | "unrepost"
  | "share"
  | "follow"
  | "unfollow"
  | "not_interested"
  | "complete"
  | "rewatch"
  | "profile_view"

export type MalikShortInteractionPayload = {
  shortId: string
  action: MalikShortInteractionAction
  positionMs?: number
  durationMs?: number
  source?: MalikShortSource
}

export type MalikShortComment = {
  id: string
  shortId: string
  parentId?: string
  user: MalikShortCreator
  body: string
  likes: number
  createdAt: string
  viewerLiked?: boolean
}
