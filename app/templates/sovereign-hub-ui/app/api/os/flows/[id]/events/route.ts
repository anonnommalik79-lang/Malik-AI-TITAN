import { subscribe } from "@/lib/os/events"
import { z } from "zod"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { recoverInterrupted } from "@/lib/os/executor"
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
    const parsed = z.object({ id: z.string().regex(/^[\w-]{3,100}$/) }).safeParse(await context.params)
    if (!parsed.success) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    const { id } = parsed.data
    const owner = await osOwner(request)
    if (!owner.authenticated) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    if (!takeRequestFrequency("work-events", owner.userId, 60)) return Response.json({ error: "Слишком много подключений. Попробуйте через минуту." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": "60" } })
    const found = await getFlow(owner.userId, id)
    if (!found) throw new OsToolError("NOT_FOUND", "Задача не найдена.", { retryable: false })
    const flow = await recoverInterrupted(owner.userId, found)
    const encoder = new TextEncoder()
    let close = () => {}

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        let snapshotSent = false
        const buffered: OsEvent[] = []
        const send = (event: string, data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            close()
          }
        }
        const dispatch = (event: OsEvent) => {
          if (event.type === "task") send("task", { flowId: event.flowId, task: flowView({ ...flow, tasks: [event.task] }).tasks[0], status: flow.status })
          else if (event.type === "artifact") send("artifact", event)
          else if (event.type === "work") send("work", event.event)
          else if (event.type === "flow") send("snapshot", { flow: flowView(event.flow) })
          else if (event.type === "done") {
            send("done", event)
            close()
          }
        }
        const unsubscribe = subscribe(flow.id, event => {
          if (snapshotSent) dispatch(event)
          else buffered.push(event)
        })
        const heartbeat = setInterval(() => send("ping", { at: Date.now() }), 15_000)
        const limit = setTimeout(() => close(), MAX_STREAM_MS)
        const onAbort = () => close()
        close = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          clearTimeout(limit)
          unsubscribe()
          request.signal.removeEventListener("abort", onAbort)
          try {
            controller.close()
          } catch {
            /* already closed by the client */
          }
        }
        request.signal.addEventListener("abort", onAbort, { once: true })
        if (request.signal.aborted) return close()
        // Subscribe before loading summaries. The operation may finish while
        // storage is responding; replay those events after the initial snapshot.
        void (async () => {
          const current = await getFlow(owner.userId, flow.id) || flow
          const snapshot = flowView(current)
          const artifacts = await getArtifacts(owner.userId, snapshot.tasks.flatMap(task => task.artifactIds))
          if (closed) return
          send("snapshot", { flow: snapshot, artifacts: artifacts.map(toSummary) })
          snapshotSent = true
          for (const event of buffered) dispatch(event)
          buffered.length = 0
          if (!closed && snapshot.finishedAt && current.finishedAt) {
            send("done", { flowId: flow.id, status: current.status })
            close()
          }
        })().catch(() => close())
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
