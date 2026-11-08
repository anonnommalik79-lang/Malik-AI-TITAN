import "server-only"

import { resolveMediaUser } from "@/lib/media/request"
import { getVideoJob } from "@/lib/media/jobs"
import { fetchVideoSource } from "@/lib/media/video-source"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The person's own finished video, streamed through Malik. Used for the branded
// download and as the player's fallback when the provider's CDN refuses the
// browser directly (referrer rules, missing range support). Normal playback
// stays direct from the provider and costs Render no media bandwidth.
export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  }
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""
  if (!taskId || taskId.length > 220) {
    return Response.json({ error: "INVALID_TASK" }, { status: 400 })
  }
  const job = await getVideoJob(taskId, user.userId)
  if (!job || job.status !== "completed" || !job.videoUrl) {
    return Response.json({ error: "VIDEO_NOT_READY" }, { status: 404 })
  }

  try {
    const fetched = await fetchVideoSource(job.videoUrl, { range: request.headers.get("range") || undefined })
    if ("error" in fetched) return Response.json({ error: fetched.error }, { status: fetched.status })
    const upstream = fetched.response
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => {})
      return Response.json({ error: "VIDEO_SOURCE_UNAVAILABLE", status: upstream.status }, { status: 502 })
    }
    const mime = (upstream.headers.get("content-type") || "").toLowerCase()
    if (mime && !mime.includes("video/") && !mime.includes("octet-stream") && !mime.includes("binary/")) {
      await upstream.body.cancel().catch(() => {})
      return Response.json({ error: "VIDEO_SOURCE_NOT_MEDIA" }, { status: 502 })
    }
    const length = Number(upstream.headers.get("content-length") || 0)
    if (length > 256 * 1024 * 1024) {
      await upstream.body.cancel()
      return Response.json({ error: "VIDEO_TOO_LARGE_FOR_BROWSER_EXPORT" }, { status: 413 })
    }
    const output = new Headers({
      // An octet-stream from the CDN is still the MP4 the job produced.
      "content-type": mime.includes("video/") ? mime : "video/mp4",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": 'inline; filename="malik-video.mp4"',
    })
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h)
      if (v) output.set(h, v)
    }
    // Body streams through; never buffer a whole MP4 in Render memory.
    return new Response(upstream.body, { status: upstream.status, headers: output })
  } catch {
    return Response.json({ error: "VIDEO_SOURCE_STREAM_FAILED" }, { status: 502 })
  }
}
