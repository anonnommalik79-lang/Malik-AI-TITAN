import { polloVideoEnabled, polloVideoModel, videoGodOrder } from "./config"
import { getVideoJob, patchVideoJob, saveVideoJob } from "./jobs"
import {
  createMalikH3Job,
  fetchMalikH3Status,
  isMalikH3TaskId,
  malikH3Configured,
  malikH3Model,
} from "./providers/malik-h3"
import { createPolloVideoTask, fetchPolloTaskStatus, polloConfigured } from "./providers/pollo"
import {
  createTitanVideoJob,
  dashscopeVideoModel,
  fetchTitanVideoStatus,
  videoProviderConfigured,
  type TitanVideoProviderId,
} from "./providers/titan-video"
import { compileMalikVideoPrompt } from "./video-prompt"
import { ensure8KQualityPrompt } from "./visual-prompt"
import type { VideoGenerateInput, VideoGenerateResult, VideoJobStatus, VideoProviderId } from "./types"

function mapRemoteStatus(status: string): VideoJobStatus {
  if (status === "succeed") return "completed"
  if (status === "failed") return "failed"
  if (status === "processing" || status === "waiting") return "generating"
  return "queued"
}

export async function routeVideoGeneration(input: VideoGenerateInput): Promise<VideoGenerateResult> {
  const errors: string[] = []
  const order = videoGodOrder() as VideoProviderId[]
  const compiledPrompt = await compileMalikVideoPrompt(input.prompt, input.generateAudio !== false)
  const providerInput = { ...input, prompt: compiledPrompt || ensure8KQualityPrompt(input.prompt) }

  for (const provider of order) {
    try {
      const userId = input.userId || "guest"
      const now = new Date().toISOString()

      if (provider === "h3") {
        if (!malikH3Configured()) {
          errors.push("h3: not configured")
          continue
        }

        const created = await createMalikH3Job(providerInput)
        saveVideoJob({
          taskId: created.taskId,
          provider: "h3",
          userId,
          prompt: input.prompt,
          status: "queued",
          model: created.model,
          statusUrl: created.statusUrl,
          responseUrl: created.responseUrl,
          createdAt: now,
          updatedAt: now,
        })
        return {
          ok: true,
          provider: "h3",
          model: created.model,
          taskId: created.taskId,
          status: "queued",
          stage: "queued",
          outputResolution: input.resolution || "1080p",
          remainingDailyVideos: 0,
        }
      }

      const titanProvider = provider as TitanVideoProviderId
      if (!videoProviderConfigured(titanProvider)) {
        errors.push(`${provider}: not configured`)
        continue
      }

      if (provider === "pollo") {
        if (!polloVideoEnabled()) throw new Error("POLLO_VIDEO_ENABLED=false")
        if (!polloConfigured()) throw new Error("POLLO_API_KEY missing")
        const created = await createPolloVideoTask(providerInput)
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

      const created = await createTitanVideoJob(titanProvider, providerInput)
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
    error: errors.join(" → ") || "No video provider configured. Configure MALIKVIDEO_H3_BASE_URL or another video provider.",
  }
}

async function refreshH3(taskId: string, model = malikH3Model()): Promise<VideoGenerateResult> {
  try {
    const remote = await fetchMalikH3Status(taskId)
    const status = mapRemoteStatus(remote.status)
    return {
      ok: status !== "failed",
      provider: "h3",
      model,
      taskId,
      status,
      remainingDailyVideos: 0,
      videoUrl: remote.videoUrl,
      stage: remote.stage,
      outputResolution: remote.outputResolution as VideoGenerateResult["outputResolution"],
      error: remote.error,
    }
  } catch (error) {
    return {
      ok: false,
      provider: "h3",
      model,
      taskId,
      status: "failed",
      remainingDailyVideos: 0,
      error: error instanceof Error ? error.message : "H3 status check failed",
    }
  }
}

export async function refreshVideoJobStatus(taskId: string): Promise<VideoGenerateResult & { videoUrl?: string }> {
  const stored = getVideoJob(taskId)

  if (!stored && isMalikH3TaskId(taskId) && malikH3Configured()) {
    return refreshH3(taskId)
  }

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

  if (stored.provider === "h3") {
    const result = await refreshH3(taskId, stored.model)
    patchVideoJob(taskId, { status: result.status, videoUrl: result.videoUrl, error: result.error })
    return result
  }

  try {
    const remote =
      stored.provider === "pollo"
        ? await fetchPolloTaskStatus(taskId)
        : await fetchTitanVideoStatus(stored.provider as TitanVideoProviderId, taskId, { statusUrl: stored.statusUrl, responseUrl: stored.responseUrl })

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
