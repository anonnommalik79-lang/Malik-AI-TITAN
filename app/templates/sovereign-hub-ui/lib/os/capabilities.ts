import type { Capability, QualityTier, ToolName } from "./types"

/**
 * Auto mode: what a goal asks for, how hard it is, and which tool and route
 * serve each part. The person describes the outcome; Malik picks the
 * capabilities. Rules are explicit and tested, so the same goal always
 * produces the same plan — no model guesses which tools exist.
 */

// JavaScript's \b only knows ASCII letters, so word edges below are written
// as (?<![\p{L}\p{N}]) … (?![\p{L}\p{N}]) to work for Cyrillic and Kazakh too.

const RULES: Array<{ capability: Capability; pattern: RegExp }> = [
  { capability: "research", pattern: /рын(?:ок|ка|ке|ку)|исслед|конкурент|тренд|анализ\s+(?:рынк|ниш|отрасл)|market|research|competitor|landscape|нарық|зерт/iu },
  { capability: "brand", pattern: /бренд|брэнд|назван|логотип|айдентик|позиционир|слоган|brand|logo|naming|tagline|identity/iu },
  { capability: "image", pattern: /изображен|картинк|логотип|обложк|визуал|иллюстрац|фото(?!граф)|image|picture|logo|visual|сурет/iu },
  { capability: "website", pattern: /сайт|лендинг|веб-?страниц|landing|website|web\s?page|сайтқа/iu },
  { capability: "presentation", pattern: /презентац|питч|pitch|deck|слайд|инвестор|investor/iu },
  { capability: "document", pattern: /документ|отч[её]т|стать[юяи]|описание\s+проекта|white\s?paper|report|document|memo|техзадан|(?<![\p{L}\p{N}])тз(?![\p{L}\p{N}])/iu },
  { capability: "business-plan", pattern: /бизнес-?план|финанс(?:ов|ы)|монетизац|юнит-?экономик|unit\s+economics|business\s+plan|financial\s+model|p&l|revenue\s+model/iu },
  { capability: "video-script", pattern: /видео|ролик|сценари|video|script|трейлер|teaser/iu },
  { capability: "code", pattern: /(?<![\p{L}\p{N}])(?:код|api|бот|app)(?![\p{L}\p{N}])|приложени|программ|телеграм-?бот|backend|frontend|next\.?js|react|python|code/iu },
  { capability: "data", pattern: /(?<![\p{L}\p{N}])(?:csv|xlsx)(?![\p{L}\p{N}])|excel|таблиц[аеуы] данных|датасет|dataset|данные из файла/iu },
]

/** "стартап" is a whole package, not one deliverable. */
const STARTUP = /стартап|startup|старт-ап|компани[юя]\s+с\s+нуля|бизнес\s+с\s+нуля/iu
const INVESTOR = /инвестор|investor|раунд|fundrais|привлеч\w*\s+инвест/iu
const IMPERATIVE = /(?<![\p{L}\p{N}])(?:создай(?:те)?|сделай(?:те)?|подготовь(?:те)?|разработай(?:те)?|построй(?:те)?|собери(?:те)?|запусти(?:те)?|придумай(?:те)?|напиши(?:те)?|оформи(?:те)?|спроектируй(?:те)?|жаса(?:шы|ңыз)?|дайында(?:шы|ңыз)?|create|build|make|prepare|launch|design|develop|draft|plan)(?![\p{L}\p{N}])/iu
const PACKAGE = /под ключ|от идеи до|полный пакет|всё для запуска|все материалы|end[- ]to[- ]end|superflow|суперфлоу|целиком|полностью/iu
const QUESTION = /^(?:что|как|почему|зачем|когда|где|кто|сколько|какой|какая|какие|можно ли|what|how|why|when|where|who|is|are|can)(?![\p{L}\p{N}])|\?\s*$/iu

export function detectCapabilities(goal: string, attachmentKinds: string[] = []): Capability[] {
  const text = String(goal || "")
  const found = new Set<Capability>()
  for (const rule of RULES) if (rule.pattern.test(text)) found.add(rule.capability)
  if (STARTUP.test(text)) {
    ;["research", "brand", "image", "website", "business-plan"].forEach((capability) => found.add(capability as Capability))
    if (INVESTOR.test(text)) {
      found.add("presentation")
      found.add("video-script")
    }
  }
  if (INVESTOR.test(text)) {
    found.add("presentation")
    found.add("business-plan")
  }
  // A logo is a picture made after the brand exists.
  if (found.has("image") && /логотип|logo/iu.test(text)) found.add("brand")
  if (found.has("data") && !attachmentKinds.some((kind) => kind === "file" || kind === "document" || kind === "dataset")) found.delete("data")
  return [...found]
}

export type SuperflowDecision = { run: boolean; reason: string; capabilities: Capability[] }

/**
 * Whether a message becomes a Superflow. Conservative on purpose: a
 * question stays a chat answer; only an instruction to produce several
 * deliverables starts the multi-tool run.
 */
export function decideSuperflow(goal: string, attachmentKinds: string[] = []): SuperflowDecision {
  const text = String(goal || "").trim()
  const capabilities = detectCapabilities(text, attachmentKinds)
  if (text.length < 24) return { run: false, reason: "short", capabilities }
  if (/^\s*\//.test(text)) return { run: false, reason: "command", capabilities }
  if (QUESTION.test(text) && !IMPERATIVE.test(text)) return { run: false, reason: "question", capabilities }
  if (!IMPERATIVE.test(text) && !PACKAGE.test(text)) return { run: false, reason: "no-instruction", capabilities }
  if (STARTUP.test(text) && capabilities.length >= 3) return { run: true, reason: "startup-package", capabilities }
  if (capabilities.length >= 3) return { run: true, reason: "multi-deliverable", capabilities }
  if (PACKAGE.test(text) && capabilities.length >= 2) return { run: true, reason: "explicit-package", capabilities }
  return { run: false, reason: "single-deliverable", capabilities }
}

const DEEP = /подробн|глубок|детальн|профессиональн|инвестор|стратеги|полный|исчерпыв|deep|detailed|thorough|comprehensive|investor|strategy/iu
const CASUAL = /^(?:привет|салам|сәлем|здравствуй|hi|hello|hey|спасибо|рахмет|thanks|ок|ok|пока|bye)[\s!.,?]*$/iu

/** Quality router: easy requests favour speed, hard ones a stronger route. */
export function qualityTier(goal: string, capabilityCount = 0): QualityTier {
  const text = String(goal || "").trim()
  if (CASUAL.test(text) || (text.length < 60 && capabilityCount === 0 && !DEEP.test(text))) return "fast"
  if (DEEP.test(text) || capabilityCount >= 3 || text.length > 600) return "deep"
  return "balanced"
}

export type CapabilityRoute = {
  capability: Capability
  tool: ToolName
  /** The text model family every text tool runs on: MAX races every provider. */
  model: "malik-max"
  reasoningEffort: "low" | "medium" | "high"
  maxTokens: number
  requires: { web?: boolean; imageModel?: boolean; codeModel?: boolean; longOutput?: boolean; attachment?: boolean }
}

const TOOL_FOR: Record<Capability, ToolName> = {
  research: "research.web",
  brand: "brand.create",
  image: "image.generate",
  website: "site.generate",
  presentation: "presentation.generate",
  document: "document.write",
  "business-plan": "business.plan",
  "video-script": "video.script",
  code: "code.project",
  data: "data.analyze",
}

/** Capability router: the tool, route and budget a capability needs. */
export function routeCapability(capability: Capability, tier: QualityTier): CapabilityRoute {
  const effort = tier === "fast" ? "low" : tier === "deep" ? "high" : "medium"
  const budget = (base: number) => (tier === "deep" ? Math.round(base * 1.6) : tier === "fast" ? Math.round(base * 0.6) : base)
  const route: CapabilityRoute = {
    capability,
    tool: TOOL_FOR[capability],
    model: "malik-max",
    reasoningEffort: effort,
    maxTokens: budget(3_000),
    requires: {},
  }
  if (capability === "research") route.requires = { web: true }
  if (capability === "image") route.requires = { imageModel: true }
  if (capability === "code") {
    route.requires = { codeModel: true, longOutput: true }
    route.maxTokens = budget(10_000)
  }
  if (capability === "website") route.requires = { longOutput: true }
  if (capability === "business-plan" || capability === "document") route.maxTokens = budget(5_000)
  if (capability === "presentation") route.maxTokens = budget(6_000)
  if (capability === "data") route.requires = { attachment: true }
  return route
}
