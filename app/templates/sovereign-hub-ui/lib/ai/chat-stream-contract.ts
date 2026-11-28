/** Shared wire contract for the existing chat stream, history and audit.
 * No provider calls, persistent state or execution of model-generated code.
 */
export const MAX_CHAT_RESULT_CHARS = 1_500_000
// JSON may encode a single UTF-16 code unit as six characters. Bound a
// malformed/unterminated frame without rejecting a valid maximum-size answer.
export const MAX_CHAT_SSE_FRAME_CHARS = MAX_CHAT_RESULT_CHARS * 6 + 64 * 1024

/**
 * The reason the explicit Stop aborts a chat request with. A fetch aborted
 * with a reason errors its body with that very value, so every layer between
 * the network and the chat can tell the person's Stop from a dropped line.
 */
export const CHAT_STOPPED_BY_USER = "Malik AI stopped by user"

export function isChatStoppedByUser(error: unknown) {
  return error === CHAT_STOPPED_BY_USER || (error instanceof Error && error.message === CHAT_STOPPED_BY_USER)
}

export type ChatSseEvent = { type: string; payload: Record<string, unknown> }

export function parseChatSseFrame(frame: string): ChatSseEvent | null {
  if (frame.length > MAX_CHAT_SSE_FRAME_CHARS) throw new Error("Chat stream frame exceeds the safe size limit")
  let event = ""
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    const field = separator < 0 ? line : line.slice(0, separator)
    const raw = separator < 0 ? "" : line.slice(separator + 1)
    const value = raw.startsWith(" ") ? raw.slice(1) : raw
    if (field === "event") event = value
    else if (field === "data") data.push(value)
  }
  if (!data.length) return null
  let payload: unknown
  try { payload = JSON.parse(data.join("\n")) } catch { return null }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const fields = payload as Record<string, unknown>
  const type = typeof fields.type === "string" && fields.type ? fields.type : event || "message"
  return { type, payload: fields }
}

/** Explicit modes avoid mistaking a repeated delta for a cumulative snapshot.
 * Older streams retain their existing cumulative/delta compatibility.
 */
export function mergeChatStreamText(previous: string, next: string, mode?: unknown): string {
  let content: string
  if (mode === "delta") content = previous + next
  else if (mode === "snapshot") {
    if (previous && !next.startsWith(previous)) {
      if (previous.startsWith(next)) return previous // older snapshot, never shrink
      throw new Error("Chat stream snapshot does not match received text")
    }
    content = next
  } else content = next.startsWith(previous) ? next : previous + next
  if (content.length > MAX_CHAT_RESULT_CHARS) throw new Error("Chat answer exceeds the safe size limit; received text was retained")
  return content
}

export function chatCompletionError(payload: Record<string, unknown>): string {
  if (payload.ok !== false && payload.success !== false) return ""
  const detail = payload.error && typeof payload.error === "object"
    ? (payload.error as Record<string, unknown>).message : payload.error
  return String(payload.message || detail || "Stream reported an unsuccessful answer").slice(0, 4000)
}

/** Incremental SSE framing. CR, LF and CRLF are legal, even across byte reads.
 * UTF-8 is decoded once; a malformed/truncated code point fails closed.
 */
export class ChatSseDecoder {
  private decoder = new TextDecoder("utf-8", { fatal: true })
  private pending = ""
  private cr = false
  push(bytes?: Uint8Array, done = false): string[] {
    let chunk = (this.cr ? "\r" : "") + this.decoder.decode(bytes, { stream: !done })
    this.cr = !done && chunk.endsWith("\r")
    if (this.cr) chunk = chunk.slice(0, -1)
    this.pending += chunk.replace(/\r\n?/g, "\n")
    const frames = this.pending.split("\n\n")
    this.pending = frames.pop() || ""
    if (done && this.pending.trim()) { frames.push(this.pending); this.pending = "" }
    if (this.pending.length > MAX_CHAT_SSE_FRAME_CHARS || frames.some(frame => frame.length > MAX_CHAT_SSE_FRAME_CHARS)) {
      throw new Error("Chat stream frame exceeds the safe size limit")
    }
    return frames
  }
}

export function sseFrameData(frame: string): string | null {
  const lines = frame.split(/\r\n|\r|\n/).filter(line => line === "data" || line.startsWith("data:"))
  return lines.length ? lines.map(line => line.slice(5).replace(/^ /, "")).join("\n") : null
}

/** The canonical text ledger: one generation, ordered UTF-16 offsets.
 * Repeated legitimate deltas have different offsets. A replay has the same
 * offset and identical bytes. Never guess an overlap or splice conflicting text.
 * Legacy streams without offsets retain the previous explicit-mode contract.
 */
export class ChatTextBuffer {
  content = ""
  private generation = ""
  private finished = false

  private identify(payload: Record<string, unknown>) {
    if (payload.generationId === undefined) return
    const id = payload.generationId
    if (typeof id !== "string" || !id || id.length > 128) throw new Error("Invalid chat generation identity")
    if (this.generation && id !== this.generation) throw new Error("Chat stream generation mismatch")
    this.generation = id
  }

  apply(payload: Record<string, unknown>): boolean {
    this.identify(payload)
    if (this.finished) return false
    const next = payload.content ?? payload.text
    if (typeof next !== "string" || !next) return false
    const old = this.content
    if (payload.offset !== undefined) {
      const offset = payload.offset
      if (payload.contentMode !== "delta" || typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid chat stream offset")
      if (offset < old.length) {
        if (offset + next.length <= old.length && old.slice(offset, offset + next.length) === next) return false
        throw new Error("Chat stream replay conflicts with received text")
      }
      if (offset !== old.length) throw new Error("Chat stream gap: received text was retained")
    }
    this.content = mergeChatStreamText(old, next, payload.contentMode)
    return this.content !== old
  }

  complete(payload: Record<string, unknown>): string {
    this.identify(payload)
    if (this.finished) return this.content
    const error = chatCompletionError(payload)
    if (error) throw new Error(error)
    const final = payload.finalContent
    if (typeof final === "string" && final.trim()) {
      if (final.length > MAX_CHAT_RESULT_CHARS) throw new Error("Chat final answer exceeds the safe size limit")
      this.content = final
    } else if (typeof payload.content === "string") {
      this.content = mergeChatStreamText(this.content, payload.content, "snapshot")
    }
    if (!this.content.trim()) throw new Error("Chat stream completed without an answer")
    this.finished = true
    return this.content
  }
}

/** Provider adapters may carry a full message, not a delta. Convert it once
 * before reasoning filtering or publishing tokens. A divergent snapshot is
 * an interruption, not permission to concatenate two different answers.
 */
export function providerTextDelta(previous: string, next: string, mode: "delta" | "snapshot" = "delta") {
  const content = mergeChatStreamText(previous, next, mode)
  return { content, delta: content.slice(previous.length) }
}
