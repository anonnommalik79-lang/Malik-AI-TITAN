import { resolveMediaUser } from "@/lib/media/request"
import { refreshVideoJobStatus } from "@/lib/media/video-router"
import type { VideoProviderId } from "@/lib/media/types"

import { withComputeVideoStatus } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

function renderVideoBandwidthGuard() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.MALIK_VIDEO_RENDER_BANDWIDTH_GUARD || "").trim())
}

function browserDirectVideoUrl(value?: string) {
  const url = String(value || "").trim()
  if (!url) return undefined
  if (!renderVideoBandwidthGuard()) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return undefined
    const appOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || "").trim()
    if (appOrigin) {
      try {
        if (parsed.host === new URL(appOrigin).host) return undefined
      } catch {}
    }
    return parsed.toString()
  } catch {
    return undefined
  }
}

export const GET = withComputeVideoStatus(handleGET)

async function handleGET(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы проверить видео." }, { status: 401 })
  }

  const url = new URL(request.url)
  const taskId = url.searchParams.get("taskId")?.trim() || ""
  const provider = url.searchParams.get("provider")?.trim() as VideoProviderId | undefined
  if (!taskId) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 })
  }

  const result = await refreshVideoJobStatus(taskId, provider, user.userId)

  const publicStatus =
    result.status === "completed"
      ? "ready"
      : result.status === "failed"
        ? "failed"
        : result.status === "generating"
          ? "processing"
          : result.status === "queued"
            ? "queued"
            : result.status

  // Bandwidth-safe delivery: when a provider already returns a browser-accessible
  // media URL (Magic Hour, Pixazo, etc.), return that URL directly. The <video>
  // element still renders inside Malik AI, but the heavy MP4 bytes travel from
  // the provider/CDN to the user's browser instead of through Render.
  const publicVideoUrl = browserDirectVideoUrl(result.videoUrl)
  const proxyBlocked = Boolean(renderVideoBandwidthGuard() && result.videoUrl && !publicVideoUrl)

  return Response.json({
    ok: proxyBlocked ? false : result.ok,
    provider: result.provider,
    model: result.model,
    taskId: result.taskId,
    status: proxyBlocked ? "failed" : publicStatus,
    stage: result.stage,
    outputResolution: result.outputResolution,
    videoUrl: publicVideoUrl,
    url: publicVideoUrl,
    deliveryMode: publicVideoUrl ? "provider-direct-browser" : "metadata-only",
    renderVideoBytes: 0,
    error: proxyBlocked ? "VIDEO_DIRECT_DELIVERY_REQUIRED" : result.error,
  }, { headers: { "cache-control": "private, no-store" } })
}
