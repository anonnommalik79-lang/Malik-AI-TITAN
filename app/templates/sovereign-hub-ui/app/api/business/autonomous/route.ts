import { checkPromptLength } from "@/lib/limits/rate-limit"
import { resolveUserTier } from "@/lib/limits/user-plan"
import { MalikModelRouteError, runStrictMalikModel } from "@/lib/server/malik-model-router"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AUTONOMOUS_MODEL_ID = "malik-27b" as const
const MODEL_LABEL = "MalikLLM Qwen3.8 27B"

type AutonomousBody = {
  idea?: string
  market?: string
  country?: string
  budget?: string
  requirements?: string
  language?: "ru" | "kk" | "en"
  modelId?: string
  operator?: string
}

function clean(value: unknown, max = 1200) {
  return String(value || "").trim().slice(0, max)
}

function systemPrompt(language: AutonomousBody["language"]) {
  const lang = language === "kk" ? "Kazakh" : language === "en" ? "English" : "Russian"
  return [
    "You are the orchestration brain of MALIK AUTONOMOUS COMPANY.",
    `Write the final business launch output in ${lang}.`,
    "Operate as eight coordinated roles: CEO, Research, Coder, Design, Marketing, Sales, Support, Analyst.",
    "Turn the founder brief into a concrete, launch-ready company system: offer, target customer, market validation, product/site specification, brand, acquisition, sales funnel, support, KPIs and first execution sprint.",
    "Be specific and executable. Include prices, channels, metrics, assets and next actions when the brief allows it.",
    "Do not claim that a website was deployed, messages were sent, accounts were created, money was charged, clients were contacted or any other external action happened unless the request context contains a confirmed tool/API result proving it.",
    "Clearly separate prepared plans/assets from actions that still require an external API or human approval.",
    "Use concise headings for the eight agents and finish with a 7-day launch sequence.",
  ].join("\n")
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AutonomousBody
  const idea = clean(body.idea, 8000)
  if (!idea) {
    return Response.json({ ok: false, error: "IDEA_REQUIRED", message: "Опишите бизнес, который нужно запустить." }, { status: 400 })
  }

  const market = clean(body.market, 260) || "Не указан"
  const country = clean(body.country, 180) || "Не указана"
  const budget = clean(body.budget, 180) || "Не указан"
  const requirements = clean(body.requirements, 1600) || "Полный запуск бизнеса"

  const entitlement = await resolveRequestEntitlement(request)
  const tier = resolveUserTier(entitlement.userId, entitlement.plan)
  const combined = [idea, market, country, budget, requirements].join("\n")
  const promptCheck = checkPromptLength(combined, tier)
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.code, message: promptCheck.error }, { status: 400 })
  }

  const prompt = [
    "FOUNDER BRIEF",
    `Idea: ${idea}`,
    `Market: ${market}`,
    `Country: ${country}`,
    `Budget: ${budget}`,
    `Requirements: ${requirements}`,
    "",
    "Build the company launch system now. Treat this as one coordinated run across all eight agents.",
  ].join("\n")

  try {
    const result = await runStrictMalikModel({
      modelId: AUTONOMOUS_MODEL_ID,
      prompt,
      systemPrompt: systemPrompt(body.language),
      maxTokens: 2600,
      temperature: 0.35,
    }, { allowFallback: false })

    return Response.json({
      ok: true,
      status: "ready",
      selectedModelId: AUTONOMOUS_MODEL_ID,
      selectedModel: MODEL_LABEL,
      provider: result.provider,
      model: result.model,
      content: result.content,
      latencyMs: result.latencyMs,
      agents: ["CEO", "Research", "Coder", "Design", "Marketing", "Sales", "Support", "Analyst"],
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json({
      ok: false,
      error: error instanceof MalikModelRouteError ? error.code : "AUTONOMOUS_COMPANY_UNAVAILABLE",
      message: error instanceof Error ? error.message : `${MODEL_LABEL} временно недоступна.`,
      selectedModelId: AUTONOMOUS_MODEL_ID,
      selectedModel: MODEL_LABEL,
    }, { status, headers: { "cache-control": "no-store" } })
  }
}
