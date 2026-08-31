import {
  isMalikH3TaskId,
  malikH3AuthHeaders,
  malikH3Configured,
  malikH3RemoteContentUrl,
} from "@/lib/media/providers/malik-h3"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""

  if (!malikH3Configured()) {
    return Response.json({ ok: false, error: "malikvideo_h3_not_configured" }, { status: 503 })
  }

  if (!taskId || !isMalikH3TaskId(taskId)) {
    return Response.json({ ok: false, error: "invalid_h3_task_id" }, { status: 400 })
  }

  const headers = malikH3AuthHeaders()
  headers.set("accept", "video/mp4,video/*,*/*")
  const range = request.headers.get("range")
  if (range) headers.set("range", range)

  const upstream = await fetch(malikH3RemoteContentUrl(taskId), {
    method: "GET",
    headers,
    cache: "no-store",
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return Response.json(
      { ok: false, error: text || `h3_video_download_failed_${upstream.status}` },
      { status: upstream.status || 502 },
    )
  }

  const out = new Headers()
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }

  if (!out.get("content-type")) out.set("content-type", "video/mp4")
  out.set("cache-control", "private, max-age=300")
  out.set("x-malik-video-provider", "h3-self-hosted")

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
