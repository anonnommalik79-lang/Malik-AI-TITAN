export type MusicStatusPayload = {
  code?: string; error?: string; status?: string; resultUrl?: string; downloadUrl?: string
  progress?: number; retryingProvider?: boolean
}

export function musicAudioUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ""
  const text = value.trim()
  if (text.startsWith("//") || (!text.startsWith("/") && !/^https?:\/\//i.test(text))) return ""
  try {
    const url = new URL(text, "https://malik.invalid")
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return ""
    return text.startsWith("/") && !text.startsWith("//") ? text : url.toString()
  } catch { return "" }
}

/** A stalled status connection must not freeze the player's polling loop. */
export async function fetchMusicStatus(requestId: string, options: {
  signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch
} = {}): Promise<{ response: Response; data: MusicStatusPayload | null }> {
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError")
  const controller = new AbortController()
  const relay = () => controller.abort()
  options.signal?.addEventListener("abort", relay, { once: true })
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new DOMException("Music status timed out or cancelled", "AbortError"))
    controller.signal.addEventListener("abort", rejectAbort, { once: true })
  })
  const timer = setTimeout(relay, options.timeoutMs ?? 15_000)
  try {
    return await Promise.race([aborted, (async () => {
      const response = await (options.fetchImpl || fetch)("/api/media/music/status?requestId=" + encodeURIComponent(requestId), {
        method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      })
      const value: unknown = await response.json().catch(() => null)
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError")
      const data = value && typeof value === "object" && !Array.isArray(value) ? value as MusicStatusPayload : null
      if (response.ok && (!data || !["queued", "processing", "ready", "done", "failed", "error"].includes(String(data.status)))) {
        throw new Error("Музыкальный провайдер вернул неизвестный статус. Проверка будет повторена.")
      }
      if (response.ok && data && ["ready", "done"].includes(String(data.status)) && !musicAudioUrl(data.resultUrl)) {
        throw new Error("Готовый трек ещё не содержит корректной ссылки на аудио. Проверка будет повторена.")
      }
      return { response, data }
    })()])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", relay)
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort)
  }
}
