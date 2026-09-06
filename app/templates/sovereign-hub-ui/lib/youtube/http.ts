import "server-only"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { oauthConfig } from "./client"
import { publicError, YouTubeError } from "./errors"
export async function identity(request?: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) throw new YouTubeError("AUTH_REQUIRED", 401)
  if (request && !["GET", "HEAD"].includes(request.method)) {
    if (request.headers.get("origin") !== oauthConfig().origin) throw new YouTubeError("CSRF", 403)
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new YouTubeError("INVALID_INPUT", 415)
  }
  return user.id
}
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } })
export const failure = (error: unknown) => json(publicError(error), error instanceof YouTubeError ? error.status : 502)
export async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new YouTubeError("INVALID_INPUT", 400)
  const decoder = new TextDecoder(); let text = "", size = 0
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16000) { await reader.cancel(); throw new YouTubeError("INVALID_INPUT", 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try { const value = JSON.parse(text); if (value && typeof value === "object" && !Array.isArray(value)) return value } catch {}
  throw new YouTubeError("INVALID_INPUT", 400)
}
