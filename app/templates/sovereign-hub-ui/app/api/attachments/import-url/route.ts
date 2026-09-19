import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_REMOTE_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 3
const ALLOWED_TYPES = ["image/", "video/"]

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase()
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")
}

function isPrivateAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return true
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Разрешены только http/https ссылки")
  if (url.username || url.password) throw new Error("Ссылки с логином/паролем не поддерживаются")
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Локальные адреса запрещены")

  const records = await lookup(url.hostname, { all: true, verbatim: true })
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("Этот адрес нельзя импортировать")
  }
  return url
}

function fileNameFrom(url: URL, contentType: string) {
  const raw = decodeURIComponent(url.pathname.split("/").pop() || "").replace(/[^p{L}p{N}._-]+/gu, "-").slice(0, 120)
  if (raw && /.[a-z0-9]{2,6}$/i.test(raw)) return raw
  const ext = contentType.includes("png") ? "png"
    : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
        : contentType.includes("mp4") ? "mp4"
          : contentType.includes("webm") ? "webm"
            : "jpg"
  return `shared-media.${ext}`
}

async function fetchPublicMedia(initial: URL) {
  let current = initial
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error("REMOTE_MEDIA_TIMEOUT")), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "image/*,video/*;q=0.9,*/*;q=0.1",
          "user-agent": "MalikAI-MediaImport/1.0",
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location || redirects === MAX_REDIRECTS) throw new Error("Слишком много перенаправлений")
        current = await assertPublicUrl(new URL(location, current).toString())
        continue
      }

      if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`)
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
      if (!ALLOWED_TYPES.some((prefix) => contentType.startsWith(prefix))) {
        throw new Error("По ссылке нет поддерживаемого фото или видео")
      }

      const contentLength = Number(response.headers.get("content-length") || 0)
      if (contentLength > MAX_REMOTE_BYTES) throw new Error("Файл больше 10 MB")

      const reader = response.body?.getReader()
      if (!reader) throw new Error("Источник не вернул файл")
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > MAX_REMOTE_BYTES) {
          try { await reader.cancel() } catch {}
          throw new Error("Файл больше 10 MB")
        }
        chunks.push(value)
      }

      const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
      return {
        mime: contentType,
        size: buffer.byteLength,
        base64: buffer.toString("base64"),
        name: fileNameFrom(current, contentType),
        sourceUrl: current.toString(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error("Не удалось импортировать медиа")
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") {
    return Response.json({ ok: false, error: "Войдите в Malik AI, чтобы импортировать медиа." }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawUrl = String(body?.url || "").trim()
  if (!rawUrl || rawUrl.length > 4096) {
    return Response.json({ ok: false, error: "Некорректная ссылка" }, { status: 400 })
  }

  try {
    const safeUrl = await assertPublicUrl(rawUrl)
    const file = await fetchPublicMedia(safeUrl)
    return Response.json({ ok: true, file }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось импортировать медиа",
    }, { status: 400, headers: { "cache-control": "no-store" } })
  }
}
