import "server-only"

import { resolveMediaUser } from "@/lib/media/request"
import { refreshVideoJobStatus } from "@/lib/media/video-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAllowedMagicHourUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === "https:" && (host === "magichour.ai" || host.endsWith(".magichour.ai"))
  } catch {
    return false
  }
}

async function proxyMagicHourVideo(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы открыть видео." }, { status: 401 })
  }

  const current = new URL(request.url)
  const taskId = current.searchParams.get("taskId")?.trim() || ""
  if (!taskId) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 })
  }

  const result = await refreshVideoJobStatus(taskId, "magichour", user.userId)
  if (!result.ok || result.status !== "completed" || !result.videoUrl) {
    return Response.json(
      {
        ok: false,
        error: result.error || "Видео ещё не готово.",
        status: result.status,
      },
      { status: result.status === "failed" ? 502 : 409 },
    )
  }

  if (!isAllowedMagicHourUrl(result.videoUrl)) {
    return Response.json(
      { ok: false, error: "Magic Hour вернул неподдерживаемый адрес видео." },
      { status: 502 },
    )
  }

  const headers = new Headers({
    accept: "video/mp4,video/*,*/*",
  })
  const range = request.headers.get("range")
  if (range) headers.set("range", range)

  const upstream = await fetch(result.videoUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "follow",
    cache: "no-store",
  })

  if (!upstream.ok || (request.method !== "HEAD" && !upstream.body)) {
    const detail = request.method === "HEAD" ? "" : await upstream.text().catch(() => "")
    return Response.json(
      {
        ok: false,
        error: detail.slice(0, 500) || `Не удалось получить готовое видео (HTTP ${upstream.status}).`,
      },
      { status: upstream.status || 502 },
    )
  }

  const out = new Headers()
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }

  const contentType = String(out.get("content-type") || "").toLowerCase()
  if (!contentType || contentType === "application/octet-stream") {
    out.set("content-type", "video/mp4")
  } else if (contentType.includes("text/html")) {
    return Response.json(
      { ok: false, error: "Magic Hour вернул страницу вместо видеофайла. Повторно получите результат." },
      { status: 502 },
    )
  }

  out.set("content-disposition", 'inline; filename="malik-video.mp4"')
  out.set("cache-control", "private, no-store")
  out.set("x-malik-video-proxy", "magic-hour")

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  })
}

export async function GET(request: Request) {
  return proxyMagicHourVideo(request)
}

export async function HEAD(request: Request) {
  return proxyMagicHourVideo(request)
}
