import { resolveMediaUser } from "@/lib/media/request"
import { getDeapiMusicJob } from "@/lib/server/deapi-music"

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

  const job = await getDeapiMusicJob(requestId)
  if (!job.ok || job.status !== "done" || !job.resultUrl) {
    return Response.json({
      ok: false,
      code: "MUSIC_NOT_READY",
      status: job.status,
      error: job.status === "failed" ? job.error || "Music generation failed" : "Трек ещё не готов.",
    }, { status: job.status === "failed" ? 502 : 409 })
  }

  let resultUrl: URL
  try {
    resultUrl = new URL(job.resultUrl)
  } catch {
    return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Музыкальный provider вернул неверную ссылку." }, { status: 502 })
  }
  if (resultUrl.protocol !== "https:" && resultUrl.protocol !== "http:") {
    return Response.json({ ok: false, code: "INVALID_RESULT_URL", error: "Неподдерживаемая ссылка на трек." }, { status: 502 })
  }

  // Redirect instead of proxying the MP3 body through Render.
  return Response.redirect(resultUrl.toString(), 302)
}
