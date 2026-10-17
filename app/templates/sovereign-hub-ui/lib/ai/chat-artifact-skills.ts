export type ChatArtifactSkill = {
  id: string
  name: string
  priority: number
  patterns: readonly RegExp[]
  instruction: string
}

const CREATION_INTENT = /(?:создай|сделай|напиши|подготовь|собери|сгенерируй|разработай|построй|оформи|составь|выгрузи|дай\s+скачать|create|build|write|make|generate|prepare|export)/iu

/**
 * Chat-native capabilities. These are quality contracts, not content templates:
 * the selected model still chooses the implementation that best fits the user's
 * request and never receives a prewritten site, slide deck or document body.
 */
export const CHAT_ARTIFACT_SKILLS: readonly ChatArtifactSkill[] = [
  {
    id: "presentation",
    name: "Presentation Studio",
    priority: 120,
    patterns: [/презентац|слайд|питч[ -]?дек|pitch[ -]?deck|presentation|slides?|\.pptx\b/iu],
    instruction: "Build a real presentation with a clear narrative arc, concise copy, useful grounded data and a strong final action. For native PowerPoint export, author Markdown with a heading for each slide, at most six concise points per slide and no unsupported quantitative claims; the existing server engine creates editable slides. Only produce an HTML presentation when HTML is explicitly requested. Do not claim an image or chart was inserted unless the actual tool confirms it.",
  },
  {
    id: "software",
    name: "Software Builder",
    priority: 115,
    patterns: [/\b(?:html|css|javascript|typescript|python|react|next\.?js|node\.?js|java|kotlin|swift|golang|rust|php|c\+\+|c#)\b|код|сайт|website|web\s*site|landing\s*page|homepage|приложен|компонент|репозитор|frontend|backend|source\s+code/iu],
    instruction: "Write the actual runnable software requested. Respect the requested stack and architecture. If none is specified, choose the smallest suitable implementation instead of forcing React, Next.js, Tailwind or any house style. For requested sites and visual apps, deliver a polished responsive interface with coherent typography, spacing, navigation, realistic content, accessible controls, and fully functioning requested interactions. Honor the user's actual style and content instead of repeating a fixed template. When no framework is requested, prefer a complete self-contained index.html with CSS and JavaScript included so preview runs immediately. Use genuine supplied/appropriately sourced images when the request calls for product photography instead of relying on emoji placeholders. Include every file and integration required for the requested behavior; no generic starter, TODO, placeholder, mock or shortened sample.",
  },
  {
    id: "document",
    name: "Document Studio",
    priority: 105,
    patterns: [/документ|отч[её]т|бриф|инструкц|руководств|договор|предложен|whitepaper|report|document|brief|manual|\bword\b|ворд|\bdocx\b|\bpdf\b/iu],
    instruction: "Create a publication-ready document with useful hierarchy, concrete content, consistent terminology and no filler. When Word or PDF is requested, author complete Markdown content for the real server exporter; never substitute an HTML file or claim the binary file exists before export is confirmed.",
  },
  {
    id: "spreadsheet",
    name: "Spreadsheet Lab",
    priority: 104,
    patterns: [/таблиц|excel|spreadsheet|\.xlsx\b|\.csv\b|бюджет|финансовая\s+модель|прогноз|калькулятор/iu],
    instruction: "Produce analysis-ready tables with headers, units, calculations grounded in supplied data and no invented figures. For explicitly requested Excel/XLSX, author complete Markdown tables for the native workbook exporter, with local arithmetic formulas only when requested. Do not substitute CSV for XLSX. For explicitly requested CSV use correctly escaped CSV. Never claim formulas were recalculated unless an execution receipt confirms it.",
  },
  {
    id: "data-analysis",
    name: "Data Analyst",
    priority: 103,
    patterns: [/анализ\s+данн|датасет|визуализац|график|диаграмм|notebook|jupyter|pandas|data\s+analysis|dataset/iu],
    instruction: "Make the analysis reproducible: preserve source columns, distinguish facts from assumptions, validate totals, handle missing values, and provide complete analysis code plus the smallest useful interpretation. Never fabricate a successful run or a chart that was not produced.",
  },
  {
    id: "api",
    name: "API Architect",
    priority: 102,
    patterns: [/\bapi\b|openapi|swagger|graphql|webhook|rest\b|endpoint/iu],
    instruction: "Design a complete usable API contract: routes, schemas, validation, errors, authentication boundary and realistic examples. When implementation is requested, include the actual server code and an openapi.yaml or equivalent contract rather than describing endpoints only.",
  },
  {
    id: "database",
    name: "Database Engineer",
    priority: 101,
    patterns: [/баз[аы]\s+данн|схем[аы]\s+бд|миграц|postgres|mysql|sqlite|mongodb|\bsql\b|database|schema/iu],
    instruction: "Return executable schema or migration files with constraints, indexes, ownership boundaries and rollback notes where relevant. Preserve data safety and never invent credentials or silently perform destructive migrations.",
  },
  {
    id: "automation",
    name: "Automation Engineer",
    priority: 100,
    patterns: [/автоматизац|workflow|скрипт|бот\b|cron|pipeline|интеграц|automation/iu],
    instruction: "Build a complete idempotent automation with explicit inputs, safe retries, useful logs, error handling and configuration through environment variables. Never hard-code secrets or claim an external action ran when only code was generated.",
  },
  {
    id: "diagram",
    name: "Diagram Designer",
    priority: 99,
    patterns: [/mermaid|блок[ -]?схем|диаграмм|mind[ -]?map|sequence\s+diagram|flowchart|architecture\s+diagram/iu],
    instruction: "Create a readable diagram whose labels and relationships match the request. Prefer a complete Mermaid block named diagram.mmd for portability, keep edge crossings low, and add a compact legend only when notation is not obvious.",
  },
  {
    id: "test-suite",
    name: "Quality Engineer",
    priority: 98,
    patterns: [/тест[ыа]|unit\s+test|integration\s+test|e2e|playwright|cypress|vitest|jest|qa\b/iu],
    instruction: "Write executable tests that verify user-visible behavior, failure paths and the most costly edge cases. Use the project's existing test stack when known and never replace assertions with snapshots or mocks that do not prove the requested behavior.",
  },
  {
    id: "business",
    name: "Founder Strategy",
    priority: 96,
    patterns: [/бизнес[ -]?план|стартап|go[ -]?to[ -]?market|roadmap|prd\b|юнит[ -]?экономик|монетизац|рынок|strategy|product\s+requirements/iu],
    instruction: "Create a decision-ready business artifact: explicit customer, problem, wedge, distribution, economics, risks, milestones and measurable next experiment. Separate verified inputs from assumptions and avoid vanity claims or invented market numbers.",
  },
  {
    id: "content-pack",
    name: "Content Director",
    priority: 94,
    patterns: [/контент[ -]?план|маркетинг|реклам|пост[ыа]?\b|email\s+campaign|рассылк|копирайт|сценарий|campaign|social\s+media/iu],
    instruction: "Create publishable copy tailored to audience, channel and objective, with distinct variants rather than cosmetic rewrites. Avoid empty hype, preserve factual claims, and include a practical content calendar or assets file only when requested.",
  },
  {
    id: "education",
    name: "Learning Designer",
    priority: 92,
    patterns: [/курс\b|урок|учебн|квиз|викторин|тест\s+(?:знаний|по\s)|проверочн|study\s+plan|learning\s+plan|quiz|flashcards/iu],
    instruction: "Create a teachable learning artifact with outcomes, progressive exercises, worked examples, feedback criteria and a genuine knowledge check. Match the user's level and never pad the course with repetitive theory. For the knowledge check use one closed ```malik-quiz fence with JSON {\"version\":1,\"title\":\"…\",\"questions\":[{\"question\":\"…\",\"options\":[\"…\",\"…\"],\"answer\":<0-based index of the correct option>,\"explanation\":\"…\"}]} (2–6 options, at most 20 questions); the chat grades it itself.",
  },
  {
    id: "career",
    name: "Career Studio",
    priority: 90,
    patterns: [/резюме|портфолио|сопроводительн|ваканси|\bcv\b|resume|cover\s+letter|portfolio/iu],
    instruction: "Create an editable, ATS-readable career artifact grounded only in supplied facts. Quantify impact only when evidence is provided, tailor it to the target role, and never invent employers, dates, credentials or achievements.",
  },
] as const

export function detectChatArtifactSkills(promptValue: string, limit = 2) {
  const prompt = String(promptValue || "").trim()
  if (!prompt || !CREATION_INTENT.test(prompt)) return []
  return CHAT_ARTIFACT_SKILLS
    .filter((skill) => skill.patterns.some((pattern) => pattern.test(prompt)))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, Math.max(1, limit))
}

export function isChatArtifactCreationRequest(prompt: string) {
  return detectChatArtifactSkills(prompt, 1).length > 0
}

export function buildChatArtifactSkillPrompt(prompt: string) {
  const skills = detectChatArtifactSkills(prompt)
  if (!skills.length) return ""

  return [
    "CHAT-NATIVE ARTIFACT CONTRACT:",
    "- The selected model is the author. Follow the user's requested content, stack, style and format; do not substitute a fixed MALIK template or house design.",
    "- Generate the finished deliverable inside this chat. Do not redirect the user to a separate generator section.",
    "- Put every downloadable text/source file in a complete fenced block whose opening fence is: ```language filename=relative/path.ext",
    "- Use real filenames. One self-contained web page should normally be filename=index.html. Multiple required files must all be complete; the chat UI will bundle them into a ZIP automatically.",
    "- Never say a file was attached, executed, deployed or validated unless it truly was. The download controls are added by the chat UI.",
    ...skills.map((skill) => `- ${skill.name}: ${skill.instruction}`),
  ].join("\n")
}
