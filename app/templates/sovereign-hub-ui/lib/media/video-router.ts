import { polloVideoEnabled, polloVideoModel, videoGodOrder } from "./config"
import { getVideoJob, patchVideoJob, saveVideoJob } from "./jobs"
import { createPolloVideoTask, fetchPolloTaskStatus, polloConfigured } from "./providers/pollo"
import {
  createTitanVideoJob,
  dashscopeVideoModel,
  fetchTitanVideoStatus,
  videoProviderConfigured,
  type TitanVideoProviderId,
} from "./providers/titan-video"
import type { VideoGenerateInput, VideoGenerateResult, VideoJobStatus } from "./types"

function mapRemoteStatus(status: string): VideoJobStatus {
  if (status === "succeed") return "completed"
  if (status === "failed") return "failed"
  if (status === "processing" || status === "waiting") return "generating"
  return "queued"
}

export async function routeVideoGeneration(input: VideoGenerateInput): Promise<VideoGenerateResult> {
  const errors: string[] = []
  const order = videoGodOrder() as TitanVideoProviderId[]

  for (const provider of order) {
    if (!videoProviderConfigured(provider)) {
      errors.push(`${provider}: not configured`)
      continue
    }

    try {
      const userId = input.userId || "guest"
      const now = new Date().toISOString()

      if (provider === "pollo") {
        if (!polloVideoEnabled()) throw new Error("POLLO_VIDEO_ENABLED=false")
        if (!polloConfigured()) throw new Error("POLLO_API_KEY missing")
        const created = await createPolloVideoTask(input)
        saveVideoJob({
          taskId: created.taskId,
          provider: "pollo",
          userId,
          prompt: input.prompt,
          status: "queued",
          model: polloVideoModel(),
          createdAt: now,
          updatedAt: now,
        })
        return { ok: true, provider: "pollo", model: polloVideoModel(), taskId: created.taskId, status: "queued", remainingDailyVideos: 0 }
      }

      const created = await createTitanVideoJob(provider, input)
      saveVideoJob({
        taskId: created.taskId,
        provider,
        userId,
        prompt: input.prompt,
        status: "queued",
        model: created.model,
        statusUrl: created.statusUrl,
        responseUrl: created.responseUrl,
        createdAt: now,
        updatedAt: now,
      })
      return { ok: true, provider, model: created.model, taskId: created.taskId, status: "queued", remainingDailyVideos: 0 }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "failed"}`)
    }
  }

  return {
    ok: false,
    provider: "dashscope",
    model: dashscopeVideoModel(),
    taskId: "",
    status: "disabled",
    remainingDailyVideos: 0,
    error: errors.join(" → ") || "No video provider configured. Add DASHSCOPE_API_KEY.",
  }
}

export async function refreshVideoJobStatus(taskId: string): Promise<VideoGenerateResult & { videoUrl?: string }> {
  const stored = getVideoJob(taskId)

  // Render/serverless processes can restart between POST and polling. Wan task IDs
  // remain valid remotely, so allow a direct DashScope status lookup even when
  // the local in-memory job map was lost.
  if (!stored && videoProviderConfigured("dashscope")) {
    try {
      const remote = await fetchTitanVideoStatus("dashscope", taskId)
      const status = mapRemoteStatus(remote.status)
      return {
        ok: status !== "failed",
        provider: "dashscope",
        model: dashscopeVideoModel(),
        taskId,
        status,
        remainingDailyVideos: 0,
        videoUrl: remote.videoUrl,
        error: remote.error,
      }
    } catch (error) {
      return {
        ok: false,
        provider: "dashscope",
        model: dashscopeVideoModel(),
        taskId,
        status: "failed",
        remainingDailyVideos: 0,
        error: error instanceof Error ? error.message : "DashScope status check failed",
      }
    }
  }

  if (!stored) {
    return { ok: false, provider: "dashscope", model: dashscopeVideoModel(), taskId, status: "failed", remainingDailyVideos: 0, error: "Video job not found" }
  }

  try {
    const remote =
      stored.provider === "pollo"
        ? await fetchPolloTaskStatus(taskId)
        : await fetchTitanVideoStatus(stored.provider, taskId, { statusUrl: stored.statusUrl, responseUrl: stored.responseUrl })

    const status = mapRemoteStatus(remote.status)
    patchVideoJob(taskId, { status, videoUrl: remote.videoUrl, error: remote.error })

    return {
      ok: status !== "failed",
      provider: stored.provider,
      model: stored.model,
      taskId,
      status,
      remainingDailyVideos: 0,
      videoUrl: remote.videoUrl,
      error: remote.error,
    }
  } catch (error) {
    return {
      ok: false,
      provider: stored.provider,
      model: stored.model,
      taskId,
      status: "failed",
      remainingDailyVideos: 0,
      error: error instanceof Error ? error.message : "Status check failed",
    }
  }
}
