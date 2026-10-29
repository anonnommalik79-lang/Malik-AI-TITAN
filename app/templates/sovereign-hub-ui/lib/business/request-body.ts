export class BusinessInputError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message) }
}

/** Bound the wire payload too: prior documents must not consume unbounded RAM. */
export async function readBusinessBody(request: Request): Promise<Record<string, unknown>> {
  const max = 1_000_000
  if (Number(request.headers.get("content-length")) > max) throw new BusinessInputError("REQUEST_TOO_LARGE", "Описание и предыдущие документы слишком большие.", 413)
  if (request.signal.aborted) throw new BusinessInputError("ABORTED", "Остановлено.", 499)
  const reader = request.body?.getReader()
  if (!reader) throw new BusinessInputError("INVALID_BODY", "Передайте описание бизнеса в JSON.")
  let bytes = 0, text = ""
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > max) { void reader.cancel().catch(() => {}); throw new BusinessInputError("REQUEST_TOO_LARGE", "Описание и предыдущие документы слишком большие.", 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new BusinessInputError("INVALID_JSON", "Не удалось прочитать описание бизнеса.") }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new BusinessInputError("INVALID_BODY", "Передайте объект с описанием бизнеса.")
  const body = data as Record<string, unknown>
  const fieldLimits: Record<string, number> = { brief: 8000, instruction: 8000, market: 200, country: 200, budget: 200, requirements: 1600 }
  for (const key of ["brief", "instruction", "market", "country", "budget", "requirements", "model", "language", "agentId", "kind"]) {
    const value = body[key]
    if (value !== undefined && typeof value !== "string") throw new BusinessInputError("INVALID_FIELD", `Поле ${key} должно быть текстом.`)
    if (typeof value === "string" && fieldLimits[key] && value.length > fieldLimits[key]) throw new BusinessInputError("FIELD_TOO_LONG", `Поле ${key} слишком длинное: максимум ${fieldLimits[key]} символов.`)
  }
  if (body.previous !== undefined && (!Array.isArray(body.previous) || body.previous.length > 8
    || body.previous.some((step: unknown) => !step || typeof step !== "object" || typeof (step as Record<string, unknown>).agentId !== "string" || typeof (step as Record<string, unknown>).content !== "string"))) {
    throw new BusinessInputError("INVALID_HISTORY", "Не удалось прочитать результаты предыдущих агентов.")
  }
  return body
}
