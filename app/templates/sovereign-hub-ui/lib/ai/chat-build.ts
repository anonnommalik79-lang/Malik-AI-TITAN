import type { ExecutionTrace } from "@/lib/ai/chat-execution"

/**
 * A chat turn that builds something to run — a site, a game, a web app — is
 * shown as its build: the steps one after another, then the result with a
 * live preview. The code is not shown while it is being written.
 *
 * The steps are the stages the server itself reported in the turn's
 * execution trace, never invented ones: a step appears once the server says
 * it started, and its time is the gap to the next one. Time alone never moves
 * the list forward.
 */

export type ChatBuildKind = "site" | "game" | "app"

const BUILD_INTENT = /(?<!\p{L})(?:созда|сдела|напиш|собер|сгенерир|разработ|построй|сверста|запили|замути|create|build|make|generate|develop|code\s+(?:a|me|the))/iu
const EDIT_INTENT = /(?<!\p{L})(?:исправ|добав|измени|поменя|передела|улучш|доработ|обнови|fix|add|change|improve|update|remake)/iu
/** A question about building, not a request to build: «как сделать сайт?». */
const ASKS_HOW = /^\s*(?:как|почему|зачем|что\s+такое|сколько|какой|какая|какие|можно\s+ли|how|why|what|which|is\s+it)(?!\p{L})/iu
const GAME_NOUN = /(?<!\p{L})(?:игр(?:а|у|ы|е|ой|ушк\p{L}*)|мини[- ]?игр\p{L}*|видеоигр\p{L}*|ойын\p{L}*|аркад\p{L}*|платформер\p{L}*|шутер\p{L}*|раннер\p{L}*|тетрис\p{L}*|змейк\p{L}*|арканоид\p{L}*|майнкрафт\p{L}*|game|games|platformer|shooter|tetris|roguelike|minecraft|battle\s*royale|pubg)(?!\p{L})/iu
const SITE_NOUN = /(?<!\p{L})(?:сайт\p{L}*|веб[- ]?сайт\p{L}*|лендинг\p{L}*|веб[- ]?страниц\p{L}*|одностраничник\p{L}*|интернет[- ]магазин\p{L}*|website|web\s*site|landing(?:\s*page)?|homepage|web\s*page)(?!\p{L})/iu
const APP_NOUN = /(?<!\p{L})(?:html|веб[- ]?приложени\p{L}*|web\s*app\p{L}*|калькулятор\p{L}*|дашборд\p{L}*|dashboard|to-?do|туду|таймер\p{L}*|виджет\p{L}*|портфолио|страниц[уаы])(?!\p{L})/iu
/** A named stack the chat cannot run in its preview: that answer stays ordinary code. */
const OTHER_STACK = /(?<!\p{L})(?:на|in|with|using|via)\s+(?:python|питоне?|pygame|unity|юнити|godot|unreal|c\+\+|c#|java(?!script)|kotlin|swift|rust|go(?:lang)?|php|lua|flutter|react\s*native)(?![\p{L}+#])/iu
const OTHER_ARTIFACT = /(?<!\p{L})(?:telegram|телеграм)[- ]?бот|презентац|pptx|docx|xlsx|excel|эксел/iu

/** What a request asks Malik AI to build and show running, or null for an ordinary answer. */
export function chatBuildKind(question: string): ChatBuildKind | null {
  const text = String(question || "").trim()
  if (!text || ASKS_HOW.test(text)) return null
  const head = text.slice(0, 260)
  if (OTHER_STACK.test(head) || OTHER_ARTIFACT.test(head)) return null
  const creates = BUILD_INTENT.test(text)
  const edits = EDIT_INTENT.test(head)
  if (GAME_NOUN.test(text) && (creates || edits)) return "game"
  if (SITE_NOUN.test(text) && (creates || edits)) return "site"
  if (APP_NOUN.test(head) && creates) return "app"
  return null
}

/** The server's own stage names that only a game or a site build reports. */
const TRACE_KINDS: Array<[RegExp, ChatBuildKind]> = [
  [/^(?:Проектирую игру|Пишу код игры|Собираю страницу игры|Designing the game|Writing the game code|Building the game page|Ойынды жобалаймын)/u, "game"],
  [/^(?:Проектирую композицию|Подбираю изображения по теме|Подбираю фотографии по теме|Собираю страницы, корзину|Проверяю сайт и дорабатываю|Art-directing the site|Choosing photos for the topic|Building the pages)/u, "site"],
]

/** A build the request did not name (a change to a game, say) is known by the stages the server reports. */
export function chatBuildKindFromTrace(trace: ExecutionTrace | undefined): ChatBuildKind | null {
  for (const step of trace?.steps || []) {
    for (const [pattern, kind] of TRACE_KINDS) if (pattern.test(step.title)) return kind
  }
  return null
}

/** A finished answer that carries a Malik game or a Malik Site Forge page. */
export function chatBuildKindFromContent(markdown: string): ChatBuildKind | null {
  const text = String(markdown || "")
  if (text.includes('id="malik-game-plan"')) return "game"
  if (text.includes('id="malik-site"') && text.includes("malik-forge/v1")) return "site"
  return null
}

export type ChatBuildFile = { name: string; language: string; content: string; lines: number; bytes: number; closed: boolean }

const EXTENSION_LANGUAGE: Record<string, string> = {
  html: "html", htm: "html", css: "css", js: "javascript", mjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
  json: "json", svg: "svg", md: "markdown", py: "python", txt: "text",
}
const DEFAULT_NAME: Record<string, string> = {
  html: "index.html", htm: "index.html", css: "style.css", javascript: "script.js", js: "script.js", jsx: "App.jsx", tsx: "App.tsx",
  typescript: "index.ts", ts: "index.ts", json: "data.json", svg: "image.svg",
}
const LANGUAGE_ALIAS: Record<string, string> = { htm: "html", js: "javascript", mjs: "javascript", ts: "typescript", py: "python", md: "markdown" }
/** Fences that are not files: drawings of a tree, shell lines, the chat's own blocks. */
const NOT_A_FILE = /^(?:|text|txt|plaintext|tree|bash|sh|shell|console|md|markdown|mermaid|diff|patch)$/i

function fenceInfo(line: string) {
  const raw = line.replace(/^\s*```+/, "").trim()
  const [first = "", ...rest] = raw.split(/\s+/)
  const named = /^(?:filename|file|path)=(.+)$/i.exec(first)
  const clean = (value: string) => value.replace(/^["'`]|["'`]$/g, "").replace(/\\/g, "/").replace(/^\.?\//, "").slice(0, 120)
  if (named) {
    const name = clean([named[1], ...rest].join(" "))
    return { language: EXTENSION_LANGUAGE[name.split(".").pop()?.toLowerCase() || ""] || "text", name }
  }
  const colon = /^([\w+.-]+):(.+\.[\w-]+)$/.exec(first)
  if (colon) return { language: colon[1].toLowerCase(), name: clean(colon[2]) }
  if (/^[\w./@+-]+\.[a-z0-9]{1,8}$/i.test(first) && !rest.length) {
    const name = clean(first)
    return { language: EXTENSION_LANGUAGE[name.split(".").pop()?.toLowerCase() || ""] || "text", name }
  }
  const restName = /(?:filename|file|path)=(\S+)/i.exec(rest.join(" "))?.[1]
  return { language: first.replace(/[^\w+.-]/g, "").toLowerCase(), name: restName ? clean(restName) : "" }
}

function byteLength(value: string) {
  return typeof TextEncoder === "function" ? new TextEncoder().encode(value).byteLength : value.length
}

/** The files an answer delivers, in order; a fence still being written is the last one, not closed. */
export function chatBuildFiles(markdown: string): ChatBuildFile[] {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n")
  const files: ChatBuildFile[] = []
  const taken = new Set<string>()
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*```/.test(lines[index])) continue
    const fence = fenceInfo(lines[index])
    const info = { ...fence, language: LANGUAGE_ALIAS[fence.language] || fence.language }
    const body: string[] = []
    index += 1
    while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) { body.push(lines[index]); index += 1 }
    const closed = index < lines.length
    if (info.language.startsWith("malik-") || (!info.name && NOT_A_FILE.test(info.language))) continue
    let name = info.name || DEFAULT_NAME[info.language] || `file-${files.length + 1}.${info.language || "txt"}`
    for (let copy = 2; taken.has(name.toLowerCase()); copy += 1) name = name.replace(/(\.[\w-]+)?$/, (ext) => `-${copy}${ext || ""}`)
    taken.add(name.toLowerCase())
    const content = body.join("\n")
    files.push({ name, language: info.language || EXTENSION_LANGUAGE[name.split(".").pop()?.toLowerCase() || ""] || "text", content, lines: body.length, bytes: byteLength(content), closed })
  }
  return files
}

export function chatBuildPreviewable(file: ChatBuildFile) {
  return ["html", "htm", "svg", "jsx", "tsx"].includes(file.language) || /<!doctype html|<html[\s>]/i.test(file.content)
}

/** The file the preview opens: a whole HTML document first, then any page or component. */
export function chatBuildPrimary(files: ChatBuildFile[]): ChatBuildFile | undefined {
  const done = files.filter((file) => file.closed)
  return done.find((file) => /\.html?$/i.test(file.name) && /<!doctype html|<html[\s>]/i.test(file.content))
    || done.find((file) => /\.html?$/i.test(file.name))
    || done.find(chatBuildPreviewable)
}

/** While the answer streams: how much code has been written so far. */
export function chatBuildWriting(markdown: string) {
  const files = chatBuildFiles(markdown)
  const current = files.find((file) => !file.closed) || files[files.length - 1]
  return { started: files.length > 0, files: files.length, lines: files.reduce((sum, file) => sum + file.lines, 0), current: current?.name || "" }
}

/** Streamed prose with no code after this much text is an ordinary answer, not a build. */
export const BUILD_PROSE_LIMIT = 1200

export function chatBuildIsProse(markdown: string) {
  const text = String(markdown || "")
  return text.length > BUILD_PROSE_LIMIT && !/^\s*```/m.test(text)
}

export type ChatBuildStep = { id: string; title: string; state: "running" | "done" | "failed"; startedAt: number; ms: number }

export const BUILD_FIRST_STEP = "Анализ запроса"
/** Bookkeeping the server reports around every turn; not a stage of the build. */
const HIDDEN_STEP = /^(?:Отправка запроса|Обработка запроса|Сборка проекта|Malik AI принял запрос|Malik AI начинает сборку проекта|Думает|Пишет ответ|Ожидаю ответ сервиса|Ответ продолжает поступать|Мгновенный ответ без внешних инструментов|Создание игры|Правка игры|Сборка сайта|Правка сайта|Проверка и доработка сайта|Автопродолжение ответа|Продолжение ответа)$/u
const WRITING_STEP = /^(?:Подготовка ответа моделью|Написание кода моделью|Ответ поступает в чат)$/u

/**
 * The build's steps from the execution trace: «Анализ запроса» from the
 * request until the server's first stage, then each stage the server
 * reported. The last one spins while the turn runs. `now` is on the server's
 * clock (the caller corrects for skew), as are all the trace's times.
 */
export function chatBuildSteps(trace: ExecutionTrace | undefined, options: { kind: ChatBuildKind; now: number }): ChatBuildStep[] {
  if (!trace) return []
  const writing = options.kind === "game" ? "Пишу код игры" : "Пишу код"
  const rows: ChatBuildStep[] = [{ id: "analysis", title: BUILD_FIRST_STEP, state: "done", startedAt: trace.startedAt, ms: 0 }]
  for (const step of [...trace.steps].sort((left, right) => left.startedAt - right.startedAt)) {
    if (step.id.endsWith(":request")) continue
    let title = step.title.replace(/\s*(?:…|\.{3})\s*$/u, "").replace(/\s+/g, " ").trim()
    if (!title || HIDDEN_STEP.test(title)) continue
    if (step.kind === "search" || step.kind === "read") title = "Изучаю источники"
    else if (WRITING_STEP.test(title)) {
      // A game is written before the chat gets it: its «answer arrives» is not a second writing step.
      if (rows.some((row) => row.title === writing)) continue
      title = writing
    }
    const last = rows[rows.length - 1]
    if (last.title === title) continue
    rows.push({ id: step.id, title, state: "done", startedAt: Math.max(step.startedAt, last.startedAt), ms: 0 })
  }
  const running = trace.state === "running"
  const lastStart = rows[rows.length - 1].startedAt
  const end = running ? Math.max(options.now, lastStart) : Math.max(trace.endedAt ?? lastStart, lastStart)
  rows.forEach((row, index) => { row.ms = Math.max(0, (rows[index + 1]?.startedAt ?? end) - row.startedAt) })
  if (running) rows[rows.length - 1].state = "running"
  else if (trace.state !== "completed") rows[rows.length - 1].state = "failed"
  return rows
}

/** The whole build, from the request to the finished answer. */
export function chatBuildTotalMs(trace: ExecutionTrace | undefined, tookMs?: number) {
  if (trace && trace.state !== "running" && trace.endedAt && trace.endedAt >= trace.startedAt) return trace.endedAt - trace.startedAt
  return typeof tookMs === "number" && tookMs > 0 ? tookMs : undefined
}

export function formatBuildSeconds(ms: number, english = false) {
  const seconds = Math.max(0, ms) / 1000
  const value = seconds < 100 ? seconds.toFixed(1) : String(Math.round(seconds))
  return english ? `${value} s` : `${value.replace(".", ",")} сек`
}

const COPY = {
  ru: {
    working: { site: "Создаю сайт", game: "Создаю игру", app: "Создаю проект" },
    editing: { site: "Обновляю сайт", game: "Обновляю игру", app: "Обновляю проект" },
    done: { site: "Сайт успешно создан!", game: "Игра успешно создана!", app: "Проект успешно создан!" },
    edited: { site: "Сайт успешно обновлён!", game: "Игра успешно обновлена!", app: "Проект успешно обновлён!" },
    total: "Итого",
    steps: "Этапы сборки",
  },
  en: {
    working: { site: "Building the site", game: "Building the game", app: "Building the project" },
    editing: { site: "Updating the site", game: "Updating the game", app: "Updating the project" },
    done: { site: "The site is ready!", game: "The game is ready!", app: "The project is ready!" },
    edited: { site: "The site is updated!", game: "The game is updated!", app: "The project is updated!" },
    total: "Total",
    steps: "Build steps",
  },
} as const

export function chatBuildCopy(question: string) {
  return /[Ѐ-ӿ]/u.test(question) || !question.trim() ? COPY.ru : COPY.en
}

export function chatBuildIsEdit(question: string) {
  return EDIT_INTENT.test(String(question || "").slice(0, 260)) && !BUILD_INTENT.test(String(question || "").slice(0, 80))
}

export type ChatBuildFacts = {
  title: string
  sections: number
  pages: number
  technologies: string[]
  responsive: boolean
  bytes: number
  lines: number
  game?: { genre?: string; engine?: string; levels?: number }
}

function decodeTitle(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

/** What the result card says about the build — read from the delivered files, nothing assumed. */
export function chatBuildFacts(files: ChatBuildFile[], primary?: ChatBuildFile): ChatBuildFacts {
  const html = primary?.content || ""
  const all = files.map((file) => file.content).join("\n")
  let game: ChatBuildFacts["game"]
  let title = decodeTitle(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "")
  const planJson = /<script id="malik-game-plan" type="application\/json">([\s\S]*?)<\/script>/u.exec(html)?.[1]
  if (planJson) {
    try {
      const plan = JSON.parse(planJson) as { title?: unknown; genre?: unknown; engine?: unknown; levels?: unknown }
      if (typeof plan.title === "string" && plan.title.trim()) title = plan.title.trim()
      game = { genre: typeof plan.genre === "string" ? plan.genre : undefined, engine: plan.engine === "3d" ? "3D · three.js" : "2D · Canvas", levels: typeof plan.levels === "number" ? plan.levels : undefined }
    } catch { /* A plan that does not parse leaves the facts to the page itself. */ }
  }
  const technologies: string[] = []
  const add = (name: string, present: boolean) => { if (present && !technologies.includes(name)) technologies.push(name) }
  add("HTML5", files.some((file) => file.language === "html") || /<!doctype html|<html[\s>]/i.test(all))
  add("CSS3", /<style[\s>]/i.test(all) || files.some((file) => file.language === "css"))
  add("JavaScript", /<script[\s>]/i.test(all) || files.some((file) => /^(?:javascript|js)$/.test(file.language)))
  add("TypeScript", files.some((file) => /^(?:typescript|tsx)$/.test(file.language)))
  add("React", /from\s+["']react["']|React\.createElement|react(?:-dom)?(?:@[\d.]+)?\/umd/i.test(all))
  add("Three.js", /three(?:@[\d.]+)?\/build\/three|\bTHREE\.\w/.test(all))
  add("WebGL", /getContext\(\s*["'](?:webgl2?|experimental-webgl)["']|WebGLRenderer/.test(all))
  add("Canvas", /getContext\(\s*["']2d["']/.test(all) || (game?.engine?.startsWith("2D") ?? false))
  add("GSAP", /\bgsap\b/i.test(all))
  add("Tailwind CSS", /cdn\.tailwindcss\.com|tailwindcss/i.test(all))
  add("Web Audio", /AudioContext/.test(all))
  add("Google Fonts", /fonts\.googleapis\.com/i.test(all))
  const pages = new Set([...html.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]).filter((page) => page !== "404"))
  return {
    title,
    sections: (html.match(/<section[\s>]/gi) || []).length,
    pages: Math.max(pages.size, files.filter((file) => /\.html?$/i.test(file.name)).length),
    technologies,
    responsive: /<meta[^>]+name=["']viewport["']/i.test(html) && /@media|clamp\(/i.test(all),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    game,
  }
}

/** A folder name for the file tree: the page's own title, made path-safe. */
export function chatBuildFolder(title: string, kind: ChatBuildKind) {
  const slug = String(title || "").toLowerCase().replace(/[«»"'`]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 28).replace(/-+$/, "")
  return slug || (kind === "game" ? "game" : kind === "site" ? "site" : "project")
}

/** «1 строка», «3 строки», «12 строк» — with the number grouped the Russian way. */
export function ruCount(count: number, forms: readonly [string, string, string]) {
  const value = Math.abs(Math.trunc(count))
  const mod10 = value % 10, mod100 = value % 100
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2]
  return `${count.toLocaleString("ru-RU")} ${form}`
}

export function formatBuildBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0).replace(".", ",")} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`
}
