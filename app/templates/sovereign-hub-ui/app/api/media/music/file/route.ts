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

  if (resultUrl.protocol !== "https:" && resultUrl.protocol !== "http:") {
    return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Unsupported result URL." }, { status: 502 })
  }

  const upstream = await fetch(resultUrl, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  })

  if (!upstream.ok || !upstream.body) {
    return Response.json({ ok: false, code: "MUSIC_DOWNLOAD_FAILED", error: "Unable to download generated MP3." }, { status: 502 })
  }

  const contentType = upstream.headers.get("content-type") || "audio/mpeg"
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="malik-music-${requestId.slice(0, 12)}.mp3"`,
      "Cache-Control": "private, no-store",
    },
  })
}
