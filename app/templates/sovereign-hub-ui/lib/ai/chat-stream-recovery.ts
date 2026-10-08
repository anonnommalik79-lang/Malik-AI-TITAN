import { briefNeedsDeep } from "./brief-quality"
import { chatCompletionError, MAX_CHAT_SSE_FRAME_CHARS, mergeChatStreamText, parseChatSseFrame } from "./chat-stream-contract"

/** Recover a saved turn before repeating a read-only question. Never replay actions. */
type RecoveryOptions = {
  fetcher?: typeof fetch
  onRecovery?: () => void
  /** Pause between reads of the saved server turn after the live stream broke. */
  pollMs?: number
  /** How long a still-running server turn is awaited after the live stream broke. */
  recoveryMs?: number
  /** Ceiling for the first words while the server keeps proving it is alive. */
  firstTextMs?: number
  /** Silence limit: no byte at all from the server for this long means the connection is gone. */
  idleMs?: number
}

export type ChatStreamTimings = { firstTextMs: number; idleMs: number; recoveryMs: number; headersMs: number }

/**
 * How long the browser waits, and for what.
 *
 * The server sends a heartbeat every 15 seconds for as long as it is working,
 * so liveness is measured as silence - time since the last byte - rather than
 * as time to the first word. A large prompt can keep MalikLLM MAX thinking for
 * over a minute before it writes (its own first-token window is 75-150 s);
 * the old fixed 60-second first-text cutoff gave up on requests that were
 * alive and about to answer, then showed «Сервис ответа временно недоступен».
 *
 * `firstTextMs` is only a ceiling for a server that keeps beating but never
 * writes. It sits well above the server's own wall clock, so the server always
 * finishes first and reports its real result or its real error.
 */
export function chatStreamTimings(body: Record<string, unknown>): ChatStreamTimings {
  const retryable = canRetryChat(body)
  const prompt = String(body.originalQuestion || body.question || body.prompt || "")
  const largeBrief = briefNeedsDeep(prompt)
  const firstTextMs = retryable ? (largeBrief ? 8 * 60_000 : 5 * 60_000) : 14 * 60_000
  return {
    firstTextMs,
    // Three missed heartbeats and then some; a large prompt gets more slack
    // for a server that is busy preparing it.
    idleMs: largeBrief ? 90_000 : 60_000,
    // After a broken connection the server keeps working (its stream is teed
    // into durable storage), so wait for that answer rather than duplicate it.
    recoveryMs: largeBrief ? 8 * 60_000 : 5 * 60_000,
    // Response headers come back as soon as the request is admitted.
    headersMs: retryable ? Math.min(firstTextMs, 120_000) : firstTextMs,
  }
}

export function canRetryChat(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const request = body as Record<string, unknown>
  if (request.isProjectRequest || request.forceCanvas || request.workspaceMode === "work") return false
  // Never launch duplicate provider work for attachments or real-world tools.
  if (Array.isArray(request.attachments) && request.attachments.length) return false
  if (request.actionPlan || request.toolCalls || request.superflow || request.isToolRequest) return false
  const prompt = String(request.originalQuestion || request.question || request.prompt || "")
  return Boolean(prompt.trim()) && !/^\s*\//u.test(prompt)
    && !/(?:отправь|опубликуй|удали|купи|оплати|забронируй|разверни|deploy|publish|delete|purchase|book\s|send\s)/iu.test(prompt)
}

function abortError() { return new DOMException("Chat stopped", "AbortError") }
function isAbort(error: unknown, signal?: AbortSignal | null) {
  return Boolean(signal?.aborted || (error as Error)?.name === "AbortError")
}
function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(abortError()) }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve() }, ms)
    if (signal?.aborted) stop()
    else signal?.addEventListener("abort", stop, { once: true })
  })
}

class DeadlineError extends Error {
  constructor() { super("Chat transport deadline"); this.name = "DeadlineError" }
}

async function within<T>(promise: Promise<T>, ms: number, signal?: AbortSignal | null): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  let abort = () => {}
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), Math.max(1, ms))
    abort = () => reject(abortError())
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
  })
  try { return await Promise.race([promise, timeout]) }
  finally { clearTimeout(timer!); signal?.removeEventListener("abort", abort) }
}

/** What the person reads when an answer could not be delivered. Always a reason, never a shrug. */
export const CHAT_FAILURE_TEXT = {
  silent: "Связь с сервером прервалась, и ответ не удалось восстановить. Нажмите «Перегенерировать», чтобы повторить.",
  cut: "Соединение оборвалось до ответа, и восстановить его не удалось. Нажмите «Перегенерировать», чтобы повторить.",
  tooLong: "Модель так и не начала писать ответ. Попробуйте ещё раз или разделите запрос на части.",
  stuck: "Сервер слишком долго не отдаёт готовый ответ. Нажмите «Перегенерировать», чтобы повторить.",
  partial: "Ответ сохранён частично: соединение оборвалось, а продолжение получить не удалось.",
  noStream: "Сервер ответил без потока данных. Нажмите «Перегенерировать», чтобы повторить.",
}

function httpFailureText(status: number) {
  if (status === 401 || status === 403) return "Проверьте доступ к аккаунту."
  if (status === 429) return "Доступный лимит запросов исчерпан."
  if (status === 502 || status === 503 || status === 504) return `Сервер Malik AI сейчас перезапускается или перегружен (HTTP ${status}). Нажмите «Перегенерировать» через несколько секунд.`
  return `Сервер вернул ошибку HTTP ${status}. Нажмите «Перегенерировать», чтобы повторить.`
}

export async function fetchRecoverableChat(input: RequestInfo | URL, init: RequestInit, options: RecoveryOptions = {}): Promise<Response> {
  const fetcher = options.fetcher || fetch
  const signal = init.signal
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(String(init.body || "{}")) } catch {}
  const retryable = canRetryChat(body)
  const defaults = chatStreamTimings(body)
  const firstTextMs = options.firstTextMs ?? defaults.firstTextMs
  const idleMs = options.idleMs ?? defaults.idleMs
  const recoveryMs = options.recoveryMs ?? defaults.recoveryMs
  const headersMs = options.firstTextMs ?? defaults.headersMs
  const pollMs = options.pollMs ?? 1500
  let response: Response
  const admission = fetcher(input, init)
  try { response = await within(admission, headersMs, signal) }
  catch (error) {
    // Missing headers do NOT prove that the server never admitted the turn.
    // AccountChatPersistence already recorded its UUID before the POST. A
    // second POST here would allocate a new UUID and race/charge the same task.
    // Drain no abandoned body, but let the existing background job persist.
    void admission.then((late) => late.body?.cancel()).catch(() => {})
    if (isAbort(error, signal)) throw error
    if (error instanceof DeadlineError) throw new Error("Сервер не подтвердил запрос вовремя. Запрос не отправлен повторно; проверьте сохранённый ответ в истории.", { cause: error })
    throw error
  }
  // A Compute admission failure is not a model/transport outage. Never replay
  // it as a brand-new user request: the reservation may be partially recorded.
  // Keep the original 503 JSON for the client to display a safe public message.
  if (response.status === 503 && response.headers.get("content-type")?.includes("application/json")) {
    const result = await response.clone().json().catch(() => null) as { code?: unknown } | null
    if (result?.code === "MALIK_COMPUTE_STORAGE_UNAVAILABLE" || result?.code === "MALIK_COMPUTE_STORE_BUSY") {
      return response
    }
  }
  // Permission and quota failures are terminal; never retry or disguise them.
  if (!response.ok && ![502, 503, 504].includes(response.status)) return response
  if (!response.headers.get("content-type")?.includes("text/event-stream") && response.ok) return response
  const encoder = new TextEncoder()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let cancelled = false
  let content = ""
  let completed = false
  let finalError = ""
  const frame = (name: string, payload: Record<string, unknown>) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (bytes: Uint8Array) => { if (!cancelled) controller.enqueue(bytes) }
      const status = (text: string, extra: Record<string, unknown> = {}) => emit(frame("progress", { type: "progress", phase: "recovering", text, ...extra }))
      try {
        if (body.chatRecovery) status("Продолжаю ответ…", { textOnly: true })
        for (let attempt = 0; attempt < 2; attempt++) {
          let buffer = ""
          const decoder = new TextDecoder()
          const began = Date.now()
          let lastByteAt = began
          let terminal = false
          let serverError = false
          // The message must describe the latest failure, not an earlier one.
          finalError = ""
          const consume = (block: string) => {
            const event = parseChatSseFrame(block)
            if (!event) { emit(encoder.encode(block + "\n\n")); return }
            const { type, payload } = event
            if (type === "error" || (type === "done" && chatCompletionError(payload))) {
              finalError = chatCompletionError(payload) || String(payload.message || payload.error || "") || CHAT_FAILURE_TEXT.cut
              serverError = true
              terminal = true
              return
            }
            if (type === "content" || type === "delta") {
              const chunk = String(payload.content ?? payload.text ?? "")
              // Some providers send a growing snapshot, others send deltas.
              // Keep the real prefix for background-turn recovery, never duplicate it.
              content = mergeChatStreamText(content, chunk, payload.contentMode)
            }
            if (type === "done") {
              if (typeof payload.content === "string") {
                content = mergeChatStreamText(content, payload.content, "snapshot")
                emit(frame("content", { type: "content", content, contentMode: "snapshot" }))
              }
              if (!content.trim()) {
                finalError = "Модель завершила запрос без текста ответа. Нажмите «Перегенерировать», чтобы повторить."
                serverError = true
                terminal = true
                return
              }
              completed = true
              terminal = true
              if (attempt || body.chatRecovery) { emit(frame("done", { ...payload, textOnly: true })); return }
            }
            emit(encoder.encode(block + "\n\n"))
          }
          try {
            if (!response.ok) { finalError = httpFailureText(response.status); throw new Error(`Chat service HTTP ${response.status}`) }
            if (!response.body) { finalError = CHAT_FAILURE_TEXT.noStream; throw new Error("Chat service returned no stream") }
            reader = response.body.getReader()
            while (!terminal && !cancelled) {
              const now = Date.now()
              const silenceLeft = idleMs - (now - lastByteAt)
              const firstTextLeft = content ? Number.POSITIVE_INFINITY : firstTextMs - (now - began)
              const remaining = Math.min(silenceLeft, firstTextLeft)
              if (remaining <= 0) throw new DeadlineError()
              let read: ReadableStreamReadResult<Uint8Array>
              try { read = await within(reader.read(), remaining, signal) }
              catch (error) {
                if (error instanceof DeadlineError) {
                  // Name the actual failure: a server that stopped talking, or
                  // one that kept beating for many minutes without one word.
                  finalError = !content && Date.now() - began >= firstTextMs ? CHAT_FAILURE_TEXT.tooLong : CHAT_FAILURE_TEXT.silent
                }
                throw error
              }
              const { value, done } = read
              // Heartbeats, statuses and steps all prove the server is working.
              if (value?.length) lastByteAt = Date.now()
              buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
              const blocks = buffer.split(/\r?\n\r?\n/)
              buffer = blocks.pop() || ""
              for (const block of blocks) { consume(block); if (terminal) break }
              if (buffer.length > MAX_CHAT_SSE_FRAME_CHARS) throw new Error("Chat stream frame exceeds the safe size limit")
              if (done) { if (!terminal && buffer.trim()) consume(buffer); break }
            }
            // A stream that ends without `done` or `error` was cut on the way.
            if (!terminal && !cancelled) finalError = CHAT_FAILURE_TEXT.cut
          } catch (error) {
            if (isAbort(error, signal)) throw error
            finalError ||= CHAT_FAILURE_TEXT.cut
          } finally { void reader?.cancel().catch(() => {}); reader = undefined }
          if (completed || cancelled) break
          options.onRecovery?.()

          // A disconnected client must reuse the server's work, including an
          // answer already partly streamed - the server keeps generating after
          // the browser drops (its stream is teed into durable storage). Wait
          // for that turn for as long as it is still running; starting a
          // duplicate request would only race it.
          const turnId = response.headers.get("x-malik-background-turn-id")
          let turnSettled = !turnId
          if (turnId && !serverError) {
            status("Связь прервалась — ответ ещё готовится на сервере, жду его…")
            const deadline = Date.now() + recoveryMs
            let lastNotice = Date.now()
            while (Date.now() < deadline && !cancelled) {
              if (signal?.aborted) throw abortError()
              try {
                const budget = Math.max(1, Math.min(10_000, deadline - Date.now()))
                const saved = await within(fetcher(`/api/stream/background/${encodeURIComponent(turnId)}`, { cache: "no-store", signal }), budget, signal)
                // Permissions and rate limits are terminal: no hot polling, and
                // never a replay that would bypass them.
                if ([401, 403, 404, 429].includes(saved.status)) {
                  finalError = saved.status === 429 ? "Доступный лимит запросов исчерпан." : "Не удалось открыть сохранённый ответ. Проверьте доступ к аккаунту."
                  turnSettled = true
                  break
                }
                const payload = saved.ok ? await within(saved.json(), budget, signal) : null
                const turn = payload?.turn
                if (turn?.status === "complete" && turn.content) {
                  const answer = String(turn.content)
                  // Dashboard recognises cumulative content, avoiding duplicates.
                  if (!content || answer.startsWith(content)) emit(frame("content", { type: "content", content: answer, contentMode: "snapshot" }))
                  else throw new Error("Recovered answer does not match streamed prefix")
                  content = answer
                  emit(frame("done", { type: "done", ...turn, usedWeb: Boolean(turn.usedWeb), sources: turn.sources || [], execution: turn.execution, textOnly: Boolean(turn.textOnly) }))
                  completed = true
                  turnSettled = true
                  break
                }
                if (turn?.status === "failed") {
                  // Keep whatever the server wrote before it failed.
                  const partial = String(turn.content || "")
                  if (partial.length > content.length && (!content || partial.startsWith(content))) {
                    emit(frame("content", { type: "content", content: partial, contentMode: "snapshot" }))
                    content = partial
                  }
                  if (turn.error) finalError = String(turn.error)
                  turnSettled = true
                  break
                }
              } catch (error) {
                if (isAbort(error, signal)) throw error
                if (error instanceof Error && /does not match/.test(error.message)) { turnSettled = true; break }
              }
              if (Date.now() - lastNotice > 20_000) {
                lastNotice = Date.now()
                status("Ответ ещё готовится на сервере…")
              }
              await wait(Math.max(1, Math.min(pollMs, deadline - Date.now())), signal)
            }
            if (!completed && !turnSettled) finalError = CHAT_FAILURE_TEXT.stuck
          }
          // Once the server identifies a job, only that job may finish it.
          // A pending, inaccessible or temporarily offline saved turn is not
          // permission to launch another provider request or consume quota.
          // Only a request the server never registered is repeated, once.
          if (completed || cancelled || turnId || content || !retryable || attempt || body.chatRecovery) break
          status("Продолжаю ответ…", { textOnly: true })
          try {
            response = await within(fetcher(input, { ...init, body: JSON.stringify({ ...body, chatRecovery: true }) }), headersMs, signal)
          } catch (error) {
            if (isAbort(error, signal)) throw error
            finalError = CHAT_FAILURE_TEXT.silent
            break
          }
          if ([401, 403, 429].includes(response.status)) { finalError = httpFailureText(response.status); break }
        }
        if (!completed && !cancelled) emit(frame("error", { type: "error", message: content ? CHAT_FAILURE_TEXT.partial : finalError || CHAT_FAILURE_TEXT.cut }))
        if (!cancelled) controller.close()
      } catch (error) { if (!cancelled) controller.error(error) }
    },
    cancel() { cancelled = true; void reader?.cancel().catch(() => {}) },
  })
  const headers = new Headers(response.headers)
  headers.set("content-type", "text/event-stream; charset=utf-8")
  headers.delete("content-length")
  return new Response(stream, { status: 200, headers })
}
