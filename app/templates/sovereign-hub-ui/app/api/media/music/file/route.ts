import { getDeapiMusicJob } from "@/lib/media/deapi-music"
import { resolveMediaUser } from "@/lib/media/request"

export const runtime = "nodejs"

function validRequestId(value: string) {
  return /^[A-Za-z0-9._:-]{8,220}$/.test(value)
}

export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Authentication required." }, { status: 401 })
  }

  const url = new URL(request.url)
  const requestId = url.searchParams.get("requestId")?.trim() || ""
  if (!requestId || !validRequestId(requestId)) {
    return Response.json({ ok: false, code: "INVALID_REQUEST_ID", error: "requestId is required." }, { status: 400 })
  }

  const job = await getDeapiMusicJob(requestId)
  if (!job.ok || job.status !== "done" || !job.resultUrl) {
    return Response.json({
      ok: false,
      code: "MUSIC_NOT_READY",
      error: job.error || "Music result is not ready yet.",
      status: job.status,
    }, { status: job.status === "error" || job.status === "failed" ? 502 : 409 })
  }

  let resultUrl: URL
  try {
    resultUrl = new URL(job.resultUrl)
  } catch {
    return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Provider returned an invalid result URL." }, { status: 502 })
  }

  if (resultUrl.protocol !== "https:") {
    return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Provider audio must use HTTPS." }, { status: 502 })
  }

  // Never relay the MP3 body through Render. This response has no body at all;
  // the browser downloads/plays the provider/CDN file directly.
  return new Response(null, {
    status: 302,
    headers: {
      location: resultUrl.toString(),
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-malik-delivery": "provider-direct-browser",
      "x-malik-render-audio-bytes": "0",
    },
  })
}
