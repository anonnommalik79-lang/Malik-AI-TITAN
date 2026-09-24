import { checkMediaLimit, recordMediaUsage } from "@/lib/media/limits"
import { getLatestVideoJobForUser, getVideoJob, patchVideoJob } from "@/lib/media/jobs"
import { resolveMediaUser } from "@/lib/media/request"
import { cancelTitanVideoJob, type TitanVideoProviderId } from "@/lib/media/providers/titan-video"
import { refundVideoAccountDailyQuota } from "@/lib/server/video-account-quota"

export const runtime = "nodejs"

function dashscopeApiBase() {
  const raw = process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/api/v1"
  return raw.replace(/\/$/, "")
}

async function cancelDashScope(taskId: string) {
  const key = process.env.DASHSCOPE_API_KEY?.trim() || ""
  if (!key) return { ok: false, status: 503, error: "Отмена DashScope временно недоступна." }

  const response = await fetch(`${dashscopeApiBase()}/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null)
  if (!response) return { ok: false, status: 502, error: "DashScope cancel request failed." }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 400 || response.status === 409 ? 409 : 502,
      error: String(payload?.message || payload?.code || "Провайдер уже не позволяет остановить рендер."),
    }
  }
  return { ok: true, status: 200, error: "" }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const user = await resolveMediaUser(request, body)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы отменить видео." }, { status: 401 })
  }

  const requestedTaskId = String(body?.taskId || "").trim()
  const job = requestedTaskId
    ? await getVideoJob(requestedTaskId, user.userId)
    : await getLatestVideoJobForUser(user.userId)

  if (!job) {
    return Response.json(
      { ok: false, code: "VIDEO_TASK_NOT_READY", error: "Задача ещё создаётся или уже недоступна." },
      { status: 404 },
    )
  }
  if (job.userId.trim().toLowerCase() !== user.userId.trim().toLowerCase()) {
    return Response.json({ ok: false, code: "VIDEO_TASK_FORBIDDEN", error: "Эта задача принадлежит другому пользователю." }, { status: 403 })
  }
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return Response.json({ ok: true, cancelled: job.status === "cancelled", taskId: job.taskId, status: job.status, refunded: false })
  }

  let upstreamCancelled = false
  if (job.provider === "dashscope") {
    const result = await cancelDashScope(job.taskId)
    upstreamCancelled = result.ok
  } else if (["runway", "fal", "luma", "veo"].includes(job.provider)) {
    upstreamCancelled = await cancelTitanVideoJob(job.provider as TitanVideoProviderId, job.taskId).catch(() => false)
  }

  await patchVideoJob(job.taskId, {
    status: "cancelled",
    error: upstreamCancelled ? "Canceled by user" : "User stopped tracking; upstream cancellation unsupported",
  }, user.userId)

  let remainingDailyVideos: number | null = null
  let refunded = false
  if (upstreamCancelled) {
    await recordMediaUsage(user.userId, "video", -1)
    const limit = await checkMediaLimit({ userId: user.userId, plan: user.plan, kind: "video" })
    const quota = await refundVideoAccountDailyQuota(user.userId, Number(limit.max || 1))
    remainingDailyVideos = quota.remaining
    refunded = true
  }

  return Response.json({
    ok: true,
    cancelled: true,
    taskId: job.taskId,
    provider: job.provider,
    upstreamCancelled,
    refunded,
    remainingDailyVideos,
    note: upstreamCancelled
      ? "Провайдер подтвердил отмену."
      : "Malik AI остановил отслеживание задачи; провайдер не поддерживает безопасную удалённую отмену для этого маршрута.",
  }, { headers: { "cache-control": "private, no-store" } })
}
