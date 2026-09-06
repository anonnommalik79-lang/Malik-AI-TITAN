import { NextRequest } from "next/server"
import { identity, body, json, failure } from "@/lib/youtube/http"
import { db, ownerFilter } from "@/lib/youtube/store"
import { videos } from "@/lib/youtube/resources"
import { videoIdValid } from "@/lib/youtube/contracts"
import { YouTubeError } from "@/lib/youtube/errors"
import { limit } from "@/lib/youtube/quota"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  try {
    const user = await identity()
    await limit(user, "read")
    await db(`shorts_history?${ownerFilter(user)}&watched_at=lt.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { method: "DELETE" })
    const offset = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get("offset")) || 0))
    const rows = await db<Array<{ video_id: string; watched_at: string; progress_seconds: number; completed: boolean }>>(`shorts_history?${ownerFilter(user)}&order=watched_at.desc,video_id&limit=20&offset=${Math.floor(offset)}`)
    const items = await videos(user, rows.map((r) => r.video_id))
    return json({ items: rows.flatMap((r) => { const video = items.find((v) => v.id === r.video_id); return video ? [{ ...video, progress: r.progress_seconds, watchedAt: r.watched_at, completed: r.completed }] : [] }), nextOffset: rows.length === 20 ? offset + 20 : null })
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  try {
    const user = await identity(request), input = await body(request)
    await limit(user, "write")
    const id = String(input.videoId || ""), progress = Number(input.progress)
    if (!videoIdValid(id) || !Number.isFinite(progress) || progress < 0 || progress > 86400) throw new YouTubeError("INVALID_INPUT", 400)
    const video = (await videos(user, [id]))[0]
    if (!video) throw new YouTubeError("NOT_FOUND", 404)
    await db("shorts_history?on_conflict=workos_user_id,video_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ workos_user_id: user, video_id: id, channel_id: video.channel.id, watched_at: new Date().toISOString(), progress_seconds: Math.min(progress, video.duration), duration_seconds: video.duration, completed: video.duration > 0 && progress >= video.duration * .95 }) })
    return json({ ok: true })
  } catch (error) { return failure(error) }
}
export async function DELETE(request: NextRequest) {
  try {
    const user = await identity(request), input = await body(request)
    if (input.all !== true && !videoIdValid(String(input.videoId || ""))) throw new YouTubeError("INVALID_INPUT", 400)
    await db(`shorts_history?${ownerFilter(user)}${input.all === true ? "" : "&video_id=eq." + input.videoId}`, { method: "DELETE" })
    return json({ ok: true })
  } catch (error) { return failure(error) }
}
