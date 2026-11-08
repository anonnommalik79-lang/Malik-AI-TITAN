import "server-only"

import { resolveMediaUser } from "@/lib/media/request"
import { getVideoJob } from "@/lib/media/jobs"
import { fetchVideoSource } from "@/lib/media/video-source"
import { inspectVideoBytes, type VideoProbe } from "@/lib/media/video-file-check"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 256 * 1024

async function readUpTo(response: Response, limit: number) {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (size < limit) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      size += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(Math.min(size, limit))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.min(chunk.length, out.length - offset))
    out.set(part, offset)
    offset += part.length
    if (offset >= out.length) break
  }
  return out
}

// Why a finished video does not play: reachable, a real video, which codec.
// Reads at most ~320 KB of the file, never the whole video.
export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  }
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""
  if (!taskId || taskId.length > 220) return Response.json({ ok: false, error: "INVALID_TASK" }, { status: 400 })
  const job = await getVideoJob(taskId, user.userId)
  if (!job || job.status !== "completed" || !job.videoUrl) {
    return Response.json({ ok: false, error: "VIDEO_NOT_READY" }, { status: 404 })
  }

  const headers = { "cache-control": "private, no-store" }
  try {
    const head = await fetchVideoSource(job.videoUrl, { range: `bytes=0-${HEAD_BYTES - 1}`, timeoutMs: 20_000 })
    if ("error" in head) return Response.json({ ok: true, probe: { reachable: false, httpStatus: head.status } satisfies VideoProbe }, { headers })
    const response = head.response
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return Response.json({ ok: true, probe: { reachable: false, httpStatus: response.status } satisfies VideoProbe }, { headers })
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase()
    const total = Number(/\/(\d+)\s*$/u.exec(response.headers.get("content-range") || "")?.[1] || response.headers.get("content-length") || 0) || undefined
    const first = await readUpTo(response, HEAD_BYTES)
    let checked = inspectVideoBytes(first)
    // An MP4 written without «faststart» keeps its codec table at the end.
    if (checked.container === "mp4" && checked.codec === "unknown" && response.status === 206) {
      const tail = await fetchVideoSource(job.videoUrl, { range: `bytes=-${TAIL_BYTES}`, timeoutMs: 20_000 })
      if (!("error" in tail) && tail.response.ok) checked = inspectVideoBytes(first, await readUpTo(tail.response, TAIL_BYTES))
    }
    const probe: VideoProbe = { reachable: true, httpStatus: response.status, contentType, sizeBytes: total, ...checked }
    return Response.json({ ok: true, probe }, { headers })
  } catch {
    return Response.json({ ok: true, probe: { reachable: false } satisfies VideoProbe }, { headers })
  }
}
