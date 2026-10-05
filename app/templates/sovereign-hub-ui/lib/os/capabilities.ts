import { isComplexBrief, leadingInstruction } from "@/lib/ai/prompt-shape"
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

/** The server refuses longer goals; such a message is answered in the chat. */
export const SUPERFLOW_MAX_GOAL_CHARS = 4_000

/** What a business is built from when the person names nothing more. */
const BUSINESS_PACKAGE: Capability[] = ["research", "brand", "image", "website", "business-plan"]

// "бизнес" / "стартап" / "компания" as the thing to create — never
// "бизнес-план", "бизнес-модель", "бизнес-идея", "startup idea": those are a
// single document or a list of ideas and stay a chat answer.
const NOT_A_BUSINESS = "(?!\\s*-?\\s*(?:план|plan|модел|model|иде|idea|процесс|process|аналит|analy|ланч|lunch|класс|class|школ|school|английск|english|центр|center|centre|кейс|case|тренинг|training|книг|book|жоспар|үлгі))"
const BUSINESS_NOUN = `(?:бизнес(?:а|у|ом|е)?|стартап(?:а|у|ом|е|ы)?|старт-ап\\p{L}*|компани(?:ю|я)|фирм(?:у|а)|сво[её]\\s+дело|собственн\\p{L}*\\s+дело|кәсіп\\p{L}*|startup|start-up|business|company)(?![\\p{L}\\p{N}])${NOT_A_BUSINESS}`
const CREATE_VERB = "(?:создай(?:те)?|сделай(?:те)?|запусти(?:те)?|открой(?:те)?|построй(?:те)?|придумай(?:те)?|разработай(?:те)?|собери(?:те)?|организуй(?:те)?|начни(?:те)?|оформи(?:те)?|create|start|launch|build|set\\s+up|make|open|found)"
const POLITE_CREATE = "(?:помоги(?:те)?|можешь|можете|сможешь|хочу|давай|нужно|надо|could\\s+you|can\\s+you|would\\s+you|help\\s+me|i\\s+want\\s+to|let'?s)\\s+(?:мне\\s+|me\\s+)?(?:создать|сделать|запустить|открыть|построить|придумать|разработать|собрать|начать|организовать|create|start|launch|build|set\\s+up|make|open|found)"
const GAP = "(?:\\s+[\\p{L}\\p{N}-]+){0,3}?"
const BUSINESS_COMMAND = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CREATE_VERB}|${POLITE_CREATE})${GAP}\\s+${BUSINESS_NOUN}`, "iu")
// Kazakh puts the verb last: «маған бизнес ашып бер», «стартап жасап бер».
const BUSINESS_COMMAND_KK = new RegExp(`(?<![\\p{L}\\p{N}])(?:бизнес|стартап|кәсіп|компания)\\p{L}*${NOT_A_BUSINESS}(?:\\s+[\\p{L}-]+){0,2}?\\s+(?:аш|құр|жаса|баста|іске\\s+қос)\\p{L}*`, "iu")
// «бизнес с нуля», «стартап под ключ», "a business from scratch".
const BUSINESS_FROM_SCRATCH = new RegExp(`(?<![\\p{L}\\p{N}])${BUSINESS_NOUN}(?:\\s+[\\p{L}\\p{N}-]+){0,3}?\\s+(?:с\\s+нуля|под\\s+ключ|from\\s+scratch|end[- ]to[- ]end|нөлден)`, "iu")
// The person can also ask for the feature by name.
const SUPERFLOW_BY_NAME = /(?<![\p{L}\p{N}])(?:запусти(?:те)?|включи(?:те)?|используй(?:те)?|через|run|start|launch|use|with)\s+(?:malik\s+)?(?:superflow|суперфлоу)(?![\p{L}\p{N}])/iu
const NEGATED = new RegExp(`(?:(?<![\\p{L}\\p{N}])(?:не|don'?t|do\\s+not|never)\\s+(?:надо\\s+|нужно\\s+)?(?:создава\\p{L}*|созда\\p{L}*|запуска\\p{L}*|запуст\\p{L}*|дела\\p{L}*|открыва\\p{L}*|включа\\p{L}*|create|start|launch|build|make|run|use)${GAP}\\s+(?:${BUSINESS_NOUN}|superflow|суперфлоу))|без\\s+(?:superflow|суперфлоу)|without\\s+superflow`, "iu")
// "Как создать бизнес?" is a question about business, not an order to build one.
const HOW_TO = /^(?:как|каким образом|что|почему|зачем|сколько|какой|какая|какие|стоит ли|можно ли|нужно ли|правда ли|расскажи|объясни|how|what|why|which|should|is it|is there|tell me|explain|қалай|неге|не\s)(?![\p{L}\p{N}])/iu

/** An explicit order to create a business: «создай бизнес», «запусти стартап». */
export function isBusinessCreationCommand(text: string): boolean {
  const value = String(text || "").replace(/\s+/g, " ").trim()
  if (!value || NEGATED.test(value)) return false
  const asksByName = SUPERFLOW_BY_NAME.test(value)
  const command = BUSINESS_COMMAND.test(value) || BUSINESS_COMMAND_KK.test(value) || BUSINESS_FROM_SCRATCH.test(value)
  if (!command && !asksByName) return false
  // A polite request («можешь создать мне бизнес?») is still a request.
  if (HOW_TO.test(value) && !new RegExp(POLITE_CREATE, "iu").test(value)) return false
  return true
}

/**
 * Whether a message becomes a Superflow.
 *
 * Only an explicit order to create a business starts the multi-tool run —
 * «создай бизнес», «запусти стартап для инвесторов», «бизнес под ключ», or
 * naming Superflow itself. Everything else — questions, single deliverables,
 * a brand or a landing page on its own, and above all long briefs and
 * numbered task lists — is answered in the chat by the model.
 *
 * In a long brief only its opening instruction counts: a mention of
 * "бизнес" in block 4 of a test prompt is content, not a command.
 */
export function decideSuperflow(goal: string, attachmentKinds: string[] = []): SuperflowDecision {
  const text = String(goal || "").trim()
  const capabilities = detectCapabilities(text, attachmentKinds)
  if (text.length < 12) return { run: false, reason: "short", capabilities }
  if (/^\s*\//.test(text)) return { run: false, reason: "command", capabilities }
  if (text.length > SUPERFLOW_MAX_GOAL_CHARS) return { run: false, reason: "too-long", capabilities }
  const brief = isComplexBrief(text)
  const scope = brief ? leadingInstruction(text) : text
  if (!isBusinessCreationCommand(scope)) return { run: false, reason: brief ? "brief" : "not-business", capabilities }
  // A business needs at least the standard package, whatever else was named.
  const full = [...new Set<Capability>([...BUSINESS_PACKAGE, ...capabilities])]
  return { run: true, reason: STARTUP.test(text) ? "startup-package" : "business-package", capabilities: full }
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
