import { getProjectArtifact } from "@/lib/server/project-artifact-store"
import { projectArtifactDownload } from "@/lib/server/project-artifact-download"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const entitlement = await resolveRequestEntitlement(request)
    const artifact = await getProjectArtifact(id, entitlement.userId)

    if (!artifact) {
      return Response.json(
        { ok: false, error: "PROJECT_ARTIFACT_NOT_FOUND", message: "Этот ZIP больше недоступен или принадлежит другому аккаунту. Соберите проект ещё раз." },
        { status: 404, headers: { "cache-control": "no-store" } },
      )
    }

    return projectArtifactDownload(artifact, request)
  } catch {
    return Response.json({ ok: false, error: "PROJECT_ARTIFACT_TEMPORARILY_UNAVAILABLE", message: "Не удалось получить ZIP. Повторите скачивание через несколько секунд." }, {
      status: 503, headers: { "cache-control": "private, no-store", "retry-after": "5" },
    })
  }
}

export async function HEAD(request: Request, context: RouteContext) {
  const response = await GET(request, context)
  return new Response(null, { status: response.status, headers: response.headers })
}
