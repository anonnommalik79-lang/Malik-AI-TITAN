import "server-only"

import { resolveMediaUser } from "@/lib/media/request"
import { getVideoJob } from "@/lib/media/jobs"
import { directMediaUrl } from "@/lib/os/media-reference"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Only for an explicit user-initiated branded download. Normal video playback
// remains direct from provider/CDN and consumes zero Render media bandwidth.
// Keep an allowlist to avoid a saved job's URL becoming an SSRF gateway.
const SAFE_HOSTS = [
  "magichour.ai", "pixazo.ai", "aiapi-pro.com", "cliptaps.com",
  "runwayml.com", "runwayml.cloud", "amazonaws.com", "cloudfront.net",
  "r2.dev", "storage.googleapis.com", "googleapis.com",
  "aliyuncs.com", "fal.media", "fal.ai", "lumalabs.ai", "pollo.ai",
  "hf.space", "huggingface.co", "hf.co",
]

function allowedSource(raw: string) {
  const direct = directMediaUrl(raw, process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || "")
  if (!direct) return null
  try {
    const url = new URL(direct)
    const configured = (process.env.MALIK_VIDEO_BRANDING_ALLOWED_HOSTS || "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
    const names = [...SAFE_HOSTS, ...configured]
    return names.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null
  } catch {
    return null
  }
}

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
  let remote = allowedSource(job.videoUrl)
  if (!remote) {
    return Response.json({ error: "VIDEO_SOURCE_UNSUPPORTED" }, { status: 422 })
  }

  const headers = new Headers({ Accept: "video/mp4,video/webm,video/*" })
  const range = request.headers.get("range")
  if (range) headers.set("Range", range)
  let upstream: Response | undefined
  try {
    // Validate each hop. Automatic redirects could otherwise target private IPs.
    for (let redirects = 0; redirects < 5; redirects++) {
      upstream = await fetch(remote.toString(), {
        method: "GET", headers, redirect: "manual", cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      })
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break
      const next = upstream.headers.get("location")
      remote = next ? allowedSource(new URL(next, remote).toString()) : null
      if (!remote) {
        return Response.json({ error: "VIDEO_REDIRECT_BLOCKED" }, { status: 502 })
      }
    }
    if (!upstream || !upstream.ok || !upstream.body) {
      return Response.json({ error: "VIDEO_SOURCE_UNAVAILABLE" }, { status: 502 })
    }
    const mime = (upstream.headers.get("content-type") || "").toLowerCase()
    if (mime && !mime.includes("video/") && !mime.includes("octet-stream")) {
      return Response.json({ error: "VIDEO_SOURCE_NOT_MEDIA" }, { status: 502 })
    }
    const length = Number(upstream.headers.get("content-length") || 0)
    if (length > 128 * 1024 * 1024) {
      await upstream.body.cancel()
      return Response.json({ error: "VIDEO_TOO_LARGE_FOR_BROWSER_EXPORT" }, { status: 413 })
    }
    const output = new Headers({
      "content-type": mime || "video/mp4",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
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
