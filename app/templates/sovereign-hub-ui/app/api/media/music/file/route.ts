import { getDeapiMusicJob } from "@/lib/media/deapi-music"
import { resolveMediaUser } from "@/lib/media/request"
import { musicJobBelongsTo } from "@/lib/server/music-job-ownership"
import { directMediaUrl } from "@/lib/os/media-reference"

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
  if (!(await musicJobBelongsTo(requestId, user.userId))) {
    return Response.json({ ok: false, code: "MUSIC_JOB_NOT_FOUND", error: "Трек этого аккаунта не найден." }, { status: 404 })
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

  const resultUrl = directMediaUrl(job.resultUrl, String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
  if (!resultUrl) return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Provider returned an unsafe result URL." }, { status: 502 })

  // Never relay the MP3 body through Render. A 302 response is only a few
  // hundred bytes; the browser then downloads/plays the provider file directly.
  return Response.redirect(resultUrl, 302)
}
