import { resolveMediaUser } from "@/lib/media/request"
import { getDeapiMusicJob, musicModel, musicProviderName } from "@/lib/server/deapi-music"

export const runtime = "nodejs"

function directAudioUrl(value: string, request: Request) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return ""
    if (url.origin === new URL(request.url).origin) return ""
    return url.toString()
  } catch {
    return ""
  }
}

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
    const audioUrl = directAudioUrl(result.resultUrl, request)
    if (!audioUrl) {
      return Response.json({
        ok: false,
        code: "DIRECT_AUDIO_URL_REQUIRED",
        provider: musicProviderName(requestId),
        model: musicModel(requestId),
        requestId,
        request_id: requestId,
        status: "failed",
        error: "Музыкальный provider не вернул безопасную прямую HTTPS-ссылку.",
      }, { status: 502, headers: { "Cache-Control": "no-store" } })
    }
    return Response.json({
      ok: true,
      provider: musicProviderName(requestId),
      model: musicModel(requestId),
      requestId,
      request_id: requestId,
      status: "ready",
      providerStatus: "done",
      progress: 100,
      resultUrl: audioUrl,
      result_url: audioUrl,
      audioUrl,
      downloadUrl: audioUrl,
      deliveryMode: "provider-direct-browser",
      renderAudioBytes: 0,
    }, { headers: {
      "Cache-Control": "no-store",
      "X-Malik-Delivery": "provider-direct-browser",
      "X-Malik-Render-Audio-Bytes": "0",
    } })
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