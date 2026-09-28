import { resolveMediaUser } from "@/lib/media/request"
import { getDeapiMusicJob, musicModel, musicProviderName } from "@/lib/server/deapi-music"
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

  const result = await getDeapiMusicJob(requestId)
  if (result.status === "failed") {
    return Response.json({
      ok: false,
      provider: musicProviderName(requestId),
      model: musicModel(requestId),
      requestId,
      request_id: requestId,
      status: "failed",
      error: result.error || "Music generation failed",
    }, { status: result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502, headers: { "Cache-Control": "no-store" } })
  }

  if (result.status === "done") {
    const resultUrl = directMediaUrl(result.resultUrl || "", String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
    if (!resultUrl) return Response.json({ ok: false, code: "MUSIC_DIRECT_DELIVERY_REQUIRED", error: "Провайдер не вернул безопасный аудиофайл." }, { status: 502 })
    return Response.json({
      ok: true,
      provider: musicProviderName(requestId),
      model: musicModel(requestId),
      requestId,
      request_id: requestId,
      status: "ready",
      providerStatus: "done",
      progress: 100,
      resultUrl,
      result_url: resultUrl,
      audioUrl: resultUrl,
      downloadUrl: resultUrl,
      deliveryMode: "provider-direct-browser",
      renderAudioBytes: 0,
    }, { headers: { "Cache-Control": "no-store" } })
  }

  return Response.json({
    ok: true,
    provider: musicProviderName(requestId),
    model: musicModel(requestId),
    requestId,
    request_id: requestId,
    status: result.status,
    progress: result.progress,
  }, { headers: { "Cache-Control": "no-store" } })
}
