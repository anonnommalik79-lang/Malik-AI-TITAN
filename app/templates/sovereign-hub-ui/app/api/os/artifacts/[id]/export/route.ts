import { z } from "zod"
import { osOwner } from "@/lib/os/http"
import { getArtifact } from "@/lib/os/store"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { ArtifactExportError, renderArtifactExport } from "@/lib/os/artifact-export"
import { DOCUMENT_FORMATS } from "@/lib/work/documents/formats"
import { documentResponse } from "@/lib/work/documents/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const querySchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/), format: z.enum(DOCUMENT_FORMATS) })
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" }
  try {
    const owner = await osOwner(request)
    const parsed = querySchema.safeParse({ ...(await context.params), format: new URL(request.url).searchParams.get("format") })
    if (!parsed.success) return Response.json({ error: "Неверный формат экспорта." }, { status: 400, headers })
    const artifact = owner.authenticated ? await getArtifact(owner.userId, parsed.data.id) : null
    if (!artifact) return Response.json({ error: "Результат не найден." }, { status: 404, headers })
    if (!takeRequestFrequency("artifact-export", owner.userId, 12)) return Response.json({ error: "Слишком много скачиваний. Попробуйте через минуту." }, { status: 429, headers: { ...headers, "retry-after": "60" } })
    const { format } = parsed.data
    if (artifact.kind === "code" && format === "zip" && artifact.sourceTool === "code.project") {
      const archiveId = /^\/api\/ai\/project\/artifacts\/([\da-f-]{36})\/download$/i.exec(String(artifact.metadata.downloadUrl || ""))?.[1]
      if (archiveId) {
        const [{ getProjectArtifact }, { projectArtifactDownload }] = await Promise.all([
          import("@/lib/server/project-artifact-store"), import("@/lib/server/project-artifact-download"),
        ])
        const full = await getProjectArtifact(archiveId, owner.userId)
        if (full) return projectArtifactDownload(full, request)
      }
    }
    return documentResponse(await renderArtifactExport(artifact, format))
  } catch (error) {
    if (error instanceof ArtifactExportError) return Response.json({ error: error.message }, { status: error.status, headers })
    return Response.json({ error: "Не удалось экспортировать результат. Проверьте содержимое и повторите." }, { status: 422, headers })
  }
}
