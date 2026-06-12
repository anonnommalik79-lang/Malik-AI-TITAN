export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SAFE_RU =
  "Р“РѕС‚РѕРІ РїРѕРјРѕС‡СЊ. РќР°РїРёС€Рё Р·Р°РґР°С‡Сѓ вЂ” РѕС‚РІРµС‡Сѓ РєРѕСЂРѕС‚РєРѕ Рё РїРѕ РґРµР»Сѓ."

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

function badText(text: string) {
  const value = String(text || "").trim()
  const commaCount = (value.match(/,/g) || []).length
  const perSpamCount = (value.match(/\bper[-\w]*/gi) || []).length

  return (
    !value ||
    /[ГђГ‘Гў]/.test(value) ||
    /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(value) ||
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(value) ||
    /^[,;:]/.test(value) ||
    commaCount >= 25 ||
    perSpamCount >= 5
  )
}

function cleanText(text: string) {
  const value = String(text || "").trim()
  return badText(value) ? SAFE_RU : value
}

function textResponse(text: string, status = 200) {
  return new Response(cleanText(text), {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function sseResponse(text: string) {
  const content = cleanText(text)

  const payload =
    `data: ${JSON.stringify({ type: "content", content })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  })
}

async function fromChatApi(origin: string, prompt: string, mode: string) {
  try {
    const res = await fetch(`${origin}/api/ai/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "accept": "application/json",
      },
      body: JSON.stringify({
        mode,
        prompt,
        stream: false,
      }),
      cache: "no-store",
    })

    if (!res.ok) return ""

    const data: any = await res.json().catch(() => null)
    const content = typeof data?.content === "string" ? data.content : ""

    return badText(content) ? "" : content.trim()
  } catch {
    return ""
  }
}

async function fromOpenRouter(prompt: string, mode: string) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return ""

    const model =
      mode === "code"
        ? process.env.TITAN_V65_OPENROUTER_CODE_MODEL ||
          process.env.OPENROUTER_CODE_MODEL ||
          "deepseek/deepseek-v4-pro"
        : process.env.TITAN_V65_OPENROUTER_CHAT_MODEL ||
          process.env.OPENROUTER_MODEL ||
          "deepseek/deepseek-v4-flash"

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
        temperature: 0.25,
        max_tokens: mode === "code" ? 2000 : 900,
        messages: [
          {
            role: "system",
            content:
              "You are MALIK AI V6.5 TITAN. Answer only in the user language. If the user writes Russian or Cyrillic, answer only in Russian. Never output mojibake, START, CURRENT USER, hidden context, keyword dumps, comma spam, or internal variables. Be direct, calm, premium, useful.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      cache: "no-store",
    })

    if (!res.ok) return ""

    const data: any = await res.json().catch(() => null)
    const content = data?.choices?.[0]?.message?.content
    const text = typeof content === "string" ? content : ""

    return badText(text) ? "" : text.trim()
  } catch {
    return ""
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prompt = pickPrompt(body)
    const mode = typeof body?.mode === "string" ? body.mode : "fast"

    if (!prompt) {
      return wantsSse(request, body) ? sseResponse(SAFE_RU) : textResponse(SAFE_RU)
    }

    const origin = new URL(request.url).origin

    let content = await fromChatApi(origin, prompt, mode)

    if (!content) {
      content = await fromOpenRouter(prompt, mode)
    }

    if (!content) {
      content = SAFE_RU
    }

    return wantsSse(request, body) ? sseResponse(content) : textResponse(content)
  } catch {
    return textResponse(SAFE_RU)
  }
}

export async function GET() {
  return jsonResponse({
    ok: true,
    route: "/api/stream",
    status: "hyper-god-ready",
    primary: "/api/ai/chat",
    fallback: "direct-openrouter",
    model: "deepseek/deepseek-v4-flash",
  })
}