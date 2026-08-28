import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { FileComputeStore } from "./file-store"
import { getComputeIdentity } from "./identity"
import { classifyComputeFailure } from "./adapter"
import { estimateCompute, MalikComputeError, MalikComputeService } from "./service"
import type { ComputeOperation, ComputeReservation } from "./types"

type Metadata = Record<string, unknown>
type Context = { metadata: Metadata }
const active = new AsyncLocalStorage<Context>()
export const computeService = new MalikComputeService(new FileComputeStore())

// Metadata comes from the actual server result, never from a submitted price/user ID.
export function observeComputeResult(result: object) {
  const context = active.getStore()
  if (context) Object.assign(context.metadata, result)
}

export async function retryCompute<T>(run: () => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return run() }
    catch (error) {
      if (!(error instanceof MalikComputeError) || error.code !== "MALIK_COMPUTE_STORE_BUSY" || attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
}

export function computeErrorResponse(error: unknown) {
  const code = error instanceof MalikComputeError ? error.code : "MALIK_COMPUTE_STORAGE_UNAVAILABLE"
  const limited = code === "MALIK_COMPUTE_LIMIT_REACHED"
  const auth = code === "MALIK_COMPUTE_AUTH_REQUIRED"
  const message = limited ? "Вы достигли дневного лимита Malik Compute. Баланс обновится в 00:00 UTC."
    : auth ? "Войдите в аккаунт или выберите гостевой вход."
    : "Не удалось обработать баланс Compute. Попробуйте ещё раз."
  return Response.json({ ok: false, code, error: message, message }, {
    status: limited ? 429 : auth ? 401 : 503,
    headers: { "Cache-Control": "private, no-store", ...(limited ? { "Retry-After": String(Math.max(1, Math.ceil((Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z") + 86400000 - Date.now()) / 1000))) } : {}) },
  })
}

function unsuccessful(data: Metadata) {
  return data.ok === false || data.success === false || Boolean(data.error) ||
    (Object.hasOwn(data, "content") && (data.content == null || (typeof data.content === "string" && !data.content.trim()))) ||
    ["failed", "error", "cancelled", "canceled", "disabled", "invalid", "limited", "unsupported"].includes(String(data.status || "").toLowerCase()) ||
    /(?:hard-fallback|source-fallback|voice-local-fallback|demo-fallback)/.test(String(data.provider || "")) ||
    /empty response prevented/i.test(String(data.content || ""))
}

function freeResult(data: Metadata) {
  return data.cached === true || data.demo === true || data.mock === true ||
    /(?:-cache$|^local-smart$)/.test(String(data.provider || "")) ||
    ["demo-ready", "preview-ready", "storyboard-ready"].includes(String(data.status || ""))
}

function jobDetails(data: Metadata, request: Request) {
  const jobId = String(data.jobId || data.taskId || data.invocationArn || "")
  if (!jobId) return undefined
  const url = new URL(request.url)
  const defaultRoute = url.pathname === "/api/media/video" ? "/api/media/video/status"
    : url.pathname === "/api/generate/video" ? "/api/generate/video/status" : "/api/ai/video/status"
  let route = defaultRoute
  if (typeof data.statusUrl === "string") route = new URL(data.statusUrl, url.origin).pathname
  return { jobId, route }
}

const pending = (data: Metadata) => ["queued", "processing", "rendering", "pending", "accepted", "generating", "inprogress", "in_progress"].includes(String(data.status || "").toLowerCase())
const videoReady = (data: Metadata) => Boolean(data.videoUrl || data.url || data.outputUrl || data.mediaUrl) &&
  ["ready", "completed", "succeeded", "success", "done"].includes(String(data.status || "").toLowerCase())

type Policy<R extends Request> = ComputeOperation | ((request: R) => Promise<ComputeOperation>)

export function withCompute<R extends Request, Args extends unknown[]>(
  handler: (request: R, ...args: Args) => Promise<Response>,
  policy: Policy<R>,
) {
  return async (request: R, ...args: Args): Promise<Response> => {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    if (active.getStore()) return handler(request, ...args)
    let reservation: ComputeReservation | undefined
    let finalized = false
    const context: Context = { metadata: {} }
    const finish = async (failed: boolean, status = 500) => {
      if (!reservation || finalized) return
      // Synchronous decision before awaiting: cancel/error/done cannot settle twice.
      finalized = true
      const item = reservation
      await retryCompute(() => {
        const noSources = Array.isArray(context.metadata.sources) && context.metadata.sources.length === 0
        const failedResearch = item.operation === "research" && noSources && !context.metadata.content
        if (failed || failedResearch || unsuccessful(context.metadata)) {
          computeService.failCompute(item, classifyComputeFailure({ status }))
          return
        }
        const attempts = context.metadata.attempts
        const fallbackCount = Array.isArray(attempts) ? attempts.slice(0, -1).filter((attempt) => attempt?.ok === false).length : 0
        const operation = item.operation === "research" && (context.metadata.usedWeb === false || noSources) ? "chat" : item.operation
        computeService.settleCompute(item, freeResult(context.metadata) ? 0 : estimateCompute(operation), operation, fallbackCount)
      })
    }
    try {
      const identity = await getComputeIdentity()
      const operation = typeof policy === "function" ? await policy(request) : policy
      reservation = await retryCompute(() => computeService.reserveCompute(identity.userId, estimateCompute(operation), operation, randomUUID()))
      if (request.signal.aborted) { await finish(true); return new Response(null, { status: 499 }) }
      const response = await active.run(context, () => handler(request, ...args))
      if (!response.ok) { await finish(true, response.status); return response }
      if (request.signal.aborted) { await finish(true); return response }
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let completed = false
        let hasContent = false
        let failed = false
        const inspect = (text: string) => {
          buffer += text
          const events = buffer.replace(/\r\n/g, "\n").split("\n\n")
          buffer = events.pop() || ""
          if (buffer.length > 2_000_000) { failed = true; buffer = "" }
          for (const event of events) {
            const kind = /^event:\s*(.*)$/m.exec(event)?.[1]
            const json = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
            try {
              const data = JSON.parse(json) as Metadata
              if (kind === "error" || data.type === "error" || data.ok === false) failed = true
              if (["content", "answer", "done"].includes(kind || "")) {
                Object.assign(context.metadata, data)
                if (kind !== "done") hasContent ||= Boolean(data.content || data.answer || data.text)
              }
              // Research also emits progress "done" events before its answer.
              if ((kind === "done" || data.type === "done") && hasContent) completed = true
            } catch { if (kind === "error") failed = true }
          }
        }
        let ended = false
        let streamController: ReadableStreamDefaultController<Uint8Array>
        const abort = () => {
          if (ended) return
          ended = true
          request.signal.removeEventListener("abort", abort)
          void reader.cancel().catch(() => {})
          void finish(true).catch(() => { /* Expiry releases a reservation after a storage outage. */ })
          streamController.error(new Error("Request cancelled"))
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller
            request.signal.addEventListener("abort", abort, { once: true })
            if (request.signal.aborted) abort()
          },
          async pull(controller) {
            try {
              const next = await reader.read()
              if (ended) return
              if (next.done) {
                inspect(decoder.decode())
                await finish(failed || !completed || !hasContent)
                ended = true
                request.signal.removeEventListener("abort", abort)
                controller.close()
              } else {
                inspect(decoder.decode(next.value, { stream: true }))
                if (completed) await finish(failed || !hasContent)
                if (ended) return
                controller.enqueue(next.value)
              }
            } catch {
              if (ended) return
              ended = true
              request.signal.removeEventListener("abort", abort)
              await finish(true).catch(() => {})
              controller.error(new Error("Malik AI: ответ прерван, Compute не списан."))
            }
          },
          async cancel() {
            ended = true
            request.signal.removeEventListener("abort", abort)
            await reader.cancel().catch(() => {})
            await finish(true)
          },
        })
        const headers = new Headers(response.headers)
        headers.set("X-Malik-Compute-Reserved", String(reservation.amount))
        return new Response(body, { status: response.status, headers })
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        const data: unknown = await response.clone().json()
        if (data && typeof data === "object") Object.assign(context.metadata, data)
      }
      if (operation === "video" && !unsuccessful(context.metadata) && !freeResult(context.metadata) &&
          (pending(context.metadata) || (jobDetails(context.metadata, request) && !videoReady(context.metadata)))) {
        const job = jobDetails(context.metadata, request)
        if (!job) { await finish(true); return response }
        await retryCompute(() => computeService.attachJob(reservation!, job.jobId, job.route))
        // Polling settles this same reservation, never a second charge.
        return response
      }
      await finish(false)
      return response
    } catch (error) {
      await finish(true).catch(() => {})
      return computeErrorResponse(error)
    }
  }
}

export function withComputeVideoStatus<R extends Request>(handler: (request: R) => Promise<Response>) {
  return async (request: R): Promise<Response> => {
    try {
      const identity = await getComputeIdentity()
      const url = new URL(request.url)
      const jobId = url.searchParams.get("jobId") || url.searchParams.get("taskId") || url.searchParams.get("invocationArn") || ""
      const route = url.pathname === "/api/ai/video" ? "/api/ai/video/status" : url.pathname
      const reservation = computeService.findJob(identity.userId, jobId, route)
      const response = await handler(request)
      if (!reservation || reservation.status !== "reserved" || !response.ok) return response
      const data = await response.clone().json() as Metadata
      if (unsuccessful(data)) await retryCompute(() => computeService.failCompute(reservation, "EXECUTION_FAILED"))
      else if (videoReady(data)) await retryCompute(() => computeService.settleCompute(reservation, estimateCompute("video")))
      return response
    } catch (error) { return computeErrorResponse(error) }
  }
}
