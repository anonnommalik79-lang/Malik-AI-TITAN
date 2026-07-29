const WINDOW_MS = 5 * 60 * 1000
const MAX_REQUESTS = 30
const MAX_BODY_BYTES = 64 * 1024
const MAX_MESSAGES = 24
const MAX_MESSAGE_CHARS = 6000

const buckets = new Map<string, { count: number; resetAt: number }>()

export type RequestGate = {
  ok: boolean
  status: number
  error?: string
  remaining: number
  resetAt: number
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown"
}

function consumeRateLimit(key: string) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + WINDOW_MS }
    buckets.set(key, next)
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: next.resetAt }
  }

  current.count += 1
  buckets.set(key, current)
  return {
    allowed: current.count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - current.count),
    resetAt: current.resetAt,
  }
}

function originAllowed(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return true

  try {
    const requestHost = new URL(request.url).host
    const originHost = new URL(origin).host
    const configured = String(process.env.MALIK_ALLOWED_ORIGINS || process.env.MALIK_SITE_URL || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .some((item) => {
        try {
          return new URL(item).host === originHost
        } catch {
          return false
        }
      })
    return originHost === requestHost || configured
  } catch {
    return false
  }
}

export function gateAiRequest(request: Request): RequestGate {
  const rate = consumeRateLimit(clientKey(request))
  if (!originAllowed(request)) {
    return { ok: false, status: 403, error: "Origin not allowed", remaining: rate.remaining, resetAt: rate.resetAt }
  }

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body is too large", remaining: rate.remaining, resetAt: rate.resetAt }
  }

  if (!rate.allowed) {
    return { ok: false, status: 429, error: "Too many requests. Try again later.", remaining: 0, resetAt: rate.resetAt }
  }

  return { ok: true, status: 200, remaining: rate.remaining, resetAt: rate.resetAt }
}

function firstText(values: unknown[]) {
  return values.find((value) => typeof value === "string" && value.trim()) as string | undefined
}

export function latestUserText(body: any) {
  const direct = firstText([
    body?.originalQuestion,
    body?.prompt,
    body?.message,
    body?.question,
    body?.input,
    body?.text,
    body?.content,
  ])
  if (direct) return direct.trim()

  const messages = Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (item?.role === "user" && typeof item?.content === "string" && item.content.trim()) return item.content.trim()
  }
  return ""
}

function buildConversation(body: any, latest: string) {
  const source = Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : []
  const messages = source.slice(-MAX_MESSAGES)

  const transcript = messages
    .map((item: any) => {
      const role = item?.role === "assistant" ? "ASSISTANT" : item?.role === "system" ? "SYSTEM-CONTEXT" : "USER"
      const content = String(item?.content || "").trim().slice(0, MAX_MESSAGE_CHARS)
      return content ? `${role}: ${content}` : ""
    })
    .filter(Boolean)

  const modelQuestion = firstText([body?.question, body?.prompt, body?.message, latest])?.trim() || latest
  const lastUser = [...messages].reverse().find((item: any) => item?.role === "user" && typeof item?.content === "string")
  if (!lastUser || String(lastUser.content).trim() !== latest.trim()) transcript.push(`USER: ${modelQuestion.slice(0, MAX_MESSAGE_CHARS)}`)

  if (transcript.length < 2) return modelQuestion

  return [
    "Use the following conversation history. Preserve earlier facts and instructions unless they conflict with system rules.",
    "The final USER entry is the current request.",
    "--- CONVERSATION ---",
    ...transcript,
    "--- END CONVERSATION ---",
  ].join("\n\n")
}

export function isChangingFact(prompt: string) {
  return /(сейчас|сегодня|актуальн|последн|новост|кто президент|кто ceo|current|latest|today|now|president|minister|ceo|price|weather|курс валют|расписание)/i.test(prompt)
}

function isGovernmentOfficeQuery(prompt: string) {
  return /(президент|министр|правительство|president|minister|government|white house|ақорда|акорда)/i.test(prompt)
}

function hasOfficialGovernmentSource(answer: any) {
  const domains = Array.isArray(answer?.sources) ? answer.sources.map((item: any) => String(item?.domain || "").toLowerCase()) : []
  return domains.some((domain: string) =>
    domain.endsWith(".gov") ||
    domain.endsWith(".gov.kz") ||
    domain === "whitehouse.gov" ||
    domain.endsWith(".whitehouse.gov") ||
    domain === "akorda.kz" ||
    domain.endsWith(".akorda.kz") ||
    domain.endsWith(".europa.eu")
  )
}

export function prepareAiBody(body: any) {
  const latest = latestUserText(body)
  if (!latest) return { ok: false as const, error: "Prompt is required", latest: "", body: {} }

  let prompt = buildConversation(body, latest)
  if (isChangingFact(latest)) {
    const today = new Date().toISOString().slice(0, 10)
    prompt = `CURRENT DATE: ${today}. For changing facts, prioritize official and recent sources, reject stale sources, and state uncertainty when verification fails.\n\n${prompt}`
  }

  const safeBody = { ...body, prompt }
  delete safeBody.isAdmin
  delete safeBody.isCreator
  delete safeBody.mediaProAccessCode
  delete safeBody.admin
  delete safeBody.owner

  return { ok: true as const, latest, body: safeBody }
}

export function applyFreshnessGuard(answer: any, latestPrompt: string) {
  if (!isChangingFact(latestPrompt)) return answer

  const sources = Array.isArray(answer?.sources) ? answer.sources : []
  if (answer?.usedWeb !== true || sources.length === 0) {
    return {
      ...answer,
      content: "Не удалось надёжно подтвердить актуальный факт через живые источники. Я не буду выдавать старые данные как текущие — повторите запрос позже.",
    }
  }

  if (isGovernmentOfficeQuery(latestPrompt) && !hasOfficialGovernmentSource(answer)) {
    return {
      ...answer,
      content: "Я нашёл источники, но среди них нет официального государственного подтверждения. Поэтому не буду уверенно называть должностное лицо.",
    }
  }

  const asksUsPresident = /(президент\s+(сша|америки)|president\s+of\s+(the\s+)?(us|usa|united states))/i.test(latestPrompt)
  const staleBidenAnswer = /(джо\s+байден|joe\s+biden)/i.test(String(answer?.content || ""))
  if (asksUsPresident && staleBidenAnswer) {
    return {
      ...answer,
      content: "Ответ заблокирован проверкой свежести: модель попыталась использовать устаревшие данные о президенте США. Нужна повторная проверка по официальному сайту White House.",
    }
  }

  return answer
}

export function rateHeaders(gate: RequestGate) {
  return {
    "x-ratelimit-remaining": String(gate.remaining),
    ...(gate.status === 429
      ? { "retry-after": String(Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 1000))) }
      : {}),
  }
}
