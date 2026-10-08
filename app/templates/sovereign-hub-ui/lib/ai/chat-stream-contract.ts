/** Shared wire contract for the existing chat stream, history and audit.
 * No provider calls, persistent state or execution of model-generated code.
 */
export const MAX_CHAT_RESULT_CHARS = 1_500_000
// JSON may encode a single UTF-16 code unit as six characters. Bound a
// malformed/unterminated frame without rejecting a valid maximum-size answer.
export const MAX_CHAT_SSE_FRAME_CHARS = MAX_CHAT_RESULT_CHARS * 6 + 64 * 1024

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
