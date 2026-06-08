import { publicEngineForProvider, publicErrorMessage } from "@/lib/brand-provider-map"
import { getAIJob, updateAIJob } from "@/lib/ai/jobs"
import { providerFetch } from "@/lib/ai/providers/base"

export const runtime = "nodejs"

type PollResult = {
  status: "queued" | "processing" | "ready" | "failed"
  url?: string
  thumbnailUrl?: string
  error?: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function rawRecord(value: unknown): Record<string, unknown> {
  return record(record(value).raw)
}

function extractVideoUrl(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") {
    const looksLikeVideo = /\.(mp4|webm|mov)(\?|$)/i.test(value) || /video|mp4|generation|storage|asset/i.test(value)
    return value.startsWith("http") && looksLikeVideo ? value : ""
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractVideoUrl(item)
      if (found) return found
    }
    return ""
  }
  if (typeof value === "object") {
    const data = value as Record<string, unknown>
    const direct =
      data.url ||
      data.videoUrl ||
      data.resultUrl ||
      data.outputUrl ||
      data.uri ||
      record(data.assets).video ||
      record(data.asset).url ||
      record(data.video).url
    const foundDirect = extractVideoUrl(direct)
    if (foundDirect) return foundDirect
    for (const item of Object.values(data)) {
      const found = extractVideoUrl(item)
      if (found) return found
    }
  }
  return ""
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await providerFetch(url, init, Number(process.env.VIDEO_STATUS_TIMEOUT_MS || 20_000))
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(record(payload).message as string || record(payload).error as string || `Video status returned ${response.status}`)
  return payload
}

function normalizedStatus(value: unknown): PollResult["status"] {
  const status = String(value || "").toLowerCase()
  if (/(complete|completed|succeeded|success|ready|done)/.test(status)) return "ready"
  if (/(fail|failed|error|cancel|cancelled)/.test(status)) return "failed"
  if (/(process|running|render|dream|pending|queued|submitted|starting)/.test(status)) return "processing"
  return "queued"
}

async function pollRunway(raw: Record<string, unknown>): Promise<PollResult> {
  const key = process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY
  const statusUrl = String(raw.statusUrl || "")
  if (!key || !statusUrl) return { status: "processing" }
  const payload = record(await fetchJson(statusUrl, {
    headers: {
      authorization: `Bearer ${key}`,
      "X-Runway-Version": "2024-11-06",
    },
  }))
  const url = extractVideoUrl(payload.output || payload.outputs || payload)
  const status = url ? "ready" : normalizedStatus(payload.status || payload.state)
  return { status, url: url || undefined, error: status === "failed" ? String(payload.error || payload.failure || "") : undefined }
}

async function pollLuma(raw: Record<string, unknown>): Promise<PollResult> {
  const key = process.env.LUMA_API_KEY
  const statusUrl = String(raw.statusUrl || "")
  if (!key || !statusUrl) return { status: "processing" }
  const payload = record(await fetchJson(statusUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${key}`,
    },
  }))
  const url = extractVideoUrl(payload.assets || payload.asset || payload)
  const status = url ? "ready" : normalizedStatus(payload.state || payload.status)
  return { status, url: url || undefined, error: status === "failed" ? String(payload.failure_reason || payload.error || "") : undefined }
}

async function pollFal(raw: Record<string, unknown>): Promise<PollResult> {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY
  if (!key) return { status: "processing" }
  const headers = { authorization: `Key ${key}` }
  const responseUrl = String(raw.responseUrl || "")
  if (responseUrl) {
    try {
      const payload = await fetchJson(responseUrl, { headers })
      const url = extractVideoUrl(payload)
      if (url) return { status: "ready", url }
    } catch {
      // FAL response URLs can be unavailable until the queue completes.
    }
  }
  const statusUrl = String(raw.statusUrl || "")
  if (!statusUrl) return { status: "processing" }
  const payload = record(await fetchJson(statusUrl, { headers }))
  const url = extractVideoUrl(payload)
  const status = url ? "ready" : normalizedStatus(payload.status)
  return { status, url: url || undefined, error: status === "failed" ? String(payload.error || payload.message || "") : undefined }
}

async function pollVeo(raw: Record<string, unknown>): Promise<PollResult> {
  const key = process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY
  const statusUrl = String(raw.statusUrl || "")
  if (!key || !statusUrl) return { status: "processing" }
  const separator = statusUrl.includes("?") ? "&" : "?"
  const payload = record(await fetchJson(`${statusUrl}${separator}key=${encodeURIComponent(key)}`, {
    headers: { "content-type": "application/json" },
  }))
  const url = extractVideoUrl(payload.response || payload.predictions || payload)
  const done = payload.done === true
  const status = url ? "ready" : done ? "failed" : "processing"
  return { status, url: url || undefined, error: status === "failed" ? String(record(payload.error).message || "Video render did not return media.") : undefined }
}

async function pollProvider(provider: string, raw: Record<string, unknown>): Promise<PollResult> {
  if (provider === "runway") return pollRunway(raw)
  if (provider === "luma") return pollLuma(raw)
  if (provider === "fal") return pollFal(raw)
  if (provider === "veo") return pollVeo(raw)
  return { status: "processing" }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const jobId = url.searchParams.get("jobId") || ""
  const job = jobId ? getAIJob(jobId) : null

  if (!job || job.type !== "video") {
    return Response.json({ ok: false, status: "missing", error: "job_not_found" }, { status: 404 })
  }

  const provider = String(job.provider || job.output?.provider || "")
  const engine = publicEngineForProvider(provider, "video")
  const storedUrl = job.output?.resultUrl

  if (job.status === "completed" && storedUrl) {
    return Response.json({ ok: true, status: "ready", engine: engine.title, jobId: job.id, videoUrl: storedUrl, url: storedUrl })
  }

  if (job.status === "failed") {
    return Response.json({
      ok: false,
      status: "failed",
      engine: engine.title,
      jobId: job.id,
      publicError: publicErrorMessage(job.error),
    }, { status: 200 })
  }

  try {
    const raw = rawRecord(job.output)
    const polled = await pollProvider(provider, raw)
    if (polled.status === "ready" && polled.url) {
      updateAIJob(job.id, {
        status: "completed",
        output: {
          ...job.output,
          resultUrl: polled.url,
          thumbnailUrl: polled.thumbnailUrl,
        },
      })
      return Response.json({ ok: true, status: "ready", engine: engine.title, jobId: job.id, videoUrl: polled.url, url: polled.url, thumbnailUrl: polled.thumbnailUrl })
    }
    if (polled.status === "failed") {
      updateAIJob(job.id, { status: "failed", error: polled.error || "Video render failed." })
      return Response.json({ ok: false, status: "failed", engine: engine.title, jobId: job.id, publicError: publicErrorMessage(polled.error) })
    }
    updateAIJob(job.id, { status: "processing" })
    return Response.json({ ok: true, status: "rendering", engine: engine.title, jobId: job.id })
  } catch (error) {
    return Response.json({
      ok: true,
      status: "rendering",
      engine: engine.title,
      jobId: job.id,
      publicError: publicErrorMessage(error),
    })
  }
}
