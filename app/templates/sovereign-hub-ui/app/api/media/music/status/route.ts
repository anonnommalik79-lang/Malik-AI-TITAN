import { resolveMediaUser } from "@/lib/media/request"
import { getDeapiMusicJob, musicModel, musicProviderName } from "@/lib/server/deapi-music"

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
    return Response.json({
      ok: true,
      provider: musicProviderName(requestId),
      model: musicModel(requestId),
      requestId,
      request_id: requestId,
      status: "ready",
      providerStatus: "done",
      progress: 100,
      resultUrl: result.resultUrl,
      result_url: result.resultUrl,
      audioUrl: result.resultUrl,
      downloadUrl: `/api/media/music/download?requestId=${encodeURIComponent(requestId)}`,
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