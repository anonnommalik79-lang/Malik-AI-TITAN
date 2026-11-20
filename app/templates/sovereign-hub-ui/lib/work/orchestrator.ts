import { routingScope } from "@/lib/ai/prompt-shape"
import { decideSuperflow, SUPERFLOW_MAX_GOAL_CHARS } from "@/lib/os/capabilities"
import type { Capability } from "@/lib/os/types"
import type { WorkspaceMode } from "@/lib/ai/work-mode"
import type { DocumentFormat } from "./documents/formats"
import { detectWorkScheduleIntent, workRepositoryIntent } from "./intent"

const actionVerb = "(?:создай(?:те)?|сделай(?:те)?|подготовь(?:те)?|разработай(?:те)?|построй(?:те)?|собери(?:те)?|напиши(?:те)?|оформи(?:те)?|сгенерируй(?:те)?|экспортируй(?:те)?|create|build|make|prepare|develop|draft|write|generate|export)"
const action = new RegExp(`^(?:(?:пожалуйста|давай|please)[,\\s]+)?${actionVerb}\\s+`, "iu")
const nextAction = new RegExp(`(?:[,;]\\s*(?:(?:и|затем|потом|and(?:\\s+then)?|then)\\s+)?|\\s+(?:и(?:\\s+затем)?|затем|потом|and(?:\\s+then)?|then|және)\\s+)(?=${actionVerb}\\s+)`, "iu")
const kazakhAction = /\s+(?:жаса(?:п бер(?:ші)?)?|құр(?:ып бер(?:ші)?)?|дайында(?:п бер(?:ші)?)?|жаз(?:ып бер(?:ші)?)?|құрастыр(?:ып бер(?:ші)?)?|экспортта)(?:шы|ңыз)?[.!]?$/iu
const question = /^(?:что|как|почему|зачем|когда|где|кто|сколько|какой|какая|какие|можно ли|what|how|why|when|where|who|is|are|can|қалай|неге|қашан|қандай|қайда|кім|не үшін)(?![\p{L}\p{N}])|\?\s*$/iu
const negated = /^(?:(?:пожалуйста|please)[,\s]+)?(?:не|никогда|do not|don['’]t|never)(?![\p{L}\p{N}])/iu
const priorResult = /(?:\s|^)(?:(?:этот|эту|это|тот|ту|предыдущ\p{L}*|прошл\p{L}*|готов\p{L}*)\s+(?:документ|отч[её]т|файл|текст|ответ|презентаци|таблиц|проект)|(?:из|по)\s+(?:этого|предыдущего|прошлого)\s+ответа|(?:this|that|previous|earlier|above|existing)\s+(?:report|file|document|deck|spreadsheet|answer|text|project)|(?:report|answer|text)\s+above|(?:алдыңғы|осы)\s+(?:жауап|файл|құжат))/iu
const code = /(?<![\p{L}\p{N}])(?:код|code|python|javascript|typescript|html|css|sql|react|next\.js|питон\p{L}*|node\.js|node|ruby|php|java|rust|golang|go|kotlin|swift|c\+\+|c#)(?![\p{L}\p{N}#])/iu
const codeProject = /(?<![\p{L}\p{N}])(?:проект\p{L}*|жоба\p{L}*|project|репозитор\p{L}*|repository)(?![\p{L}\p{N}])/iu
const withCodePackage = /(?<![\p{L}\p{N}])(?:приложени\p{L}*|утилит\p{L}*|бот\p{L}*|игр[ауеы]|бағдарлама\p{L}*|app(?:lication)?|cli|bot|game|(?:rest\s+)?api|source\s+files|исходны[ей]\s+файлы|репозитор\p{L}*|repository)(?![\p{L}\p{N}])/iu
const proseRequest = /^(?:(?:мне|a|an|the|me|коротк\p{L}*|кратк\p{L}*|небольш\p{L}*|short|brief)\s+)*(?:пример|сравнение|описание|обзор|список|промпт|идеи|инструкци\p{L}*|функцию|код|example|sample|comparison|description|overview|list|prompt|function|tutorial|code)(?![\p{L}\p{N}])/iu
const frameworkSite = /\s+(?:на|с помощью|in|using|with)\s+(?:next(?:\.js)?|react|vue|svelte|astro|vite|django|flask|python|laravel|node\.js)(?![\p{L}\p{N}])/iu
const researchCommand = /^(?:(?:пожалуйста|please)[,\s]+)?(?:найди|поищи|проверь|исследуй|find|search for|look up|research)\s+/iu
const sourcesRequested = /(?:по\s+(?:свежим|актуальным|открытым|официальным)\s+источникам|со?\s+(?:свежими\s+|актуальными\s+|официальными\s+)?источниками|на основе\s+исследования|with\s+(?:recent\s+|official\s+|verified\s+)?sources|using\s+(?:recent\s+|official\s+|verified\s+)?sources)/iu
const localOnly = /(?:без\s+(?:интернета|веб[- ]?поиска|источников)|without\s+(?:web search|browsing|sources)|no\s+web search)/iu

type WorkFileCapability = "document" | "presentation" | "website" | "business-plan" | "code"
export type WorkFileFormats = Partial<Record<WorkFileCapability, DocumentFormat[]>>
export type WorkRoute = { route: "chat" | "flow"; reason: string; capabilities: Capability[]; files?: WorkFileFormats }

const formatTargets = {
  docx: "document", pdf: "document", xlsx: "document", csv: "document",
  pptx: "presentation", html: "website", zip: "code",
} satisfies Partial<Record<DocumentFormat, WorkFileCapability>>
const formats = Object.keys(formatTargets) as Array<keyof typeof formatTargets>
const formatWords = formats.join("|")
const formatInTarget = new RegExp(`(?<![\\p{L}\\p{N}])(${formatWords})(?![\\p{L}\\p{N}])`, "giu")
const formatAsOutput = new RegExp(`\\s+(?:в(?:\\s+формате)?|формат(?:е)?|as|in|файл(?:ы)?\\s+формата|format)\\s+(?:(?:an?|the)\\s+)?\\.?(?:${formatWords})(?:(?:\\s*[,/]\\s*|\\s+(?:и|and|немесе|және)\\s+)\\.?(?:${formatWords}))*(?![\\p{L}\\p{N}])`, "giu")
const targets: Array<{ capability: WorkFileCapability; format: DocumentFormat; noun: RegExp }> = [
  { capability: "business-plan", format: "docx", noun: /бизнес[- ]?план|business\s+plan|бизнес[- ]?жоспар/iu },
  { capability: "presentation", format: "pptx", noun: /презентац|таныстырылым|слайд|pitch\s+deck|presentation|(?<!\p{L})deck(?!\p{L})/iu },
  { capability: "website", format: "html", noun: /(?<!\p{L})(?:сайт\p{L}*|лендинг\p{L}*|веб[- ]страниц\p{L}*|website|web\s?page|landing\s+page|landing)(?!\p{L})/iu },
  { capability: "document", format: "docx", noun: /документ|отч[её]т|инструкци|құжат|есеп|нұсқаулық|document|report|manual|briefing/iu },
  { capability: "document", format: "xlsx", noun: /таблиц|кесте|электронн\p{L}*\s+таблиц|spreadsheet|workbook|(?<!\p{L})excel(?!\p{L})/iu },
]

function workFiles(scope: string): WorkFileFormats | undefined {
  if (!action.test(scope) && !kazakhAction.test(scope) && !researchCommand.test(scope)) return
  const desired: WorkFileFormats = {}
  const add = (capability: WorkFileCapability, format: DocumentFormat) => {
    const existing = desired[capability] ||= []
    if (!existing.includes(format)) existing.push(format)
  }
  for (const command of scope.split(nextAction)) {
    if (command.trim()) addCommandFiles(command.trim(), add)
  }
  if (Object.keys(desired).length) return desired
}

function addCommandFiles(scope: string, add: (capability: WorkFileCapability, format: DocumentFormat) => void) {
  const verbLast = kazakhAction.test(scope)
  if (!action.test(scope) && !verbLast) return
  // Only the deliverable phrase and an explicit format declaration select
  // tools. The topic ("PDF about a Python website") is still passed to the tool.
  const request = scope.replace(action, "").replace(kazakhAction, "")
    .split(/\n|[;.!?]\s|[, ]+(?:не\s+(?:дела|созда)|без|without|do not|don['’]t)\s/iu, 1)[0]
  const subject = (verbLast ? request.replace(/^.*?\s+(?:туралы|бойынша|үшін)\s+/iu, "") : request)
    .split(/\s+(?:о|об|по|для|про|с|со|в|на|about|on|for|with|from|to|as|in|using|explaining|describing)\s+/iu, 1)[0]
  const explicit = new Set<keyof typeof formatTargets>()
  const targetsInCommand = subject.split(/(?:[,;]|\s+(?:и|and|және)\s+)/iu)
  for (const clause of targetsInCommand) {
    if (proseRequest.test(clause)) continue
    for (const match of clause.matchAll(formatInTarget)) explicit.add(match[1].toLowerCase() as keyof typeof formatTargets)
  }
  for (const declaration of request.matchAll(formatAsOutput)) {
    for (const match of declaration[0].matchAll(formatInTarget)) explicit.add(match[1].toLowerCase() as keyof typeof formatTargets)
  }
  for (const clause of targetsInCommand) {
    const target = targets.find(item => item.noun.test(clause))
    if (proseRequest.test(clause) && !/^(?:примеры?\s+исходник|код\s+всего\s+проекта)/iu.test(clause)) continue
    if (target?.capability === "website" && (explicit.has("zip") || !explicit.has("html") && frameworkSite.test(request))) {
      add("code", "zip")
      continue
    }
    const matchesFormat = [...explicit].some(format => formatTargets[format] === target?.capability)
    if (target && !matchesFormat && !(target.capability === "business-plan" && (explicit.has("pdf") || explicit.has("docx")))) add(target.capability, target.format)
    if (target?.capability === "business-plan" && (explicit.has("pdf") || explicit.has("docx"))) {
      for (const format of ["docx", "pdf"] as const) if (explicit.delete(format)) add("business-plan", format)
    }
    if (!target && (withCodePackage.test(clause) || codeProject.test(clause) && code.test(`${clause} ${request}`))) add("code", "zip")
  }
  for (const format of explicit) {
    // HTML source code is inline unless the user asks for a page/file or explicitly asks for HTML output.
    if (format === "html" && /^(?:html[- ]?)?(?:код|code|пример|example)(?![\p{L}\p{N}])/iu.test(subject) && !withCodePackage.test(subject)) continue
    add(formatTargets[format], format)
  }
}

/**
 * Chat: a Superflow starts only on an explicit «создай бизнес» (see
 * decideSuperflow). Work: additionally, an explicit request for a file
 * («создай документ / PDF / презентацию») becomes a file task. A long brief
 * or a numbered task list is answered in the chat; only its opening
 * instruction may ask for a file.
 */
export function routeWorkRequest(goal: string, options: { mode: WorkspaceMode; signedIn: boolean; attachmentKinds?: string[] }): WorkRoute {
  const text = String(goal || "").trim()
  const legacy = decideSuperflow(text, options.attachmentKinds || [])
  const chat = (reason: string) => ({ route: "chat" as const, reason, capabilities: legacy.capabilities })
  if (!options.signedIn) return chat("guest")
  if (options.mode !== "work") return { route: legacy.run ? "flow" : "chat", reason: legacy.reason, capabilities: legacy.capabilities }
  if (/^\s*\//.test(text)) return chat("command")
  if (detectWorkScheduleIntent(text)) return chat("work-schedule")
  if (workRepositoryIntent(text)) return { route: "flow", reason: "work-repository", capabilities: ["code"] }
  if (text.length > SUPERFLOW_MAX_GOAL_CHARS) return chat("too-long")
  const scope = routingScope(text)
  if (question.test(scope)) return chat("question")
  if (negated.test(scope)) return chat("negated")
  if (priorResult.test(scope)) return chat("artifact-follow-up")
  const files = workFiles(scope)
  if (files) {
    const capabilities: Capability[] = Object.keys(files) as WorkFileCapability[]
    if (!localOnly.test(scope) && (researchCommand.test(scope) || sourcesRequested.test(scope))) capabilities.unshift("research")
    return { route: "flow", reason: "work-file-result", capabilities, files }
  }
  if (legacy.run) return { route: "flow", reason: legacy.reason, capabilities: legacy.capabilities }
  if (code.test(scope)) return chat("inline-code")
  return chat(scope === text ? "no-file-instruction" : "brief")
}
