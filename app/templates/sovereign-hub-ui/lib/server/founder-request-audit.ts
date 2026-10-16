import "server-only"

import { randomUUID } from "node:crypto"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { appendFounderMessage, MAX_FOUNDER_TEXT_CHARS, type FounderMessageSource, type FounderMessageStatus } from "@/lib/server/founder-message-log"
import { chatCompletionError, MAX_CHAT_SSE_FRAME_CHARS, mergeChatStreamText, parseChatSseFrame } from "@/lib/ai/chat-stream-contract"

type Endpoint = (request: Request) => Promise<Response>
const MAX_TEXT = MAX_FOUNDER_TEXT_CHARS
function redact(value: unknown) {
  return String(value ?? "").slice(0, MAX_TEXT)
    .replace(/\bsk-(?:proj-)?[a-z0-9_-]{12,}\b/gi, "sk-[REDACTED]")
    .replace(/\bgh[pousr]_[a-z0-9]{20,}\b/gi, "gh_[REDACTED]")
    .replace(/(Bearer\s+)[a-z0-9._~+/-]{20,}/gi, "$1[REDACTED]")
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|password|пароль|секрет)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .trim()
}
function promptFrom(body: any, source: FounderMessageSource) {
  if (!body || typeof body !== "object") return ""
  const keys = source === "voice"
    ? ["text", "transcript", "prompt", "message", "input"]
    : ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]
  for (const key of keys) {
    if (typeof body[key] === "string" && body[key].trim()) return body[key] as string
  }
  if (Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const message = body.messages[i]
      if (message?.role !== "user") continue
      if (typeof message.content === "string") return message.content as string
      if (Array.isArray(message.parts)) return message.parts.filter((part: { type?: string; text?: unknown }) => part?.type === "text" && typeof part.text === "string").map((part: { text: string }) => part.text).join("\n") as string
    }
  }
  return ""
}
function bodyAnswer(payload: any, raw: string) {
  for (const value of [payload?.content, payload?.output, payload?.answer, payload?.response, payload?.message]) {
    if (typeof value === "string" && value.trim()) return value
    if (value && typeof value === "object") return JSON.stringify(value)
  }
  return raw
}
function codeFor(payload: any, status: number) {
  const value = payload?.error?.code || payload?.error || payload?.code || (status >= 400 ? `HTTP_${status}` : "")
  return redact(typeof value === "string" ? value : JSON.stringify(value || "")).slice(0, 120)
}
/**
 * Records an authenticated request BEFORE generation, then marks that same id
 * successful, failed, or interrupted. Never trusts body-supplied user identity.
 * Errors in telemetry cannot prevent the user's original request from running.
 */
export function withFounderRequestAudit(handler: Endpoint, source: FounderMessageSource = "chat"): Endpoint {
  return async (request) => {
    const [body, entitlement] = await Promise.all([
      request.clone().json().catch(() => null),
      resolveRequestEntitlement(request).catch(() => null),
    ])
    const prompt = promptFrom(body, source)
    const userText = redact(prompt)
    if (!entitlement?.authenticated || !entitlement.userId || entitlement.userId === "guest" ||
        !userText || userText.toLowerCase() === "/malik") return handler(request)

    const id = randomUUID(), createdAt = new Date().toISOString(), start = Date.now(), userId = entitlement.userId
    let textTruncated = prompt.length > MAX_TEXT
    const save = async (input: {
      status: FounderMessageStatus; assistantText?: string; provider?: string; model?: string;
      errorCode?: string; errorMessage?: string; httpStatus?: number
    }) => {
      try {
        const stored = await appendFounderMessage({
          id, userId, source, userText, createdAt, status: input.status,
          assistantText: redact(input.assistantText), provider: redact(input.provider).slice(0, 100),
          model: redact(input.model).slice(0, 160), errorCode: redact(input.errorCode).slice(0, 120),
          errorMessage: redact(input.errorMessage).slice(0, 800), httpStatus: input.httpStatus,
          durationMs: Date.now() - start,
          textTruncated: textTruncated || String(input.assistantText || "").length > MAX_TEXT,
        })
        if (!stored) console.error("[FOUNDER AUDIT] persistence unconfirmed", id, input.status)
      } catch (error) {
        console.error("[FOUNDER AUDIT] write error", error instanceof Error ? error.message : "unknown")
      }
    }
    await save({ status: "pending" })
    let response: Response
    try { response = await handler(request) }
    catch (error) {
      await save({ status: request.signal.aborted ? "interrupted" : "failed",
        errorCode: "UNHANDLED_EXCEPTION", errorMessage: error instanceof Error ? error.message : "Unhandled request error", httpStatus: 500 })
      throw error
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/event-stream") || !response.body) {
      let raw = ""
      try { raw = await response.clone().text() } catch { /* Record HTTP result anyway */ }
      let payload: any = null
      try { payload = JSON.parse(raw) } catch { /* Text response */ }
      const failed = !response.ok || payload?.ok === false || payload?.success === false
      await save({
        status: failed ? "failed" : "success",
        assistantText: failed ? "" : bodyAnswer(payload, raw),
        provider: payload?.provider, model: payload?.model,
        errorCode: failed ? codeFor(payload, response.status) : undefined,
        errorMessage: failed ? (payload?.message || payload?.error?.message || payload?.error || response.statusText) : undefined,
        httpStatus: response.status,
      })
      return response
    }

    const reader = response.body.getReader(), decoder = new TextDecoder()
    let pending = "", answer = "", done = false, errored = !response.ok, errorMessage = "", errorCode = ""
    let provider = "", model = "", finished = false
    const recordParseError = (error: unknown) => {
      errored = true; errorCode = "AUDIT_STREAM_PARSE"
      errorMessage = error instanceof Error ? error.message : "Audit stream could not be parsed"
    }
    const parseEvent = (frame: string) => {
      try {
        const event = parseChatSseFrame(frame)
        if (!event) return
        const { type, payload } = event
        if (type === "done") {
          done = true; provider = String(payload.provider || provider); model = String(payload.model || payload.selectedModelId || model)
          const completionError = chatCompletionError(payload)
          if (completionError) { errored = true; errorMessage = completionError }
          const hasFinalContent = typeof payload.finalContent === "string" && payload.finalContent.trim()
          if (!hasFinalContent && typeof payload.content === "string") {
            textTruncated ||= payload.content.length > MAX_TEXT
            answer = mergeChatStreamText(answer, payload.content.slice(0, MAX_TEXT), "snapshot").slice(0, MAX_TEXT)
          }
          // The exact final answer delivered to the UI may replace an earlier
          // draft after verification. Never keep that discarded draft instead.
          if (typeof payload.finalContent === "string" && hasFinalContent) {
            textTruncated ||= payload.finalContent.length > MAX_TEXT
            answer = payload.finalContent.slice(0, MAX_TEXT)
          }
        }
        if (type === "error") {
          errored = true; errorMessage = String(payload.message || payload.error || "Streaming failed")
          errorCode = String(payload.code || payload.errorCode || "STREAM_ERROR")
        }
        if (type === "content" || type === "delta") {
          const chunk = String(payload.content ?? payload.text ?? "")
          // Keep audit storage bounded, but merge growing snapshots before
          // truncating: repeated snapshots must not fill it with duplicates.
          const merged = mergeChatStreamText(answer, chunk.slice(0, MAX_TEXT), payload.contentMode)
          textTruncated ||= chunk.length > MAX_TEXT || merged.length > MAX_TEXT
          answer = merged.slice(0, MAX_TEXT)
        }
      } catch (error) {
        // Telemetry parsing must never break the user's original stream.
        recordParseError(error)
      }
    }
    const consume = (chunk: string) => {
      pending += chunk
      let boundary: RegExpExecArray | null
      const separator = /\r?\n\r?\n/g
      while ((boundary = separator.exec(pending))) {
        const frame = pending.slice(0, boundary.index)
        pending = pending.slice(boundary.index + boundary[0].length)
        separator.lastIndex = 0
        parseEvent(frame)
      }
      if (pending.length > MAX_CHAT_SSE_FRAME_CHARS) {
        pending = ""
        recordParseError(new Error("Audit stream frame exceeds the safe size limit"))
      }
    }
    const finish = async (interrupted = false) => {
      if (finished) return
      finished = true
      if (done && !errored && !answer.trim()) {
        errored = true; errorCode = "EMPTY_ANSWER"; errorMessage = "Stream completed without answer content"
      }
      await save({
        status: interrupted || (!done && !errored) ? "interrupted" : errored ? "failed" : "success",
        assistantText: answer, provider, model,
        errorCode: errored ? errorCode || `HTTP_${response.status}` : interrupted || !done ? "STREAM_INTERRUPTED" : undefined,
        errorMessage: errored ? errorMessage : interrupted || !done ? "Stream ended without a completion event" : undefined,
        httpStatus: response.status,
      })
    }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read()
          if (next.done) {
            consume(decoder.decode())
            if (pending.trim()) parseEvent(pending)
            await finish()
            controller.close()
            return
          }
          consume(decoder.decode(next.value, { stream: true }))
          controller.enqueue(next.value)
        } catch (error) {
          errored = true
          errorCode = "STREAM_EXCEPTION"
          errorMessage = error instanceof Error ? error.message : "Stream reader failed"
          controller.error(error)
          await finish()
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason) } finally { await finish(true) }
      },
    })
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}
