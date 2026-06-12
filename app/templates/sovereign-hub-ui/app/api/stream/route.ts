export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function textUtf8(content: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "text/plain; charset=utf-8")
  headers.set("cache-control", "no-store")
  return new Response(content, { ...init, headers })
}

function jsonUtf8(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("cache-control", "no-store")
  return new Response(JSON.stringify(data), { ...init, headers })
}

function sseUtf8(content: string) {
  const headers = new Headers()
  headers.set("content-type", "text/event-stream; charset=utf-8")
  headers.set("cache-control", "no-cache, no-transform")
  headers.set("connection", "keep-alive")

  const payload =
    `data: ${JSON.stringify({ type: "content", content })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, { headers })
}

function pickPrompt(body: any) {
  if (typeof body?.prompt === "string" && body.prompt.trim()) return body.prompt.trim()
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim()
  if (typeof body?.input === "string" && body.input.trim()) return body.input.trim()
  if (typeof body?.text === "string" && body.text.trim()) return body.text.trim()

  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i]
    const content = typeof item?.content === "string" ? item.content : ""
    if (content.trim()) return content.trim()
  }

  return ""
}

function wantsSSE(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function cleanMode(mode: unknown) {
  const raw = typeof mode === "string" ? mode.toLowerCase().trim() : "fast"
  if (raw === "code") return "code"
  if (raw === "pro") return "pro"
  if (raw === "deep") return "deep"
  return "fast"
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = pickPrompt(body)
  const mode = cleanMode(body?.mode)

  if (!prompt) {
    const fallback = "Готов помочь. Напиши задачу — отвечу коротко и по делу."
    return wantsSSE(request, body) ? sseUtf8(fallback) : textUtf8(fallback)
  }

  const origin = new URL(request.url).origin

  const response = await fetch(`${origin}/api/ai/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "accept": "application/json",
    },
    body: JSON.stringify({
      ...body,
      mode,
      prompt,
      stream: false,
    }),
    cache: "no-store",
  })

  const data = await response.json().catch(() => null)

  const content =
    typeof data?.content === "string" && data.content.trim()
      ? data.content.trim()
      : "Готов помочь. Напиши задачу — отвечу коротко и по делу."

  if (wantsSSE(request, body)) return sseUtf8(content)

  return textUtf8(content)
}

export async function GET() {
  return jsonUtf8({
    ok: true,
    route: "/api/stream",
    engine: "MALIK AI",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "connected-to-chat-api",
  })
}