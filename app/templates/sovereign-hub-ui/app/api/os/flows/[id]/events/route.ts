import { subscribe } from "@/lib/os/events"
import { isFlowRunning, recoverInterrupted } from "@/lib/os/executor"
import { flowView, osError, osOwner } from "@/lib/os/http"
import { getArtifacts, getFlow, toSummary } from "@/lib/os/store"
import { OsToolError } from "@/lib/os/failures"
import type { OsEvent } from "@/lib/os/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 800

type RouteContext = { params: Promise<{ id: string }> }

const MAX_STREAM_MS = 12 * 60 * 1000

/**
 * Live timeline of a flow as Server-Sent Events: a snapshot first, then
 * every task change and finished artifact, then "done". Small JSON only —
 * artifact content is fetched separately, on demand.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    const found = await getFlow(owner.userId, id)
    if (!found) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    const flow = await recoverInterrupted(owner.userId, found)
    const artifacts = await getArtifacts(owner.userId, flow.tasks.flatMap((task) => task.artifactIds))
    const encoder = new TextEncoder()
    let close = () => {}

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        const send = (event: string, data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            close()
          }
        }
        send("snapshot", { flow: flowView(flow), artifacts: artifacts.map(toSummary) })
        if (!isFlowRunning(flow.id)) {
          send("done", { flowId: flow.id, status: flow.status })
          closed = true
          controller.close()
          return
        }
        const unsubscribe = subscribe(flow.id, (event: OsEvent) => {
          if (event.type === "task") send("task", { flowId: event.flowId, task: flowView({ ...flow, tasks: [event.task] }).tasks[0], status: flow.status })
          else if (event.type === "artifact") send("artifact", event)
          else if (event.type === "flow") send("snapshot", { flow: flowView(event.flow) })
          else if (event.type === "done") {
            send("done", event)
            close()
          }
        })
        const heartbeat = setInterval(() => send("ping", { at: Date.now() }), 15_000)
        const limit = setTimeout(() => close(), MAX_STREAM_MS)
        close = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          clearTimeout(limit)
          unsubscribe()
          try {
            controller.close()
          } catch {
            /* already closed by the client */
          }
        }
        request.signal.addEventListener("abort", () => close(), { once: true })
      },
      cancel() {
        close()
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "private, no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    })
  } catch (error) {
    return osError(error)
  }
}
