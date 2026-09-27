import { OsToolError } from "../failures"
import type { Artifact } from "../types"
import type { ToolContext } from "./contract"

/**
 * What tools share: reading the brief, the brand and the research that
 * earlier tasks produced, and turning a model's answer into JSON safely.
 */

export type Language = "ru" | "kk" | "en"

export type Brief = {
  title: string
  language: Language
  country: string
  industry: string
  idea: string
  audience: string
  problem: string
  solution: string
  businessModel: string
  deliverables: string[]
  queries: string[]
  constraints: string[]
}

export type Brand = {
  name: string
  tagline: string
  positioning: string
  audience: string
  values: string[]
  voice: string
  colors: { primary: string; secondary: string; accent: string; background: string; text: string }
  typography: string
  logoConcept: string
  nameRationale: string
}

export function languageOf(text: string): Language {
  if (/[әғқңөұүһі]/iu.test(text)) return "kk"
  if (/[а-яё]/iu.test(text)) return "ru"
  return "en"
}

export const LANGUAGE_NAME: Record<Language, string> = { ru: "русском", kk: "казахском", en: "английском" }

export function clip(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+\n/g, "\n").trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** The first JSON object or array in a model's answer, or null. */
export function extractJson(raw: string): unknown {
  const text = String(raw || "").replace(/```(?:json)?/gi, "").trim()
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = text.indexOf(open)
    const end = text.lastIndexOf(close)
    if (start < 0 || end <= start) continue
    const candidate = text.slice(start, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      // A trailing comma is the most common damage.
      try {
        return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"))
      } catch {
        /* try the other bracket kind */
      }
    }
  }
  return null
}

function str(value: unknown, max = 400) {
  return typeof value === "string" ? clip(value, max) : ""
}

function list(value: unknown, max = 8, itemMax = 200) {
  return Array.isArray(value) ? value.map((item) => str(item, itemMax)).filter(Boolean).slice(0, max) : []
}

const HEX = /^#[0-9a-f]{6}$/i

export function normalizeBrief(raw: unknown, goal: string): Brief | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const idea = str(value.idea, 600)
  const industry = str(value.industry, 120)
  if (!idea || !industry) return null
  const language = ["ru", "kk", "en"].includes(String(value.language)) ? value.language as Language : languageOf(goal)
  return {
    title: str(value.title, 120) || idea.slice(0, 80),
    language,
    country: str(value.country, 80),
    industry,
    idea,
    audience: str(value.audience, 400),
    problem: str(value.problem, 600),
    solution: str(value.solution, 600),
    businessModel: str(value.businessModel, 400),
    deliverables: list(value.deliverables, 10, 80),
    queries: list(value.queries, 4, 160),
    constraints: list(value.constraints, 8, 200),
  }
}

export function normalizeBrand(raw: unknown): Brand | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const name = str(value.name, 60).replace(/^["«]|["»]$/g, "")
  if (!name || name.length < 2) return null
  const colors = (value.colors && typeof value.colors === "object" ? value.colors : {}) as Record<string, unknown>
  const color = (key: string, fallback: string) => (HEX.test(String(colors[key] || "")) ? String(colors[key]).toLowerCase() : fallback)
  return {
    name,
    tagline: str(value.tagline, 160),
    positioning: str(value.positioning, 600),
    audience: str(value.audience, 400),
    values: list(value.values, 6, 80),
    voice: str(value.voice, 300),
    colors: {
      primary: color("primary", "#111111"),
      secondary: color("secondary", "#f4f4f4"),
      accent: color("accent", "#2f6f4f"),
      background: color("background", "#ffffff"),
      text: color("text", "#111111"),
    },
    typography: str(value.typography, 160),
    logoConcept: str(value.logoConcept, 500),
    nameRationale: str(value.nameRationale, 400),
  }
}

/** The brief from the "understand" step. It always exists once that step completed. */
export function briefOf(context: ToolContext): Brief | null {
  const output = context.dependency("understand")
  const artifact = output?.artifacts[0]
  const brief = artifact?.metadata?.brief
  return brief && typeof brief === "object" ? brief as Brief : null
}

export function brandOf(context: ToolContext): Brand | null {
  const artifact = context.dependency("brand")?.artifacts[0] || context.inputs.find((item) => item.metadata?.role === "brand")
  const brand = artifact?.metadata?.brand
  return brand && typeof brand === "object" ? brand as Brand : null
}

export function researchOf(context: ToolContext): { text: string; sources: Array<{ n: number; title: string; url: string }> } | null {
  const artifact = context.dependency("research")?.artifacts[0] || context.inputs.find((item) => item.kind === "analysis")
  if (!artifact?.content) return null
  const sources = Array.isArray(artifact.metadata?.sources) ? artifact.metadata.sources as Array<{ n: number; title: string; url: string }> : []
  return { text: artifact.content, sources }
}

export function planOf(context: ToolContext): Artifact | null {
  return context.dependency("plan")?.artifacts[0] || context.inputs.find((item) => item.kind === "business-plan") || null
}

export function logoOf(context: ToolContext): Artifact | null {
  const artifact = context.dependency("logo")?.artifacts[0]
  return artifact?.url && /^https:\/\//i.test(artifact.url) ? artifact : null
}

/** The context block every writing tool puts in front of its instructions. */
export function projectContext(context: ToolContext, options: { research?: number; plan?: number } = {}) {
  const brief = briefOf(context)
  const brand = brandOf(context)
  const research = researchOf(context)
  const plan = planOf(context)
  const lines: string[] = [`ЦЕЛЬ ПОЛЬЗОВАТЕЛЯ: ${clip(context.flow.goal, 2_000)}`]
  const some = (...items: string[]) => items.filter(Boolean)
  if (brief) {
    lines.push(
      "",
      "БРИФ:",
      ...some(
        `- Идея: ${brief.idea}`,
        `- Отрасль: ${brief.industry}${brief.country ? `; страна: ${brief.country}` : ""}`,
        brief.audience ? `- Аудитория: ${brief.audience}` : "",
        brief.problem ? `- Проблема: ${brief.problem}` : "",
        brief.solution ? `- Решение: ${brief.solution}` : "",
        brief.businessModel ? `- Бизнес-модель: ${brief.businessModel}` : "",
        brief.constraints.length ? `- Ограничения: ${brief.constraints.join("; ")}` : "",
      ),
    )
  }
  if (brand) {
    lines.push(
      "",
      "БРЕНД (использовать точно это название везде):",
      ...some(
        `- Название: ${brand.name}`,
        brand.tagline ? `- Слоган: ${brand.tagline}` : "",
        brand.positioning ? `- Позиционирование: ${brand.positioning}` : "",
        brand.voice ? `- Тон: ${brand.voice}` : "",
      ),
    )
  }
  const facts = Object.entries(context.project.facts || {}).filter(([key]) => !["brandName", "tagline"].includes(key))
  if (facts.length) lines.push("", "ИЗВЕСТНО О ПРОЕКТЕ:", ...facts.slice(0, 12).map(([key, value]) => `- ${key}: ${clip(value, 200)}`))
  const decisions = (context.project.decisions || []).slice(-8)
  if (decisions.length) lines.push("", "РЕШЕНИЯ ПОЛЬЗОВАТЕЛЯ:", ...decisions.map((item) => `- ${clip(item.text, 240)}`))
  if (research && options.research) {
    lines.push("", "ИССЛЕДОВАНИЕ РЫНКА (с источниками [n]):", clip(research.text, options.research))
    if (research.sources.length) lines.push("", "ИСТОЧНИКИ:", ...research.sources.map((source) => `[${source.n}] ${source.title} — ${source.url}`))
  }
  if (plan?.content && options.plan) lines.push("", "БИЗНЕС-ПЛАН (сокращённо):", clip(plan.content, options.plan))
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n")
}

export function feedbackNote(context: ToolContext) {
  const failed = context.feedback?.checks.filter((check) => !check.ok) || []
  if (!failed.length) return ""
  return `\n\nПРЕДЫДУЩАЯ ВЕРСИЯ НЕ ПРОШЛА ПРОВЕРКУ. Исправь именно это:\n${failed.map((check) => `- ${check.note}`).join("\n")}`
}

/** Asks for JSON and reads it; one repair attempt when the answer is not JSON. */
export async function askJson<T>(context: ToolContext, input: { system: string; prompt: string; maxTokens: number; normalize: (raw: unknown) => T | null; temperature?: number }) {
  let prompt = input.prompt
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await context.deps.text({
      system: input.system,
      prompt,
      maxTokens: input.maxTokens,
      temperature: input.temperature ?? (attempt ? 0.2 : 0.5),
      reasoningEffort: context.flow.quality === "deep" ? "high" : "medium",
      signal: context.signal,
    })
    const value = input.normalize(extractJson(result.content))
    if (value) return { value, provider: `${result.provider}/${result.model}` }
    prompt = `${input.prompt}\n\nПредыдущий ответ нельзя прочитать как JSON нужной формы. Верни только один JSON-объект, без пояснений.`
  }
  throw new OsToolError("BAD_RESPONSE", "Модель вернула ответ в неверном формате. Повторю ещё раз.", { retryable: true })
}

export async function askText(context: ToolContext, input: { system: string; prompt: string; maxTokens: number; temperature?: number }) {
  const result = await context.deps.text({
    system: input.system,
    prompt: `${input.prompt}${feedbackNote(context)}`,
    maxTokens: input.maxTokens,
    temperature: input.temperature ?? 0.55,
    reasoningEffort: context.flow.quality === "deep" ? "high" : "medium",
    signal: context.signal,
  })
  const content = String(result.content || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim()
  if (content.length < 200) throw new OsToolError("BAD_RESPONSE", "Модель вернула слишком короткий ответ. Повторю ещё раз.", { retryable: true })
  return { content, provider: `${result.provider}/${result.model}` }
}

export const NO_INVENTION = [
  "Не выдумывай факты, цифры, клиентов, отзывы, награды и имена людей.",
  "Любая цифра без источника помечается как «оценка» или «допущение» и объясняется, откуда она.",
  "Цифры из исследования — только с номером источника [n].",
  "Не упоминай провайдеров, модели и внутреннее устройство Malik AI.",
].join(" ")
