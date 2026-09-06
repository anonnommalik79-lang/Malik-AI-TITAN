import "server-only"
import { youtube, type Resource, type List } from "./client"
import { durationSeconds, type Channel, type YouTubeVideo, type YouTubeComment } from "./contracts"
import { connection, locked, patchConnection } from "./store"
import { YouTubeError } from "./errors"

const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value : ""
const count = (value: unknown) => value === undefined || value === null ? undefined : Number(value)
const image = (snippet: Record<string, unknown>) => {
  const thumbs = obj(snippet.thumbnails)
  return text(obj(thumbs.high || thumbs.medium || thumbs.default).url) || undefined
}
export function mapChannel(row: Resource): Channel {
  const s = row.snippet || {}, stats = row.statistics || {}
  return { id: row.id, title: text(s.title), handle: text(s.customUrl) || undefined, avatar: image(s), description: text(s.description), subscribers: stats.hiddenSubscriberCount === "true" || (stats.hiddenSubscriberCount as unknown) === true ? undefined : count(stats.subscriberCount), videoCount: count(stats.videoCount), uploads: text(obj(row.contentDetails?.relatedPlaylists).uploads) || undefined }
}
export async function channels(user: string, ids?: string[]) {
  const result = await youtube(user, "channels", { part: "snippet,contentDetails,statistics", ...(ids ? { id: [...new Set(ids)].slice(0, 50).join(",") } : { mine: "true" }), maxResults: "50" })
  return result.items.map(mapChannel)
}
export async function videos(user: string, ids: string[], withRating = false) {
  if (!ids.length) return []
  const result = await youtube(user, "videos", { part: "snippet,contentDetails,statistics,status", id: [...new Set(ids)].slice(0, 50).join(",") })
  if (!result.items.length) return []
  const authors = await channels(user, result.items.map((item) => text(item.snippet?.channelId)))
  const ratings = withRating ? await youtube<{ items: Array<{ videoId: string; rating: string }> }>(user, "videos/getRating", { id: ids.slice(0, 50).join(",") }) : { items: [] }
  return result.items.map((row): YouTubeVideo => {
    const s = row.snippet || {}, stats = row.statistics || {}
    return { id: row.id, sourceUrl: `https://www.youtube.com/watch?v=${row.id}`, title: text(s.title), description: text(s.description), thumbnail: image(s), duration: durationSeconds(text(row.contentDetails?.duration)), publishedAt: text(s.publishedAt), channel: authors.find((c) => c.id === s.channelId) || { id: text(s.channelId), title: text(s.channelTitle), description: "" }, views: count(stats.viewCount), likes: count(stats.likeCount), comments: count(stats.commentCount), rating: ratings.items.find((r) => r.videoId === row.id)?.rating }
  })
}
export async function subscription(user: string, channelId: string) {
  const rows = await youtube(user, "subscriptions", { part: "id", mine: "true", forChannelId: channelId, maxResults: "50" })
  return { subscribed: rows.items.length > 0, id: rows.items[0]?.id }
}
export async function setSubscription(user: string, channelId: string, enabled: boolean) {
  return locked(user, `subscribe:${channelId}`, async () => {
    const current = await subscription(user, channelId)
    if (enabled && !current.subscribed) await youtube(user, "subscriptions", { part: "snippet" }, "POST", { snippet: { resourceId: { kind: "youtube#channel", channelId } } })
    if (!enabled && current.id) await youtube(user, "subscriptions", { id: current.id }, "DELETE")
    try { return await subscription(user, channelId) }
    catch { return { subscribed: enabled, needsRefresh: true } }
  })
}
export async function playlistVideos(user: string, playlistId: string, pageToken = "") {
  const result = await youtube(user, "playlistItems", { part: "contentDetails", playlistId, maxResults: "20", pageToken })
  const ids = result.items.map((r) => text(r.contentDetails?.videoId)).filter(Boolean)
  const rows = await videos(user, ids)
  return { items: ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean), nextPageToken: result.nextPageToken }
}
export function mapComment(row: Resource, userChannel: string, replyCount = 0): YouTubeComment {
  const s = row.snippet || {}
  const authorChannel = text(obj(s.authorChannelId).value)
  return { id: row.id, parentId: text(s.parentId) || undefined, author: text(s.authorDisplayName), channelId: authorChannel || undefined, avatar: text(s.authorProfileImageUrl) || undefined, text: text(s.textOriginal || s.textDisplay), publishedAt: text(s.publishedAt), updatedAt: text(s.updatedAt), likes: count(s.likeCount), viewerRating: text(s.viewerRating) || undefined, replyCount, own: authorChannel === userChannel }
}
export async function listComments(user: string, videoId: string, pageToken = "", parentId = "") {
  const row = await connection(user)
  const result = await youtube(user, parentId ? "comments" : "commentThreads", { part: "snippet", ...(parentId ? { parentId } : { videoId, order: "time" }), textFormat: "plainText", maxResults: "20", pageToken })
  return { items: result.items.map((r) => parentId ? mapComment(r, row?.channel_id || "") : mapComment(r.snippet?.topLevelComment as Resource, row?.channel_id || "", Number(r.snippet?.totalReplyCount || 0))), nextPageToken: result.nextPageToken }
}
export async function savedPlaylist(user: string, create: boolean): Promise<string | null> {
  const row = await connection(user)
  if (!row?.channel_id) throw new YouTubeError("CHANNEL_REQUIRED", 409)
  if (row.saved_playlist_id) return row.saved_playlist_id
  if (!create && row.saved_playlist_checked) return null
  // Caller holds the saved lock. Recover a previous successful creation after a DB/network failure.
  let pageToken = ""
  const deadline = Date.now() + 90000
  for (let page = 0; page < 10; page++) {
    if (Date.now() > deadline) throw new YouTubeError("BUSY", 409)
    const list = await youtube(user, "playlists", { part: "snippet", mine: "true", maxResults: "50", pageToken })
    const existing = list.items.find((r) => r.snippet?.title === "Malik Shorts Saved" && r.snippet?.description === "Private saved videos from Malik Shorts." && r.snippet?.channelId === row.channel_id)
    if (existing) { await patchConnection(user, { saved_playlist_id: existing.id, saved_playlist_checked: true }); return existing.id }
    pageToken = list.nextPageToken || ""
    if (!pageToken) break
    if (page === 9) throw new YouTubeError("BUSY", 409)
  }
  if (!create) { await patchConnection(user, { saved_playlist_checked: true }); return null }
  const created = await youtube<Resource>(user, "playlists", { part: "snippet,status" }, "POST", { snippet: { title: "Malik Shorts Saved", description: "Private saved videos from Malik Shorts." }, status: { privacyStatus: "private" } })
  await patchConnection(user, { saved_playlist_id: created.id })
  return created.id
}
export async function savedState(user: string, videoId: string) {
  const playlistId = await savedPlaylist(user, false)
  if (!playlistId) return { saved: false, ids: [] as string[] }
  const result = await youtube(user, "playlistItems", { part: "id", playlistId, videoId, maxResults: "50" })
  return { saved: result.items.length > 0, ids: result.items.map((r) => r.id) }
}
export async function setSaved(user: string, videoId: string, enabled: boolean) {
  return locked(user, "saved", async () => {
    const playlistId = await savedPlaylist(user, enabled)
    if (!playlistId) return { saved: false }
    const current = await savedState(user, videoId)
    if (enabled && !current.saved) await youtube(user, "playlistItems", { part: "snippet" }, "POST", { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
    if (!enabled) for (const id of current.ids) await youtube(user, "playlistItems", { id }, "DELETE")
    return { saved: enabled }
  })
}
export async function search(user: string, q: string, pageToken: string, kind: string, language: string, recent: boolean) {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_YOUTUBE_API_KEY
  if (!key) throw new YouTubeError("YOUTUBE_CONFIGURATION_REQUIRED", 503)
  const params = new URLSearchParams({ key, part: "snippet", type: kind === "channels" ? "channel" : "video", q: q || "shorts", maxResults: "20", relevanceLanguage: language, order: recent ? "date" : "relevance", ...(kind === "channels" ? {} : { videoEmbeddable: "true", videoDuration: "short" }) })
  if (pageToken) params.set("pageToken", pageToken)
  if (recent) { const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - 7); params.set("publishedAfter", since.toISOString()) }
  // Only public discovery is cached. Never share OAuth-authorized responses between users.
  const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params, { next: { revalidate: 300 }, signal: AbortSignal.timeout(15000) })
  const result = await response.json() as List & { error?: { errors?: Array<{ reason: string }> } }
  if (!response.ok) throw new YouTubeError(result.error?.errors?.[0]?.reason || "API_UNAVAILABLE", response.status === 403 ? 403 : 502)
  // Search returns an object ID, unlike other YouTube resources.
  const ids = result.items.map((r) => text(obj(r.id)[kind === "channels" ? "channelId" : "videoId"])).filter(Boolean)
  return { items: !ids.length ? [] : kind === "channels" ? await channels(user, ids) : await videos(user, ids), nextPageToken: result.nextPageToken }
}
