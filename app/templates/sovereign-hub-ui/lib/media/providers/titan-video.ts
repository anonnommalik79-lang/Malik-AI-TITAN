import type { VideoGenerateInput } from "../types"

export type TitanVideoProviderId = "pollo" | "runway" | "fal" | "luma" | "veo"

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY
}
function runwayKey() {
  return process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY
}
function veoKey() {
  return process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY
}

export function videoProviderConfigured(id: TitanVideoProviderId): boolean {
  if (id === "pollo") return Boolean(process.env.POLLO_API_KEY?.trim()) && process.env.POLLO_VIDEO_ENABLED === "true"
  if (id === "runway") return Boolean(runwayKey())
  if (id === "fal") return Boolean(falKey())
  if (id === "luma") return Boolean(process.env.LUMA_API_KEY?.trim())
  if (id === "veo") return Boolean(veoKey())
  return false
}

export async function createTitanVideoJob(provider: TitanVideoProviderId, input: VideoGenerateInput) {
  const length = input.length || 5

  if (provider === "runway") {
    const key = runwayKey()
    if (!key) throw new Error("RUNWAY_API_KEY missing")
    const model = process.env.RUNWAY_VIDEO_MODEL || "gen4.5"
    const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "X-Runway-Version": "2024-11-06" },
      body: JSON.stringify({ model, promptText: input.prompt, ratio: "1280:720", duration: length }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.id) throw new Error(payload?.error || payload?.message || "Runway failed")
    return { taskId: payload.id, model, statusUrl: `https://api.dev.runwayml.com/v1/tasks/${payload.id}`, responseUrl: undefined }
  }

  if (provider === "fal") {
    const key = falKey()
    if (!key) throw new Error("FAL_KEY missing")
    const model = process.env.FAL_VIDEO_MODEL || "fal-ai/minimax-video"
    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { authorization: `Key ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: input.prompt }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.request_id) throw new Error(payload?.detail || payload?.message || "FAL video failed")
    return { taskId: payload.request_id, model, statusUrl: payload.status_url, responseUrl: payload.response_url }
  }

  if (provider === "luma") {
    const key = process.env.LUMA_API_KEY
    if (!key) throw new Error("LUMA_API_KEY missing")
    const model = process.env.LUMA_VIDEO_MODEL || "ray-2"
    const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ prompt: input.prompt, model, resolution: input.resolution || "720p", duration: `${length}s`, aspect_ratio: "16:9" }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.id) throw new Error(payload?.detail || payload?.message || "Luma failed")
    return { taskId: payload.id, model, statusUrl: `https://api.lumalabs.ai/dream-machine/v1/generations/${payload.id}` }
  }

  if (provider === "veo") {
    const key = veoKey()
    if (!key) throw new Error("GOOGLE_VEO_API_KEY missing")
    const model = process.env.GOOGLE_VEO_MODEL || "veo-3.1-generate-preview"
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: input.prompt }], parameters: { aspectRatio: "16:9" } }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.name) throw new Error(payload?.error?.message || "Veo failed")
    return { taskId: payload.name, model, statusUrl: `https://generativelanguage.googleapis.com/v1beta/${payload.name}?key=${key}` }
  }

  throw new Error(`Provider ${provider} not handled here — use Pollo module`)
}

export async function fetchTitanVideoStatus(provider: TitanVideoProviderId, taskId: string, extras?: { statusUrl?: string; responseUrl?: string }) {
  if (provider === "runway") {
    const key = runwayKey()
    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
    })
    const payload = await response.json().catch(() => ({}))
    const status = payload?.status === "SUCCEEDED" ? "succeed" : payload?.status === "FAILED" ? "failed" : "processing"
    const videoUrl = payload?.output?.[0]?.url || payload?.output?.url
    return { status, videoUrl, error: payload?.failure || payload?.error }
  }

  if (provider === "fal" && extras?.responseUrl) {
    const key = falKey()
    const statusRes = await fetch(extras.statusUrl || "", { headers: { authorization: `Key ${key}` } })
    const statusPayload = await statusRes.json().catch(() => ({}))
    if (statusPayload?.status !== "COMPLETED") {
      return { status: statusPayload?.status === "FAILED" ? "failed" : "processing", videoUrl: undefined }
    }
    const resultRes = await fetch(extras.responseUrl, { headers: { authorization: `Key ${key}` } })
    const resultPayload = await resultRes.json().catch(() => ({}))
    const videoUrl = resultPayload?.video?.url || resultPayload?.output?.url
    return { status: videoUrl ? "succeed" : "processing", videoUrl }
  }

  if (provider === "luma") {
    const key = process.env.LUMA_API_KEY
    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    })
    const payload = await response.json().catch(() => ({}))
    const status = payload?.state === "completed" ? "succeed" : payload?.state === "failed" ? "failed" : "processing"
    const videoUrl = payload?.assets?.video || payload?.video?.url
    return { status, videoUrl, error: payload?.failure_reason }
  }

  if (provider === "veo") {
    const key = veoKey()
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${taskId}?key=${key}`)
    const payload = await response.json().catch(() => ({}))
    const done = Boolean(payload?.done)
    const status = payload?.error ? "failed" : done ? "succeed" : "processing"
    const videoUrl = payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    return { status, videoUrl, error: payload?.error?.message }
  }

  return { status: "processing" as const, videoUrl: undefined }
}
