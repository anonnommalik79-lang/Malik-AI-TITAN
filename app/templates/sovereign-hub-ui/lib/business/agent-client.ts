/**
 * Browser side of POST /api/business/agent: one stage, streamed.
 *
 * Kept out of the component so the parser can be tested without a browser.
 */

export type AgentSource = { title: string; uri: string }

export type AgentDone = {
  content: string
  model: string
  label: string
  modelVersion?: string
  ms: number
  usage?: { promptTokens?: number; outputTokens?: number; thoughtTokens?: number; totalTokens?: number }
  sources?: AgentSource[]
  searched?: boolean
}

export type AgentStreamEvent =
  | { type: "ready"; label: string }
  | { type: "model"; model: string; label: string }
  | { type: "thought"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset"; reason: string }
  | { type: "sources"; items: AgentSource[] }

export class AgentStreamError extends Error {
  code: string
  retryAfterMs?: number
  trail?: string[]
  constructor(code: string, message: string, retryAfterMs?: number, trail?: string[]) {
    super(message)
    this.name = "AgentStreamError"
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.trail = trail
  }
}

export type AgentRequest = {
  kind: "agent" | "summary" | "stress"
  agentId?: string
  brief: string
  instruction?: string
  market?: string
  country?: string
  budget?: string
  requirements?: string
  previous?: Array<{ agentId: string; content: string }>
  model?: string
}

export const AGENT_ENDPOINT = "/api/business/agent"

/** Splits an SSE byte stream into (event, data) pairs. Comments are skipped. */
export function createSseParser(onMessage: (event: string, data: string) => void) {
  let buffer = ""
  const flush = (block: string) => {
    let event = "message"
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
    }
    if (data.length) onMessage(event, data.join("\n"))
  }
  return {
    push(chunk: string) {
      buffer += chunk
      let index: number
      while ((index = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, index)
        buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, "")
        flush(block)
      }
    },
    end() {
      if (buffer.trim()) flush(buffer)
      buffer = ""
    },
  }
}

export async function streamAgent(
  request: AgentRequest,
  options: { signal?: AbortSignal; onEvent?: (event: AgentStreamEvent) => void; stallMs?: number; fetchImpl?: typeof fetch },
): Promise<AgentDone> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  options.signal?.addEventListener("abort", onAbort, { once: true })
  let stalled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { stalled = true; controller.abort() }, options.stallMs ?? 150_000)
  }

  // Held in an object: the parser callback assigns these, and TypeScript does
  // not follow assignments made inside callbacks.
  const outcome: { done: AgentDone | null; failure: AgentStreamError | null } = { done: null, failure: null }

  try {
    arm()
    const response = await (options.fetchImpl || fetch)(AGENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as { code?: string; message?: string; retryAfterMs?: number }
      throw new AgentStreamError(payload.code || `HTTP_${response.status}`, payload.message || `Сервер ответил ${response.status}.`, Number(payload.retryAfterMs) || undefined)
    }

    const parser = createSseParser((event, raw) => {
      let data: any
      try { data = JSON.parse(raw) } catch { return }
      if (event === "done") outcome.done = data as AgentDone
      else if (event === "error") outcome.failure = new AgentStreamError(String(data.code || "ERROR"), String(data.message || "Ошибка"), Number(data.retryAfterMs) || undefined, Array.isArray(data.trail) ? data.trail : undefined)
      else if (event === "ready") options.onEvent?.({ type: "ready", label: String(data.label || "") })
      else if (event === "model") options.onEvent?.({ type: "model", model: String(data.model || ""), label: String(data.label || data.model || "") })
      else if (event === "thought") options.onEvent?.({ type: "thought", text: String(data.text || "") })
      else if (event === "delta") options.onEvent?.({ type: "delta", text: String(data.text || "") })
      else if (event === "reset") options.onEvent?.({ type: "reset", reason: String(data.reason || "") })
      else if (event === "sources") options.onEvent?.({ type: "sources", items: Array.isArray(data.items) ? data.items : [] })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      arm()
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.end()
  } catch (error) {
    if (error instanceof AgentStreamError) throw error
    if (options.signal?.aborted) throw new AgentStreamError("ABORTED", "Остановлено.")
    if (stalled) throw new AgentStreamError("TIMEOUT", "Связь с сервером прервалась: ответа не было слишком долго.")
    throw new AgentStreamError("NETWORK", "Связь с сервером прервалась. Нажми «Продолжить».")
  } finally {
    if (timer) clearTimeout(timer)
    options.signal?.removeEventListener("abort", onAbort)
  }

  if (outcome.failure) throw outcome.failure
  if (!outcome.done) throw new AgentStreamError("INCOMPLETE", "Ответ оборвался до конца. Нажми «Продолжить».")
  return outcome.done
}
