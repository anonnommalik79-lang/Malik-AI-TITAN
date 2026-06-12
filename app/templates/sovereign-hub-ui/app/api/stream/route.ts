export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SAFE_RU =
  "\u0413\u043e\u0442\u043e\u0432 \u043f\u043e\u043c\u043e\u0447\u044c. \u041d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 \u043e\u0442\u0432\u0435\u0447\u0443 \u043a\u043e\u0440\u043e\u0442\u043a\u043e \u0438 \u043f\u043e \u0434\u0435\u043b\u0443."

function jsonUtf8(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("cache-control", "no-store")
  return new Response(JSON.stringify(data), { ...init, headers })
}

function textUtf8(text: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "text/plain; charset=utf-8")
  headers.set("cache-control", "no-store")
  return new Response(text, { ...init, headers })
}

function sseUtf8(text: string) {
  const headers = new Headers()
  headers.set("content-type", "text/event-stream; charset=utf-8")
  headers.set("cache-control", "no-cache, no-transform")
  headers.set("connection", "keep-alive")

  const payload =
    `data: ${JSON.stringify({ type: "content", content: text })}\n\n` +
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
    const content = typeof messages[i]?.content === "string" ? messages[i].content.trim() : ""
    if (content) return content
  }

  return ""
}

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function cleanText(text: string) {
  const value = String(text || "").trim()
  const commaCount = (value.match(/,/g) || []).length
  const bad =
    !value ||
    /[ÐÑâ]/.test(value) ||
    /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(value) ||
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(value) ||
    /^[,;:]/.test(value) ||
    commaCount >= 25

  return bad ? SAFE_RU : value
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prompt = pickPrompt(body)

    if (!prompt) {
      return wantsSse(request, body) ? sseUtf8(SAFE_RU) : textUtf8(SAFE_RU)
    }

    const origin = new URL(request.url).origin

    const response = await fetch(`${origin}/api/ai/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify({
        mode: body?.mode || "fast",
        prompt,
        stream: false,
      }),
      cache: "no-store",
    })

    const data = await response.json().catch(() => null)
    const content = cleanText(typeof data?.content === "string" ? data.content : "")

    return wantsSse(request, body) ? sseUtf8(content) : textUtf8(content)
  } catch {
    return wantsSse(request, {}) ? sseUtf8(SAFE_RU) : textUtf8(SAFE_RU)
  }
}

export async function GET() {
  return jsonUtf8({
    ok: true,
    route: "/api/stream",
    status: "connected-to-api-ai-chat",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
  })
}