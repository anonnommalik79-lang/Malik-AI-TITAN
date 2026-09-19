import { buildProjectZip } from "@/lib/business/project-zip"
import { getProjectArtifact } from "@/lib/server/project-artifact-store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params
  const entitlement = await resolveRequestEntitlement(request)
  const artifact = await getProjectArtifact(id, entitlement.userId)

  if (!artifact) {
    return Response.json(
      { ok: false, error: "PROJECT_ARTIFACT_NOT_FOUND", message: "Этот ZIP больше недоступен или принадлежит другому аккаунту. Соберите проект ещё раз." },
      { status: 404, headers: { "cache-control": "no-store" } },
    )
  }

  const zip = buildProjectZip(artifact.project.files.map((file) => ({
    name: file.path,
    content: file.content,
  })))

  return new Response(zip, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${artifact.filename}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-malik-artifact": "project-zip",
    },
  })
}
