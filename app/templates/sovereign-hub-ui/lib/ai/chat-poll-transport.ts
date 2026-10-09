import { MAX_CHAT_RESULT_CHARS } from "./chat-stream-contract"

type PollOptions = {
  fetcher: typeof fetch
  signal: AbortSignal
  pollMs?: number
  timeoutMs?: number
  requestMs?: number
}

/** Network uses finite JSON requests; the existing UI receives a local SSE body.
 * Never sends another POST or changes the server's account/limit checks. */
export function pollingChatResponse(admission: Response, options: PollOptions): Response {
  if (admission.status !== 202 || admission.headers.get("preference-applied") !== "respond-async") return admission
  const turnId = admission.headers.get("x-malik-background-turn-id") || ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(turnId)) {
    throw new Error("Сервер не подтвердил номер запроса. Проверьте сохранённый ответ в истории.")
  }
  const pollMs = Math.max(1000, options.pollMs ?? 2000)
  const deadline = Date.now() + (options.timeoutMs ?? 14 * 60_000)
  const encoder = new TextEncoder()
  let cancelled = false
  let activeRequest: AbortController | undefined
  let wake: (() => void) | undefined
  // Finish the finite admission response instead of cancelling its HTTP
  // connection while the server is handing generation to after().
  void admission.text().catch(() => {})
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stop = () => {
        cancelled = true; activeRequest?.abort(); wake?.()
        controller.error(new DOMException("Chat stopped", "AbortError"))
      }
      const send = (event: string, payload: Record<string, unknown>) => {
        if (!cancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify({ ...payload, type: event })}\n\n`))
      }
      const pause = (ms: number) => new Promise<void>((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve() }, Math.max(0, ms))
        wake = () => { clearTimeout(timer); wake = undefined; resolve() }
        if (cancelled) wake()
      })
      options.signal.addEventListener("abort", stop, { once: true })
      if (options.signal.aborted) stop()
      try {
        while (!cancelled && Date.now() < deadline) {
          // Also proves liveness to the existing stream idle watchdog.
          send("progress", { phase: "thinking", text: "Готовлю ответ…" })
          activeRequest = new AbortController()
          const timer = setTimeout(() => activeRequest?.abort(), Math.max(1, Math.min(options.requestMs ?? 10_000, deadline - Date.now())))
          let delay = pollMs
          try {
            const saved = await options.fetcher(`/api/stream/background/${encodeURIComponent(turnId)}`, {
              method: "GET", cache: "no-store", credentials: "same-origin",
              headers: { Accept: "application/json" }, signal: activeRequest.signal,
            })
            if (cancelled) break
            if ([401, 403, 404, 429].includes(saved.status)) {
              send("error", { message: saved.status === 429 ? "Доступный лимит запросов исчерпан." : "Не удалось открыть сохранённый ответ. Проверьте доступ к аккаунту." })
              break
            }
            if (!saved.ok) throw new Error(`HTTP ${saved.status}`)
            const payload = await saved.json() as { turn?: Record<string, unknown> }
            if (cancelled) break
            const turn = payload?.turn
            if (!turn || !["pending", "complete", "failed"].includes(String(turn.status))) throw new Error("Invalid saved turn")
            if (turn.status !== "pending") {
              const content = typeof turn.content === "string" ? turn.content : ""
              if (content.length > MAX_CHAT_RESULT_CHARS) {
                send("error", { message: "Размер сохранённого ответа превышает допустимый предел." })
                break
              }
              if (content) send("content", { content, contentMode: "snapshot" })
              if (turn.status === "failed" || !content.trim()) {
                send("error", { message: typeof turn.error === "string" ? turn.error : "Модель завершила запрос без текста ответа." })
              } else {
                send("done", { ...turn, content, ok: true })
              }
              break
            }
          } catch {
            // Network/proxy failures read the same job again, never regenerate.
            delay = Math.max(pollMs, 5000)
          } finally { clearTimeout(timer); activeRequest = undefined }
          await pause(Math.min(delay, Math.max(0, deadline - Date.now())))
        }
        if (!cancelled && Date.now() >= deadline) send("error", { message: "Ответ ещё не получен. Проверьте сохранённый запрос в истории." })
        if (!cancelled) controller.close()
      } finally {
        options.signal.removeEventListener("abort", stop)
        activeRequest?.abort()
        wake?.()
      }
    },
    cancel() { cancelled = true; activeRequest?.abort(); wake?.() },
  })
  const headers = new Headers(admission.headers)
  headers.set("content-type", "text/event-stream; charset=utf-8")
  headers.delete("content-length")
  return new Response(body, { status: 200, headers })
}
