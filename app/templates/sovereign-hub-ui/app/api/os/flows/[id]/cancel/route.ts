import { cancelFlow } from "@/lib/os/executor"
import { OsToolError } from "@/lib/os/failures"
import { flowView, osError, osJson, osOwner } from "@/lib/os/http"
import { getFlow } from "@/lib/os/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    if (!(await cancelFlow(owner.userId, id))) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    const flow = await getFlow(owner.userId, id)
    return osJson({ ok: true, flow: flow ? flowView(flow) : null })
  } catch (error) {
    return osError(error)
  }
}
