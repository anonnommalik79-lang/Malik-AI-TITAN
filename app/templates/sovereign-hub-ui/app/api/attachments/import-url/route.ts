import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { request as httpRequest, type IncomingMessage } from "node:http"
import { request as httpsRequest, type RequestOptions } from "node:https"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeSharedRequestFrequency } from "@/lib/server/request-frequency"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_REMOTE_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 3
const ALLOWED_TYPES = /^(?:image\/(?:png|jpeg|webp|gif|avif|bmp)|video\/(?:mp4|webm|quicktime|mpeg|ogg))$/

// IPv4 only for this importer. Never connect to IPv6, mapped IPv6, non-global
// addresses, or a different DNS answer after checking the address.
function isPublicIpv4(address: string) {
  if (isIP(address) !== 4) return false
  const [a,b,c] = address.split(".").map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}

async function resolvePublicUrl(raw: string) {
  const url = new URL(raw)
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.port || !url.hostname || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    throw new Error("UNSAFE_REMOTE_URL")
  }
  const records = await lookup(url.hostname, { all: true, family: 4, verbatim: true })
  if (!records.length || records.some(record => !isPublicIpv4(record.address))) throw new Error("UNSAFE_REMOTE_URL")
  return { url, address: records[0].address }
}

function pinnedRequest(url: URL, address: string, signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const options: RequestOptions = {
      protocol: url.protocol, hostname: address, port: url.protocol === "https:" ? 443 : 80,
      path: url.pathname + url.search, method: "GET", signal, agent: false,
      ...(url.protocol === "https:" && !isIP(url.hostname) ? { servername: url.hostname } : {}),
      headers: { host: url.host, accept: "image/*,video/*", "user-agent": "MalikAI-MediaImport/1.0" },
    }
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(options, resolve)
    req.once("error", reject)
    req.end()
  })
}

async function fetchPublicMedia(raw: string) {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let next = raw
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const { url, address } = await resolvePublicUrl(next)
    signal.throwIfAborted()
    const response = await pinnedRequest(url, address, signal)
    try {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400) {
        if (!response.headers.location || redirects === MAX_REDIRECTS) throw new Error("REMOTE_REDIRECT_LIMIT")
        next = new URL(response.headers.location, url).toString()
        continue
      }
      if (status !== 200) throw new Error("REMOTE_MEDIA_FAILED")
      const mime = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase()
      if (!ALLOWED_TYPES.test(mime)) throw new Error("UNSUPPORTED_MEDIA")
      if (Number(response.headers["content-length"] || 0) > MAX_REMOTE_BYTES) throw new Error("REMOTE_MEDIA_TOO_LARGE")
      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of response) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += bytes.length
        if (total > MAX_REMOTE_BYTES) throw new Error("REMOTE_MEDIA_TOO_LARGE")
        chunks.push(bytes)
      }
      const buffer = Buffer.concat(chunks)
      const ext = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1] === "quicktime" ? "mov" : mime.split("/")[1]
      const rawName = decodeURIComponent(url.pathname.split("/").pop() || "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120)
      const name = rawName && /\.[a-z0-9]{2,6}$/i.test(rawName) ? rawName : "shared-media." + ext
      return { mime, size: buffer.length, base64: buffer.toString("base64"), name, sourceUrl: url.toString() }
    } finally {
      response.destroy()
    }
  }
  throw new Error("REMOTE_MEDIA_FAILED")
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  if (!await takeSharedRequestFrequency("media-import", entitlement.userId, 6)) {
    return Response.json({ ok: false, error: "RATE_LIMIT_REACHED" }, { status: 429 })
  }
  try {
    const body = await readJsonBodyLimited<{ url?: unknown }>(request, 16 * 1024)
    const raw = typeof body?.url === "string" ? body.url.trim() : ""
    if (!raw || raw.length > 4096) return Response.json({ ok: false, error: "INVALID_URL" }, { status: 400 })
    return Response.json({ ok: true, file: await fetchPublicMedia(raw) }, { headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof RequestSafetyError ? error.code : "REMOTE_MEDIA_IMPORT_FAILED" }, { status: error instanceof RequestSafetyError ? error.status : 400, headers: { "cache-control": "private, no-store" } })
  }
}
