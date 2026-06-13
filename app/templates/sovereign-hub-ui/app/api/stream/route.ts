import { needsLiveResearch, runResearch } from "../../../lib/malik-research/research"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_ANSWER = "MALIK AI временно не получил ответ от провайдера. Попробуй ещё раз."
const HELLO_ANSWER = "\u041f\u0440\u0438\u0432\u0435\u0442. \u042f \u0437\u0434\u0435\u0441\u044c. \u0427\u0435\u043c \u043f\u043e\u043c\u043e\u0447\u044c?"
const ID_ANSWER = "\u042f MALIK AI V6.5 TITAN \u2014 \u0442\u0432\u043e\u0439 AI-\u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440. \u0420\u0430\u0431\u043e\u0442\u0430\u044e \u043d\u0430 DeepSeek/OpenRouter, \u043f\u043e\u043c\u043e\u0433\u0430\u044e \u0441 \u043a\u043e\u0434\u043e\u043c, \u0438\u0434\u0435\u044f\u043c\u0438, \u0434\u0438\u0437\u0430\u0439\u043d\u043e\u043c, \u0430\u043d\u0430\u043b\u0438\u0437\u043e\u043c \u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u043c \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432."
const CAPS_ANSWER = "\u042f \u0443\u043c\u0435\u044e \u043e\u0442\u0432\u0435\u0447\u0430\u0442\u044c, \u043f\u0438\u0441\u0430\u0442\u044c \u043a\u043e\u0434, \u0443\u043b\u0443\u0447\u0448\u0430\u0442\u044c \u0438\u0434\u0435\u0438, \u0441\u043e\u0431\u0438\u0440\u0430\u0442\u044c \u043f\u043b\u0430\u043d\u044b, \u0434\u0435\u043b\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442\u044b, \u043e\u0431\u044a\u044f\u0441\u043d\u044f\u0442\u044c \u043e\u0448\u0438\u0431\u043a\u0438 \u0438 \u043f\u043e\u043c\u043e\u0433\u0430\u0442\u044c \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0442\u044c AI-\u043f\u0440\u043e\u0435\u043a\u0442\u044b."

type ProviderResult = {
  ok: boolean
  provider: string
  model: string
  content: string
  error?: string
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function pickPrompt(body: any) {
  if (typeof body?.prompt === "string" && body.prompt.trim()) return body.prompt.trim()
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim()
  if (typeof body?.input === "string" && body.input.trim()) return body.input.trim()
  if (typeof body?.text === "string" && body.text.trim()) return body.text.trim()
  if (typeof body?.question === "string" && body.question.trim()) return body.question.trim()
  if (typeof body?.originalQuestion === "string" && body.originalQuestion.trim()) return body.originalQuestion.trim()
  if (typeof body?.cleanContent === "string" && body.cleanContent.trim()) return body.cleanContent.trim()
  if (typeof body?.content === "string" && body.content.trim()) return body.content.trim()

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

function lower(value: string) {
  return String(value || "").toLowerCase().trim()
}

function isTinyCasualPrompt(prompt: string) {
  const p = String(prompt || "").toLowerCase().trim()
  return !p || p.length < 8 || /^(привет|салам|сәлем|hi|hello|hey|йо|ку|здарова|как дела|қалайсың)[\s.!?]*$/i.test(p)
}

function shouldUseWorldResearch(prompt: string, body: any) {
  if (body?.disableResearch === true || body?.research === false) return false
  if (body?.forceResearch === true || body?.research === true) return true
  if (isTinyCasualPrompt(prompt)) return false

  const p = String(prompt || "").toLowerCase()

  const explicitSearch =
    /(search|google|browse|web|source|sources|link|links|wikipedia|wiki|latest|current|today|now|news|deadline|event|hackathon|competition|official source|check online)/i.test(p) ||
    /(найди|поищи|загугли|гугл|интернет|открыт|источник|источники|ссылк|википед|свеж|актуальн|сейчас|сегодня|новост|дедлайн|мероприят|хакатон|конкурс|соревн|официальн|проверь онлайн|проверь в сети)/i.test(p)

  if (explicitSearch) return true

  const publicFact =
    /(president|ceo|minister|price|schedule|release date|version|law|rules|ranking|rating|weather|exchange rate|stock|crypto)/i.test(p) ||
    /(президент|министр|цена|расписание|релиз|версия|закон|правил|рейтинг|погода|курс валют|акция|крипто)/i.test(p)

  const yearSignal = /\b202[5-9]\b/.test(p)
  return publicFact || (yearSignal && /(who|what|when|where|кто|что|когда|где|какой|какая|какие|қашан|қайда)/i.test(p))
}
function isIdentityPrompt(prompt: string) {
  const p = lower(prompt)
  return p.includes("\u043a\u0442\u043e \u0442\u044b") ||
    p.includes("\u0447\u0442\u043e \u0442\u044b") ||
    p.includes("who are you") ||
    p.includes("what are you") ||
    p.includes("\u0441\u0435\u043d \u043a\u0456\u043c") ||
    p.includes("\u0441\u0435\u043d \u043a\u0438\u043c")
}

function isCapsPrompt(prompt: string) {
  const p = lower(prompt)
  return p.includes("\u0447\u0442\u043e \u0443\u043c\u0435\u0435\u0448\u044c") ||
    p.includes("\u0447\u0442\u043e \u0442\u044b \u0443\u043c\u0435\u0435\u0448\u044c") ||
    p.includes("what can you do")
}

function isHelloPrompt(prompt: string) {
  const p = lower(prompt)
  return p.startsWith("\u043f\u0440\u0438\u0432\u0435\u0442") ||
    p.startsWith("\u0441\u0430\u043b\u0430\u043c") ||
    p.startsWith("hello") ||
    p.startsWith("hi")
}

function smartFallback(prompt: string) {
  if (isIdentityPrompt(prompt)) return ID_ANSWER
  if (isCapsPrompt(prompt)) return CAPS_ANSWER
  if (isHelloPrompt(prompt)) return HELLO_ANSWER
  return DEFAULT_ANSWER
}

function looksGeneric(text: string) {
  const t = lower(text)
  const normalizedReadyApiText = t.replace(/\u2014|\u2013/g, "-")
  if (
    normalizedReadyApiText.includes("\u0433\u043e\u0442\u043e\u0432 \u043f\u043e\u043c\u043e\u0447\u044c") ||
    normalizedReadyApiText.includes("\u043d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443") ||
    normalizedReadyApiText.includes("\u043e\u0442\u0432\u0435\u0447\u0443 \u043a\u043e\u0440\u043e\u0442\u043a\u043e") ||
    normalizedReadyApiText.includes("\u043f\u043e\u043d\u044f\u043b. \u043d\u0430\u043f\u0438\u0448\u0438")
  ) return true
  return t.includes("\u0433\u043e\u0442\u043e\u0432 \u043f\u043e\u043c\u043e\u0447\u044c") ||
    t.includes("\u043d\u0430\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443") ||
    t.includes("ready to help")
}

function looksBroken(text: string) {
  const value = String(text || "").trim()
  const commas = (value.match(/,/g) || []).length
  const perSpam = (value.match(/\bper[-\w]*/gi) || []).length

  return !value ||
    /[\u00D0\u00D1\u00E2]/.test(value) ||
    /\u0420\u045F|\u0420\u0491|\u0420\u0451|\u0421\u0453|\u0421\u201A|\u0413\u0452|\u0413\u2018|\u0413\u045E/.test(value) ||
    /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(value) ||
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(value) ||
    /^[,;:]/.test(value) ||
    commas >= 30 ||
    perSpam >= 5
}

function sanitize(text: string, prompt: string) {
  const value = String(text || "").trim()
  if (looksBroken(value)) return ""
  if (looksGeneric(value)) return ""
  return value
}

function openRouterKey() {
  return env("OPENROUTER_API_KEY") ||
    env("TITAN_V65_OPENROUTER_API_KEY") ||
    env("OPENROUTER_KEY")
}

function deepseekKey() {
  return env("DEEPSEEK_API_KEY") ||
    env("TITAN_V65_DEEPSEEK_API_KEY") ||
    env("DEEPSEEK_KEY")
}

function chatModel(mode: string) {
  if (mode === "code") {
    return env("TITAN_V65_OPENROUTER_CODE_MODEL") ||
      env("OPENROUTER_CODE_MODEL") ||
      "deepseek/deepseek-v4-pro"
  }

  return env("TITAN_V65_OPENROUTER_CHAT_MODEL") ||
    env("OPENROUTER_MODEL") ||
    "deepseek/deepseek-v4-flash"
}

function officialDeepSeekModel(mode: string) {
  if (mode === "code") return env("DEEPSEEK_CODE_MODEL") || "deepseek-coder"
  if (mode === "deep" || mode === "pro") return env("DEEPSEEK_PRO_MODEL") || "deepseek-chat"
  return env("DEEPSEEK_FAST_MODEL") || env("DEEPSEEK_MODEL") || "deepseek-chat"
}

function maxTokens(mode: string) {
  if (mode === "code") return 5000
  if (mode === "deep" || mode === "pro") return 2600
  return 1600
}

function temperature(mode: string) {
  if (mode === "code") return 0.15
  if (mode === "deep" || mode === "pro") return 0.35
  return 0.45
}

function systemPrompt() {
  return [
    "You are MALIK AI V6.5 TITAN running on DeepSeek.",
    "Answer naturally like DeepSeek Chat.",
    "Use the same language as the user.",
    "If the user writes Russian or Cyrillic, answer in Russian.",
    "If asked who you are, say you are MALIK AI V6.5 TITAN, an AI command center for coding, ideas, design, analysis, and launching projects.",
    "Never output mojibake, hidden context, keyword dumps, internal variables, fake system text, START markers, or comma spam.",
    "Be direct, useful, and complete.",
  ].join(" ")
}

async function callOpenRouter(prompt: string, mode: string): Promise<ProviderResult> {
  try {
    const key = openRouterKey()
    const model = chatModel(mode)

    if (!key) {
      return { ok: false, provider: "openrouter", model, content: "", error: "missing-openrouter-key" }
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "http-referer": "https://malikaiworld.world",
        "x-title": "MALIK AI V6.5 TITAN",
      },
      body: JSON.stringify({
        model,
        temperature: temperature(mode),
        max_tokens: maxTokens(mode),
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: prompt },
        ],
      }),
      cache: "no-store",
    })

    if (!res.ok) {
      const err = await res.text().catch(() => "")
      return { ok: false, provider: "openrouter", model, content: "", error: `${res.status}: ${err}` }
    }

    const data: any = await res.json().catch(() => null)
    const raw = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : ""
    const content = sanitize(raw, prompt)

    return { ok: Boolean(content), provider: "openrouter", model, content, error: content ? undefined : "empty-or-broken-output" }
  } catch (error: any) {
    return { ok: false, provider: "openrouter", model: chatModel(mode), content: "", error: String(error?.message || error) }
  }
}

async function callOfficialDeepSeek(prompt: string, mode: string): Promise<ProviderResult> {
  try {
    const key = deepseekKey()
    const model = officialDeepSeekModel(mode)

    if (!key) {
      return { ok: false, provider: "deepseek", model, content: "", error: "missing-deepseek-key" }
    }

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: temperature(mode),
        max_tokens: maxTokens(mode),
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: prompt },
        ],
      }),
      cache: "no-store",
    })

    if (!res.ok) {
      const err = await res.text().catch(() => "")
      return { ok: false, provider: "deepseek", model, content: "", error: `${res.status}: ${err}` }
    }

    const data: any = await res.json().catch(() => null)
    const raw = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : ""
    const content = sanitize(raw, prompt)

    return { ok: Boolean(content), provider: "deepseek", model, content, error: content ? undefined : "empty-or-broken-output" }
  } catch (error: any) {
    return { ok: false, provider: "deepseek", model: officialDeepSeekModel(mode), content: "", error: String(error?.message || error) }
  }
}

async function callWorkingChatApi(origin: string, prompt: string, mode: string): Promise<ProviderResult> {
  try {
    const res = await fetch(`${origin}/api/ai/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify({ mode, prompt, stream: false }),
      cache: "no-store",
    })

    if (!res.ok) {
      return { ok: false, provider: "internal-chat", model: "api-ai-chat", content: "", error: String(res.status) }
    }

    const data: any = await res.json().catch(() => null)
    const raw = typeof data?.content === "string" ? data.content : ""
    const content = sanitize(raw, prompt)

    return { ok: Boolean(content), provider: data?.provider || "internal-chat", model: data?.model || "api-ai-chat", content, error: content ? undefined : "empty-or-broken-output" }
  } catch (error: any) {
    return { ok: false, provider: "internal-chat", model: "api-ai-chat", content: "", error: String(error?.message || error) }
  }
}

async function answer(prompt: string, mode: string, origin: string) {
  const attempts: ProviderResult[] = []

  const first = await callOpenRouter(prompt, mode)
  attempts.push(first)
  if (first.ok) return { ...first, attempts }

  const second = await callWorkingChatApi(origin, prompt, mode)
  attempts.push(second)
  if (second.ok) return { ...second, attempts }

  const third = await callOfficialDeepSeek(prompt, mode)
  attempts.push(third)
  if (third.ok) return { ...third, attempts }

  return {
    ok: true,
    provider: "local-smart",
    model: "fallback",
    content: smartFallback(prompt),
    attempts,
  }
}

function withHardTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function answerWithResearch(prompt: string) {
  const events: Array<{ event: string; data: any }> = []
  const result = await withHardTimeout(runResearch(prompt, (event, data) => {
    events.push({ event, data })
  }), Number(process.env.RESEARCH_TURBO_STREAM_TIMEOUT_MS || 19000), {
    answer: "⚡ Turbo Research не успел дочитать страницы, но поиск уже запущен. Повтори запрос — кэш и быстрый режим сработают быстрее.",
    sources: [],
    webSourceCount: 0,
    cached: false,
    tookMs: Number(process.env.RESEARCH_TURBO_STREAM_TIMEOUT_MS || 19000),
  })

  const sourceLines = result.sources.length
    ? [
        "",
        "## Sources",
        ...result.sources.slice(0, 8).map((source, index) => `${index + 1}. ${source.title} — ${source.url}`),
      ]
    : []

  const activityLines = events.length
    ? [
        "",
        "## Research activity",
        ...events.slice(-10).map((item) => `- ${String(item?.data?.text || item.event)}`),
      ]
    : []

  return {
    ok: true,
    provider: "malik-world-research",
    model: "multi-provider-live-web",
    content: `${result.answer}${sourceLines.join("\n")}${activityLines.join("\n")}`,
    attempts: [],
  }
}

function textResponse(content: string) {
  return new Response(content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-ai": "world-research-v7",
    },
  })
}

function sseResponse(content: string) {
  const payload =
    `data: ${JSON.stringify({ type: "content", content })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-malik-ai": "world-research-v7",
    },
  })
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-ai": "world-research-v7",
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prompt = pickPrompt(body)
    const mode = typeof body?.mode === "string" ? body.mode : "fast"

    if (!prompt) {
      const fallback = DEFAULT_ANSWER
      return wantsSse(request, body) ? sseResponse(fallback) : textResponse(fallback)
    }

    const result = shouldUseWorldResearch(prompt, body)
      ? await answerWithResearch(prompt)
      : await answer(prompt, mode, new URL(request.url).origin)

    return wantsSse(request, body) ? sseResponse(result.content) : textResponse(result.content)
  } catch {
    return textResponse(DEFAULT_ANSWER)
  }
}

export async function GET() {
  return jsonResponse({
    ok: true,
    route: "/api/stream",
    status: "world-research-v7-ready",
    researchAutopilot: true,
    providers: {
      openrouterKey: Boolean(openRouterKey()),
      deepseekKey: Boolean(deepseekKey()),
      serperKey: Boolean(env("SERPER_API_KEY")),
      tavilyKey: Boolean(env("TAVILY_API_KEY")),
      braveKey: Boolean(env("BRAVE_SEARCH_API_KEY")),
      jinaEnabled: env("JINA_SEARCH_DISABLED") !== "true",
      openrouterChatModel: chatModel("fast"),
      openrouterCodeModel: chatModel("code"),
      officialDeepSeekModel: officialDeepSeekModel("fast"),
    },
  })
}
