import { resolveMediaUser } from "@/lib/media/request"
import { getDeapiMusicJob } from "@/lib/server/deapi-music"
import { musicJobBelongsTo } from "@/lib/server/music-job-ownership"
import { directMediaUrl } from "@/lib/os/media-reference"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 })
  }

  const url = new URL(request.url)
  const requestId = String(url.searchParams.get("requestId") || url.searchParams.get("request_id") || "").trim()
  if (!requestId) {
    return Response.json({ ok: false, code: "REQUEST_ID_REQUIRED", error: "request_id is required" }, { status: 400 })
  }
  if (!(await musicJobBelongsTo(requestId, user.userId))) {
    return Response.json({ ok: false, code: "MUSIC_JOB_NOT_FOUND", error: "Трек этого аккаунта не найден." }, { status: 404 })
  }

  const job = await getDeapiMusicJob(requestId)
  if (!job.ok || job.status !== "done" || !job.resultUrl) {
    return Response.json({
      ok: false,
      code: "MUSIC_NOT_READY",
      status: job.status,
      error: job.status === "failed" ? job.error || "Music generation failed" : "Трек ещё не готов.",
    }, { status: job.status === "failed" ? 502 : 409 })
  }

  const resultUrl = directMediaUrl(job.resultUrl, String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
  if (!resultUrl) return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Провайдер вернул небезопасную ссылку на трек." }, { status: 502 })

  // Redirect instead of proxying the MP3 body through Render.
  return Response.redirect(resultUrl, 302)
}
