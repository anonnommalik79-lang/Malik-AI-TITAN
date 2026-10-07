import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require_ = createRequire(import.meta.url)
const React = require_("react")
const { renderToStaticMarkup } = require_("react-dom/server")
const icon = (name) => function TestIcon() { return React.createElement("svg", { "data-icon": name }) }
const lucide = { ArrowUpRight: icon("arrow-up-right"), Archive: icon("archive"), Check: icon("check"), Copy: icon("copy"), Download: icon("download"), ExternalLink: icon("external"), Eye: icon("eye"), RefreshCw: icon("refresh") }

/**
 * The chat printed the model's reply into a `whitespace-pre-wrap` div, so every
 * answer arrived as one unbroken wall of prose. Headings, lists and code all
 * landed as the same run of text, and markdown the model did produce showed up
 * as literal asterisks. Two answers of identical quality read completely
 * differently depending only on that.
 *
 * The renderer is parsed into React elements rather than HTML: the text comes
 * from a model, so it can contain anything, and `dangerouslySetInnerHTML` here
 * would be an injection route straight from a prompt to the page.
 */

function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

const source = fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText

// The formula renderer is a sibling module; it is transpiled the same way.
const texBox = { exports: {} }
new Function("require", "module", "exports", "React", ts.transpileModule(fs.readFileSync("components/sovereign/malik-tex.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText.replace(/require\("react"\)/g, "React"))(
  (name) => {
    if (name === "./malik-tex.css") return {}
    throw new Error(`unexpected require(${name})`)
  }, texBox, texBox.exports, React,
)

const box = { exports: {} }
function loadPure(file) {
  const module = { exports: {} }
  const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText
  new Function("require", "module", "exports", "React", javascript)((name) => {
    if (name === "react") return React
    if (name === "lucide-react") return lucide
    if (name.endsWith(".css")) return {}
    const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)
    const resolved = [base + ".ts", base + ".tsx"].find((candidate) => fs.existsSync(candidate))
    if (resolved) return loadPure(resolved)
    throw new Error(`unexpected pure require(${name})`)
  }, module, module.exports, React)
  return module.exports
}
const catalog = loadPure("lib/media/reference-catalog.ts")
const { chatHttpErrorMessage } = loadPure("lib/ai/errors.ts")
assert.match(chatHttpErrorMessage(403, "<!doctype html><title>Blocked</title><style>huge embedded font</style>"), /Защита сайта/)
assert(!chatHttpErrorMessage(502, "<html>proxy failure</html>", "text/html").includes("<html>"))
assert.equal(chatHttpErrorMessage(429, JSON.stringify({ error: { message: "Лимит запросов" } })), "Лимит запросов")
assert.equal(chatHttpErrorMessage(400, JSON.stringify({ message: "Укажите запрос" })), "Укажите запрос")
assert(chatHttpErrorMessage(503, "x".repeat(70_000)).length < 100)
assert(!chatHttpErrorMessage(403, JSON.stringify({ error: "<html>blocked</html>" })).includes("<html>"))
const entities = loadPure("lib/ai/answer-entities.ts")
new Function("require", "module", "exports", "React", js.replace(/require\("react"\)/g, "React"))(
  (name) => {
    if (name === "lucide-react") return lucide
    if (name === "@/lib/business/project-zip") return { downloadProjectZip() {} }
    if (name === "@/lib/canvas-preview") return { buildCanvasSrcDoc: (code) => code, buildCanvasProjectSrcDoc: (files, filename) => files.find((file) => file.name === filename)?.content || "", createCanvasBlobUrl: () => "blob:test" }
    if (name === "./malik-tex") return texBox.exports
    if (name === "./MalikVisualGallery") return { isSafeVisualUrl: catalog.isSafeVisualUrl, MalikVisualGallery: () => React.createElement("section", { "data-test-gallery": true }), MalikReferenceImages: ({ children, planOverride, row, hero, lineup }) => React.createElement("div", { "data-test-photo-topic": planOverride?.topic, "data-test-row": row ? "true" : "false", "data-test-hero": hero ? "true" : "false", "data-test-lineup": lineup ? "true" : undefined, "data-test-caption": planOverride?.caption }, children) }
    if (name === "@/lib/ai/answer-entities") return entities
    if (name === "@/lib/ai/reference-visual-policy") return loadPure("lib/ai/reference-visual-policy.ts")
    if (name === "@/lib/ai/answer-visuals") return loadPure("lib/ai/answer-visuals.ts")
    if (name === "@/lib/ai/answer-photo-hints") return loadPure("lib/ai/answer-photo-hints.ts")
    if (name === "@/lib/media/source-reference-photos") return { sourceReferencePhoto: () => null }
    if (name === "./MalikAnswerVisual") return loadPure("components/sovereign/MalikAnswerVisual.tsx")
    if (name === "./MalikAnswerCards") return loadPure("components/sovereign/MalikAnswerCards.tsx")
    if (name === "@/lib/ai/answer-cards") return loadPure("lib/ai/answer-cards.ts")
    if (name === "@/lib/ai/citation-names") return loadPure("lib/ai/citation-names.ts")
    if (name === "./MalikAnswerChecklist") return loadPure("components/sovereign/MalikAnswerChecklist.tsx")
    throw new Error(`unexpected require(${name})`)
  }, box, box.exports, React,
)
const { MalikMarkdown } = box.exports
const render = (text, props = {}) => renderToStaticMarkup(React.createElement(MalikMarkdown, { text, ...props }))

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${error.message}`)
  }
}

console.log("\nan answer arrives as structure, not as a wall of text")

check("closed grounded photo hints render topics without leaking metadata or duplicating heuristics", () => {
  const text = 'Нурсултан Назарбаев — политик.\n\n```malik-photos\n{"version":1,"subjects":[{"name":"Нурсултан Назарбаев","query":"Nursultan Nazarbayev","layout":"portrait"}]}\n```'
  const html = render(text, { visualContext: { question: "Кто такой Назарбаев" } })
  assert.equal((html.match(/data-test-photo-topic/g) || []).length, 1)
  assert(html.includes('data-test-photo-topic="Нурсултан Назарбаев"'))
  assert(!html.includes("malik-photos") && !html.includes("Nursultan Nazarbayev") && !html.includes("&quot;version&quot;"))
})
check("a head-to-head lineup shows every contender side by side with its caption", () => {
  const text = 'Claude сильнее в длинном коде, ChatGPT — в мультимодальности.\n\n```malik-photos\n{"version":1,"layout":"lineup","subjects":[{"name":"ChatGPT","query":"ChatGPT","caption":"OpenAI · GPT-5"},{"name":"Claude","query":"Claude (language model)","caption":"Anthropic · Opus"}]}\n```\n\n### 1. Что это\n\nТекст.'
  const html = render(text, { visualContext: { question: "сравни чатгпт и клод" } })
  assert(html.includes("data-malik-photo-lineup"))
  assert(html.includes("malik-answer-lineup is-2"))
  assert.equal((html.match(/data-test-lineup="true"/g) || []).length, 2)
  assert(html.includes('data-test-caption="OpenAI · GPT-5"') && html.includes('data-test-caption="Anthropic · Opus"'))
  assert(!html.includes("&quot;layout&quot;") && !html.includes("malik-photos"))
  // The lineup stands where the model put it - before the first section.
  assert(html.indexOf("data-malik-photo-lineup") < html.indexOf("Что это"))
})
check("an ordinary multi-subject fence is never turned into a lineup", () => {
  const html = render('ChatGPT и Claude.\n\n```malik-photos\n{"version":1,"subjects":[{"name":"ChatGPT","query":"ChatGPT"},{"name":"Claude","query":"Claude"}]}\n```', { visualContext: { question: "сравни чатгпт и клод" } })
  assert(!html.includes("data-malik-photo-lineup"))
})
check("[n] markers become source chips named after the site, never raw brackets", () => {
  const citations = [
    { url: "https://www.anthropic.com/news/claude", domain: "anthropic.com", title: "Claude" },
    { url: "https://openai.com/index/gpt-5", domain: "openai.com", title: "GPT-5" },
    { url: "https://platform.openai.com/docs", domain: "platform.openai.com", title: "API" },
  ]
  const html = render("Claude держит длинный контекст [1]. GPT-5 вышел в 2025 году [2][3].", { citations })
  assert(!/\[\d\]/.test(html), html)
  assert(html.includes('class="malik-md-cite"'))
  assert(html.includes(">Anthropic</a>"))
  assert(html.includes(">OpenAI +1</a>"))
  assert(html.includes('href="https://openai.com/index/gpt-5"'))
})
check("a marker without a matching source disappears; without sources text stays as written", () => {
  const html = render("Факт [7].", { citations: [{ url: "https://example.com/a", domain: "example.com" }] })
  assert(!html.includes("[7]") && !html.includes("malik-md-cite"))
  const plain = render("Список [1] остаётся.")
  assert(plain.includes("[1]"))
  // A Markdown link is still a link, not a citation.
  const link = render("[1](https://example.com/x)", { citations: [{ url: "https://example.com/a" }] })
  assert(/class="malik-md-link[^"]*"/.test(link) && !link.includes("malik-md-cite"))
})
const CARD_SOURCES = [
  { url: "https://astanahub.com/ru/event/alem-battle", domain: "astanahub.com", title: "Astana Hub", image: "https://astanahub.com/media/battle.jpg" },
  { url: "https://www.gitex.com/kazakhstan", domain: "gitex.com", title: "GITEX", image: "https://www.gitex.com/og.jpg" },
  { url: "https://activat.vc/apply", domain: "activat.vc", title: "Activat VC" },
]
const cardsFence = (json) => "Ответ.\n\n```malik-cards\n" + JSON.stringify(json) + "\n```\n\nДальше."
check("event cards: picture from the source page, name links to the official page, badge, date and chips", () => {
  const html = render(cardsFence({ version: 1, type: "cards", items: [
    { title: "Grand Final alem.ai Battle", url: "https://astanahub.com/ru/event/alem-battle", image: 1, badge: "Ближайшее в Казахстане", meta: "23 октября 2026 · Астана", text: "Финал AI-соревнования [1].", note: "Статус подачи уточняется.", links: [{ label: "Программа и регистрация", url: "https://astanahub.com/ru/event/alem-battle#program" }], sources: [2] },
    { title: "Expand North Star 2026", url: "https://invented-site.example/ens", meta: "8–10 декабря 2026 · Дубай" },
  ] }), { citations: CARD_SOURCES })
  assert(html.includes('class="malik-cards is-list"'))
  assert(html.includes('src="https://astanahub.com/media/battle.jpg"') && html.includes('referrerPolicy="no-referrer"'))
  assert(html.includes('href="https://astanahub.com/ru/event/alem-battle"'))
  assert(html.includes(">Ближайшее в Казахстане<") && html.includes("23 октября 2026 · Астана"))
  assert(html.includes("Программа и регистрация") && html.includes("malik-md-cite"))
  // A link to a site none of the sources is on is never shown: the name stays plain text.
  assert(!html.includes("invented-site.example") && html.includes("Expand North Star 2026"))
  // No picture → a quiet initial, never a broken image.
  assert(html.includes('malik-card__thumb is-empty'))
  assert(!html.includes("&quot;version&quot;") && !html.includes("malik-cards\n"))
})
check("hero, options, dates and actions render as panels and buttons", () => {
  const hero = render(cardsFence({ version: 1, type: "hero", item: { title: "GITEX AI KAZAKHSTAN 2027", url: "https://www.gitex.com/kazakhstan", image: 2, badge: "Приём заявок открыт", value: "7–8 июня 2027", meta: "Алматы, Казахстан", sources: [2] } }), { citations: CARD_SOURCES })
  assert(hero.includes("malik-cards is-hero") && hero.includes("malik-card__hero-image") && hero.includes(">gitex.com<") && hero.includes("7–8 июня 2027"))
  const options = render(cardsFence({ version: 1, type: "options", items: [
    { title: "Activat VC", url: "https://activat.vc", value: "$30 млн", valueNote: "Активы под управлением", action: { label: "Подать заявку", url: "https://activat.vc/apply" }, sources: [3] },
    { title: "Astana Hub Ventures", url: "https://astanahub.com/ventures", action: { label: "Перейти к подаче", url: "https://astanahub.com/ventures/pitch" }, facts: [{ label: "Последний день подачи", value: "2 ноября 2026" }] },
  ] }), { citations: CARD_SOURCES })
  assert(options.includes("malik-cards is-options"))
  assert((options.match(/malik-card-button is-primary/g) || []).length === 1, "only the first option is the white button")
  assert(options.includes("Последний день подачи") && options.includes("2 ноября 2026") && options.includes("$30 млн"))
  const dates = render(cardsFence({ version: 1, type: "dates", title: "Supernova", items: [{ label: "Дедлайн", value: "1 мая 2027" }, { label: "Финал", value: "8 июня 2027" }] }))
  assert(dates.includes("malik-card-dates is-2") && dates.includes("1 мая 2027"))
  const actions = render(cardsFence({ version: 1, type: "actions", items: [{ label: "Заявка Supernova", url: "https://www.gitex.com/kazakhstan/supernova", primary: true }, { label: "Фейк", url: "https://evil.example/" }] }), { citations: CARD_SOURCES })
  assert(actions.includes("Заявка Supernova") && actions.includes("is-primary is-inline") && !actions.includes("evil.example"))
})
check("without web sources a card keeps only front-page links", () => {
  const html = render(cardsFence({ version: 1, type: "cards", items: [{ title: "Python", url: "https://www.python.org/" }, { title: "Deep page", url: "https://www.python.org/made/up/page" }] }))
  assert(html.includes('href="https://www.python.org/"') && !html.includes("made/up/page"))
})
check("a half-written card fence shows a status while streaming and nothing raw", () => {
  const html = render("Ответ.\n\n```malik-cards\n{\"version\":1,\"type\":\"cards\",\"items\":[{\"title\":\"Gr", { visualContext: { question: "события", streaming: true } })
  assert(html.includes("Собираю карточки") && !html.includes("&quot;title&quot;"))
})
check("in a web answer an outside link gets ↗, an invented one stays plain text", () => {
  const html = render("Сайт [Astana Hub](https://astanahub.com/ru/) и [выдуманный](https://fake.example/x).", { citations: CARD_SOURCES })
  assert(html.includes('class="malik-md-link is-external"') && html.includes("↗"))
  assert(!html.includes("fake.example") && html.includes("выдуманный"))
})
check("a citation pointing at a non-web URL is never linked", () => {
  const html = render("Факт [1].", { citations: [{ url: "javascript:alert(1)", domain: "x" }] })
  assert(!html.includes("javascript:") && !html.includes("malik-md-cite"))
})
check("partial, malformed and ungrounded photo hints remain invisible", () => {
  for (const body of ['{"version":1', '{invalid}', '{"version":1,"subjects":[{"name":"Other person","query":"Other person"}]}']) {
    const html = render("Ответ.\n\n```malik-photos\n" + body, { visualContext: { question: "Привет", streaming: true } })
    assert(!html.includes("malik-photos") && !html.includes("version") && !html.includes("Other person"))
  }
})
check("a named-place photo sits beside its description without duplicating text", () => {
  const html = render('## Медеу\n\nВысокогорный каток.\n\n```malik-photos\n{"version":1,"subjects":[{"name":"Медеу","query":"Medeu"}]}\n```', { visualContext: { question: "Расскажи про достопримечательности Алматы" } })
  assert.equal((html.match(/data-test-photo-topic/g) || []).length, 1)
  assert.equal((html.match(/Высокогорный каток/g) || []).length, 1)
  assert(!html.includes("data-malik-photo-hints"))
})
check("photo hints respect opt-outs and keep exact verified product collections", () => {
  const answer = 'iPhone 16 Pro.\n\n```malik-photos\n{"version":1,"subjects":[{"name":"iPhone 16 Pro","query":"iPhone 16 Pro"}]}\n```'
  const plain = render(answer, { visualContext: { question: "Расскажи про iPhone без фото" } })
  assert(!plain.includes("data-test-photo-topic"))
  const all = render(answer, { visualContext: { question: "Покажи все модели айфона" } })
  assert(!all.includes("data-malik-photo-hints"))
  assert.equal((all.match(/data-test-photo-topic/g) || []).length, 1)
})

check("paragraphs separated by a blank line become separate paragraphs", () => {
  const html = render("Первый абзац.\n\nВторой абзац.")
  assert.equal((html.match(/<p /g) || []).length, 2)
})
check("entity rows preserve real descriptions once, including the final paragraph", () => {
  const html = render("## Metricool\n\nПланирование публикаций.\n\n## Canva\n\nСоздание графики.")
  assert.equal((html.match(/data-malik-answer-entity/g) || []).length, 2)
  assert.equal((html.match(/Планирование публикаций/g) || []).length, 1)
  assert.equal((html.match(/Создание графики/g) || []).length, 1)
})
check("chat can forbid model-invented image links while keeping text", () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: "Описание.\n\n![Фото](https://thumb.wikimedia.org/example.jpg)", allowImages: false }))
  assert.ok(html.includes("Описание."))
  assert.ok(!html.includes("data-test-gallery"))
})

check("bullets become a list", () => {
  const html = render("Из чего:\n\n- геометрия\n- материалы\n- свет")
  assert.match(html, /<ul/)
  assert.equal((html.match(/<li>/g) || []).length, 3)
})

check("numbered steps keep their numbering", () => {
  const html = render("Шаги:\n\n1. первый\n2. второй\n3. третий")
  assert.match(html, /<ol/)
  assert.equal((html.match(/<li>/g) || []).length, 3)
})

check("bold, italic and inline code are rendered, not printed as symbols", () => {
  const html = render("**Рендер** это *визуализация* через `blender`")
  assert.match(html, /<strong[^>]*>Рендер<\/strong>/)
  assert.match(html, /<em[^>]*>визуализация<\/em>/)
  assert.match(html, /<code[^>]*>blender<\/code>/)
  assert.ok(!html.includes("**"), "no stray asterisks may survive")
})

check("bold around inline maths never leaks literal markdown markers", () => {
  const html = render("1. **$x < -\\sqrt{3}$**: мысалы, -2\n2. **$1 < x < \\sqrt{3}$**: мысалы, 1.2")
  assert.match(html, /class="malik-md-strong"/)
  assert.match(html, /class="mtx/)
  assert.ok(!html.includes("**"), "bold markers around formula must be consumed")
})

check("completed prose hides orphan math punctuation and display delimiters", () => {
  const html = render("Шекарасы: $x=0$ кірмейді $)$. Соңы$$.")
  assert.ok(!html.includes("$)$"), "punctuation wrapper must not leak")
  assert.ok(!html.includes("$$"), "orphan display delimiter must not leak")
  assert.match(html, /кірмейді \)/)
})

check("streaming keeps incomplete formatting untouched until the model closes it", () => {
  const html = render("Жауап$$", { visualContext: { question: "есеп", streaming: true } })
  assert.ok(html.includes("$$"))
})

check("a fenced block becomes a code block with its own scroll", () => {
  const html = render("Команда:\n\n```bash\nnpm run build\n```")
  assert.match(html, /<pre[^>]*class="malik-md-pre"/)
  assert.match(html, /class="malik-md-codebar"/)
  assert.match(html, /Копировать/)
  assert.match(html, /npm run build/)
  const css = fs.readFileSync("app/titan-chat.css", "utf8")
  assert.match(css, /malik-md-pre[\s\S]{0,400}overflow-x: auto/, "a long line must not widen the conversation")
})

check("a Markdown comparison becomes an accessible table", () => {
  const html = render("| Модель | Скорость |\n| --- | --- |\n| Fast | Высокая |\n| Pro | Средняя |")
  assert.match(html, /<table class="malik-md-table">/)
  assert.equal((html.match(/<th/g) || []).length, 3) // thead + two header cells
  assert.equal((html.match(/<td/g) || []).length, 4)
})

check("headings become headings", () => {
  const html = render("## Где применяется\n\nтекст")
  assert.match(html, /<h3[^>]*class="malik-md-h/)
})

check("model text is never injected as HTML", () => {
  const component = codeOf("components/sovereign/MalikMarkdown.tsx")
  assert.ok(!component.includes("dangerouslySetInnerHTML"), "a prompt must not be able to reach the DOM as markup")
  const html = render("<img src=x onerror=alert(1)>")
  assert.ok(!html.includes("<img"), "raw HTML in the answer stays text")
})

check("an unterminated code fence does not swallow the rest of the answer", () => {
  // Streaming answers get cut off mid-block all the time.
  const html = render("Вот код:\n\n```js\nconst a = 1")
  assert.match(html, /token-keyword">const/)
  assert.match(html, / a = /)
  assert.match(html, /token-number">1/)
})

check("a plain one-line answer stays one plain paragraph", () => {
  const html = render("Да, работает.")
  assert.equal((html.match(/<p /g) || []).length, 1)
  assert.ok(!html.includes("<ul"))
})

const visualTools = loadPure("lib/ai/answer-visuals.ts")
const team = { version: 1, type: "composition", title: "Планируемая команда", unit: "человек", items: [{ label: "Разработка", value: 5 }, { label: "AI-видео", value: 5 }, { label: "Продвижение", value: 4 }] }
const fence = (value) => "```malik-visual\n" + JSON.stringify(value) + "\n```"
check("team card computes 14 and keeps roles table", () => {
  const html = render(fence(team) + "\n\n| Роль | Задача |\n| --- | --- |\n| Lead | Архитектура |")
  assert.match(html, /data-malik-answer-visual="composition"/)
  assert.match(html, /data-malik-visual-total[^>]*>14/)
  assert.match(html, /<table/)
  assert.doesNotMatch(html, /malik-md-codebar|&quot;version&quot;/)
})
check("numeric table gets a local visual without dropping evidence", () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: "| Отдел | Человек |\n| --- | --- |\n| Разработка | 5 |\n| Видео | 5 |\n| Продвижение | 4 |\n| Итого | 14 |", visualContext: { question: "Состав команды" } }))
  assert.match(html, /data-malik-visual-total[^>]*>14/)
  assert.match(html, /<table/)
})
check("streamed JSON remains hidden until complete", () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: "Ответ.\n\n```malik-visual\n{\"type\":", visualContext: { question: "Команда", streaming: true } }))
  assert.match(html, /Подготавливаю/)
  assert.doesNotMatch(html, /&quot;type&quot;|<figure/)
})
check("plain text preference and two card limit are respected", () => {
  const text = [fence(team), fence(team), fence(team)].join("\n\n")
  assert.equal((render(text).match(/data-malik-answer-visual=/g) || []).length, 2)
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text, visualContext: { question: "Только текст" } }))
  assert.doesNotMatch(html, /<figure|malik-visual/)
})
check("invalid totals, percentages, duplicate labels and oversized data are rejected", () => {
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ ...team, total: 15 })), null)
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ ...team, unit: "%" })), null)
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ ...team, items: [team.items[0], team.items[0]] })), null)
  assert.equal(visualTools.parseAnswerVisual(" ".repeat(13000)), null)
  assert.equal(visualTools.inferListVisual(["Открой настройки", "Нажми кнопку"], "Инструкция"), null)
  assert.equal(visualTools.inferListVisual(["3-4 разработчика", "5 дизайнеров"], "Команда"), null)
})
check("all visual types render safe text and exact numeric values", () => {
  for (const type of ["bars", "metrics"]) {
    const html = render(fence({ ...team, type, title: "<img onerror=alert(1)>", items: [{ label: "A", value: -3 }, { label: "B", value: 0 }] }))
    assert.match(html, new RegExp(`data-malik-answer-visual="${type}"`))
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /-3/)
  }
  assert.match(render(fence({ type: "timeline", title: "План", steps: [{ label: "Исследование", date: "Неделя 1" }, { label: "Запуск" }] })), /data-malik-answer-visual="timeline"/)
})

check("checklists preserve confirmed states and expose accessible progress", () => {
  const html = render(fence({ type: "checklist", title: "План на сегодня", items: [{ label: "Проверить чат", detail: "История и ошибки", checked: true }, { label: "Проверить мобильную версию" }] }))
  assert.match(html, /data-malik-answer-visual="checklist"/)
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2)
  assert.equal((html.match(/checked=""/g) || []).length, 1)
  assert.match(html, /aria-valuenow="1"/)
  assert.match(html, /1\/2/)
  assert.match(html, /Копировать чек-лист/)
  assert.match(html, /История и ошибки/)
})
check("ordinary Markdown tasks get a checklist without losing descriptions", () => {
  const html = render("- [ ] **Проверить чат** История и streaming\n- [x] **Добавить карточки** Две колонки")
  assert.match(html, /data-malik-answer-visual="checklist"/)
  assert.match(html, /История и streaming/)
  assert.match(html, /aria-valuenow="1"/)
  assert.doesNotMatch(html, /\*\*Проверить/)
})
check("a requested checklist also works when the model sends ordinary numbered items", () => {
  const html = render("## Запуск проекта\n\n1. **Проверить чат** — История и отправка\n2. Настроить доступ: Вход и выход", { visualContext: { question: "Составь чек-лист запуска", messageId: "qa-checklist" } })
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2)
  assert.match(html, /0\/2/)
  assert.match(html, /История и отправка/)
  assert.match(html, /Вход и выход/)
  assert.equal((html.match(/Запуск проекта/g) || []).length, 1, "reuse the heading once")
  assert.doesNotMatch(render("1. Один\n2. Два", { visualContext: { question: "Составь чек-лист, только текст" } }), /type="checkbox"/)
})
check("empty image placeholders disappear while the explanation and code stay intact", () => {
  const html = render("## Медеу\n\nВысокогорный каток.\n![Медеу]()\n\nСледующий абзац.", { allowImages: false })
  assert.doesNotMatch(html, /!\[Медеу\]/)
  assert.match(html, /Высокогорный каток/)
  assert.match(html, /Следующий абзац/)
  assert.match(render("```markdown\n![Медеу]()\n```"), /Медеу/, "code examples must not be removed")
})
check("a requested identity card has a fallback while feature comparisons keep their table", () => {
  const source = "| Слева | Справа |\n| --- | --- |\n| MALIK AI | Команда |\n| Основатель | Разработчики |"
  assert.match(render(source, { visualContext: { question: "Покажи карточку в две колонки" } }), /data-malik-answer-visual="comparison"/)
  assert.match(render(source, { visualContext: { question: "Сравни в таблице" } }), /<table/)
})
check("one named subject gets a large photograph directly with its description", () => {
  const source = '## Альберт Эйнштейн\n\nФизик-теоретик.\n\n' +
    '　'.replace('　', '') + '```malik-photos\n{"version":1,"subjects":[{"name":"Альберт Эйнштейн","query":"Albert Einstein","kind":"person","layout":"portrait"}]}\n```'
  const html = render(source, { visualContext: { question: "Кто такой Альберт Эйнштейн" } })
  assert.match(html, /data-test-photo-topic="Альберт Эйнштейн"[^>]*data-test-hero="true"/)
  assert.equal((html.match(/Физик-теоретик/g) || []).length, 1, "description must not be duplicated")
  assert.doesNotMatch(html, /data-malik-photo-hints/, "anchored images must not be repeated after the answer")
})
check("multiple named list items each own their matching inline image, not a bottom gallery", () => {
  const source = '- **Багдат Мусин** — описание первого.\n- **Jeff Dean** — описание второго.\n\n' +
    '```malik-photos\n{"version":1,"subjects":[{"name":"Багдат Мусин","query":"Bagdat Mussin","kind":"person","layout":"portrait"},{"name":"Jeff Dean","query":"Jeff Dean","kind":"person","layout":"portrait"}]}\n```'
  const html = render(source, { visualContext: { question: "Назови нескольких спикеров" } })
  assert.match(html, /<li[^>]*><div data-test-photo-topic="Багдат Мусин"[^>]*data-test-row="true"/)
  assert.match(html, /<li[^>]*><div data-test-photo-topic="Jeff Dean"[^>]*data-test-row="true"/)
  assert.doesNotMatch(html, /data-malik-photo-hints/)
})
check("unverified event names do not gain fallback portraits", () => {
  const html = render("## Эмма Уотсон\n\nЕё выступление не подтверждено.", { visualContext: { question: "Кто спикеры AI Digital Bridge?" } })
  assert.doesNotMatch(html, /data-test-photo-topic=/)
})
check("comparison cards keep both identities and escape untrusted content", () => {
  const html = render(fence({ type: "comparison", title: "Подписи", columns: [{ label: "Слева — ты", title: "MALIK AI", subtitle: "FOUNDER & CEO", detail: "Building the Future." }, { label: "Справа", title: "<img onerror=alert(1)>", detail: "Уточнить должность" }] }))
  assert.match(html, /data-malik-answer-visual="comparison"/)
  assert.match(html, /MALIK AI/)
  assert.match(html, /FOUNDER &amp; CEO/)
  assert.match(html, /Уточнить должность/)
  assert.doesNotMatch(html, /<img/)
})
check("malformed or oversized interactive blocks cannot claim completion", () => {
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ type: "checklist", title: "План", items: [{ label: "Задача", checked: "true" }] })), null)
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ type: "checklist", title: "План", items: Array.from({ length: 21 }, () => ({ label: "Задача" })) })), null)
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ type: "comparison", title: "Сравнение", columns: [{ label: "Один", title: "A" }] })), null)
  assert.equal(visualTools.parseAnswerVisual(JSON.stringify({ type: "comparison", title: "Сравнение", columns: [{ label: "Один", title: "A" }, { label: "Два" }] })), null)
})

console.log("\nwiring")

check("the chat renders the assistant reply through it", () => {
  const chat = codeOf("components/sovereign/chat-view.tsx")
  assert.match(chat, /MalikMarkdown/, "the component must be used")
  assert.ok(!/malik-message-card-assistant whitespace-pre-wrap/.test(chat),
    "pre-wrap on the assistant card would double the spacing the blocks already have")
})

check("the model is told to structure its answer", () => {
  const persona = fs.readFileSync("lib/ai/persona.ts", "utf8")
  assert.match(persona, /Never answer with one unbroken block of text/)
  assert.match(persona, /bulleted list/)
  assert.match(persona, /blank line before and after every list/)
  // A short answer must not get headings bolted onto it.
  assert.match(persona, /one-sentence answer stays one sentence/)
})

console.log("\nformulas, nested lists and numbering, like ChatGPT")

check("display maths is typeset, not shown as LaTeX", () => {
  const html = render("Формула:\n\n$$\\frac{a}{b} + \\sqrt{x^2 + 1}$$\n\nГотово.")
  assert.match(html, /class="mtx mtx-display"/)
  assert.match(html, /class="mtx-frac"/)
  assert.match(html, /class="mtx-sqrt"/)
  assert.match(html, /<sup>/)
  assert.doesNotMatch(html.replace(/aria-label="[^"]*"/g, ""), /\\frac/)
})

check("multi-line \\[ … \\] blocks and inline $…$ are typeset", () => {
  const html = render("Площадь круга $S = \\pi r^2$, а сумма:\n\\[\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n\\]")
  assert.match(html, /class="mtx"/)
  assert.match(html, /π/)
  assert.match(html, /class="mtx-limits"/)
  assert.match(html, /∑/)
})

check("$$…$$ in the middle of a line is set as a display formula", () => {
  const html = render("Сумма первых $n$ чисел: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$ — это формула Гаусса.")
  assert.match(html, /class="mtx mtx-display"/)
  assert.doesNotMatch(html.replace(/aria-label="[^"]*"/g, ""), /\\sum|\$\$/)
})

check("prices are not mistaken for maths", () => {
  const html = render("Тариф стоит $5, а годовой $50.")
  assert.doesNotMatch(html, /class="mtx/)
  assert.match(html, /\$5, а годовой \$50/)
})

check("code spans keep their dollar signs", () => {
  const html = render("Переменная `$HOME` и `$PATH`.")
  assert.doesNotMatch(html, /class="mtx/)
  assert.match(html, /<code class="malik-md-code">\$HOME<\/code>/)
})

check("an unfinished formula while streaming stays as text", () => {
  const html = render("Решение:\n\n$$\\frac{a}{")
  assert.doesNotMatch(html, /mtx-display/)
})

check("matrices, cases, Greek letters and \\text render", () => {
  const html = render("$$A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\alpha \\leq \\beta, \\text{где } x \\in \\mathbb{R}$$")
  assert.match(html, /mtx-matrix/)
  assert.match(html, /α/)
  assert.match(html, /≤/)
  assert.match(html, /ℝ/)
  assert.match(html, /где/)
})

check("indented items become a nested list", () => {
  const html = render("- Фрукты\n  - Яблоко\n  - Груша\n- Овощи")
  assert.match(html, /<ul class="malik-md-ul"><li>Фрукты<ul class="malik-md-ul"><li>Яблоко<\/li><li>Груша<\/li><\/ul><\/li><li>Овощи<\/li><\/ul>/)
})

check("a numbered list split by blank lines keeps counting", () => {
  const html = render("1. Первый шаг\n\n2. Второй шаг\n\n3. Третий шаг")
  assert.equal((html.match(/<ol/g) || []).length, 1)
  const later = render("Продолжение:\n\n4. Четвёртый шаг")
  assert.match(later, /<ol class="malik-md-ol" start="4">/)
})

check("task lists show checked and open boxes", () => {
  const html = render("- [x] Сделано\n- [ ] Осталось")
  assert.match(html, /type="checkbox" checked=""/)
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2)
  assert.match(html, /Выполнено 1 из 2/)
})

check("any mix of lines finishes rendering (no endless loop)", () => {
  const pieces = ["$$", "\\[", "\\]", "- a", "  - b", "1. x", "", "text $x$", "| a | b |", "|---|---|", "```", "> q", "# h", "$$x$$", "\\frac{", "  continued", "- [x] t", "3) y", "+ z"]
  let seed = 7
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let round = 0; round < 400; round += 1) {
    const lines = Array.from({ length: 1 + Math.floor(random() * 14) }, () => pieces[Math.floor(random() * pieces.length)])
    render(lines.join("\n"))
  }
})

check("task-specific flow renders arrows and parallel tools as semantic HTML without a photo request", () => {
  const flow = { version: 1, type: "flow", title: "Архитектура", subtitle: "Предлагаемая схема", stages: [
    { label: "Пользователь", detail: "Задача" }, { label: "Оркестратор", detail: "План" },
    { label: "Инструменты", nodes: [{ label: "Research", detail: "Проверка источников" }, { label: "Code", detail: "Разработка и тесты" }, { label: "Documents", detail: "Файлы" }, { label: "Browser", detail: "Сайты" }] },
    { label: "Проверка и согласование" }, { label: "Результат" },
  ] }
  const html = render("## Как это работает\n\n```malik-visual\n" + JSON.stringify(flow) + "\n```\n\nНе утверждение о внутренних системах компании.", { visualContext: { question: "Объясни архитектуру бизнес-системы", isLatest: true } })
  assert(html.includes('data-malik-answer-visual="flow"'))
  assert.equal((html.match(/class="malik-answer-flow__arrow"/g) || []).length, 4)
  assert(html.includes("Проверка источников") && html.includes("Не утверждение"))
  assert(!html.includes("malik-visual") && !html.includes("data-test-photo-topic"))
  const parser = loadPure("lib/ai/answer-visuals.ts")
  assert.equal(parser.parseAnswerVisual(JSON.stringify({ ...flow, stages: [{ label: "one" }] })), null)
  assert.equal(parser.parseAnswerVisual(JSON.stringify({ ...flow, stages: [{ label: "one", nodes: [{ label: "" }] }, { label: "two" }] })), null)
  const exported = loadPure("lib/ai/answer-cards.ts").answerCardsToText("До.\n\n```malik-visual\n" + JSON.stringify(flow) + "\n```\n\nПосле.")
  assert(exported.includes("Предлагаемая схема") && exported.includes("Research — Проверка источников") && exported.includes("5. Результат"))
  assert(!/malik-visual|"stages"|"version"/.test(exported))
  assert(exported.startsWith("До.") && exported.endsWith("После."))
})
check("pricing columns preserve exact values/conditions and source chips without decorative photos", () => {
  const pricing = { version: 1, type: "pricing", items: [{ title: "Test product", offers: [{ label: "Standard", value: "$12", note: "за месяц · тестовые данные" }, { label: "Premium", value: "$34", note: "за месяц · тестовые данные" }], text: "Условия тарифа [1]" }] }
  const html = render("## Стоимость\n\n```malik-cards\n" + JSON.stringify(pricing) + "\n```", { citations: [{ url: "https://example.com/pricing", domain: "example.com" }], visualContext: { question: "Сравни тарифы продуктов" } })
  assert(html.includes("malik-card-offers is-2"))
  assert(html.includes("$12") && html.includes("$34") && html.includes("тестовые данные"))
  assert(html.includes("malik-md-cite"))
  assert(!html.includes("data-test-photo-topic"))
  const exported = loadPure("lib/ai/answer-cards.ts").answerCardsToText("```malik-cards\n" + JSON.stringify(pricing) + "\n```")
  assert(exported.includes("Standard: $12") && exported.includes("Premium: $34"))
})
check("software cards show exact logos in their own section at first render without waiting for an effect", () => {
  const text = '## Экосистемы\n\n```malik-cards\n{"version":1,"type":"cards","items":[{"title":"ChatGPT","image":"ChatGPT","text":"OpenAI · модельный ответ"},{"title":"Claude","image":"Claude","text":"Anthropic · модельный ответ"}]}\n```\n\n## Следующий раздел\n\nТекст без повторных фотографий.'
  const html = render(text, { visualContext: { question: "Сравни ChatGPT и Claude для бизнеса" } })
  assert(html.includes("OpenAI_logo_2025") && html.includes("Claude_AI_symbol"))
  assert.equal((html.match(/is-logo/g) || []).length, 2)
  assert(!html.includes("data-test-photo-topic"))
  assert(html.indexOf("Claude_AI_symbol") < html.indexOf("Следующий раздел"))
  assert(html.includes("Текст без повторных фотографий"))
})
check("even a model-authored photo fence cannot turn an abstract business process into a stock-photo search", () => {
  const html = render('## Контент-маркетинг\n\nМатериалы для клиентов.\n\n```malik-photos\n{"version":1,"subjects":[{"name":"Контент-маркетинг","query":"Content marketing","kind":"topic","layout":"landscape"}]}\n```', { visualContext: { question: "План бизнес-процессов", isLatest: true } })
  assert(!html.includes("data-test-photo-topic"))
  assert(html.includes("Материалы для клиентов"))
})
console.log(failures ? `\n${failures} failing\n` : "\nall answer format checks passed\n")
process.exit(failures ? 1 : 0)
