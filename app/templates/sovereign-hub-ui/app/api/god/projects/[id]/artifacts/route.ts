import type { GodArtifactKind } from "@/lib/god-mode/contracts"
import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { addGodArtifact } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }
const KINDS = new Set<GodArtifactKind>(["text", "code", "image", "video", "audio", "website", "presentation", "document", "dataset", "analysis", "business-plan", "other"])

function safeArtifactUrl(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return undefined
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 4_000)
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:") return undefined
    if (url.username || url.password) return undefined
    return url.toString().slice(0, 4_000)
  } catch {
    return undefined
  }
}

export async function POST(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id } = await context.params
  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 128 * 1024)
  const kind = String(body.kind || "") as GodArtifactKind
  const title = String(body.title || "").trim()
  if (!KINDS.has(kind) || !title) return withGodTraceHeaders(Response.json({ ok: false, code: "INVALID_ARTIFACT", error: "Укажите корректные kind и title." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })

  const artifact = await addGodArtifact(id, entitlement.userId, {
    kind,
    title,
    sourceTaskId: String(body.sourceTaskId || "").trim() || undefined,
    sourceTool: String(body.sourceTool || "").trim() || undefined,
    parentArtifactId: String(body.parentArtifactId || "").trim() || undefined,
    derivedFrom: Array.isArray(body.derivedFrom) ? body.derivedFrom.map(String).slice(0, 32) : [],
    url: safeArtifactUrl(body.url),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {},
  })
  if (!artifact) return withGodTraceHeaders(Response.json({ ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })
  await appendGodAudit(entitlement.userId, {
    category: "project", action: "artifact.create", success: true, traceId: trace.traceId,
    resourceId: artifact.id, metadata: { projectId: id, kind: artifact.kind, version: artifact.version },
  }).catch(() => undefined)
  return withGodTraceHeaders(Response.json({ ok: true, artifact }, { status: 201 }), trace, { operation: "project-state", budgetMs: 1500 })
}
