import { getVideoJob } from "@/lib/media/jobs"
import { refreshVideoJobStatus } from "@/lib/media/video-router"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { directMediaUrl } from "@/lib/os/media-reference"
import { getArtifact, getArtifacts, getProject, putArtifact, updateProject } from "@/lib/os/store"
import { summarizeArtifact } from "@/lib/os/types"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** Save only a completed, owner-verified provider job URL; never proxy MP4 bytes. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const { id } = await context.params
    const project = await getProject(owner.userId, id)
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024)
    const taskId = String(body.taskId || "").trim().slice(0, 200)
    const sourceImageId = String(body.sourceImageId || "").trim()
    if (!taskId) throw new OsToolError("INVALID_INPUT", "Не указан идентификатор видео.", { retryable: false })
    const job = await getVideoJob(taskId, owner.userId)
    if (!job) throw new OsToolError("NOT_FOUND", "Видео этого аккаунта не найдено.", { retryable: false })
    const source = sourceImageId ? await getArtifact(owner.userId, sourceImageId) : null
    if (sourceImageId && (!source || source.kind !== "image" || source.projectId !== id)) {
      throw new OsToolError("INVALID_INPUT", "Исходное изображение не относится к этому проекту.", { retryable: false })
    }
    const previous = await getArtifacts(owner.userId, project.artifactIds.slice(-100))
    const match = previous.find((artifact) => artifact.kind === "video" && artifact.metadata?.taskId === taskId)
    if (match) return osJson({ ok: true, created: false, artifact: summarizeArtifact(match) })
    const result = await refreshVideoJobStatus(taskId, job.provider, owner.userId)
    if (!result.ok || result.status === "failed") throw new OsToolError("VIDEO_FAILED", result.error || "Видеомодель не завершила задачу.", { retryable: false })
    if (result.status !== "completed") {
      return osJson({ ok: false, code: "VIDEO_NOT_READY", error: "Видео ещё создаётся. Сохраните его после завершения." }, 409)
    }
    const url = directMediaUrl(result.videoUrl || "", String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
    if (!url) throw new OsToolError("VIDEO_DIRECT_DELIVERY_REQUIRED", "Провайдер не вернул безопасную прямую ссылку на видео.", { retryable: false })
    const artifact = await putArtifact(owner.userId, {
      projectId: id,
      kind: "video",
      title: `Видео · ${project.title}`,
      sourceTool: "import",
      url,
      mime: "video/*",
      summary: job.prompt.slice(0, 240),
      links: source ? [{ relation: "derived-from", artifactId: source.id }] : [],
      metadata: { role: "video", taskId, provider: result.provider, model: result.model, delivery: "provider-direct", ephemeral: true, sourceImageId: source?.id },
    })
    await updateProject(owner.userId, id, (current) => { current.artifactIds.push(artifact.id) })
    return osJson({ ok: true, created: true, artifact: summarizeArtifact(artifact) }, 201)
  } catch (error) {
    return osError(error)
  }
}
