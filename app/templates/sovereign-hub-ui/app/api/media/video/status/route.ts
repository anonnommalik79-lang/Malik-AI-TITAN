import { resolveMediaUser } from "@/lib/media/request"
import { refreshVideoJobStatus } from "@/lib/media/video-router"
import type { VideoProviderId } from "@/lib/media/types"

import { withComputeVideoStatus } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

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

  const publicVideoUrl =
    result.provider === "magichour" && publicStatus === "ready" && result.videoUrl
      ? `/api/media/video/file?taskId=${encodeURIComponent(result.taskId)}`
      : result.videoUrl

  return Response.json({
    ok: result.ok,
    provider: result.provider,
    model: result.model,
    taskId: result.taskId,
    status: publicStatus,
    stage: result.stage,
    outputResolution: result.outputResolution,
    videoUrl: publicVideoUrl,
    url: publicVideoUrl,
    error: result.error,
  }, { headers: { "cache-control": "private, no-store" } })
}
