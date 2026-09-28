import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { getProject, putArtifact, storeIsDurable, updateProject } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** The user explicitly saves a translated TXT/Markdown file as project text. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    if (!(await storeIsDurable())) return osJson({ ok: false, error: "Постоянное хранилище проектов недоступно. Скачайте перевод на устройство." }, 503)
    const { id } = await context.params
    const project = await getProject(owner.userId, id)
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 160 * 1024)
    const name = String(body.name || "").replace(/[\\/\x00-\x1f]/g, "").slice(0, 120)
    const content = typeof body.content === "string" ? body.content : ""
    const source = String(body.source || "").slice(0, 20)
    const target = String(body.target || "").slice(0, 20)
    const extension = /\.md$/i.test(name) ? "md" : /\.txt$/i.test(name) ? "txt" : null
    if (!extension || !content.trim() || content.length > 40_000 || !source || !target) {
      throw new OsToolError("INVALID_INPUT", "Нужен непустой перевод TXT/Markdown до 40 000 символов с языками перевода.", { retryable: false })
    }
    const artifact = await putArtifact(owner.userId, {
      projectId: id,
      kind: "document",
      title: name,
      content,
      mime: extension === "md" ? "text/markdown" : "text/plain",
      sourceTool: "user",
      summary: `Перевод документа: ${source} → ${target}`,
      metadata: { role: "translation", source, target, extension, userSaved: true },
    })
    await updateProject(owner.userId, id, (current) => { current.artifactIds.push(artifact.id) })
    return osJson({ ok: true, artifactId: artifact.id }, 201)
  } catch (error) {
    return osError(error)
  }
}
