import { retryFlow } from "@/lib/os/executor"
import { OsToolError } from "@/lib/os/failures"
import { flowView, osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { serverToolDeps } from "@/lib/os/runtime"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** Runs a failed step again (or every failed step, or an interrupted flow). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024).catch(() => ({} as Record<string, unknown>))
    const taskId = typeof body.taskId === "string" && /^[\w.-]{3,120}$/.test(body.taskId) ? body.taskId : undefined
    const flow = await retryFlow(owner.userId, id, owner, serverToolDeps(), taskId)
    if (!flow) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    return osJson({ ok: true, flow: flowView(flow) })
  } catch (error) {
    return osError(error)
  }
}
