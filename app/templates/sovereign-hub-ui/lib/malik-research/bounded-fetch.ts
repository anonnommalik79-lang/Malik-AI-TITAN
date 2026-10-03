/** Research reads text under one deadline, including the body after headers. */
export async function fetchResearchResponse(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12_000, maxBytes = 1024 * 1024): Promise<Response> {
  const signal = AbortSignal.any([AbortSignal.timeout(Math.max(1, timeoutMs)), ...(init.signal ? [init.signal] : [])])
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let onAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(signal.reason)
      void reader?.cancel(signal.reason).catch(() => {})
    }
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  const started = Date.now()
  try {
    return await Promise.race([cancelled, (async () => {
      const response = await fetch(input, { ...init, signal })
      if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw signal.reason }
      const headers = new Headers(response.headers)
      const media = headers.get("content-type") || ""
      if (/^(?:image|video|audio)\/|application\/pdf/iu.test(media)) {
        void response.body?.cancel().catch(() => {})
        return new Response(null, { status: response.status, statusText: response.statusText, headers })
      }
      if (Number(headers.get("content-length")) > maxBytes) {
        void response.body?.cancel().catch(() => {})
        throw new Error("Research response exceeds byte limit")
      }
      if (!response.body) return response
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (signal.aborted) throw signal.reason
          if (done) break
          size += value.byteLength
          if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new Error("Research response exceeds byte limit") }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      headers.delete("content-encoding")
      headers.delete("content-length")
      return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers })
    })()])
  } catch (error) {
    let domain = "unknown"
    try { domain = new URL(String(input)).hostname } catch {}
    console.warn("[MALIK_WEB_FETCH]", JSON.stringify({ domain, ms: Date.now() - started, reason: signal.aborted ? "deadline-or-cancel" : "read-failed" }))
    throw error
  } finally { signal.removeEventListener("abort", onAbort) }
}
