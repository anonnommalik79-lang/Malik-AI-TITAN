import { recoverInterrupted } from "@/lib/os/executor"
import { OsToolError } from "@/lib/os/failures"
import { flowView, osError, osJson, osOwner } from "@/lib/os/http"
import { getArtifacts, getFlow, toSummary } from "@/lib/os/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** One flow with the summaries of its artifacts (no content). */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    const found = await getFlow(owner.userId, id)
    if (!found) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    const flow = await recoverInterrupted(owner.userId, found)
    const artifacts = await getArtifacts(owner.userId, flow.tasks.flatMap((task) => task.artifactIds))
    return osJson({ ok: true, flow: flowView(flow), artifacts: artifacts.map(toSummary) })
  } catch (error) {
    return osError(error)
  }
}
