import { getPolloApiKey, POLLO_API_BASE, polloVideoEnabled, polloVideoModel } from "../config"
import type { VideoGenerateInput } from "../types"

type PolloCreateResponse = {
  taskId?: string
  status?: string
  message?: string
}

type PolloStatusResponse = {
  taskId?: string
  generations?: Array<{
    status?: string
    url?: string | null
    failMsg?: string | null
    mediaType?: string
  }>
  message?: string
}

export function polloConfigured(): boolean {
  return Boolean(getPolloApiKey())
}

function polloHeaders(): HeadersInit {
  const key = getPolloApiKey()
  if (!key) throw new Error("POLLO_API_KEY not configured")
  return {
    "content-type": "application/json",
    "x-api-key": key,
  }
}

function modelPath(): string {
  const model = polloVideoModel()
  return `/generation/pollo/${model}`
}

export async function createPolloVideoTask(input: VideoGenerateInput): Promise<{ taskId: string; status: string }> {
  const key = getPolloApiKey()
  if (!key) throw new Error("POLLO_API_KEY not configured")

  const body: Record<string, unknown> = {
    input: input.imageUrl
      ? {
          prompt: input.prompt.slice(0, 2000),
          image: input.imageUrl,
          length: input.length || 5,
          resolution: input.resolution || "720p",
          generateAudio: Boolean(input.generateAudio),
        }
      : {
          prompt: input.prompt.slice(0, 2000),
          length: input.length || 5,
          resolution: input.resolution || "720p",
          generateAudio: Boolean(input.generateAudio),
          aspectRatio: "16:9",
        },
  }

  const response = await fetch(`${POLLO_API_BASE}${modelPath()}`, {
    method: "POST",
    headers: polloHeaders(),
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => ({}))) as PolloCreateResponse
  if (!response.ok) {
    throw new Error(payload?.message || `Pollo returned ${response.status}`)
  }

  const taskId = payload.taskId
  if (!taskId) throw new Error("Pollo returned no taskId")

  return { taskId, status: payload.status || "waiting" }
}

export async function fetchPolloTaskStatus(taskId: string): Promise<{
  status: "waiting" | "processing" | "succeed" | "failed"
  videoUrl?: string
  error?: string
}> {
  const response = await fetch(`${POLLO_API_BASE}/generation/${encodeURIComponent(taskId)}/status`, {
    method: "GET",
    headers: polloHeaders(),
  })

  const payload = (await response.json().catch(() => ({}))) as PolloStatusResponse
  if (!response.ok) {
    throw new Error(payload?.message || `Pollo status returned ${response.status}`)
  }

  const generation = payload.generations?.[0]
  const raw = generation?.status || "waiting"
  const status =
    raw === "succeed" ? "succeed" : raw === "failed" ? "failed" : raw === "processing" ? "processing" : "waiting"

  return {
    status,
    videoUrl: generation?.url || undefined,
    error: generation?.failMsg || undefined,
  }
}

export function mapPolloStatusToJob(status: string): "queued" | "generating" | "completed" | "failed" {
  if (status === "succeed") return "completed"
  if (status === "failed") return "failed"
  if (status === "processing" || status === "waiting") return "generating"
  return "queued"
}

export async function pingPollo(): Promise<"configured" | "missing" | "disabled"> {
  if (!polloVideoEnabled()) return "disabled"
  return polloConfigured() ? "configured" : "missing"
}
