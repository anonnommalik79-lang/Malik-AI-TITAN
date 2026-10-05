import { after } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { z } from "zod"
import { POST as streamPOST } from "../route"
import { normalizeExecutionTrace, upsertExecutionStep, type ExecutionTrace } from "@/lib/ai/chat-execution"
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

function parseSseFrame(frame: string, state: { content: string; error: string; provider: string; model: string; execution?: ExecutionTrace; responseMetadata?: Record<string, unknown> }) {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === "[DONE]") continue
    try {
      const payload = JSON.parse(raw)
      if (payload?.type === "activity" && payload.traceId) {
        state.execution = upsertExecutionStep(state.execution || { version: 1, id: payload.traceId, startedAt: Number(payload.startedAt) || Date.now(), state: "running", steps: [] }, payload.step)
      }
      if (payload.execution) state.execution = normalizeExecutionTrace(payload.execution) || state.execution
      if (payload?.type === "content" && typeof payload.content === "string") state.content += payload.content
      if (payload?.type === "error") state.error = String(payload.message || payload.error || "Background chat failed")
      if (payload?.type === "done") {
        state.provider = String(payload.provider || state.provider || "")
        state.model = String(payload.model || payload.selectedModelId || state.model || "")
        state.responseMetadata = {
          usedWeb: payload.usedWeb === true,
          sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 32) : [],
          textOnly: payload.textOnly === true,
          factAudit: payload.factAudit ?? null,
          selectedModelId: typeof payload.selectedModelId === "string" ? payload.selectedModelId : undefined,
        }
      }
    } catch {
      // Non-JSON SSE metadata is not part of the final answer.
    }
  }
}

async function persistStreamResult(turnId: string, response: Response) {
  try {
    const contentType = response.headers.get("content-type") || ""
    if (!response.body) {
      await failBackgroundChatTurn(turnId, `Background stream returned ${response.status} without a body`)
      return
    }

    if (!contentType.includes("text/event-stream")) {
      const text = await response.text()
      if (response.ok && text.trim()) {
        await completeBackgroundChatTurn(turnId, { content: text })
      } else {
        await failBackgroundChatTurn(turnId, text || `Background stream returned ${response.status}`)
      }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const state: { content: string; error: string; provider: string; model: string; execution?: ExecutionTrace; responseMetadata?: Record<string, unknown> } = { content: "", error: "", provider: "", model: "" }
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
      if (done) break
    }
    if (buffer.trim()) parseSseFrame(buffer, state)

    if (state.error) {
      await failBackgroundChatTurn(turnId, state.error, state.execution)
      return
    }
    if (!response.ok || !state.content.trim()) {
      await failBackgroundChatTurn(turnId, `Background chat finished without content (HTTP ${response.status})`)
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
    await failBackgroundChatTurn(turnId, error)
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
  const started = await startBackgroundChatTurn(turnId, entitlement.userId)
  if (!started) return Response.json({ ok: false, error: "Этот запрос уже существует. Начните новый." }, { status: 409, headers: { "cache-control": "private, no-store" } })

  let response: Response
  try {
    response = await streamPOST(request)
  } catch (error) {
    await failBackgroundChatTurn(turnId, error)
    throw error
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
