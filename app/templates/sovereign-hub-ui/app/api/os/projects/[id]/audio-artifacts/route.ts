import { getDeapiMusicJob, musicModel, musicProviderName } from "@/lib/server/deapi-music"
import { musicJobBelongsTo } from "@/lib/server/music-job-ownership"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { directMediaUrl } from "@/lib/os/media-reference"
import { getArtifacts, getProject, putArtifact, storeIsDurable, updateProject } from "@/lib/os/store"
import { summarizeArtifact } from "@/lib/os/types"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** Save an owner-verified audio reference; MP3 bytes remain at the provider. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    if (!(await storeIsDurable())) return osJson({ ok: false, error: "Хранилище проектов недоступно. Скачайте трек на устройство." }, 503)
    const { id } = await context.params
    const project = await getProject(owner.userId, id)
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024)
    const requestId = String(body.requestId || "").trim().slice(0, 500)
    const title = String(body.title || "Музыка Malik AI").replace(/[\x00-\x1f]/g, " ").trim().slice(0, 120) || "Музыка Malik AI"
    if (!requestId || !(await musicJobBelongsTo(requestId, owner.userId))) {
      throw new OsToolError("NOT_FOUND", "Трек этого аккаунта не найден.", { retryable: false })
    }
    const previous = await getArtifacts(owner.userId, project.artifactIds.slice(-100))
    const match = previous.find((artifact) => artifact.kind === "audio" && artifact.metadata?.requestId === requestId)
    if (match) return osJson({ ok: true, created: false, artifact: summarizeArtifact(match) })
    const result = await getDeapiMusicJob(requestId)
    if (!result.ok || result.status !== "done" || !result.resultUrl) {
      return osJson({ ok: false, code: "MUSIC_NOT_READY", error: "Трек ещё не готов для сохранения." }, 409)
    }
    const url = directMediaUrl(result.resultUrl, String(process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || ""))
    if (!url) throw new OsToolError("INVALID_INPUT", "Провайдер не вернул безопасную прямую ссылку на трек.", { retryable: false })
    const artifact = await putArtifact(owner.userId, {
      projectId: id,
      kind: "audio",
      title,
      url,
      mime: "audio/*",
      sourceTool: "import",
      summary: "Трек Malik AI · ссылка провайдера может истечь",
      metadata: { role: "project-music", requestId, provider: musicProviderName(requestId), model: musicModel(requestId), delivery: "provider-direct", ephemeral: true },
    })
    await updateProject(owner.userId, id, (current) => { current.artifactIds.push(artifact.id) })
    return osJson({ ok: true, created: true, artifact: summarizeArtifact(artifact) }, 201)
  } catch (error) {
    return osError(error)
  }
}
