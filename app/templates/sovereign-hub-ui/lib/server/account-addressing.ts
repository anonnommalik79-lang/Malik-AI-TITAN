import { createHash } from "node:crypto"

/** A server-verified, account-specific greeting; request body identities are never trusted. */
type ChatAccount = { authenticated: boolean; userId: string }

// Hash avoids publishing the user's email address in repository source.
const TARGET_ACCOUNT_HASH = "0582ca3f7f3aab03e18fa43fe123ee1a8b899021d81838993b9572892270e934"
const ADDRESS = "Ғлөқдос"

export function shouldAddressAccount(account: ChatAccount): boolean {
  return account.authenticated && createHash("sha256").update(account.userId.trim().toLowerCase()).digest("hex") === TARGET_ACCOUNT_HASH
}

export function addressAnswer(content: string): string {
  if (!content.trim() || content.trimStart().startsWith(ADDRESS)) return content
  return ADDRESS + ", " + content
}

/** Handles both incremental chat events and authoritative finalContent replacements. */
function addressSse(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let firstContentAddressed = false

  function transformFrame(frame: string) {
    const lines = frame.split("\n")
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim()
    const dataIndex = lines.findIndex((line) => line.startsWith("data:"))
    if (dataIndex < 0) return frame
    try {
      const data = JSON.parse(lines[dataIndex].slice(5).trim())
      if (!data || typeof data !== "object") return frame
      let changed = false
      if ((event === "content" || data.type === "content") && typeof data.content === "string" && data.content.length && !firstContentAddressed) {
        data.content = addressAnswer(data.content)
        firstContentAddressed = true
        changed = true
      }
      if (event === "done" || data.type === "done") {
        if (typeof data.finalContent === "string") {
          data.finalContent = addressAnswer(data.finalContent)
          changed = true
        }
        if (typeof data.content === "string") {
          data.content = addressAnswer(data.content)
          changed = true
        }
      }
      if (changed) lines[dataIndex] = "data: " + JSON.stringify(data)
    } catch {
      // Unrecognized SSE data passes through unchanged.
    }
    return lines.join("\n")
  }

  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        controller.enqueue(encoder.encode(transformFrame(frame) + "\n\n"))
        boundary = buffer.indexOf("\n\n")
      }
    },
    flush(controller) {
      buffer += decoder.decode()
      if (buffer) controller.enqueue(encoder.encode(transformFrame(buffer)))
    },
  }))
}

/** No modifications to other accounts, errors, status events, metadata or generated files. */
export async function addressChatResponse(response: Response, account: ChatAccount): Promise<Response> {
  if (!shouldAddressAccount(account) || !response.ok) return response
  const contentType = response.headers.get("content-type") || ""
  let body: BodyInit | null
  if (contentType.includes("text/event-stream")) {
    if (!response.body) return response
    body = addressSse(response.body)
  } else if (contentType.includes("application/json")) {
    const payload = await response.clone().json().catch(() => null)
    if (!payload || typeof payload.content !== "string") return response
    body = JSON.stringify({ ...payload, content: addressAnswer(payload.content) })
  } else if (contentType.includes("text/plain")) {
    body = addressAnswer(await response.text())
  } else {
    return response
  }
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
