import { forgeSiteWithRouter } from "./forge/server"
import { FORGE_VERSION } from "./forge/plan"
import { buildPlannerPrompt, fallbackWebsitePlan, renderWebsiteFromPlan } from "./skill-engine"
import { publicSkillSources, selectSiteSkills } from "./skill-registry"
import { planWebsite, scoreWebsitePlan } from "./site-planner"

export const SITES_SKILL_ENGINE_VERSION = "malik-sites/v4"

type SiteRequestBody = {
  prompt?: string
  message?: string
  /** The site being edited; a Malik Site Forge page is changed through its embedded plan. */
  previousHtml?: string
  template?: string
  style?: string
  quality?: string
  userEmail?: string
  userId?: string
}

function text(value: unknown, max = 12_000) {
  return String(value || "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 || code === 9 || code === 10 || code === 13
    })
    .join("")
    .trim()
    .slice(0, max)
}

async function readBody(request: Request): Promise<SiteRequestBody> {
  const raw = await request.text().catch(() => "")
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as SiteRequestBody
  } catch {
    return { prompt: raw }
  }
}

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Malik-Sites-Engine": SITES_SKILL_ENGINE_VERSION,
    },
  })
}

export async function handleSkillWebsiteGenerationRequest(request: Request) {
  const startedAt = Date.now()
  const body = await readBody(request)
  const prompt = text(body.prompt || body.message)
  const template = text(body.template || "adaptive", 120)

  if (!prompt) {
    return json({
      ok: false,
      kind: "website",
      error: "empty_prompt",
      message: "Опишите сайт, который нужно собрать.",
      engine: SITES_SKILL_ENGINE_VERSION,
    }, 400)
  }

  const userId = text(body.userId || body.userEmail || "sites-guest", 180) || "sites-guest"

  // Places people visit or buy from (cafés, salons, clinics, hotels, shops) and
  // edits of a forge site go to Malik Site Forge: six working pages, basket,
  // booking, photographs and the interface skills checked in the page.
  const forged = await forgeSiteWithRouter({
    prompt,
    userId,
    lane: "sites-forge",
    signal: request.signal,
    previousHtml: typeof body.previousHtml === "string" ? body.previousHtml.slice(0, 600_000) : "",
  })
  if (forged) {
    const { result } = forged
    const name = result.plan.brand.name
    const skillSources = result.skills.map((skill) => ({ id: skill.id, name: skill.name, category: skill.group, source: skill.name, repo: skill.repo, url: skill.url, role: skill.does, capabilities: [] as string[] }))
    return json({
      ok: true,
      kind: "website",
      status: "ready",
      engine: FORGE_VERSION,
      model: result.planner.used ? forged.model : "Malik Site Forge",
      provider: result.planner.used ? forged.provider : "local",
      format: "ForgePlan -> Malik Site Forge -> standalone multi-page HTML/CSS/JS",
      html: result.html,
      code: result.html,
      content: result.html,
      plan: result.plan,
      pages: result.pages,
      understood: result.plan.understood || "",
      quality: { score: result.quality.score, issues: result.quality.issues.map((issue) => issue.message) },
      skills: skillSources,
      skillCount: skillSources.length,
      photos: result.photoStats,
      samples: result.plan.samples,
      planner: { used: result.planner.used, attempts: result.planner.attempts, fallbackUsed: !result.planner.used },
      fallback: !result.planner.used,
      message: forged.mode === "edit"
        ? `Сайт «${name}» обновлён через его план: изменено только то, что вы попросили.`
        : `Сайт «${name}» собран Malik Site Forge: ${result.pages.length} страниц, ${skillSources.length} скиллов интерфейсов, проверка качества ${result.quality.score}/100.${result.planner.used ? "" : " Тексты из шаблона: модель сейчас не ответила."}`,
      latencyMs: Date.now() - startedAt,
    })
  }

  const skills = selectSiteSkills(prompt, template)
  const sources = publicSkillSources(skills)
  const plannerPrompt = buildPlannerPrompt(prompt, template, skills)

  // Model-independent: whatever text provider is configured gets a turn, the
  // plan it returns is scored against the request, and a weak plan is sent back
  // with its deficiencies for another attempt.
  const outcome = await planWebsite({
    prompt,
    template,
    plannerPrompt,
    userId,
    signal: request.signal,
    skillIds: skills.map((skill) => skill.id),
  })

  const plannerUsed = Boolean(outcome.plan)
  const plan = outcome.plan || fallbackWebsitePlan(prompt, template)
  const quality = scoreWebsitePlan(plan, prompt)
  const html = renderWebsiteFromPlan(plan, skills)

  return json({
    ok: true,
    kind: "website",
    status: "ready",
    engine: SITES_SKILL_ENGINE_VERSION,
    model: outcome.model || "Malik Skill Renderer",
    provider: outcome.provider || "local",
    format: "WebsitePlan -> Malik Skill Renderer -> standalone HTML/CSS/JS",
    html,
    code: html,
    content: html,
    plan,
    understood: outcome.understood || plan.understood || "",
    quality: { score: quality.score, issues: quality.reasons },
    skills: sources,
    skillCount: sources.length,
    planner: {
      used: plannerUsed,
      attempts: outcome.attempts,
      fallbackUsed: !plannerUsed,
    },
    fallback: !plannerUsed,
    message: plannerUsed
      ? `Сайт собран движком Malik Skill Engine из ${sources.length} скиллов · качество плана ${quality.score}/100.`
      : `Сайт собран локальным Malik Skill Engine из ${sources.length} скиллов; ни одна модель не вернула план.`,
    latencyMs: Date.now() - startedAt,
  })
}
