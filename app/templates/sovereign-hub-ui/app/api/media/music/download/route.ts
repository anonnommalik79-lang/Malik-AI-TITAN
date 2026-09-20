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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const upstream = await fetch(job.resultUrl, { signal: controller.signal, cache: "no-store" })
    if (!upstream.ok || !upstream.body) {
      return Response.json({ ok: false, code: "MUSIC_DOWNLOAD_FAILED", error: "Не удалось скачать готовый аудиофайл." }, { status: 502 })
    }

    const headers = new Headers()
    headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg")
    const length = upstream.headers.get("content-length")
    if (length) headers.set("Content-Length", length)
    headers.set("Content-Disposition", `attachment; filename="malik-music-${requestId.slice(0, 12)}.mp3"`)
    headers.set("Cache-Control", "private, no-store")
    return new Response(upstream.body, { status: 200, headers })
  } finally {
    clearTimeout(timer)
  }
}