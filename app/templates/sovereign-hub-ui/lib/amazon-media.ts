import { unsplashPhoto } from "./section-media"

/** Base URL for Amazon S3 / CloudFront media — override via env. */
export function getAmazonMediaBase(): string {
  const base = process.env.NEXT_PUBLIC_AMAZON_MEDIA_BASE?.trim()
  if (base) return base.replace(/\/$/, "")
  return ""
}

export type AmazonMediaAsset = {
  id: string
  title: string
  kind: "photo" | "video"
  /** Resolved URL (Amazon CDN or fallback). */
  url: string
  poster?: string
  tag: string
}

const FALLBACK_PHOTOS = {
  studio: unsplashPhoto("photo-1598483644766-792bd69c9e18", 900),
  broadcast: unsplashPhoto("photo-1585829367313-978306c6eca4", 900),
  astana: unsplashPhoto("photo-1565008576549-57569a49371d", 900),
  cyber: unsplashPhoto("photo-1518770660439-4636190af475", 900),
  data: unsplashPhoto("photo-1551288049-bebda4e38f71", 900),
} as const

/** Relative paths under NEXT_PUBLIC_AMAZON_MEDIA_BASE (user swaps S3 keys here). */
const AMAZON_MEDIA_CATALOG: Array<Omit<AmazonMediaAsset, "url"> & { path: string; fallback: string }> = [
  { id: "amz-photo-studio", title: "AWS Studio Loop", kind: "photo", path: "/media/loops/studio-hero.jpg", fallback: FALLBACK_PHOTOS.studio, tag: "Photo · AWS" },
  { id: "amz-photo-broadcast", title: "Broadcast Prime", kind: "photo", path: "/media/loops/broadcast-prime.jpg", fallback: FALLBACK_PHOTOS.broadcast, tag: "TV · CDN" },
  { id: "amz-photo-astana", title: "Astana Hub CDN", kind: "photo", path: "/media/loops/astana-hub.jpg", fallback: FALLBACK_PHOTOS.astana, tag: "Astana · Hub" },
  { id: "amz-video-cinema", title: "Cinema Loop", kind: "video", path: "/media/loops/cinema-loop.mp4", poster: "/media/posters/cinema-loop.jpg", fallback: FALLBACK_PHOTOS.cyber, tag: "Video · Loop" },
  { id: "amz-video-data", title: "Data Core Flythrough", kind: "video", path: "/media/loops/data-core.mp4", poster: "/media/posters/data-core.jpg", fallback: FALLBACK_PHOTOS.data, tag: "Tech · Motion" },
  { id: "amz-video-launch", title: "Product Launch", kind: "video", path: "/media/loops/product-launch.mp4", poster: "/media/posters/product-launch.jpg", fallback: FALLBACK_PHOTOS.astana, tag: "Launch · AWS" },
]

function resolveAmazonUrl(path: string, fallback: string): string {
  const base = getAmazonMediaBase()
  if (!base) return fallback
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

export function listAmazonMediaAssets(): AmazonMediaAsset[] {
  return AMAZON_MEDIA_CATALOG.map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.kind,
    url: resolveAmazonUrl(item.path, item.fallback),
    poster: item.poster ? resolveAmazonUrl(item.poster, item.fallback) : item.fallback,
    tag: item.tag,
  }))
}

export function amazonPhotoUrl(id: string, fallback?: string): string {
  const item = AMAZON_MEDIA_CATALOG.find((entry) => entry.id === id && entry.kind === "photo")
  if (!item) return fallback || FALLBACK_PHOTOS.studio
  return resolveAmazonUrl(item.path, fallback || item.fallback)
}

export function amazonVideoUrl(id: string, fallback?: string): { src: string; poster: string } {
  const item = AMAZON_MEDIA_CATALOG.find((entry) => entry.id === id && entry.kind === "video")
  if (!item) {
    const poster = fallback || FALLBACK_PHOTOS.cyber
    return { src: poster, poster }
  }
  return {
    src: resolveAmazonUrl(item.path, item.fallback),
    poster: item.poster ? resolveAmazonUrl(item.poster, item.fallback) : item.fallback,
  }
}

/** Merge Amazon CDN URLs into template photo/video fields when base is configured. */
export function withAmazonMedia<T extends { photo: string; video?: string }>(
  template: T,
  photoId: string,
  videoId?: string,
): T {
  const photo = amazonPhotoUrl(photoId, template.photo)
  if (!videoId || !template.video) return { ...template, photo }
  const video = amazonVideoUrl(videoId, template.video)
  return { ...template, photo, video: video.src }
}
