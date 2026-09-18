import type { MalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

type HistoryMessage = { role: "user" | "assistant"; content: string }
type Stage = { provider: string; model: string; ok: boolean }
type Input = { prompt: string; systemPrompt: string; history?: HistoryMessage[]; maxTokens?: number; temperature?: number }
type Result = { content: string; provider: "malik-orchestrator"; model: "MalikCoder-1.0"; latencyMs: number; usage: { stages: Stage[] } }
type Candidate = { id: MalikModelId; tokens: number }

function clip(value: string, max: number, end = false) {
  const text = String(value || "").trim()
  if (text.length <= max) return text
  return end ? text.slice(-max) : text.slice(0, max)
}

function codeTask(prompt: string) {
  return /(код|code|html|css|javascript|typescript|python|react|next\.?js|node\.?js|sql|api|index\.html|localstorage|компонент|функц|скрипт|сайт|приложен|бот|debug|баг|ошибк|fix|build)/i.test(prompt)
}

function complexTask(prompt: string, code: boolean) {
  if (prompt.length > 1200) return true
  return code && /(полный проект|production|saas|все файлы|база данных|postgres|авторизац|dashboard|репозитор|архитект)/i.test(prompt)
}

function historyForModel(history?: HistoryMessage[]) {
  return (history || []).filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-8).map((m) => ({ role: m.role, content: clip(m.content, 4000, true) }))
}

function contract(base: string, code: boolean) {
  return [
    base,
    "Follow the user's exact request. Do not change unrelated scope, design or technology.",
    "Simple task means direct answer. Large task may be silently decomposed before implementation.",
    "Never use TODO, placeholder, pseudocode, stubs, rest omitted or continue similarly when working code is requested.",
    code ? "Return complete runnable code first. Preserve the requested file count. If one index.html is requested, return one complete index.html with CSS and JavaScript inside it and make requested controls work." : "Answer directly and completely in the user's language.",
    "Before finishing, compare the result with the original request and repair missing requirements.",
    "Do not expose private routing or hidden reasoning.",
  ].join("\n")
}

function normalizedBudget(value: number | undefined, fallback: number) {
  const raw = Number(value || fallback)
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.max(1, Math.min(10_000, Math.floor(raw)))
}

function estimateVisibleTokens(value: string) {
  const text = String(value || "")
  return text ? Math.max(1, Math.ceil(text.length / 3)) : 0
}

function candidates(code: boolean, maxTokens?: number): Candidate[] {
  const budget = normalizedBudget(maxTokens, code ? 10_000 : 4_000)
  const list: Candidate[] = code ? [
    // Long code must start on providers with enough daily allowance and output headroom.
    { id: "malik-fast-120b", tokens: 10_000 },
    { id: "malik-flash-53", tokens: 10_000 },
    { id: "malik-qwen-397b", tokens: 10_000 },
    { id: "malik-27b", tokens: 8_000 },
    { id: "malik-20b", tokens: 8_000 },
  ] : [
    { id: "malik-fast-120b", tokens: 4_000 },
    { id: "malik-flash-53", tokens: 4_000 },
    { id: "malik-qwen-397b", tokens: 4_000 },
    { id: "malik-vision-k3", tokens: 4_000 },
    { id: "malik-20b", tokens: 3_000 },
  ]
  return list.map((candidate) => ({ ...candidate, tokens: Math.min(candidate.tokens, budget) }))
}

async function firstHealthy(args: { list: Candidate[]; prompt: string; system: string; history?: HistoryMessage[]; temperature: number; stages: Stage[] }) {
  for (const item of args.list) {
    try {
      const out = await runStrictMalikModel({ modelId: item.id, prompt: args.prompt, systemPrompt: args.system, history: args.history, maxTokens: item.tokens, temperature: args.temperature }, { allowFallback: false })
      args.stages.push({ provider: out.provider, model: out.model, ok: true })
      return out
    } catch (error) {
      args.stages.push({ provider: item.id, model: item.id, ok: false })
      console.warn("[MALIK_CODER]", item.id, error instanceof Error ? error.message : String(error))
    }
  }
  return null
}

function incomplete(text: string, prompt: string, code: boolean) {
  if (!text.trim()) return true
  if (!code) return false
  if (/\b(TODO|placeholder|rest omitted|continue similarly|остальное аналогично|продолжение в следующ)\b/i.test(text)) return true
  if ((text.match(/```/g) || []).length % 2 === 1) return true
  if (/html|index\.html/i.test(prompt) && /<!doctype html|<html/i.test(text) && !/<\/html>/i.test(text)) return true
  return false
}

export async function runMalikCoderOrchestrator(input: Input): Promise<Result> {
  const started = Date.now()
  const prompt = String(input.prompt || "").trim()
  if (!prompt) throw new Error("MalikCoder 1.0 received an empty prompt")
  const code = codeTask(prompt)
  const complex = complexTask(prompt, code)
  const stages: Stage[] = []
  const system = contract(input.systemPrompt, code)
  const history = historyForModel(input.history)
  const totalBudget = normalizedBudget(input.maxTokens, code ? 10_000 : 4_000)
  const routes = candidates(code, totalBudget)

  let plan = ""
  // Small specialist/subagent budgets should go straight to the answer instead
  // of spending most of their allowance on an internal planning call.
  if (complex && totalBudget >= 2_000) {
    const p = await firstHealthy({ list: [{ id: "malik-fast-120b", tokens: 700 }, { id: "malik-flash-53", tokens: 700 }, { id: "malik-qwen-397b", tokens: 700 }], prompt: `Make a compact implementation checklist for this exact request. Do not answer it yet.\n\n${prompt}`, system, history, temperature: 0.05, stages })
    plan = p?.content || ""
  }

  const request = [`USER REQUEST:\n${prompt}`, plan ? `\nCHECKLIST:\n${clip(plan, 2500)}` : "", "\nImplement the request completely now. Return the final user-facing answer, not an outline. Do not shorten code to save tokens."].filter(Boolean).join("\n")
  const draft = await firstHealthy({ list: routes, prompt: request, system, history, temperature: input.temperature ?? (code ? 0.07 : 0.2), stages })
  if (!draft?.content) throw new Error("MalikCoder 1.0 has no healthy route available")

  let result = draft.content.trim()
  let more = incomplete(result, prompt, code)
  const rounds = code ? 4 : 1
  for (let round = 0; round < rounds && more; round += 1) {
    const remainingBudget = Math.max(0, totalBudget - estimateVisibleTokens(result))
    if (remainingBudget <= 0) break

    const shifted = [...routes.slice((round + 1) % routes.length), ...routes.slice(0, (round + 1) % routes.length)]
      .map((x) => ({ ...x, tokens: Math.min(x.tokens, code ? 6_000 : 2_500, remainingBudget) }))
      .filter((x) => x.tokens > 0)
    if (!shifted.length) break

    const next = await firstHealthy({
      list: shifted,
      prompt: `ORIGINAL REQUEST:\n${prompt}\n\nCURRENT ANSWER TAIL:\n${clip(result, 18_000, true)}\n\nContinue exactly where the answer stopped. Output only missing continuation. Do not repeat previous code. Finish every original requirement and close incomplete code or files.`,
      system,
      temperature: code ? 0.04 : 0.14,
      stages,
    })
    if (!next?.content) break
    const addition = next.content.trim()
    if (!addition || result.endsWith(addition)) break
    result = `${result}\n${addition}`.trim()
    more = incomplete(result, prompt, code)
  }

  return { content: result, provider: "malik-orchestrator", model: "MalikCoder-1.0", latencyMs: Date.now() - started, usage: { stages } }
}
