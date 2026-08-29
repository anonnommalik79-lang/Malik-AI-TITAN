import { checkMediaLimit, recordMediaUsage } from "@/lib/media/limits"
import { getLatestVideoJobForUser, getVideoJob, patchVideoJob } from "@/lib/media/jobs"
import { resolveMediaUser } from "@/lib/media/request"

export const runtime = "nodejs"

function dashscopeApiBase() {
  const raw = process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/api/v1"
  return raw.replace(/\/$/, "")
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const user = await resolveMediaUser(request, body)
  const requestedTaskId = String(body?.taskId || "").trim()
  const job = requestedTaskId ? getVideoJob(requestedTaskId) : getLatestVideoJobForUser(user.userId)

  if (!job) {
    return Response.json(
      { ok: false, code: "VIDEO_TASK_NOT_READY", error: "Задача ещё создаётся. Повтори отмену через мгновение." },
      { status: 404 },
    )
  }

  if (job.userId.trim().toLowerCase() !== user.userId.trim().toLowerCase()) {
    return Response.json({ ok: false, code: "VIDEO_TASK_FORBIDDEN", error: "Эта задача принадлежит другому пользователю." }, { status: 403 })
  }

  if (job.status === "completed" || job.status === "failed") {
    return Response.json({ ok: false, code: "VIDEO_TASK_FINISHED", error: "Эту задачу уже нельзя отменить." }, { status: 409 })
  }

  if (job.provider !== "dashscope") {
    return Response.json(
      { ok: false, code: "VIDEO_CANCEL_UNSUPPORTED", error: "Текущий видеопровайдер не поддерживает безопасную отмену этой задачи." },
      { status: 409 },
    )
  }

  const key = process.env.DASHSCOPE_API_KEY?.trim() || ""
  if (!key) {
    return Response.json({ ok: false, code: "VIDEO_CANCEL_NOT_CONFIGURED", error: "Отмена видео временно недоступна." }, { status: 503 })
  }

  const response = await fetch(`${dashscopeApiBase()}/tasks/${encodeURIComponent(job.taskId)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const providerMessage = String(payload?.message || payload?.code || "").trim()
    if (response.status === 400) {
      return Response.json(
        {
          ok: false,
          code: "VIDEO_ALREADY_PROCESSING",
          error: "Рендер уже начался у видеомодели. На этом этапе провайдер больше не позволяет отменить задачу.",
          providerMessage,
        },
        { status: 409 },
      )
    }

    return Response.json(
      { ok: false, code: "VIDEO_CANCEL_FAILED", error: providerMessage || "Не удалось отменить видеозадачу." },
      { status: 502 },
    )
  }

  patchVideoJob(job.taskId, { status: "failed", error: "Canceled by user" })
  await recordMediaUsage(user.userId, "video", -1)
  const limit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "video" })

  return Response.json({
    ok: true,
    cancelled: true,
    taskId: job.taskId,
    provider: job.provider,
    refunded: true,
    remainingDailyVideos: limit.ok ? limit.remaining : 0,
  })
}
