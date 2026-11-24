import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { takeSharedRequestFrequency } from "@/lib/server/request-frequency"
import { listAIJobs } from "@/lib/ai/jobs"
export const runtime = "nodejs"

function renderVideoBandwidthGuard() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.MALIK_VIDEO_RENDER_BANDWIDTH_GUARD || "").trim())
}

function googleVideoKey() {
  return (
    process.env.GOOGLE_VEO_API_KEY ||
    process.env.VEO_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  )
}

function isAllowedGoogleVideoUri(uri: string) {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === "https:" && parsed.hostname === "generativelanguage.googleapis.com"
      && !parsed.port && !parsed.username && !parsed.password && !parsed.hash
      && /^\/(?:download\/)?v1(?:beta)?\/files\/[A-Za-z0-9_-]+(?::download)?$/.test(parsed.pathname)
      && [...parsed.searchParams.keys()].every(key => key === "alt")
      && (!parsed.searchParams.has("alt") || parsed.searchParams.get("alt") === "media")
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  if (!await takeSharedRequestFrequency("video-file", entitlement.userId, 60)) {
    return Response.json({ ok: false, error: "RATE_LIMIT_REACHED" }, { status: 429 })
  }
  if (renderVideoBandwidthGuard()) {
    return Response.json({
      ok: false,
      error: "direct_video_delivery_required",
      message: "Authenticated Veo media proxying through Render is disabled in low-bandwidth mode.",
    }, { status: 409, headers: { "cache-control": "private, no-store" } })
  }
  const current = new URL(request.url)
  const uri = current.searchParams.get("uri") || ""
  const apiKey = googleVideoKey()

  if (!apiKey) {
    return Response.json(
      { ok: false, error: "google_veo_api_key_missing" },
      { status: 500 },
    )
  }

  if (!uri || !isAllowedGoogleVideoUri(uri)) {
    return Response.json(
      { ok: false, error: "invalid_google_video_uri" },
      { status: 400 },
    )
  }

  const owned = listAIJobs(entitlement.userId).some(job =>
    job.type === "video" && job.input.userId === entitlement.userId && job.status === "completed"
    && job.output?.resultUrl === "/api/ai/video/file?uri=" + encodeURIComponent(uri))
  if (!owned) return Response.json({ ok: false, error: "VIDEO_NOT_FOUND" }, { status: 404 })
  const headers = new Headers({
    "x-goog-api-key": apiKey,
    accept: "video/mp4,video/*,*/*",
  })

  const range = request.headers.get("range")
  if (range) headers.set("range", range)

  const upstream = await fetch(uri, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  })

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      {
        ok: false,
        error: "google_video_download_failed",
      },
      { status: upstream.status || 502 },
    )
  }

  const contentType = upstream.headers.get("content-type") || ""
  if (!/^(?:video\/|application\/octet-stream(?:;|$))/i.test(contentType)) {
    await upstream.body.cancel().catch(() => {})
    return Response.json({ ok: false, error: "INVALID_VIDEO_RESPONSE" }, { status: 502 })
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
  out.set("cache-control", "private, no-store")
  out.set("X-Content-Type-Options", "nosniff")
  out.set("x-malik-video-proxy", "google-veo")

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
