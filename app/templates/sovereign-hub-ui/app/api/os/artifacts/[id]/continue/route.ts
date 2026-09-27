import { CONTINUE_TARGETS, continueFromArtifact } from "@/lib/os/actions"
import { OsToolError } from "@/lib/os/failures"
import { cleanRequestId, flowView, osError, osJson, osOwner, requireSignedIn, returnDailyFlow, takeDailyFlow } from "@/lib/os/http"
import { serverToolDeps } from "@/lib/os/runtime"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** "Make a deck from this plan": the artifact becomes the next tool's input. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 16 * 1024)
    const target = String(body.target || "")
    const clientRequestId = cleanRequestId(body.clientRequestId)
    if (!CONTINUE_TARGETS[target]) throw new OsToolError("INVALID_REQUEST", "Неизвестный тип продолжения.", { retryable: false })
    if (!clientRequestId) throw new OsToolError("INVALID_REQUEST", "Нет идентификатора запроса.", { retryable: false })
    await takeDailyFlow(owner)
    const result = await continueFromArtifact({ owner, artifactId: id, target, instruction: String(body.instruction || ""), clientRequestId, deps: serverToolDeps() })
      .catch(async (error) => {
        await returnDailyFlow(owner).catch(() => undefined)
        throw error
      })
    if (!result.created) await returnDailyFlow(owner).catch(() => undefined)
    return osJson({ ok: true, created: result.created, flow: flowView(result.flow) }, result.created ? 201 : 200)
  } catch (error) {
    return osError(error)
  }
}
