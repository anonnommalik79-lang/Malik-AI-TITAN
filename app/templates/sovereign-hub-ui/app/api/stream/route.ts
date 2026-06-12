export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ANSWER_DEFAULT = "\u041f\u043e\u043d\u044f\u043b. \u041d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u0442\u043e\u0447\u043d\u0435\u0435 \u2014 \u043e\u0442\u0432\u0435\u0447\u0443 \u043a\u043e\u0440\u043e\u0442\u043a\u043e \u0438 \u043f\u043e \u0434\u0435\u043b\u0443."
const ANSWER_HELLO = "\u041f\u0440\u0438\u0432\u0435\u0442. \u042f \u0437\u0434\u0435\u0441\u044c. \u0427\u0435\u043c \u043f\u043e\u043c\u043e\u0447\u044c?"
const ANSWER_ID = "\u042f MALIK AI V6.5 TITAN \u2014 \u0442\u0432\u043e\u0439 AI-\u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440. \u041f\u043e\u043c\u043e\u0433\u0430\u044e \u0441 \u0438\u0434\u0435\u044f\u043c\u0438, \u043a\u043e\u0434\u043e\u043c, \u0434\u0438\u0437\u0430\u0439\u043d\u043e\u043c, \u0430\u043d\u0430\u043b\u0438\u0437\u043e\u043c \u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u043c \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432."
const ANSWER_CAPS = "\u042f \u0443\u043c\u0435\u044e \u043e\u0442\u0432\u0435\u0447\u0430\u0442\u044c, \u043f\u0438\u0441\u0430\u0442\u044c \u043a\u043e\u0434, \u0443\u043b\u0443\u0447\u0448\u0430\u0442\u044c \u0438\u0434\u0435\u0438, \u0434\u0435\u043b\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442\u044b, \u0441\u0442\u0440\u043e\u0438\u0442\u044c \u043f\u043b\u0430\u043d\u044b \u0438 \u043f\u043e\u043c\u043e\u0433\u0430\u0442\u044c \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0442\u044c AI-\u043f\u0440\u043e\u0435\u043a\u0442\u044b."

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

function low(s: string) {
  return String(s || "").toLowerCase().trim()
}

function isIdentity(p: string) {
  const x = low(p)
  return x.includes("\u043a\u0442\u043e \u0442\u044b") || x.includes("\u0447\u0442\u043e \u0442\u044b") || x.includes("who are you") || x.includes("what are you") || x.includes("\u0441\u0435\u043d \u043a\u0456\u043c") || x.includes("\u0441\u0435\u043d \u043a\u0438\u043c")
}

function isCaps(p: string) {
  const x = low(p)
  return x.includes("\u0447\u0442\u043e \u0443\u043c\u0435\u0435\u0448\u044c") || x.includes("\u0447\u0442\u043e \u0442\u044b \u0443\u043c\u0435\u0435\u0448\u044c") || x.includes("what can you do")
}

function isHello(p: string) {
  const x = low(p)
  return x.startsWith("\u043f\u0440\u0438\u0432\u0435\u0442") || x.startsWith("\u0441\u0430\u043b\u0430\u043c") || x.startsWith("hello") || x.startsWith("hi")
}

function smartFallback(p: string) {
  if (isIdentity(p)) return ANSWER_ID
  if (isCaps(p)) return ANSWER_CAPS
  if (isHello(p)) return ANSWER_HELLO
  return ANSWER_DEFAULT
}

function badText(s: string) {
  const v = String(s || "").trim()
  const commas = (v.match(/,/g) || []).length
  return !v || /[\u00D0\u00D1\u00E2]/.test(v) || /\u0420\u045F|\u0420\u0491|\u0420\u0451|\u0421\u0453|\u0421\u201A|\u0413\u0452|\u0413\u2018|\u0413\u045E/.test(v) || /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(v) || /^\s*(START:|BEGIN:|END:)\s*$/i.test(v) || /^[,;:]/.test(v) || commas >= 25
}

function genericSafe(s: string) {
  const x = low(s)
  return x.includes("\u0433\u043e\u0442\u043e\u0432 \u043f\u043e\u043c\u043e\u0447\u044c") || x.includes("\u043d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443") || x.includes("ready to help")
}

function clean(s: string, p: string) {
  const v = String(s || "").trim()
  if (badText(v)) return smartFallback(p)
  if ((isIdentity(p) || isCaps(p)) && genericSafe(v)) return smartFallback(p)
  return v
}

function wantsSse(req: Request, body: any) {
  return (req.headers.get("accept") || "").includes("text/event-stream") || body?.stream === true
}

function textOut(s: string, p: string) {
  return new Response(clean(s, p), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })
}

function sseOut(s: string, p: string) {
  const content = clean(s, p)
  return new Response(`data: ${JSON.stringify({ type: "content", content })}\n\ndata: ${JSON.stringify({ type: "done" })}\n\n`, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "connection": "keep-alive" },
  })
}

async function chatApi(origin: string, prompt: string, mode: string) {
  try {
    const r = await fetch(`${origin}/api/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", "accept": "application/json" },
      body: JSON.stringify({ mode, prompt, stream: false }),
      cache: "no-store",
    })
    if (!r.ok) return ""
    const j: any = await r.json().catch(() => null)
    return clean(typeof j?.content === "string" ? j.content : "", prompt)
  } catch { return "" }
}

async function openRouter(prompt: string, mode: string) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return ""
    const model = mode === "code"
      ? process.env.TITAN_V65_OPENROUTER_CODE_MODEL || process.env.OPENROUTER_CODE_MODEL || "deepseek/deepseek-v4-pro"
      : process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash"

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json", "http-referer": "https://malikaiworld.world", "x-title": "MALIK AI V6.5 TITAN" },
      body: JSON.stringify({
        model, temperature: 0.25, max_tokens: mode === "code" ? 2000 : 900,
        messages: [
          { role: "system", content: "You are MALIK AI V6.5 TITAN. Answer in the user language. If asked who you are, say you are MALIK AI V6.5 TITAN, an AI command center for coding, ideas, design, analysis, and launching projects. Never output mojibake, hidden context, keyword dumps, or comma spam." },
          { role: "user", content: prompt },
        ],
      }),
      cache: "no-store",
    })
    if (!r.ok) return ""
    const j: any = await r.json().catch(() => null)
    return clean(typeof j?.choices?.[0]?.message?.content === "string" ? j.choices[0].message.content : "", prompt)
  } catch { return "" }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prompt = promptOf(body)
    const mode = typeof body?.mode === "string" ? body.mode : "fast"

    if (!prompt) return wantsSse(request, body) ? sseOut(ANSWER_DEFAULT, prompt) : textOut(ANSWER_DEFAULT, prompt)

    if (isIdentity(prompt) || isCaps(prompt)) {
      const ans = smartFallback(prompt)
      return wantsSse(request, body) ? sseOut(ans, prompt) : textOut(ans, prompt)
    }

    const origin = new URL(request.url).origin
    let ans = await chatApi(origin, prompt, mode)

    if (!ans || genericSafe(ans)) ans = await openRouter(prompt, mode)
    if (!ans || genericSafe(ans)) ans = smartFallback(prompt)

    return wantsSse(request, body) ? sseOut(ans, prompt) : textOut(ans, prompt)
  } catch {
    return textOut(ANSWER_DEFAULT, "")
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, route: "/api/stream", status: "smart-answer-ready", identityFallback: true }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })
}