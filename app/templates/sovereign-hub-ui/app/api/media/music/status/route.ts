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
  const rawStatus = String(job.status || "").toLowerCase()

  if (!job.ok || rawStatus === "error" || rawStatus === "failed") {
    return Response.json({
      ok: false,
      request_id: requestId,
      requestId,
      status: "failed",
      error: job.error || "Music generation failed.",
    }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  if (rawStatus === "done" && job.resultUrl) {
    return Response.json({
      ok: true,
      provider: "deapi",
      model: job.model,
      request_id: requestId,
      requestId,
      status: "ready",
      progress: 100,
      result_url: job.resultUrl,
      resultUrl: job.resultUrl,
      audioUrl: job.resultUrl,
      downloadUrl: `/api/media/music/file?requestId=${encodeURIComponent(requestId)}`,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const queued = rawStatus === "queued" || rawStatus === "pending"
  return Response.json({
    ok: true,
    provider: "deapi",
    model: job.model,
    request_id: requestId,
    requestId,
    status: queued ? "queued" : "processing",
    progress: typeof job.progress === "number" ? job.progress : undefined,
    stage: rawStatus === "done" ? "finalizing" : rawStatus || "processing",
  }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}
