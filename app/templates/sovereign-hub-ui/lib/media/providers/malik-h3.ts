import type { VideoGenerateInput, VideoResolution } from "../types"

const H3_TASK_PREFIX = "h3:"

type H3Mode = "worker" | "sglang"

function trimSlash(value: string) {
  return value.replace(/\/$/, "")
}

export function malikH3BaseUrl() {
  return trimSlash(process.env.MALIKVIDEO_H3_BASE_URL?.trim() || "")
}

function malikH3ApiKey() {
  return process.env.MALIKVIDEO_H3_API_KEY?.trim() || ""
}

export function malikH3Mode(): H3Mode {
  return process.env.MALIKVIDEO_H3_MODE?.trim().toLowerCase() === "sglang" ? "sglang" : "worker"
}

export function malikH3Model() {
  return process.env.MALIKVIDEO_H3_MODEL?.trim() || "MalikVideo-1.0-H3"
}

export function malikH3Configured() {
  return process.env.MALIKVIDEO_H3_ENABLED?.trim().toLowerCase() === "true" && Boolean(malikH3BaseUrl())
}

function h3Headers(extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set("content-type", "application/json")
  const key = malikH3ApiKey()
  if (key) headers.set("authorization", `Bearer ${key}`)
  return headers
}

function remoteTaskId(taskId: string) {
  return taskId.startsWith(H3_TASK_PREFIX) ? taskId.slice(H3_TASK_PREFIX.length) : taskId
}

export function isMalikH3TaskId(taskId: string) {
  return taskId.startsWith(H3_TASK_PREFIX)
}

export function malikH3ContentPath(taskId: string) {
  return `/api/media/video/h3-content?taskId=${encodeURIComponent(taskId)}`
}

function requestedOutput(resolution?: VideoResolution) {
  if (resolution === "2k") return "2k"
  if (resolution === "1080p") return "1080p"
  return "raw768"
}

async function assertWorkerOutputReady(base: string, outputResolution: "raw768" | "1080p" | "2k") {
  if (outputResolution === "raw768") return

  const response = await fetch(`${base}/health`, {
    method: "GET",
    headers: h3Headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.MALIKVIDEO_H3_STATUS_TIMEOUT_MS || 15_000)),
  })
  const payload = await response.json().catch(() => ({}))
  const supported = Array.isArray(payload?.supported_outputs)
    ? payload.supported_outputs.map((value: unknown) => String(value).toLowerCase())
    : []

  if (!response.ok || payload?.ok === false || !supported.includes(outputResolution)) {
    const detail = payload?.error || payload?.detail || `worker does not advertise ${outputResolution}`
    throw new Error(`MalikVideo high-resolution path unavailable: ${String(detail)}`)
  }
}

/**
 * Submit to our MalikVideo worker (recommended) or directly to SGLang.
 * H3 Base itself always renders a 768px-short-edge audiovisual master. The
 * worker is what turns that master into honest 1080p/2K output via restoration.
 */
export async function createMalikH3Job(input: VideoGenerateInput) {
  if (!malikH3Configured()) throw new Error("MALIKVIDEO_H3 is not configured")

  const base = malikH3BaseUrl()
  const duration = input.length || 5
  const ratio = input.ratio || "16:9"
  const task = input.imageUrl ? "fl2va" : "t2va"
  const outputResolution = requestedOutput(input.resolution)
  const mode = malikH3Mode()

  if (mode === "sglang" && outputResolution !== "raw768") {
    throw new Error("Direct H3/SGLang only produces the 768p master. Use MALIKVIDEO_H3_MODE=worker for 1080p/2K.")
  }

  if (mode === "worker") {
    await assertWorkerOutputReady(base, outputResolution)
  }

  const conditions = input.imageUrl
    ? [{ type: "image", uri: input.imageUrl, role: "keyframe", frame_index: 0 }]
    : []

  const baseBody = {
    task,
    prompt: input.prompt,
    conditions,
    target: {
      short_edge: 768,
      aspect_ratio: ratio,
      duration_seconds: duration,
    },
    seed: Number(process.env.MALIKVIDEO_H3_SEED || 0),
  }

  const body = mode === "worker"
    ? {
        ...baseBody,
        output_resolution: outputResolution,
        metadata: {
          requested_resolution: input.resolution || "1080p",
          generate_audio: input.generateAudio !== false,
          product: "MalikVideo",
        },
      }
    : baseBody

  const response = await fetch(`${base}/v1/videos`, {
    method: "POST",
    headers: h3Headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.MALIKVIDEO_H3_SUBMIT_TIMEOUT_MS || 30_000)),
  })

  const payload = await response.json().catch(() => ({}))
  const id = payload?.id || payload?.video_id || payload?.task_id
  if (!response.ok || !id) {
    throw new Error(payload?.detail || payload?.error?.message || payload?.message || `H3 submit failed (${response.status})`)
  }

  const taskId = `${H3_TASK_PREFIX}${String(id)}`
  return {
    taskId,
    model: malikH3Model(),
    statusUrl: `${base}/v1/videos/${encodeURIComponent(String(id))}`,
    responseUrl: `${base}/v1/videos/${encodeURIComponent(String(id))}/content`,
  }
}

function normalizeH3Status(raw: unknown) {
  const status = String(raw || "").trim().toLowerCase()
  if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return "succeed"
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "failed"
  if (["running", "processing", "generating", "in_progress"].includes(status)) return "processing"
  return "waiting"
}

export async function fetchMalikH3Status(taskId: string) {
  if (!malikH3Configured()) throw new Error("MALIKVIDEO_H3 is not configured")

  const id = remoteTaskId(taskId)
  const response = await fetch(`${malikH3BaseUrl()}/v1/videos/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: h3Headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.MALIKVIDEO_H3_STATUS_TIMEOUT_MS || 15_000)),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.error?.message || payload?.message || `H3 status failed (${response.status})`)
  }

  const status = normalizeH3Status(payload?.status || payload?.state)
  return {
    status,
    videoUrl: status === "succeed" ? malikH3ContentPath(taskId) : undefined,
    stage: typeof payload?.stage === "string" ? payload.stage : undefined,
    outputResolution: typeof payload?.output_resolution === "string" ? payload.output_resolution : undefined,
    error: status === "failed" ? String(payload?.detail || payload?.error?.message || payload?.error || payload?.message || "H3 generation failed") : undefined,
  }
}

export function malikH3RemoteContentUrl(taskId: string) {
  const id = remoteTaskId(taskId)
  return `${malikH3BaseUrl()}/v1/videos/${encodeURIComponent(id)}/content`
}

export function malikH3AuthHeaders() {
  const headers = new Headers()
  const key = malikH3ApiKey()
  if (key) headers.set("authorization", `Bearer ${key}`)
  return headers
}
