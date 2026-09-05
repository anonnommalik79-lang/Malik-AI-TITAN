export type MalikShortSource = "malik" | "youtube" | "tiktok"

export type MalikShortPlayback =
  | { kind: "native"; url: string; poster?: string }
  | { kind: "youtube"; videoId: string }
  | { kind: "tiktok"; videoId: string; canonicalUrl?: string }

export type MalikShortCreator = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  bio?: string
  verified?: boolean
  external?: boolean
  claimed?: boolean
}

export type MalikShortMetrics = {
  views: number
  likes: number
  comments: number
  reposts: number
  saves: number
  shares: number
  watchTimeMs?: number
  completionRate?: number
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
