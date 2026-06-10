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

const GEMINI_VIDEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function rawRecord(value: unknown): Record<string, unknown> {
  return record(record(value).raw)
}

function googleVideoKey() {
  return process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
}

function proxyGoogleVideoUri(uri: string) {
  if (!uri) return ""
  return `/api/ai/video/file?uri=${encodeURIComponent(uri)}`
}

function extractGoogleVideoUri(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") {
    if (/^https:\/\/generativelanguage\.googleapis\.com\//i.test(value)) return value
    if (/^https?:\/\//i.test(value) && /video|file|media|download|mp4|webm/i.test(value)) return value
    return ""
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractGoogleVideoUri(item)
      if (found) return found
    }
    return ""
  }
  if (typeof value === "object") {
    const data = value as Record<string, unknown>
    const direct =
      data.uri ||
      data.url ||
      data.videoUrl ||
      data.resultUrl ||
      data.outputUrl ||
      record(data.video).uri ||
      record(data.video).url ||
      record(data.file).uri ||
      record(data.file).url
    const directFound = extractGoogleVideoUri(direct)
    if (directFound) return directFound
    for (const item of Object.values(data)) {
      const found = extractGoogleVideoUri(item)
      if (found) return found
    }
  }
  return ""
}

function extractVideoUrl(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") {
    const looksLikeVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value) || /video|mp4|webm|generation|storage|asset|media|download/i.test(value)
    return (value.startsWith("http") || value.startsWith("/")) && looksLikeVideo ? value : ""
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
      record(data.video).url ||
      record(data.video).uri
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
  if (!response.ok) throw new Error(record(payload).message as string || record(record(payload).error).message as string || record(payload).error as string || `Video status returned ${response.status}`)
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
  const key = googleVideoKey()
  const operationName = String(raw.operationName || raw.jobId || raw.providerJobId || raw.name || "")
  const statusUrl = String(raw.statusUrl || (operationName ? `https://generativelanguage.googleapis.com/v1beta/${operationName}` : ""))
  if (!key || !statusUrl) return { status: "processing" }

  const payload = record(await fetchJson(statusUrl, {
    headers: {
      "x-goog-api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
  }))

  const googleUri = extractGoogleVideoUri(payload.response || payload)
  const directUrl = extractVideoUrl(payload.response || payload)
  const done = payload.done === true
  const url = googleUri ? proxyGoogleVideoUri(googleUri) : directUrl

  if (url) return { status: "ready", url }
  if (done) return { status: "failed", error: String(record(payload.error).message || "Veo finished but did not return a video URI.") }
  return { status: "processing" }
}

async function pollBedrock(raw: Record<string, unknown>): Promise<PollResult> {
  // Bedrock video output usually lands in S3 and needs a signed URL layer.
  // Until that layer is configured, keep the job processing instead of returning fake media.
  if (raw.resultUrl && typeof raw.resultUrl === "string") return { status: "ready", url: raw.resultUrl }
  return { status: "processing" }
}

async function pollProvider(provider: string, raw: Record<string, unknown>): Promise<PollResult> {
  if (provider === "runway") return pollRunway(raw)
  if (provider === "luma") return pollLuma(raw)
  if (provider === "fal") return pollFal(raw)
  if (provider === "veo") return pollVeo(raw)
  if (provider === "aws-bedrock" || provider === "bedrock") return pollBedrock(raw)
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

