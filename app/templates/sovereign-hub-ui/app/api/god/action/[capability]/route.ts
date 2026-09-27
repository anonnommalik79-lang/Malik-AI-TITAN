import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { godCapability, isGodCapability } from "@/lib/god-mode/capabilities"
import { publicFailure } from "@/lib/god-mode/security"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { renderBandwidthBlocked, renderResponseBudgetBytes } from "@/lib/server/render-bandwidth"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type Context = { params: Promise<{ capability: string }> }

async function cappedBody(response: Response, maxBytes: number) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel("Render response budget exceeded")
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return joined
}

export async function POST(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "god-action", budgetMs: 300_000 })
  }

  const { capability: raw } = await context.params
  if (!isGodCapability(raw)) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "UNKNOWN_CAPABILITY", error: "Неизвестная возможность Malik AI." }, { status: 404 }), trace, { operation: "god-action", budgetMs: 300_000 })
  }
  const capability = godCapability(raw)
  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 256 * 1024)
  const forwardedBody = raw === "chat" || raw === "analysis"
    ? { ...body, stream: false, ...(raw === "analysis" ? { task: body.task || "file_analysis" } : {}) }
    : body

  const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/plain;q=0.9" })
  const cookie = request.headers.get("cookie")
  const authorization = request.headers.get("authorization")
  const idempotency = request.headers.get("idempotency-key")
  if (cookie) headers.set("cookie", cookie)
  if (authorization) headers.set("authorization", authorization)
  if (idempotency) headers.set("idempotency-key", idempotency.slice(0, 180))
  headers.set("x-malik-trace-id", trace.traceId)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("Capability timed out", "TimeoutError")), capability.timeoutMs)
  const startedAt = Date.now()
  try {
    const target = new URL(capability.endpoint, request.url)
    // The registry contains relative paths only. This guard makes a future
    // accidental registry edit fail closed instead of becoming an SSRF proxy.
    if (target.origin !== new URL(request.url).origin || !capability.endpoint.startsWith("/api/")) {
      throw new Error("CAPABILITY_ORIGIN_REJECTED")
    }

    const upstream = await fetch(target, {
      method: capability.method,
      headers,
      body: JSON.stringify(forwardedBody),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })

    const maxBytes = renderResponseBudgetBytes()
    const declared = Number(upstream.headers.get("content-length") || 0)
    if (declared > maxBytes) return renderBandwidthBlocked(`god-action:${raw}`, declared)
    const bytes = await cappedBody(upstream, maxBytes)
    if (!bytes) return renderBandwidthBlocked(`god-action:${raw}`, maxBytes + 1)

    const resultHeaders = new Headers({
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-malik-capability": raw,
      "x-malik-capability-duration-ms": String(Date.now() - startedAt),
    })
    await appendGodAudit(entitlement.userId, {
      category: "generation",
      action: `capability.${raw}`,
      success: upstream.ok,
      traceId: trace.traceId,
      metadata: { status: upstream.status, durationMs: Date.now() - startedAt },
    }).catch(() => undefined)

    return withGodTraceHeaders(new Response(bytes, { status: upstream.status, headers: resultHeaders }), trace, { operation: "god-action", budgetMs: capability.timeoutMs })
  } catch (error) {
    const safe = publicFailure(error, trace.diagnosticId)
    await appendGodAudit(entitlement.userId, {
      category: "generation", action: `capability.${raw}`, success: false, traceId: trace.traceId,
      metadata: { durationMs: Date.now() - startedAt, code: safe.code },
    }).catch(() => undefined)
    return withGodTraceHeaders(Response.json({ ok: false, ...safe }, { status: safe.code === "TIMEOUT" ? 504 : 502 }), trace, { operation: "god-action", budgetMs: capability.timeoutMs })
  } finally {
    clearTimeout(timer)
  }
}
