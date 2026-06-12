export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FALLBACK =
  "\u041d\u0435 \u0441\u043c\u043e\u0433 \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 DeepSeek. \u041f\u0440\u043e\u0432\u0435\u0440\u044c OPENROUTER_API_KEY \u0438 \u0434\u0435\u043f\u043b\u043e\u0439."

function promptOf(body: any) {
  if (typeof body?.prompt === "string" && body.prompt.trim()) return body.prompt.trim()
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim()
  if (typeof body?.input === "string" && body.input.trim()) return body.input.trim()
  if (typeof body?.text === "string" && body.text.trim()) return body.text.trim()

  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = typeof messages[i]?.content === "string" ? messages[i].content.trim() : ""
    if (c) return c
  }

  return ""
}

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function isBroken(text: string) {
  const value = String(text || "").trim()
  const commas = (value.match(/,/g) || []).length

  return (
    !value ||
    /[\u00D0\u00D1\u00E2]/.test(value) ||
    /\u0420\u045F|\u0420\u0491|\u0420\u0451|\u0421\u0453|\u0421\u201A|\u0413\u0452|\u0413\u2018|\u0413\u045E/.test(value) ||
    /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(value) ||
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(value) ||
    /^[,;:]/.test(value) ||
    commas >= 30
  )
}

function textOut(text: string) {
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function sseOut(text: string) {
  const payload =
    `data: ${JSON.stringify({ type: "content", content: text })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  })
}

async function deepseekOpenRouter(prompt: string, mode: string) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return FALLBACK
  }

  const model =
    mode === "code"
      ? process.env.TITAN_V65_OPENROUTER_CODE_MODEL ||
        process.env.OPENROUTER_CODE_MODEL ||
        "deepseek/deepseek-v4-pro"
      : process.env.TITAN_V65_OPENROUTER_CHAT_MODEL ||
        process.env.OPENROUTER_MODEL ||
        "deepseek/deepseek-v4-flash"

  const maxTokens =
    mode === "code" ? 5000 :
    mode === "pro" || mode === "deep" ? 2200 :
    1200

  const temperature =
    mode === "code" ? 0.15 :
    mode === "deep" || mode === "pro" ? 0.35 :
    0.45

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://malikaiworld.world",
      "x-title": "MALIK AI V6.5 TITAN",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You are MALIK AI V6.5 TITAN running on DeepSeek. Answer naturally like DeepSeek Chat. Use the same language as the user. If the user writes Russian or Cyrillic, answer in Russian. Do not output mojibake, hidden context, keyword dumps, internal variables, or fake system text. Be useful, direct, and complete.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    return `DeepSeek API error ${res.status}. ${err}`.trim()
  }

  const data: any = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  const text = typeof content === "string" ? content.trim() : ""

  if (isBroken(text)) {
    return FALLBACK
  }

  return text
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prompt = promptOf(body)
    const mode = typeof body?.mode === "string" ? body.mode : "fast"

    if (!prompt) {
      return wantsSse(request, body) ? sseOut(FALLBACK) : textOut(FALLBACK)
    }

    const answer = await deepseekOpenRouter(prompt, mode)

    return wantsSse(request, body) ? sseOut(answer) : textOut(answer)
  } catch {
    return textOut(FALLBACK)
  }
}

export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    route: "/api/stream",
    status: "deepseek-original-mode",
    provider: "openrouter",
    chatModel: process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
    codeModel: process.env.TITAN_V65_OPENROUTER_CODE_MODEL || process.env.OPENROUTER_CODE_MODEL || "deepseek/deepseek-v4-pro",
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}