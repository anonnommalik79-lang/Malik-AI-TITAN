/** Recover a saved turn before repeating a read-only question. Never replay actions. */
type RecoveryOptions = {
  fetcher?: typeof fetch
  onRecovery?: () => void
  pollMs?: number
  recoveryMs?: number
  firstTextMs?: number
  idleMs?: number
}

export function canRetryChat(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const request = body as Record<string, unknown>
  if (request.isProjectRequest || request.forceCanvas || request.workspaceMode === "work") return false
  const prompt = String(request.originalQuestion || request.question || request.prompt || "")
  return Boolean(prompt.trim()) && !/^\s*\//u.test(prompt)
    && !/(?:отправь|опубликуй|удали|купи|оплати|забронируй|разверни|deploy|publish|delete|purchase|book\s|send\s)/iu.test(prompt)
}

function abortError() { return new DOMException("Chat stopped", "AbortError") }
function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(abortError()) }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve() }, ms)
    if (signal?.aborted) stop()
    else signal?.addEventListener("abort", stop, { once: true })
  })
}

async function within<T>(promise: Promise<T>, ms: number, signal?: AbortSignal | null): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  let abort = () => {}
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Chat transport deadline")), Math.max(1, ms))
    abort = () => reject(abortError())
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
  })
  try { return await Promise.race([promise, timeout]) }
  finally { clearTimeout(timer!); signal?.removeEventListener("abort", abort) }
}

export async function fetchRecoverableChat(input: RequestInfo | URL, init: RequestInit, options: RecoveryOptions = {}): Promise<Response> {
  const fetcher = options.fetcher || fetch
  const signal = init.signal
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(String(init.body || "{}")) } catch {}
  const retryable = canRetryChat(body)
  const firstTextMs = options.firstTextMs ?? (retryable ? 60_000 : 14 * 60_000)
  let response: Response
  try { response = await within(fetcher(input, init), firstTextMs, signal) }
  catch (error) {
    if (!retryable || signal?.aborted || (error as Error)?.name === "AbortError") throw error
    options.onRecovery?.()
    response = await within(fetcher(input, { ...init, body: JSON.stringify({ ...body, chatRecovery: true, responseDepth: "balanced" }) }), firstTextMs, signal)
    body = { ...body, chatRecovery: true }
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
      try {
        if (body.chatRecovery) emit(frame("progress", { type: "progress", phase: "recovering", text: "Продолжаю ответ…", textOnly: true }))
        for (let attempt = 0; attempt < 2; attempt++) {
          let buffer = ""
          const decoder = new TextDecoder()
          const began = Date.now()
          let terminal = false
          const consume = (block: string) => {
            const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
            let payload: Record<string, unknown>
            try { payload = JSON.parse(data) } catch { emit(encoder.encode(block + "\n\n")); return }
            if (payload.type === "error") { finalError = String(payload.message || payload.error || "Сервис ответа временно недоступен."); terminal = true; return }
            if (payload.type === "content") content += String(payload.content || "")
            if (payload.type === "done") {
              completed = true
              terminal = true
              if (attempt || body.chatRecovery) { emit(frame("done", { ...payload, textOnly: true })); return }
            }
            emit(encoder.encode(block + "\n\n"))
          }
          try {
            if (!response.ok) throw new Error(`Chat service HTTP ${response.status}`)
            if (!response.body) throw new Error("Chat service returned no stream")
            reader = response.body.getReader()
            while (!terminal && !cancelled) {
              const remaining = content ? options.idleMs || 45_000 : firstTextMs - (Date.now() - began)
              const { value, done } = await within(reader.read(), remaining, signal)
              buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
              const blocks = buffer.split(/\r?\n\r?\n/)
              buffer = blocks.pop() || ""
              for (const block of blocks) { consume(block); if (terminal) break }
              if (done) { if (!terminal && buffer.trim()) consume(buffer); break }
            }
          } catch (error) {
            if (signal?.aborted || (error as Error)?.name === "AbortError") throw error
            finalError = "Сервис ответа временно недоступен."
          } finally { void reader?.cancel().catch(() => {}); reader = undefined }
          if (completed || cancelled) break
          options.onRecovery?.()

          // A disconnected client must reuse completed server work, including
          // an answer already partly streamed. It must not start a duplicate job.
          const turnId = response.headers.get("x-malik-background-turn-id")
          if (turnId) {
            const deadline = Date.now() + (options.recoveryMs ?? 20_000)
            while (Date.now() < deadline && !cancelled) {
              if (signal?.aborted) throw abortError()
              try {
                const saved = await within(fetcher(`/api/stream/background/${encodeURIComponent(turnId)}`, { cache: "no-store", signal }), Math.min(4000, deadline - Date.now()), signal)
                const payload = await within(saved.json(), Math.min(4000, deadline - Date.now()), signal)
                if (payload?.turn?.status === "complete" && payload.turn.content) {
                  const answer = String(payload.turn.content)
                  // Dashboard recognises cumulative content, avoiding duplicates.
                  if (!content || answer.startsWith(content)) emit(frame("content", { type: "content", content: answer }))
                  else throw new Error("Recovered answer does not match streamed prefix")
                  emit(frame("done", { type: "done", ...payload.turn, usedWeb: Boolean(payload.turn.usedWeb), sources: payload.turn.sources || [], execution: payload.turn.execution, textOnly: Boolean(payload.turn.textOnly) }))
                  completed = true
                  break
                }
                if (payload?.turn?.status === "failed" || saved.status === 404) break
              } catch (error) { if (signal?.aborted || (error as Error)?.name === "AbortError") throw error }
              await wait(options.pollMs ?? 800, signal)
            }
          }
          if (completed || cancelled || content || !retryable || attempt || body.chatRecovery) break
          emit(frame("progress", { type: "progress", phase: "recovering", text: "Продолжаю ответ…", textOnly: true }))
          response = await within(fetcher(input, { ...init, body: JSON.stringify({ ...body, chatRecovery: true, responseDepth: "balanced" }) }), firstTextMs, signal)
          if ([401, 403, 429].includes(response.status)) { finalError = response.status === 429 ? "Доступный лимит запросов исчерпан." : "Проверьте доступ к аккаунту."; break }
        }
        if (!completed && !cancelled) emit(frame("error", { type: "error", message: content ? "Ответ сохранён частично; сервис не смог завершить продолжение." : finalError || "Не удалось получить ответ от сервисов. Запрос сохранён в истории." }))
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
