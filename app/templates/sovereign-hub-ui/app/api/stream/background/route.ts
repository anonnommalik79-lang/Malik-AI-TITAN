import { after } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { z } from "zod"
import { POST as streamPOST } from "../route"
import { normalizeExecutionTrace, upsertExecutionStep, type ExecutionTrace } from "@/lib/ai/chat-execution"
import { chatCompletionError, MAX_CHAT_RESULT_CHARS, MAX_CHAT_SSE_FRAME_CHARS, mergeChatStreamText, parseChatSseFrame } from "@/lib/ai/chat-stream-contract"
import {
  completeBackgroundChatTurn,
  failBackgroundChatTurn,
  normalizeBackgroundTurnId,
  startBackgroundChatTurn,
} from "@/lib/server/background-chat-turns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cloneResponse(response: Response, body: BodyInit | null) {
  const headers = new Headers(response.headers)
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function parseSseFrame(frame: string, state: { content: string; error: string; done: boolean; provider: string; model: string; execution?: ExecutionTrace; responseMetadata?: Record<string, unknown> }) {
  const event = parseChatSseFrame(frame)
  if (!event) return
  const { type, payload } = event
  if (type === "activity" && typeof payload.traceId === "string") {
    state.execution = upsertExecutionStep(state.execution || { version: 1, id: payload.traceId, startedAt: Number(payload.startedAt) || Date.now(), state: "running", steps: [] }, payload.step)
  }
  if (payload.execution) state.execution = normalizeExecutionTrace(payload.execution) || state.execution
  if ((type === "content" || type === "delta") && typeof (payload.content ?? payload.text) === "string") {
    state.content = mergeChatStreamText(state.content, String(payload.content ?? payload.text), payload.contentMode)
  }
  if (type === "error") state.error = String(payload.message || payload.error || "Background chat failed")
  if (type === "done") {
    state.error ||= chatCompletionError(payload)
    if (typeof payload.content === "string") state.content = mergeChatStreamText(state.content, payload.content, "snapshot")
    // The server's authoritative final text (a truth warning, an incomplete
    // note) replaces what streamed, so a reload shows the same answer.
    if (typeof payload.finalContent === "string" && payload.finalContent.trim() && payload.finalContent.length <= MAX_CHAT_RESULT_CHARS) state.content = payload.finalContent
    state.done = true
    state.provider = String(payload.provider || state.provider || "")
    state.model = String(payload.model || payload.selectedModelId || state.model || "")
    state.responseMetadata = {
      usedWeb: payload.usedWeb === true,
      sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 32) : [],
      textOnly: payload.textOnly === true,
      factAudit: payload.factAudit ?? null,
      incomplete: payload.incomplete && typeof payload.incomplete === "object" ? payload.incomplete : null,
      selectedModelId: typeof payload.selectedModelId === "string" ? payload.selectedModelId : undefined,
    }
  }
}

async function persistStreamResult(turnId: string, response: Response) {
  const state: { content: string; error: string; done: boolean; provider: string; model: string; execution?: ExecutionTrace; responseMetadata?: Record<string, unknown> } = { content: "", error: "", done: false, provider: "", model: "" }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const contentType = response.headers.get("content-type") || ""
    if (!response.body) {
      await failBackgroundChatTurn(turnId, `Background stream returned ${response.status} without a body`)
      return
    }

    if (!contentType.includes("text/event-stream")) {
      const text = await response.text()
      if (text.length > MAX_CHAT_RESULT_CHARS) throw new Error("Background answer exceeds the safe size limit")
      if (response.ok && text.trim()) {
        await completeBackgroundChatTurn(turnId, { content: text })
      } else {
        await failBackgroundChatTurn(turnId, text || `Background stream returned ${response.status}`)
      }
      return
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary >= 0) {
        const match = buffer.match(/\r?\n\r?\n/)
        const separatorLength = match?.[0]?.length || 2
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + separatorLength)
        parseSseFrame(frame, state)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      if (buffer.length > MAX_CHAT_SSE_FRAME_CHARS) throw new Error("Background stream frame exceeds the safe size limit")
      if (done) break
    }
    if (buffer.trim()) parseSseFrame(buffer, state)

    if (state.error) {
      await failBackgroundChatTurn(turnId, state.error, state.execution, state.content)
      return
    }
    // A closed SSE body without the server's final done event is an interrupted
    // turn, even if it delivered text: never report a partial answer as complete.
    if (!response.ok || !state.done || !state.content.trim()) {
      const reason = !state.done
        ? "Соединение прервалось до подтверждения завершения ответа."
        : `Background chat finished without content (HTTP ${response.status})`
      await failBackgroundChatTurn(turnId, reason, state.execution, state.content)
      return
    }
    await completeBackgroundChatTurn(turnId, {
      content: state.content,
      provider: state.provider,
      model: state.model,
      execution: state.execution,
      responseMetadata: state.responseMetadata,
    })
  } catch (error) {
    // reader.read() can throw after many valid chunks. Preserve those chunks
    // just as we do for an orderly EOF without done; never replace them with an error-only turn.
    await failBackgroundChatTurn(turnId, error, state.execution, state.content)
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() }
  }
}

export async function POST(request: Request) {
  const parsed = z.string().uuid().safeParse(request.headers.get("x-malik-background-turn-id"))
  const turnId = parsed.success ? normalizeBackgroundTurnId(parsed.data) : ""
  if (!turnId) {
    return Response.json({ ok: false, error: "INVALID_BACKGROUND_TURN_ID" }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const asynchronous = (request.headers.get("prefer") || "").split(",").some((value) => value.trim().toLowerCase() === "respond-async")
  // The polling endpoint is account-private. Do not accept anonymous jobs
  // whose results the caller could never read, or weaken ownership checks.
  if (asynchronous && !entitlement.authenticated) {
    return Response.json({ ok: false, error: "Войдите в аккаунт для совместимого режима подключения." }, {
      status: 401, headers: { "cache-control": "private, no-store" },
    })
  }
  const started = await startBackgroundChatTurn(turnId, entitlement.userId)
  if (!started) return Response.json({ ok: false, error: "Этот запрос уже существует. Начните новый." }, { status: 409, headers: { "cache-control": "private, no-store" } })

  let response: Response
  try {
    if (asynchronous) {
      const headers = new Headers(request.headers)
      headers.set("accept", "text/event-stream")
      request = new Request(request, { headers })
    }
    response = await streamPOST(request)
  } catch (error) {
    await failBackgroundChatTurn(turnId, error)
    throw error
  }

  if (asynchronous && response.ok && response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
    // Only short JSON responses cross the network. Model SSE is consumed on
    // the server, so a buffering school/office proxy cannot hold the answer.
    const persistence = persistStreamResult(turnId, response)
    after(async () => { await persistence })
    return Response.json({ ok: true, turnId, status: "pending" }, {
      status: 202,
      headers: {
        "cache-control": "private, no-store",
        "preference-applied": "respond-async",
        "x-malik-background-turn-id": turnId,
      },
    })
  }

  if (!response.body) {
    const persistence = persistStreamResult(turnId, response.clone())
    after(async () => { await persistence })
    const headers = new Headers(response.headers)
    headers.set("x-malik-background-turn-id", turnId)
    return new Response(null, { status: response.status, statusText: response.statusText, headers })
  }

  // One branch stays attached to the user's live SSE stream. The second starts
  // draining immediately and is also registered with Next `after()`, so closing
  // the tab or changing routes cannot orphan the model task before persistence.
  const [clientBody, persistenceBody] = response.body.tee()
  const persistenceResponse = cloneResponse(response, persistenceBody)
  const persistence = persistStreamResult(turnId, persistenceResponse)
  after(async () => { await persistence })

  const headers = new Headers(response.headers)
  headers.set("x-malik-background-turn-id", turnId)
  return new Response(clientBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
