import { refreshVideoJobStatus } from "@/lib/media/video-router"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""
  if (!taskId) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 })
  }

  const result = await refreshVideoJobStatus(taskId)

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

  return Response.json({
    ok: result.ok,
    provider: result.provider,
    model: result.model,
    taskId: result.taskId,
    status: publicStatus,
    videoUrl: result.videoUrl,
    url: result.videoUrl,
    error: result.error,
  })
}
