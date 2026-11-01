import { createHash } from "node:crypto"

import { buildZip } from "@/lib/work/documents/zip"
import { projectArtifactFiles, type StoredProjectArtifact } from "@/lib/server/project-artifact-store"
import { renderBandwidthBlocked, renderResponseFitsBudget } from "@/lib/server/render-bandwidth"

function disposition(artifact: StoredProjectArtifact) {
  const fallback = artifact.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "malik-project.zip"
  const cleanTitle = [...artifact.project.title.normalize("NFC")].filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("")
  const title = cleanTitle.replace(/[\\/<>:"|?*]/gu, "").trim().slice(0, 90) || "Malik project"
  const name = Buffer.from(`${title.replace(/[. ]+$/u, "")}.zip`).toString("utf8")
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/** One byte range; unsupported units/multiple ranges fall back to the full ZIP. */
function byteRange(value: string | null, length: number): { start: number; end: number } | null | undefined {
  if (!value) return undefined
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return undefined
  if (!match[1]) {
    const suffix = Number(match[2])
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, length - suffix), end: length - 1 } : null
  }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : length - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start) return null
  return { start, end: Math.min(end, length - 1) }
}

/** Deterministic packaging allows a download to resume without mixing versions. */
export function projectArtifactDownload(artifact: StoredProjectArtifact, request: Request) {
  const files = projectArtifactFiles(artifact.project, new Date(artifact.createdAt))
  const bytes = buildZip(files.map(file => ({ name: file.name, data: file.content })), new Date(artifact.createdAt))
  // Apply the existing guard to the complete compressed representation before
  // handling ranges. A partial request must not bypass the delivery budget.
  if (!renderResponseFitsBudget(bytes.length)) return renderBandwidthBlocked("project-zip", bytes.length)
  const sha256 = createHash("sha256").update(bytes).digest("hex"), etag = `"${sha256}"`
  const headers = new Headers({
    "content-type": "application/zip",
    "content-disposition": disposition(artifact),
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-malik-artifact": "project-zip",
    "x-malik-archive-sha256": sha256,
    "content-length": String(bytes.length),
    "accept-ranges": "bytes",
    etag,
  })
  const condition = request.headers.get("if-none-match")
  if (condition?.split(",").some(value => value.trim() === "*" || value.trim().replace(/^W\//, "") === etag)) {
    headers.delete("content-length")
    return new Response(null, { status: 304, headers })
  }
  if (request.method === "HEAD") return new Response(null, { status: 200, headers })
  const ifRange = request.headers.get("if-range")
  const range = !ifRange || ifRange === etag ? byteRange(request.headers.get("range"), bytes.length) : undefined
  if (range === null) {
    headers.set("content-range", `bytes */${bytes.length}`)
    headers.set("content-length", "0")
    return new Response(null, { status: 416, headers })
  }
  if (range) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${bytes.length}`)
    headers.set("content-length", String(range.end - range.start + 1))
    return new Response(new Uint8Array(bytes.subarray(range.start, range.end + 1)), { status: 206, headers })
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers })
}
