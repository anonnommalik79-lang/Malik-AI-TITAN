import "server-only"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import type { MalikShortItem } from "@/lib/shorts/types"

export type ViewerFeedHistory = {
  seenPostIds: Set<string>
  discoverySeed: number
}

const WINDOW_DAYS = 30
const MAX_EVENTS = 500

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Load the viewer's recently watched post ids from the same event stream used
 * for view counting. This survives leaving Shorts, refreshing, signing out and
 * returning later, so the feed does not restart from the same first video.
 */
export async function loadViewerFeedHistory(userKey?: string): Promise<ViewerFeedHistory> {
  const empty = { seenPostIds: new Set<string>(), discoverySeed: 0 }
  if (!userKey || !getShortsSupabaseConfig()) return empty

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const rows = await shortsSupabaseRequest<Array<{ post_id?: string | null; created_at?: string | null }>>(
    `malik_shorts_events?select=post_id,created_at&user_key=eq.${encodeURIComponent(userKey)}&event_type=in.(view,complete,rewatch)&post_id=not.is.null&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${MAX_EVENTS}`,
  ).catch(() => [])

  const seenPostIds = new Set<string>()
  const seedParts: string[] = []
  for (const row of rows) {
    const postId = String(row?.post_id || "").trim()
    if (!postId || seenPostIds.has(postId)) continue
    seenPostIds.add(postId)
    if (seedParts.length < 32) seedParts.push(postId)
  }

  return {
    seenPostIds,
    discoverySeed: hashSeed(`${seenPostIds.size}:${seedParts.join("|")}`),
  }
}

export function withoutRecentlySeen(items: MalikShortItem[], history: ViewerFeedHistory) {
  if (!history.seenPostIds.size) return items
  return items.filter((item) => !history.seenPostIds.has(item.id))
}

const DISCOVERY: Record<"ru" | "kk" | "en", string[]> = {
  ru: [
    "Казахстан shorts",
    "Алматы shorts",
    "Астана shorts",
    "Казахстан юмор shorts",
    "Казахстан музыка shorts",
    "Казахстан спорт shorts",
    "Казахстан технологии shorts",
    "Казахстан vlog shorts",
    "казахский контент shorts",
    "Центральная Азия shorts",
  ],
  kk: [
    "Қазақстан shorts",
    "Алматы shorts қазақша",
    "Астана shorts қазақша",
    "қазақша әзіл shorts",
    "қазақша музыка shorts",
    "Қазақстан спорт shorts",
    "Қазақстан технология shorts",
    "қазақша vlog shorts",
    "қазақ контент shorts",
    "Қазақстан жастар shorts",
  ],
  en: [
    "Kazakhstan shorts",
    "Almaty shorts",
    "Astana shorts",
    "Kazakhstan travel shorts",
    "Kazakhstan music shorts",
    "Kazakhstan sport shorts",
    "Kazakhstan technology shorts",
    "Central Asia shorts",
    "Kazakhstan vlog shorts",
    "Kazakhstan culture shorts",
  ],
}

/** Change the discovery slice as the viewer consumes videos, while staying deterministic. */
export function youtubeDiscoveryQuery(language: string, seed: number) {
  const locale: "ru" | "kk" | "en" = language === "kk" ? "kk" : language === "en" ? "en" : "ru"
  const pool = DISCOVERY[locale]
  return pool[Math.abs(seed) % pool.length]
}
