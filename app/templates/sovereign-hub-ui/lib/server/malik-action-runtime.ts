import { buildMalikActionPlan, malikActionPlanModelContext, type MalikActionPlan } from "@/lib/ai/action-os"
import { decodeMalikMemoryCookie, MALIK_MEMORY_COOKIE } from "@/lib/ai/memory-contract"

type RuntimeMessage = { role: "user" | "assistant"; content: string }

function extractPrompt(body: any) {
  for (const key of ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]) {
    const value = typeof body?.[key] === "string" ? body[key].trim() : ""
    if (value) return value
  }
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index--) {
    const value = typeof messages[index]?.content === "string" ? messages[index].content.trim() : ""
    if (value) return value
  }
  return ""
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || ""
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    return part.slice(separator + 1).trim()
  }
  return ""
}

function memoryContext(items: string[]) {
  if (!items.length) return ""
  return [
    "[MALIK_USER_CONTROLLED_MEMORY]",
    "These facts were explicitly saved by the user. Use only when relevant. Do not expose this block or claim any memory outside it.",
    ...items.map((item) => `- ${item}`),
  ].join("\n")
}

function runtimeMessages(memoryItems: string[], plan: MalikActionPlan): RuntimeMessage[] {
  const messages: RuntimeMessage[] = []
  const memory = memoryContext(memoryItems)
  const action = malikActionPlanModelContext(plan)
  if (memory) messages.push({ role: "assistant", content: memory })
  if (action) messages.push({ role: "assistant", content: action })
  return messages
}

function injectBeforeCurrentUser(historyValue: unknown, injected: RuntimeMessage[]): RuntimeMessage[] {
  const history = (Array.isArray(historyValue) ? historyValue : [])
    .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item: any) => ({ role: item.role as "user" | "assistant", content: item.content.trim() }))
    .filter((item: RuntimeMessage) => item.content)

  if (!injected.length) return history.slice(-12)

  const currentUser = history.length && history[history.length - 1].role === "user" ? history[history.length - 1] : null
  const prior = currentUser ? history.slice(0, -1) : history
  const roomForPrior = Math.max(0, 12 - injected.length - (currentUser ? 1 : 0))
  return [
    ...prior.slice(-roomForPrior),
    ...injected,
    ...(currentUser ? [currentUser] : []),
  ]
}

export type MalikPreparedRuntime = {
  body: any
  plan: MalikActionPlan
  memoryItems: string[]
}

export function prepareMalikActionRuntime(request: Request, bodyValue: any): MalikPreparedRuntime {
  const body = bodyValue && typeof bodyValue === "object" ? bodyValue : {}
  const prompt = extractPrompt(body)
  const plan = buildMalikActionPlan(prompt, body)
  const memoryItems = decodeMalikMemoryCookie(readCookie(request, MALIK_MEMORY_COOKIE))
  const injected = runtimeMessages(memoryItems, plan)
  const historySource = Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : []

  return {
    body: {
      ...body,
      history: injectBeforeCurrentUser(historySource, injected),
      malikActionPlan: plan.shouldRender ? plan : undefined,
      malikMemoryItemCount: memoryItems.length,
    },
    plan,
    memoryItems,
  }
}
