import { polloVideoEnabled, polloVideoModel, videoGodOrder } from "./config"
import { getVideoJob, patchVideoJob, saveVideoJob } from "./jobs"
import {
  createFreeVideoJob,
  fetchFreeVideoStatus,
  freeVideoModel,
  freeVideoProviderConfigured,
  isFreeVideoProvider,
  type FreeVideoProviderId,
} from "./providers/free-video"
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
  const order = input.providerId ? [input.providerId] : (videoGodOrder() as VideoProviderId[])
  // Source-driven edits should preserve the user's literal edit/motion request.
  // The cinematic text-to-video compiler is useful for blank-canvas generation,
  // but can accidentally invent scene changes for image/video source modes.
  const compiledPrompt = input.mode === "text"
    ? await compileMalikVideoPrompt(input.prompt, input.generateAudio !== false)
    : input.prompt
  const providerInput = {
    ...input,
    prompt: input.mode === "text" ? (compiledPrompt || ensure8KQualityPrompt(input.prompt)) : input.prompt,
  }

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
        await saveVideoJob({
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

      if (isFreeVideoProvider(provider)) {
        if (!freeVideoProviderConfigured(provider)) {
          errors.push(`${provider}: API key not configured`)
          continue
        }

        const created = await createFreeVideoJob(provider, providerInput)
        await saveVideoJob({
          taskId: created.taskId,
          provider,
          userId,
          prompt: input.prompt,
          status: "queued",
          model: created.model,
          statusUrl: created.statusUrl,
          credentialSlot: created.credentialSlot,
          createdAt: now,
          updatedAt: now,
        })
        return {
          ok: true,
          provider,
          model: created.model,
          taskId: created.taskId,
          status: "queued",
          outputResolution: provider === "magichour" ? "480p" : input.resolution || "720p",
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
        await saveVideoJob({
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
      await saveVideoJob({
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

  const publicError = errors.length === 1
    ? errors[0].replace(/^[^:]+:\s*/, "")
    : errors.join(" → ")

  return {
    ok: false,
    provider: "dashscope",
    model: dashscopeVideoModel(),
    taskId: "",
    status: "disabled",
    remainingDailyVideos: 0,
    error: publicError || "No video provider configured. Configure MALIKVIDEO_H3_BASE_URL or another video provider.",
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

export async function refreshVideoJobStatus(taskId: string, providerHint?: VideoProviderId, userId?: string): Promise<VideoGenerateResult & { videoUrl?: string }> {
  const stored = await getVideoJob(taskId, userId)

  if (!stored && !userId && providerHint && isFreeVideoProvider(providerHint) && freeVideoProviderConfigured(providerHint)) {
    try {
      const remote = await fetchFreeVideoStatus(providerHint, taskId)
      const status = mapRemoteStatus(remote.status)
      return {
        ok: status !== "failed",
        provider: providerHint,
        model: freeVideoModel(providerHint),
        taskId,
        status,
        remainingDailyVideos: 0,
        videoUrl: remote.videoUrl,
        error: remote.error,
      }
    } catch (error) {
      return {
        ok: false,
        provider: providerHint,
        model: freeVideoModel(providerHint),
        taskId,
        status: "failed",
        remainingDailyVideos: 0,
        error: error instanceof Error ? error.message : "Free video status check failed",
      }
    }
  }

  if (!stored && !userId && isMalikH3TaskId(taskId) && malikH3Configured()) {
    return refreshH3(taskId)
  }

  if (!stored && !userId && videoProviderConfigured("dashscope")) {
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
    await patchVideoJob(taskId, { status: result.status, videoUrl: result.videoUrl, error: result.error }, stored.userId)
    return result
  }

  if (isFreeVideoProvider(stored.provider)) {
    try {
      const remote = await fetchFreeVideoStatus(stored.provider as FreeVideoProviderId, taskId, {
        statusUrl: stored.statusUrl,
        credentialSlot: stored.credentialSlot,
      })
      const status = mapRemoteStatus(remote.status)
      await patchVideoJob(taskId, { status, videoUrl: remote.videoUrl, error: remote.error }, stored.userId)
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
        error: error instanceof Error ? error.message : "Free video status check failed",
      }
    }
  }

  try {
    const remote =
      stored.provider === "pollo"
        ? await fetchPolloTaskStatus(taskId)
        : await fetchTitanVideoStatus(stored.provider as TitanVideoProviderId, taskId, { statusUrl: stored.statusUrl, responseUrl: stored.responseUrl })

    const status = mapRemoteStatus(remote.status)
    await patchVideoJob(taskId, { status, videoUrl: remote.videoUrl, error: remote.error }, stored.userId)

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
