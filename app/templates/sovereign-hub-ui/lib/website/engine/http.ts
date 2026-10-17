import "server-only"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { isFeatureDisabled, readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { websiteStore } from "./store"
import { stepProject } from "./runner"
import { ownerKey, projectFiles, sourceHash, validProjectId } from "./workspace"
import { buildProjectPreview } from "@/lib/work/code/preview"
import { buildZip } from "@/lib/work/documents/zip"
import type { WebsiteJob } from "./types"
import { getPublicOrigin } from "@/lib/public-origin"
import { getRenderAccessOrigin, guestRedirectOrigin } from "@/lib/auth/guest-origin"

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
export function publicJob(job: WebsiteJob, files = false) {
  return {
    id: job.id, version: job.version, title: job.title, state: job.state, checkpoint: job.checkpoint, workspaceRoot: job.workspaceRoot,
    cursor: job.cursor, totalFiles: job.design?.files.length || 0, revision: job.revision,
    events: job.events, checks: job.checks, error: job.error, retryAt: Math.max(job.retryAt || 0, job.lease?.until || 0) || undefined,
    design: job.design, creative: job.creative, assets: job.assets, revisions: job.revisions,
    fileList: job.files.map(file => ({ path: file.path, chars: file.content.length })),
    ...(files ? { files: job.files } : {}),
    execution: job.execution, createdAt: job.createdAt, updatedAt: job.updatedAt,
    // Explicit deployment truth: the queue is durable; worker liveness is not
    // inferred from an environment variable or a running browser tab.
    continuation: "Browser advances saved checkpoints. Unattended continuation requires the separately deployed worker.",
  }
}
export async function websiteProjectsRequest(request: Request, id?: string) {
  try {
    if (isFeatureDisabled("website_engine")) return json({ ok: false, code: "WEBSITE_ENGINE_DISABLED" }, 503)
    const submittedOrigin = request.headers.get("origin")
    // Render can expose an internal HTTP Request.url after terminating TLS.
    // Use fixed, configured production origins, never an arbitrary forwarded
    // host. Development still requires the exact local request origin.
    const allowedOrigins = process.env.NODE_ENV === "production" || process.env.RENDER === "true"
      ? [getPublicOrigin(), getRenderAccessOrigin()].filter(Boolean) : [new URL(request.url).origin]
    if (request.method === "POST" && submittedOrigin && !allowedOrigins.includes(submittedOrigin)) return json({ ok: false, code: "CROSS_ORIGIN_WRITE_DENIED" }, 403)
    const identity = await resolveRequestEntitlement(request)
    if (!identity.authenticated) return json({ ok: false, error: "Войдите, чтобы сохранять проекты и возобновлять работу.", code: "SIGN_IN_REQUIRED" }, 401)
    if (!websiteStore.storage.configured()) return json({ ok: false, error: "Постоянное хранилище проектов не настроено.", code: "WEBSITE_STORAGE_NOT_CONFIGURED" }, 503)
    if (id && !validProjectId(id)) return json({ ok: false, code: "PROJECT_NOT_FOUND" }, 404)
    const url = new URL(request.url)
    const owner = ownerKey(identity.userId)
    if (request.method === "GET" && !id) return json({ ok: true, ids: await websiteStore.list(identity.userId) })
    let job = id ? await websiteStore.read(identity.userId, id) : null
    if (id && !job) return json({ ok: false, code: "PROJECT_NOT_FOUND" }, 404)
    if (request.method === "GET" && job) {
      if (url.searchParams.get("export") === "zip") {
        const files = projectFiles(job.files)
        if (!files.length) return json({ ok: false, code: "NO_FILES_YET" }, 409)
        const readme = ["# Malik AI project", `Workspace: ${job.workspaceRoot}`, `Source SHA-256: ${sourceHash(files)}`, `State: ${job.state}`,
          "", "## Actual verification", ...Object.entries(job.checks).map(([name, check]) => `${name}: ${check.status}\n${check.details.join("\n")}`),
          "", "No installation or generated code runs on the Malik web server. A browser preview is not a production build. Publishing requires a separate explicit action.",
          "", "Windows: for supported Next.js versions prefer npm run dev using next dev --webpack. If SWC native bindings fail, reinstall dependencies for the current OS/architecture/Node version with optional dependencies enabled inside your own environment or sandbox. Do not copy node_modules across operating systems.",
        ].join("\n")
        const credits = job.assets.map(a => `${a.slot}: ${a.credit}\n${a.sourcePage}\nLicense/guidelines: ${a.license}\nVerified: ${a.verifiedAt}\nRemote asset (not bundled): ${a.url}`).join("\n\n")
        // One and only one top-level directory; never sibling app/page.tsx.
        const projectId = job.id
        const zip = buildZip([...files.map(f => ({ name: `${projectId}/${f.path}`, data: f.content })), { name: `${projectId}/MALIK-VERIFICATION.md`, data: readme }, { name: `${projectId}/MALIK-ASSETS.md`, data: credits || "No verified third-party media selected." }], new Date(job.createdAt))
        return new Response(Buffer.from(zip), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="malik-project-${job.id}.zip"` } })
      }
      if (url.searchParams.has("preview")) {
        const runtimeBase = process.env.NODE_ENV === "production" || process.env.RENDER === "true" ? guestRedirectOrigin(request) : url.origin
        const preview = buildProjectPreview(projectFiles(job.files), { runtimeBase, token: job.id, route: url.searchParams.get("route") || "/" })
        if (!preview.ok) return json({ ok: false, code: preview.reason, limitations: preview.limitations }, 409)
        return json({ ok: true, preview: { ...preview, token: job.id } })
      }
      if (url.searchParams.has("events")) {
        const after = Number(request.headers.get("last-event-id") || 0)
        const events = job.events.filter(e => e.seq > after)
        const stream = new ReadableStream({ start(controller) {
          const encode = new TextEncoder()
          for (const event of events) controller.enqueue(encode.encode(`id: ${event.seq}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`))
          controller.enqueue(encode.encode(`event: checkpoint\ndata: ${JSON.stringify({ state: job!.state, revision: job!.revision })}\n\n`)); controller.close()
        } })
        return new Response(stream, { headers: { ...headers, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" } })
      }
      return json({ ok: true, job: publicJob(job, url.searchParams.has("files")) })
    }
    if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405)
    if (!takeRequestFrequency("website-engine", identity.userId, 60)) return json({ ok: false, code: "RATE_LIMITED" }, 429)
    const body = await readJsonBodyLimited<{ action?: string; prompt?: string; requestId?: string; revisionId?: string }>(request, 64_000)
    if (!id) {
      job = await websiteStore.create({ actor: identity.userId, plan: identity.plan, modelId: "auto", prompt: String(body.prompt || ""), requestId: body.requestId })
      return json({ ok: true, job: publicJob(job) }, 202)
    }
    const action = body.action || "step"
    if (action === "step") {
      // Refresh the current entitlement before every browser-driven stage.
      // Submitted plan/userId/model privileges are never trusted.
      await websiteStore.update(owner, id, current => { current.plan = identity.plan; current.authorizationExpiresAt = Date.now() + 15 * 60_000 })
      job = await stepProject(owner, id, { signal: request.signal })
    } else if (["cancel", "pause", "resume", "edit", "restore"].includes(action)) {
      job = await websiteStore.control(identity.userId, id, action as "cancel" | "pause" | "resume" | "edit" | "restore", String(body.prompt || ""), String(body.revisionId || ""))
    } else return json({ ok: false, code: "INVALID_PROJECT_ACTION" }, 400)
    return json({ ok: true, job: publicJob(job!) })
  } catch (error) {
    if (error instanceof RequestSafetyError) return json({ ok: false, code: error.code }, error.status)
    const message = error instanceof Error ? error.message : "WEBSITE_ENGINE_UNAVAILABLE"
    const code = /^[A-Z_]{3,70}$/.test(message) ? message : "WEBSITE_ENGINE_UNAVAILABLE"
    const busy = /BUSY|CHANGED|STALE|NOT_PAUSED|LIMIT|CONFLICT/.test(code)
    return json({ ok: false, code, error: code === "PROJECT_NOT_FOUND" ? "Проект не найден." : "Операция не подтверждена. Сохранённые файлы не удалены." }, code === "PROJECT_NOT_FOUND" ? 404 : busy ? 409 : /^(?:INVALID|UNSAFE)_/.test(code) ? 400 : 503)
  }
}
