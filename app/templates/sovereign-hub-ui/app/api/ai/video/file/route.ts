export const runtime = "nodejs"

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
  } catch {
    return false
  }
}

export async function GET(request: Request) {
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
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return Response.json(
      {
        ok: false,
        error: text || `google_video_download_failed_${upstream.status}`,
      },
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
  out.set("x-malik-video-proxy", "google-veo")

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
