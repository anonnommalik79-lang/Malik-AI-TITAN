import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { GET as originalGET, POST as originalPOST } from "./route-impl"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MALIK_ADMIN_COMMAND = "/malik"

function extractPrompt(body: any) {
  for (const key of ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]) {
    const value = body?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const value = messages[index]?.content
    if (messages[index]?.role === "user" && typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function redactCredentialLikeText(value: unknown) {
  return String(value ?? "")
    .replace(/\bsk-(?:proj-)?[a-z0-9_-]{12,}\b/gi, "sk-[REDACTED]")
    .replace(/\bgh[pousr]_[a-z0-9]{20,}\b/gi, "gh_[REDACTED]")
    .replace(/\b(Bearer\s+)[a-z0-9._~+\/-]{20,}/gi, "$1[REDACTED]")
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|password|пароль|секрет|ключ)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
}

function markdownQuote(value: unknown) {
  const clean = redactCredentialLikeText(value).trim() || "(пустой запрос)"
  return clean.split(/\r?\n/).map((line) => `> ${line}`).join("\n")
}

function formatAlmatyDate(value: unknown) {
  const parsed = new Date(String(value || ""))
  if (!Number.isFinite(parsed.getTime())) return "дата неизвестна"
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed)
}

async function founderApiJson(request: Request, path: string) {
  const headers = new Headers({ Accept: "application/json" })
  const cookie = request.headers.get("cookie")
  const authorization = request.headers.get("authorization")
  if (cookie) headers.set("cookie", cookie)
  if (authorization) headers.set("authorization", authorization)

  const response = await fetch(new URL(path, request.url), {
    method: "GET",
    headers,
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({})) as any
  if (!response.ok || payload?.ok === false) {
    const detail = String(payload?.error || payload?.message || response.statusText || response.status)
    throw new Error(`${path}: ${detail}`)
  }
  return payload
}

async function buildFounderCommandAnswer(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return "Команда `/malik` доступна только владельцу MALIK AI."
  }

  const [overview, activity] = await Promise.all([
    founderApiJson(request, "/api/founder/overview"),
    founderApiJson(request, "/api/founder/activity"),
  ])

  const users = Array.isArray(overview?.recentUsers) ? overview.recentUsers : []
  const items = Array.isArray(activity?.items) ? activity.items : []
  const grouped = new Map<string, any[]>()

  for (const item of items) {
    const key = String(item?.userEmail || item?.userId || "unknown").trim().toLowerCase()
    const list = grouped.get(key) || []
    list.push(item)
    grouped.set(key, list)
  }

  const lines: string[] = [
    "# MALIK · Founder Database",
    "",
    `**Зарегистрировано:** ${users.length}`,
    `**Сохранённых запросов:** ${Number(activity?.total || items.length)}`,
    `**Запросов сегодня:** ${Number(activity?.today || 0)}`,
    `**Хранилище истории:** ${String(activity?.storage || "unknown")}`,
    "",
    "## Пользователи",
    "",
  ]

  if (!users.length) lines.push("Пользователи не найдены.")

  users.forEach((user: any, index: number) => {
    const email = String(user?.email || "").trim().toLowerCase()
    const id = String(user?.id || "").trim()
    const name = String(user?.name || email || "Пользователь").trim()
    const logs = grouped.get(email) || grouped.get(id.toLowerCase()) || []
    const flags = [
      user?.emailVerified ? "verified" : "unverified",
      user?.activeToday ? "active today" : "",
      user?.registeredToday ? "registered today" : "",
    ].filter(Boolean).join(" · ")

    lines.push(`${index + 1}. **${name}** — \`${email || "email unavailable"}\``)
    lines.push(`   ID: \`${id || "unknown"}\` · запросов в журнале: **${logs.length}**${flags ? ` · ${flags}` : ""}`)
    if (user?.createdAt) lines.push(`   Регистрация: ${formatAlmatyDate(user.createdAt)}`)
    if (user?.lastSignInAt) lines.push(`   Последний вход: ${formatAlmatyDate(user.lastSignInAt)}`)
    lines.push("")
  })

  lines.push("## Все запросы пользователей", "")

  if (!items.length) {
    lines.push("В серверном журнале пока нет сохранённых запросов. Новые запросы основного чата сохраняются автоматически.")
  } else {
    ;[...grouped.entries()].forEach(([key, logs], groupIndex) => {
      const first = logs[0] || {}
      const name = String(first?.userName || key || "Пользователь")
      const email = String(first?.userEmail || key || "")
      lines.push(`### ${groupIndex + 1}. ${name} — \`${email}\` · ${logs.length}`)
      lines.push("")
      logs.forEach((item: any, index: number) => {
        lines.push(`**${index + 1}. ${formatAlmatyDate(item?.createdAt)} · ${String(item?.source || "chat")}**`)
        lines.push(markdownQuote(item?.userText))
        lines.push("")
      })
    })
  }

  const warnings = [overview?.warning, activity?.warning]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
  if (warnings.length) lines.push("---", `⚠️ ${warnings.join(" · ")}`)

  lines.push("", "Credentials и похожие на секреты значения автоматически маскируются в этой выдаче.")
  return lines.join("\n")
}

function textResponse(content: string) {
  return new Response(content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-router": "malik-founder-command",
    },
  })
}

function sseResponse(content: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: content\ndata: ${JSON.stringify({ type: "content", content, at: Date.now() })}\n\n`))
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({
        type: "done",
        provider: "malik-founder-core",
        model: "malik-founder-command",
        selectedModelId: "malik-founder-command",
        usedWeb: false,
        sources: [],
        webSourceCount: 0,
        tookMs: 0,
        at: Date.now(),
      })}\n\n`))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-malik-router": "malik-founder-command",
    },
  })
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.clone().json()
  } catch {
    return originalPOST(request)
  }

  if (extractPrompt(body).trim().toLowerCase() !== MALIK_ADMIN_COMMAND) {
    return originalPOST(request)
  }

  try {
    const content = await buildFounderCommandAnswer(request)
    return wantsSse(request, body) ? sseResponse(content) : textResponse(content)
  } catch (error) {
    console.error("[MALIK FOUNDER COMMAND]", error instanceof Error ? error.message : String(error))
    return Response.json({
      ok: false,
      error: "FOUNDER_COMMAND_FAILED",
      message: "Не удалось загрузить Founder Database. Попробуйте ещё раз.",
    }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    })
  }
}

export async function GET() {
  return originalGET()
}
