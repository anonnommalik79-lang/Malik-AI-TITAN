import type { VideoGenerateInput, VideoResolution } from "../types"

const H3_TASK_PREFIX = "h3:"
const HF_TASK_PREFIX = "h3hf:"

type H3Mode = "hf" | "worker" | "sglang"
type HfJob = {
  status: "waiting" | "processing" | "succeed" | "failed"
  videoUrl?: string
  error?: string
}

const hfJobs = new Map<string, HfJob>()

function trimSlash(value: string) {
  return value.replace(/\/$/, "")
}

function hfToken() {
  return process.env.HF_TOKEN?.trim() || process.env.MALIKVIDEO_HF_TOKEN?.trim() || ""
}

function hfSpace() {
  return process.env.MALIKVIDEO_HF_SPACE?.trim() || "ks2047/minimax-h3"
}

function hfBaseUrl() {
  const explicit = process.env.MALIKVIDEO_HF_BASE_URL?.trim()
  if (explicit) return trimSlash(explicit)
  return `https://${hfSpace().replace("/", "-").toLowerCase()}.hf.space`
}

export function malikH3BaseUrl() {
  if (malikH3Mode() === "hf") return hfBaseUrl()
  return trimSlash(process.env.MALIKVIDEO_H3_BASE_URL?.trim() || "")
}

function malikH3ApiKey() {
  return process.env.MALIKVIDEO_H3_API_KEY?.trim() || ""
}

export function malikH3Mode(): H3Mode {
  const explicit = process.env.MALIKVIDEO_H3_MODE?.trim().toLowerCase()
  if (explicit === "sglang") return "sglang"
  if (explicit === "worker") return "worker"
  if (explicit === "hf") return "hf"
  return hfToken() ? "hf" : "worker"
}

export function malikH3Model() {
  return process.env.MALIKVIDEO_H3_MODEL?.trim() || "MalikVideo 1.0"
}

export function malikH3Configured() {
  if (malikH3Mode() === "hf") return Boolean(hfToken())
  return process.env.MALIKVIDEO_H3_ENABLED?.trim().toLowerCase() === "true" && Boolean(malikH3BaseUrl())
}

function h3Headers(extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set("content-type", "application/json")
  const key = malikH3ApiKey()
  if (key) headers.set("authorization", `Bearer ${key}`)
  return headers
}

function hfHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set("content-type", "application/json")
  const token = hfToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  return headers
}

function remoteTaskId(taskId: string) {
  if (taskId.startsWith(HF_TASK_PREFIX)) return taskId.slice(HF_TASK_PREFIX.length)
  return taskId.startsWith(H3_TASK_PREFIX) ? taskId.slice(H3_TASK_PREFIX.length) : taskId
}

export function isMalikH3TaskId(taskId: string) {
  return taskId.startsWith(H3_TASK_PREFIX) || taskId.startsWith(HF_TASK_PREFIX)
}

export function malikH3ContentPath(taskId: string) {
  return `/api/media/video/h3-content?taskId=${encodeURIComponent(taskId)}`
}

function requestedOutput(resolution?: VideoResolution) {
  if (resolution === "2k") return "2k"
  if (resolution === "1080p") return "1080p"
  return "raw768"
}

function hfCanvas(ratio?: string) {
  if (ratio === "9:16") return process.env.MALIKVIDEO_HF_CANVAS_9_16?.trim() || "544x960 · 9:16 fast"
  if (ratio === "1:1") return process.env.MALIKVIDEO_HF_CANVAS_1_1?.trim() || "544x544 · 1:1 fast"
  if (ratio === "4:3") return process.env.MALIKVIDEO_HF_CANVAS_4_3?.trim() || "768x576 · 4:3 fast"
  return process.env.MALIKVIDEO_HF_CANVAS_16_9?.trim() || "1024x576 · 16:9 fast"
}

function absoluteHfUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value
  return `${hfBaseUrl()}${value.startsWith("/") ? "" : "/"}${value}`
}

function findVideoUrl(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && /(?:\.mp4|\.webm|\.mov)(?:\?|$)/i.test(value)) return value
    if (value.startsWith("/") && /(?:\.mp4|\.webm|\.mov)(?:\?|$)/i.test(value)) return absoluteHfUrl(value)
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item)
      if (found) return found
    }
    return undefined
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const url = typeof record.url === "string" ? record.url : undefined
    if (url) return absoluteHfUrl(url)
    const path = typeof record.path === "string" ? record.path : undefined
    if (path && /(?:\.mp4|\.webm|\.mov)$/i.test(path)) {
      return `${hfBaseUrl()}/gradio_api/file=${encodeURIComponent(path)}`
    }
    for (const item of Object.values(record)) {
      const found = findVideoUrl(item)
      if (found) return found
    }
  }
  return undefined
}

function parseSseComplete(text: string): { videoUrl?: string; error?: string } {
  const blocks = text.split(/\r?\n\r?\n/)
  let lastError = ""
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim()
    const dataText = lines.filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
    if (!dataText) continue
    if (event === "error") {
      lastError = dataText
      continue
    }
    if (event !== "complete") continue
    try {
      const payload = JSON.parse(dataText)
      const videoUrl = findVideoUrl(payload)
      if (videoUrl) return { videoUrl }
      return { error: "Hugging Face completed generation but returned no video URL" }
    } catch {
      return { error: `Invalid Hugging Face completion payload: ${dataText.slice(0, 300)}` }
    }
  }
  return { error: lastError || "Hugging Face stream ended before completion" }
}

async function monitorHfJob(taskId: string, eventId: string) {
  hfJobs.set(taskId, { status: "processing" })
  try {
    const response = await fetch(`${hfBaseUrl()}/gradio_api/call/generate/${encodeURIComponent(eventId)}`, {
      method: "GET",
      headers: hfHeaders({ accept: "text/event-stream" }),
      cache: "no-store",
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(detail || `HF H3 stream failed (${response.status})`)
    }
    const stream = await response.text()
    const completed = parseSseComplete(stream)
    if (completed.videoUrl) hfJobs.set(taskId, { status: "succeed", videoUrl: completed.videoUrl })
    else hfJobs.set(taskId, { status: "failed", error: completed.error || "HF H3 generation failed" })
  } catch (error) {
    hfJobs.set(taskId, { status: "failed", error: error instanceof Error ? error.message : "HF H3 generation failed" })
  }
}

async function createHfJob(input: VideoGenerateInput) {
  const duration = Math.max(2, Math.min(5, Number(process.env.MALIKVIDEO_HF_DURATION || input.length || 5)))
  const steps = Math.max(10, Math.min(40, Number(process.env.MALIKVIDEO_HF_STEPS || 20)))
  const seed = Number(process.env.MALIKVIDEO_HF_SEED || 42)
  const response = await fetch(`${hfBaseUrl()}/gradio_api/call/generate`, {
    method: "POST",
    headers: hfHeaders(),
    body: JSON.stringify({ data: [input.prompt, null, null, hfCanvas(input.ratio), duration, steps, seed] }),
    signal: AbortSignal.timeout(Number(process.env.MALIKVIDEO_HF_SUBMIT_TIMEOUT_MS || 45_000)),
  })
  const payload = await response.json().catch(() => ({})) as { event_id?: string; detail?: string; error?: string }
  if (!response.ok || !payload.event_id) {
    throw new Error(payload.detail || payload.error || `HF H3 submit failed (${response.status})`)
  }
  const taskId = `${HF_TASK_PREFIX}${payload.event_id}`
  hfJobs.set(taskId, { status: "waiting" })
  void monitorHfJob(taskId, payload.event_id)
  return {
    taskId,
    model: malikH3Model(),
    statusUrl: `${hfBaseUrl()}/gradio_api/call/generate/${encodeURIComponent(payload.event_id)}`,
    responseUrl: "",
  }
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

export async function createMalikH3Job(input: VideoGenerateInput) {
  if (!malikH3Configured()) throw new Error("MalikVideo 1.0 is not configured")
  if (malikH3Mode() === "hf") return createHfJob(input)

  const base = malikH3BaseUrl()
  const duration = input.length || 5
  const ratio = input.ratio || "16:9"
  const task = input.imageUrl ? "fl2va" : "t2va"
  const outputResolution = requestedOutput(input.resolution)
  const mode = malikH3Mode()

  if (mode === "sglang" && outputResolution !== "raw768") {
    throw new Error("Direct H3/SGLang only produces the 768p master. Use worker mode for 1080p/2K.")
  }
  if (mode === "worker") await assertWorkerOutputReady(base, outputResolution)

  const conditions = input.imageUrl
    ? [{ type: "image", uri: input.imageUrl, role: "keyframe", frame_index: 0 }]
    : []
  const baseBody = {
    task,
    prompt: input.prompt,
    conditions,
    target: { short_edge: 768, aspect_ratio: ratio, duration_seconds: duration },
    seed: Number(process.env.MALIKVIDEO_H3_SEED || 0),
  }
  const body = mode === "worker"
    ? {
        ...baseBody,
        output_resolution: outputResolution,
        metadata: {
          requested_resolution: input.resolution || "720p",
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
  if (!malikH3Configured()) throw new Error("MalikVideo 1.0 is not configured")
  if (taskId.startsWith(HF_TASK_PREFIX)) {
    const job = hfJobs.get(taskId)
    if (!job) return { status: "failed", error: "MalikVideo task state was lost after a server restart" }
    return {
      status: job.status,
      videoUrl: job.status === "succeed" ? malikH3ContentPath(taskId) : undefined,
      stage: job.status === "succeed" ? "ready" : job.status,
      outputResolution: "720p",
      error: job.error,
    }
  }

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
  if (taskId.startsWith(HF_TASK_PREFIX)) {
    const url = hfJobs.get(taskId)?.videoUrl
    if (!url) throw new Error("HF video is not ready")
    return url
  }
  const id = remoteTaskId(taskId)
  return `${malikH3BaseUrl()}/v1/videos/${encodeURIComponent(id)}/content`
}

export function malikH3AuthHeaders(taskId?: string) {
  const headers = new Headers()
  if (taskId?.startsWith(HF_TASK_PREFIX) || malikH3Mode() === "hf") {
    const token = hfToken()
    if (token) headers.set("authorization", `Bearer ${token}`)
    return headers
  }
  const key = malikH3ApiKey()
  if (key) headers.set("authorization", `Bearer ${key}`)
  return headers
}
