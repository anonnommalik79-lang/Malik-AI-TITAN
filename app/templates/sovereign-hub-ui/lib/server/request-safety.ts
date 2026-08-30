const DEFAULT_MAX_JSON_BYTES = 16 * 1024 * 1024
const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
]

export class RequestSafetyError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message)
    this.name = "RequestSafetyError"
    this.status = status
    this.code = code
  }
}

export function disabledFeatures(): Set<string> {
  const raw = process.env.MALIK_DISABLED_FEATURES || ""
  return new Set(raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))
}

export function isFeatureDisabled(feature: string): boolean {
  const key = feature.trim().toLowerCase()
  if (!key) return false
  if (disabledFeatures().has(key)) return true
  const envKey = `MALIK_DISABLE_${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
  return /^(1|true|yes|on)$/i.test(process.env[envKey] || "")
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), Math.max(1000, timeoutMs))
  const externalSignal = init.signal

  const abortFromExternal = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
  }
  if (externalSignal?.aborted) abortFromExternal()
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true })

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", abortFromExternal)
  }
}

async function readBodyTextLimited(request: Request, maxBytes: number) {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let raw = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > maxBytes) {
        try { await reader.cancel("body-too-large") } catch {}
        throw new RequestSafetyError("Request body is too large.", 413, "BODY_TOO_LARGE")
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    return raw
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

export async function readJsonBodyLimited<T = Record<string, unknown>>(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestSafetyError("Request body is too large.", 413, "BODY_TOO_LARGE")
  }

  const raw = await readBodyTextLimited(request, maxBytes)
  if (!raw.trim()) return {} as T

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new RequestSafetyError("Invalid JSON body.", 400, "INVALID_JSON")
  }
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true
  const ipv6 = host.includes(":")
  if (ipv6 && (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))) return true
  if (PRIVATE_IPV4.some((pattern) => pattern.test(host))) return true
  return host === "metadata.google.internal" || host === "metadata" || host.endsWith(".internal")
}

export function assertPublicHttpUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RequestSafetyError("Invalid URL.", 400, "INVALID_URL")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RequestSafetyError("Only public HTTP(S) URLs are allowed.", 400, "UNSAFE_URL")
  }
  if (url.username || url.password || isPrivateHostname(url.hostname)) {
    throw new RequestSafetyError("Private or credential-bearing URLs are not allowed.", 400, "UNSAFE_URL")
  }
  return url
}

export function safeErrorMessage(error: unknown, fallback = "Request failed") {
  if (error instanceof RequestSafetyError) return error.message
  if (error instanceof Error && error.name === "AbortError") return "Request timed out. Please try again."
  return fallback
}

export function requestSafetySnapshot() {
  return {
    maxJsonMb: DEFAULT_MAX_JSON_BYTES / (1024 * 1024),
    disabledFeatures: [...disabledFeatures()].sort(),
    urlGuard: true,
    requestTimeouts: true,
    streamingBodyLimit: true,
  }
}
