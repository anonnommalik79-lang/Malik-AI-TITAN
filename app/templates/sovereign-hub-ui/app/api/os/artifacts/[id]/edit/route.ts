import { editArtifact } from "@/lib/os/actions"
import { OsToolError } from "@/lib/os/failures"
import { cleanRequestId, flowView, osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { serverToolDeps } from "@/lib/os/runtime"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * A new version from an instruction, or "Fix with AI" from the errors the
 * preview caught. The old version stays; the new one links to it.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 32 * 1024)
    const clientRequestId = cleanRequestId(body.clientRequestId)
    if (!clientRequestId) throw new OsToolError("INVALID_REQUEST", "Нет идентификатора запроса.", { retryable: false })
    const errors = Array.isArray(body.errors) ? body.errors.map((item) => String(item || "").slice(0, 400)).filter(Boolean).slice(0, 8) : []
    const result = await editArtifact({ owner, artifactId: id, instruction: String(body.instruction || ""), errors, clientRequestId, deps: serverToolDeps() })
    return osJson({ ok: true, created: result.created, flow: flowView(result.flow) }, result.created ? 201 : 200)
  } catch (error) {
    return osError(error)
  }
}
