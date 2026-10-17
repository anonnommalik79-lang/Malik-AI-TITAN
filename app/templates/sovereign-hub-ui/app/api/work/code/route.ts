import { randomUUID } from "node:crypto"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { normalizeProjectFiles, PROJECT_LIMITS, type ProjectFile } from "@/lib/work/code/files"
import { analyzeProject } from "@/lib/work/code/diagnostics"
import { buildProjectPreview } from "@/lib/work/code/preview"
import { readProjectZip, ZipReadError } from "@/lib/work/code/zip-read"
import { projectStatus } from "@/lib/work/code/status"
import { guestRedirectOrigin } from "@/lib/auth/guest-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Malik Work code projects: analyze, preview, unpack a ZIP and save.
 *
 * The owner always comes from the session, never from the body. Guests can
 * analyze and preview (nothing is stored); saving needs an account and goes
 * to that account's private project store. Bodies are bounded before they
 * are parsed; every file passes the same path, secret and size rules.
 */

const MAX_BODY = 14 * 1024 * 1024
const headers = { "cache-control": "private, no-store" }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers })

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > MAX_BODY) return null
  if (!/application\/json/i.test(request.headers.get("content-type") || "")) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel().catch(() => undefined); return null }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { return null }
}

function filesFrom(body: Record<string, unknown>) {
  const raw = Array.isArray(body.files) ? body.files.slice(0, PROJECT_LIMITS.files * 2) : []
  return normalizeProjectFiles(raw.map((item) => ({ path: String((item as { path?: unknown })?.path || ""), content: typeof (item as { content?: unknown })?.content === "string" ? (item as { content: string }).content : "" })))
}

/** The largest source-first subset that fits one stored project artifact. */
function fitForStorage(files: ProjectFile[], limit = 390_000) {
  const weight = (path: string) => /\.(?:tsx?|jsx?|css|html?|json)$/i.test(path) ? 0 : /\.md$/i.test(path) ? 1 : 2
  const ordered = [...files].sort((a, b) => weight(a.path) - weight(b.path) || a.content.length - b.content.length)
  const kept: ProjectFile[] = []
  let size = 20
  for (const file of ordered) {
    const cost = JSON.stringify(file).length + 1
    if (size + cost > limit) continue
    kept.push(file); size += cost
  }
  return kept.sort((a, b) => a.path.localeCompare(b.path))
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!takeRequestFrequency("work-code", entitlement.userId, 40)) return json({ ok: false, code: "RATE_LIMITED", error: "Слишком много запросов. Подождите минуту." }, 429)
  const body = await readBody(request)
  if (!body) return json({ ok: false, code: "INVALID_BODY", error: "Нужен JSON до 14 МБ." }, 400)
  const action = String(body.action || "")

  if (action === "unzip") {
    const base64 = typeof body.zipBase64 === "string" ? body.zipBase64 : ""
    if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return json({ ok: false, code: "INVALID_ZIP", error: "Архив не передан." }, 400)
    try {
      const unpacked = readProjectZip(Buffer.from(base64, "base64"))
      const normalized = normalizeProjectFiles(unpacked.files)
      const analysis = analyzeProject(normalized.files)
      return json({ ok: true, files: normalized.files, skipped: [...unpacked.skipped, ...normalized.rejected].slice(0, 300), analysis, status: projectStatus({ analysis }) })
    } catch (error) {
      const code = error instanceof ZipReadError ? error.code : "ZIP_FAILED"
      return json({ ok: false, code, error: `Архив не прочитан (${code}).` }, 400)
    }
  }

  const { files, rejected } = filesFrom(body)
  if (!files.length) return json({ ok: false, code: "NO_FILES", error: "Нет поддерживаемых текстовых файлов проекта.", skipped: rejected.slice(0, 300) }, 400)

  if (action === "analyze") {
    const analysis = analyzeProject(files)
    return json({ ok: true, analysis, skipped: rejected.slice(0, 300), status: projectStatus({ analysis }) })
  }

  if (action === "preview") {
    const analysis = analyzeProject(files)
    const token = randomUUID()
    const origin = process.env.NODE_ENV === "production" || process.env.RENDER === "true" ? guestRedirectOrigin(request) : new URL(request.url).origin
    const preview = buildProjectPreview(files, { runtimeBase: origin, token, route: typeof body.route === "string" ? body.route.slice(0, 200) : "/" })
    return json({ ok: true, preview: { ...preview, token }, analysis, status: projectStatus({ analysis, preview }) })
  }

  if (action === "save") {
    if (!entitlement.authenticated) return json({ ok: false, code: "SIGN_IN_REQUIRED", error: "Войдите в аккаунт, чтобы сохранить проект." }, 401)
    const { createProject, putArtifact, getArtifact, isOsId, updateProject } = await import("@/lib/os/store")
    const title = String(body.title || "Проект").replace(/\s+/g, " ").trim().slice(0, 120) || "Проект"
    const kept = fitForStorage(files)
    const analysis = analyzeProject(files)
    const previous = isOsId(body.revisionOf) ? await getArtifact(entitlement.userId, body.revisionOf as string) : null
    const projectId = previous?.projectId || (await createProject(entitlement.userId, { title, goal: `Проект ${title}: загрузка и проверка в Malik Work` })).id
    const artifact = await putArtifact(entitlement.userId, {
      projectId,
      kind: "code",
      title,
      sourceTool: "import",
      content: JSON.stringify({ files: kept, truncated: kept.length < files.length }),
      mime: "application/vnd.malik.files+json",
      summary: `${files.length} файлов · ${analysis.stack}`,
      links: previous ? [{ relation: "revision-of", artifactId: previous.id }] : [],
      metadata: { role: "code", fileCount: files.length, savedFiles: kept.length, stack: analysis.stack, errors: analysis.counts.errors, warnings: analysis.counts.warnings, source: "work-code-studio" },
      version: previous ? (previous.version || 1) + 1 : 1,
    })
    await updateProject(entitlement.userId, projectId, (project) => { if (!project.artifactIds.includes(artifact.id)) project.artifactIds.unshift(artifact.id) }).catch(() => undefined)
    return json({ ok: true, artifactId: artifact.id, projectId, savedFiles: kept.length, totalFiles: files.length })
  }

  return json({ ok: false, code: "UNKNOWN_ACTION", error: "Неизвестное действие." }, 400)
}
