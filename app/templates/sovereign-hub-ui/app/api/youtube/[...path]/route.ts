import { type NextRequest } from "next/server"
import { identity, json, failure, body as readBody } from "@/lib/youtube/http"
import { youtube, accessToken } from "@/lib/youtube/client"
import { db, connection, patchConnection, locked } from "@/lib/youtube/store"
import { unseal } from "@/lib/youtube/security"
import { YouTubeError } from "@/lib/youtube/errors"
import { videoIdValid, channelIdValid } from "@/lib/youtube/contracts"
import { channels, videos, subscription, setSubscription, listComments, mapComment, playlistVideos, savedPlaylist, savedState, setSaved, search } from "@/lib/youtube/resources"
import type { Resource } from "@/lib/youtube/client"
import { limit } from "@/lib/youtube/quota"

// WorkOS/request access keeps the handler dynamic. Do not force every fetch to
// no-store here: public search explicitly opts into a five-minute data cache.
// All OAuth calls and response headers remain private/no-store.
export const runtime = "nodejs"
type Context = { params: Promise<{ path: string[] }> }
const validate = (condition: unknown) => { if (!condition) throw new YouTubeError("INVALID_INPUT", 400) }
const commentId = (id: string) => /^[A-Za-z0-9_.-]{1,180}$/.test(id)
async function handle(request: NextRequest, context: Context) {
  try {
    const user = await identity(request)
    const path = (await context.params).path
    const route = path.join("/")
    const method = request.method
    await limit(user, route === "feed" ? "search" : method === "GET" ? "read" : "write")
    const query = request.nextUrl.searchParams
    const pageToken = query.get("pageToken") || ""
    validate(pageToken.length <= 1024)
    const input = ["POST", "PATCH", "PUT", "DELETE"].includes(method) ? await readBody(request) : {}
    if (route === "me" && method === "GET") {
      const row = await connection(user)
      if (!row) return json({ connected: false })
      const available = await channels(user)
      const selected = available.find((c) => c.id === row.channel_id)
      await patchConnection(user, { channels: available })
      return json({ connected: true, channel: selected || null, channels: available })
    }
    if (route === "disconnect" && method === "POST") {
      const row = await connection(user)
      if (row) {
        const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token: unseal(row.refresh_encrypted, user) }), signal: AbortSignal.timeout(15000) })
        if (!response.ok && response.status !== 400) throw new YouTubeError("API_UNAVAILABLE")
        await db("rpc/youtube_delete_connection", { method: "POST", body: JSON.stringify({ p_user: user }) })
      }
      return json({ ok: true })
    }
    if (route === "me" && method === "POST") {
      const id = String(input.channelId || "")
      const available = await channels(user)
      if (available.length !== 1) throw new YouTubeError("CHANNEL_SELECTION_REQUIRED", 409)
      validate(available.some((c) => c.id === id))
      await patchConnection(user, { channel_id: id, channels: available, saved_playlist_id: null, saved_playlist_checked: false })
      return json({ ok: true })
    }
    if (route === "token/refresh" && method === "POST") { await accessToken(user); return json({ ok: true }) }
    const row = await connection(user)
    if (!row) throw new YouTubeError("YOUTUBE_CONNECT_REQUIRED", 401)
    if (!row.channel_id) throw new YouTubeError(row.channels.length ? "CHANNEL_SELECTION_REQUIRED" : "CHANNEL_REQUIRED", 409)
    if (route === "feed" && method === "GET") {
      const q = (query.get("q") || "").trim()
      validate(q.length <= 150)
      return json(await search(user, q, pageToken, query.get("kind") || "videos", ["ru", "kk", "en"].includes(query.get("language") || "") ? query.get("language")! : "ru", query.get("recent") === "true"))
    }
    if (route === "subscriptions" && method === "GET") {
      const result = await youtube(user, "subscriptions", { part: "snippet", mine: "true", maxResults: "20", pageToken })
      const ids = result.items.map((r) => (r.snippet?.resourceId as { channelId?: string })?.channelId || "").filter(Boolean)
      return json({ items: ids.length ? await channels(user, ids) : [], nextPageToken: result.nextPageToken })
    }
    if (route === "following" && method === "GET") {
      // Five channels per explicit page: bounded fanout, no search.list on scrolling.
      const list = await youtube(user, "subscriptions", { part: "snippet", mine: "true", maxResults: "5", pageToken })
      const ids = list.items.map((r) => (r.snippet?.resourceId as { channelId?: string })?.channelId || "").filter(Boolean)
      const authors = ids.length ? await channels(user, ids) : []
      const batches = await Promise.all(authors.filter((c) => c.uploads).map((c) => youtube(user, "playlistItems", { part: "contentDetails", playlistId: c.uploads!, maxResults: "3" })))
      const videoIds = batches.flatMap((r) => r.items.map((item) => String(item.contentDetails?.videoId || ""))).filter(Boolean)
      return json({ items: (await videos(user, videoIds)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), nextPageToken: list.nextPageToken, note: "Последние видео из очередной группы подписок; не полный хронологический порядок всех подписок." })
    }
    if (path[0] === "library" && method === "GET" && path.length === 2) {
      validate(["liked", "saved", "uploads"].includes(path[1]))
      if (path[1] === "liked") {
        const liked = await youtube(user, "videos", { part: "id", myRating: "like", maxResults: "20", pageToken })
        return json({ items: await videos(user, liked.items.map((r) => r.id), true), nextPageToken: liked.nextPageToken })
      }
      const playlistId = path[1] === "saved" ? await savedPlaylist(user, false) : path[1] === "uploads" ? (await channels(user, [row.channel_id]))[0]?.uploads : null
      if (!playlistId) return json({ items: [] })
      return json(await playlistVideos(user, playlistId, pageToken))
    }
    if (path[0] === "videos") {
      validate(path.length === 2 || path.length === 3)
      const id = path[1]; validate(videoIdValid(id))
      if (path.length === 2 && method === "GET") {
        const video = (await videos(user, [id], true))[0]
        if (!video) throw new YouTubeError("NOT_FOUND", 404)
        const [following, saved] = await Promise.all([subscription(user, video.channel.id), savedState(user, id)])
        return json({ video, subscribed: following.subscribed, saved: saved.saved })
      }
      if (path[2] === "rating" && method === "POST") {
        validate(["like", "none"].includes(String(input.rating)))
        return json(await locked(user, `rating:${id}`, async () => {
          await youtube(user, "videos/rate", { id, rating: String(input.rating) }, "POST")
          // A successful write must not be reported as failed if reconciliation times out.
          try { return { ok: true, video: (await videos(user, [id], true))[0] } }
          catch { return { ok: true, rating: input.rating, needsRefresh: true } }
        }))
      }
      if (path[2] === "saved" && method === "POST") { validate(typeof input.saved === "boolean"); return json(await setSaved(user, id, input.saved as boolean)) }
      if (path[2] === "comments" && method === "GET") return json(await listComments(user, id, pageToken))
      if (path[2] === "comments" && method === "POST") {
        const text = String(input.text || "").trim(); validate(text.length > 0 && text.length <= 2200)
        const created = await youtube<Resource>(user, "commentThreads", { part: "snippet" }, "POST", { snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: text } } } })
        return json({ item: mapComment(created.snippet?.topLevelComment as Resource, row.channel_id) }, 201)
      }
    }
    if (path[0] === "comments") {
      validate(path.length === 2 || path.length === 3)
      const id = path[1]; validate(commentId(id))
      if (path[2] === "replies" && method === "GET") return json(await listComments(user, "", pageToken, id))
      if (path[2] === "replies" && method === "POST") {
        const text = String(input.text || "").trim(); validate(text.length > 0 && text.length <= 2200)
        const created = await youtube<Resource>(user, "comments", { part: "snippet" }, "POST", { snippet: { parentId: id, textOriginal: text } })
        return json({ item: mapComment(created, row.channel_id) }, 201)
      }
      if (path.length === 2 && ["DELETE", "PATCH"].includes(method)) {
        const resource = (await youtube(user, "comments", { part: "snippet", id })).items[0]
        if (!resource || !mapComment(resource, row.channel_id).own) throw new YouTubeError("forbidden", 403)
        if (method === "DELETE") { await youtube(user, "comments", { id }, "DELETE"); return json({ ok: true }) }
        const text = String(input.text || "").trim(); validate(text.length > 0 && text.length <= 2200)
        const result = await youtube<Resource>(user, "comments", { part: "snippet" }, "PUT", { id, snippet: { textOriginal: text } })
        return json({ item: mapComment(result, row.channel_id) })
      }
    }
    if (path[0] === "channels") {
      validate(path.length === 2 || path.length === 3 && ["videos", "subscription"].includes(path[2]))
      const id = path[1]; validate(channelIdValid(id))
      if (path[2] === "subscription") {
        if (method === "GET") return json(await subscription(user, id))
        if (method === "POST") { validate(typeof input.subscribed === "boolean"); return json(await setSubscription(user, id, input.subscribed as boolean)) }
      }
      if (method === "GET") {
        const channel = (await channels(user, [id]))[0]
        if (!channel) throw new YouTubeError("NOT_FOUND", 404)
        if (path[2] === "videos") return json(channel.uploads ? await playlistVideos(user, channel.uploads, pageToken) : { items: [] })
        return json({ channel, ...(await subscription(user, id)) })
      }
    }
    throw new YouTubeError("NOT_FOUND", 404)
  } catch (error) { return failure(error) }
}
export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
