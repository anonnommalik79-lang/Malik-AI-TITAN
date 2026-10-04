// Browser QA of the real answer renderer and CSS. Fixtures are not model output
// and test prices/screens are explicitly labelled. No provider calls or credits.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ts = require("typescript")
const engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const production = (pkg, file) => readFileSync(path.join(path.dirname(require.resolve(pkg)), "cjs", file), "utf8")
const modules = {
  react: production("react", "react.production.js"),
  "react/jsx-runtime": production("react", "react-jsx-runtime.production.js"),
  scheduler: production("scheduler", "scheduler.production.js"),
  "react-dom": production("react-dom", "react-dom.production.js"),
  "react-dom/client": production("react-dom", "react-dom-client.production.js"),
  "lucide-react": readFileSync(require.resolve("lucide-react"), "utf8"),
}
// Traverse real local imports, retaining hooks/effects/catalogue behaviour.
function bundle(file) {
  const id = path.relative(project, file).replaceAll("\\", "/")
  if (modules[id]) return id
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  modules[id] = "" // circular-import guard
  modules[id] = js.replace(/require\("([^"]+)"\)/g, (whole, name) => {
    if (name.endsWith(".css") || modules[name]) return whole
    const base = name.startsWith("@/") ? path.join(project, name.slice(2)) : path.resolve(path.dirname(file), name)
    const dependency = [base, base + ".ts", base + ".tsx"].find(candidate => existsSync(candidate))
    if (!dependency) throw Error("Unsupported QA import: " + name)
    return `require(${JSON.stringify(bundle(dependency))})`
  })
  return id
}
const markdown = bundle(path.join(project, "components/sovereign/MalikMarkdown.tsx"))
const globalPath = path.join(project, "app/globals.css")
const globals = (await require("postcss")([require("@tailwindcss/postcss")({ base: project })])
  .process(readFileSync(globalPath, "utf8"), { from: globalPath })).css
const sheets = [...readFileSync(path.join(project, "app/layout.tsx"), "utf8").matchAll(/import ["'](\.\/[^"']+\.css)["']/g)]
  .map(match => match[1] === "./globals.css" ? globals : readFileSync(path.join(project, "app", match[1]), "utf8"))
for (const name of ["chat-live.css", "answer-blocks.css", "answer-cards.css", "malik-tex.css"])
  sheets.push(readFileSync(path.join(project, "components/sovereign", name), "utf8"))
const bootstrap = `(function(){const process={env:{NODE_ENV:"production"}},sources=${JSON.stringify(modules)},cache={};
function require(id){if(id.endsWith(".css"))return {};if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};
if(!sources[id])throw Error("Missing QA module "+id);new Function("module","exports","require","process",sources[id])(module,module.exports,require,process);return module.exports;}
window.qaReact=require("react");window.qaMarkdown=require(${JSON.stringify(markdown)}).MalikMarkdown;
window.qaRoot=require("react-dom/client").createRoot(document.getElementById("qa-answer"));
window.qaRender=props=>window.qaRoot.render(window.qaReact.createElement(window.qaMarkdown,props));})()`
const fence = (kind, block) => "```" + kind + "\n" + JSON.stringify({ version: 1, ...block }) + "\n```"
const flow = { type: "flow", title: "От задачи к результату", subtitle: "Предлагаемая схема · не внутренняя архитектура компаний", stages: [
  { label: "ПРЕДПРИНИМАТЕЛЬ", detail: "Ставит цель обычным человеческим языком" },
  { label: "AI ORCHESTRATOR", detail: "Планирует этапы и подбирает разрешённые инструменты" },
  { label: "Специализированные инструменты", nodes: [
    { label: "Research", detail: "Поиск и проверка источников" }, { label: "Coding", detail: "Разработка и тесты" },
    { label: "Finance", detail: "Расчёты по данным пользователя" }, { label: "Marketing", detail: "Тексты и материалы" },
    { label: "Documents", detail: "Документы и файлы" }, { label: "Browser", detail: "Работа с разрешёнными сайтами" },
  ] }, { label: "ПРОВЕРКА И СОГЛАСОВАНИЕ", detail: "Проверка фактов и разрешение на важные действия" },
  { label: "ГОТОВЫЙ РЕЗУЛЬТАТ", detail: "Сайт + документы + расчёты + следующие действия" },
] }
const text = [
  "## Как собрать рабочую AI-систему для бизнеса",
  "Это проверка оформления ответа, не обзор актуальных тарифов и возможностей компаний. Содержание под конкретный запрос формирует выбранная модель.",
  "### 1. Экосистемы и инструменты",
  fence("malik-cards", { type: "cards", items: [
    { title: "ChatGPT", image: "ChatGPT", url: "https://openai.com/", text: "OpenAI · иллюстрация компактного логотипа рядом с описанием.", sources: [1] },
    { title: "Claude", image: "Claude", url: "https://www.anthropic.com/", text: "Anthropic · логотип относится именно к Claude AI, не к одноимённому человеку.", sources: [2] },
  ] }),
  "### 2. Как устроить работу", "Схема объясняет предлагаемый процесс. Её отображение не означает, что инструменты уже выполнили задачу.",
  fence("malik-visual", flow),
  "### 3. Большое изображение в своём разделе",
  fence("malik-cards", { type: "hero", item: { title: "Контрольный экран", image: 3, text: "Тестовое изображение источника. Оно показано целиком, без обрезки текста.", sources: [3] } }),
  "### 4. Сравнение результатов",
  "| Этап | Результат для пользователя |\n|---|---|\n| Исследование | Ссылки и проверенные факты |\n| Разработка | Код и результаты тестов |\n| Документы | Файлы и понятные инструкции |\n| Проверка | Ограничения и необходимые согласования |",
  "### 5. Условия и цены",
  fence("malik-cards", { type: "pricing", items: [
    { title: "Контрольный продукт A", offers: [{ label: "Standard", value: "$12", note: "тестовая цена · за месяц" }, { label: "Premium", value: "$34", note: "тестовая цена · за месяц" }], text: "Это данные теста, не тарифы OpenAI или Anthropic.", sources: [3] },
    { title: "Контрольный продукт B", offers: [{ label: "Standard", value: "$18", note: "тестовая цена · за месяц" }, { label: "Premium", value: "$46", note: "тестовая цена · за месяц" }], text: "В реальном ответе модель должна проверить актуальные условия по источникам.", sources: [3] },
  ] }), "**Следующий шаг:** сформулировать задачу и проверить каждый результат.",
].join("\n\n")
const citations = [
  { url: "https://openai.com/", title: "OpenAI", domain: "openai.com" },
  { url: "https://www.anthropic.com/", title: "Anthropic", domain: "anthropic.com" },
  { url: "https://example.com/qa", title: "QA fixture", domain: "example.com", image: "https://example.com/qa/screen.svg" },
]
const fixture = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="500"><rect width="960" height="500" fill="#f6f6f6"/><rect width="960" height="52" fill="#dedede"/><circle cx="30" cy="26" r="6" fill="#666"/><circle cx="52" cy="26" r="6" fill="#999"/><text x="96" y="32" font-family="Arial" font-size="18">QA fixture — not a real product screenshot</text><rect x="24" y="78" width="184" height="398" rx="8" fill="#e8e8e8"/><text x="46" y="118" font-family="Arial" font-size="20">Workspace</text><text x="240" y="160" font-family="Arial" font-size="30">Full source image, no crop</text><rect x="240" y="206" width="680" height="194" rx="12" fill="#fff" stroke="#ccc"/><text x="270" y="254" font-family="Arial" font-size="20">The answer stays in its own section.</text><text x="730" y="474" font-family="Arial" font-size="16">Bottom edge visible</text></svg>'
const out = process.env.MALIK_QA_OUTPUT
if (out) mkdirSync(out, { recursive: true })
for (const engine of (process.env.MALIK_QA_ENGINES || "chromium").split(",")) {
  const browser = await engines[engine].launch({ headless: true, ...(engine === "chromium" && process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
  try {
    for (const width of [320, 390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 920 } })
      const errors = [], catalogues = []
      page.on("pageerror", error => errors.push(error.message))
      page.on("request", request => { if (/api\.php|reference-images/.test(request.url())) catalogues.push(request.url()) })
      await page.route("https://example.com/qa/screen.svg", route => route.fulfill({ contentType: "image/svg+xml", body: fixture }))
      // The fixture uses a scrolling document instead of the app's fixed shell,
      // so full-page screenshots include the complete answer. Component rules
      // and the full legacy cascade stay real; only shell geometry is adapted.
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheets.join("\n")}</style><style>html,body{margin:0;color:#fff;font-family:Arial,sans-serif;overflow:auto!important;height:auto!important}#malik-root,#malik-root .malik-dashboard-shell,#malik-root .malik-dashboard-shell .malik-ai-chat-bg,#malik-root .malik-dashboard-shell .malik-chat-fullwidth{position:static!important;display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;transform:none!important}#malik-root #qa-answer{position:static!important;max-width:760px!important;width:100%!important;height:auto!important;max-height:none!important;margin:0 auto!important;padding:24px 16px!important;box-sizing:border-box;min-width:0;overflow:visible!important}.qa-label{max-width:728px;margin:24px auto 0;padding:0 16px;font-size:12px;color:#999}</style><p class="qa-label">Malik AI · проверка оформления компонентов</p><div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-ai-chat-bg"><div class="malik-chat-fullwidth"><div class="malik-message-card-assistant" id="qa-answer"></div></div></div></div></div>`)
      await page.evaluate(() => {
        // :has-based mobile shell rules can otherwise clip a full-page capture.
        for (const node of [document.documentElement, document.body, ...document.querySelectorAll("#malik-root,.malik-dashboard-shell,.malik-ai-chat-bg,.malik-chat-fullwidth,#qa-answer")]) {
          for (const [name, value] of [["height", "auto"], ["min-height", "0"], ["max-height", "none"], ["overflow", "visible"], ["position", "static"], ["display", "block"], ["contain", "none"]]) node.style.setProperty(name, value, "important")
        }
      })
      await page.addScriptTag({ content: bootstrap })
      await page.evaluate(props => window.qaRender(props), { text, citations, visualContext: { question: "Сравни ChatGPT и Claude и предложи AI-архитектуру для бизнеса", isLatest: true } })
      await page.locator(".malik-card-offers").last().waitFor()
      assert.equal(await page.locator(".malik-card__thumb.is-logo img").count(), 2)
      assert.equal(await page.locator(".malik-answer-flow__nodes > li").count(), 6)
      assert.equal(await page.locator(".malik-md-table tbody tr").count(), 4)
      assert.equal(await page.locator("[data-malik-reference-topic]").count(), 0, "No duplicate/decorative photo searches beside structured blocks")
      assert.equal(catalogues.length, 0, "Exact logos and source pictures need no catalogue API")
      assert(!await page.locator("#qa-answer").innerText().then(value => /Ищу фото|malik-cards|malik-visual/.test(value)))
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        flowColumns: getComputedStyle(document.querySelector(".malik-answer-flow__nodes")).gridTemplateColumns.split(" ").length,
        priceColumns: getComputedStyle(document.querySelector(".malik-card-offers")).gridTemplateColumns.split(" ").length,
        heroFit: getComputedStyle(document.querySelector(".malik-card__hero-image img")).objectFit,
        black: getComputedStyle(document.querySelector("#malik-root")).backgroundColor,
      }))
      assert.equal(geometry.overflow, false, `${engine} ${width}: no page-wide horizontal scroll`)
      assert.equal(geometry.flowColumns, width < 360 ? 1 : 2)
      assert.equal(geometry.priceColumns, 2)
      assert.equal(geometry.heroFit, "contain")
      assert.equal(geometry.black, "rgb(0, 0, 0)")
      // Validate the actual remote symbols, not just their attributes.
      await page.waitForFunction(() => [...document.querySelectorAll(".malik-card__thumb.is-logo img")].every(img => img.complete && img.naturalWidth > 0), { timeout: 15000 }).catch(() => {})
      const logos = await page.locator(".malik-card__thumb.is-logo img").evaluateAll(images => images.map(img => ({ loaded: img.complete && img.naturalWidth > 0, url: img.src })))
      assert.equal(logos.length, 2, "Failed logos must be reported, not silently counted as successful")
      assert(logos.every(logo => logo.loaded), `${engine}: real Wikimedia brand PNGs must load`)
      await page.locator(".malik-card__hero-image").scrollIntoViewIfNeeded()
      await page.waitForFunction(() => document.querySelector(".malik-card__hero-image img")?.naturalWidth > 0)
      if (out && (width === 390 || width === 1440)) {
        await page.locator(".malik-md-h").first().scrollIntoViewIfNeeded()
        await page.evaluate(() => scrollTo(0, 0))
        const firstHeading = await page.locator(".malik-md-h").first().boundingBox()
        assert(firstHeading.y >= 0 && firstHeading.y < 200, "Screenshots must include the beginning of the answer")
        assert(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 500), "Full-page capture must include the complete long answer")
        await page.screenshot({ path: path.join(out, `illustrated-answer-${engine}-${width}.png`), fullPage: true, animations: "disabled" })
        await page.screenshot({ path: path.join(out, `illustrated-answer-${engine}-${width}-top.png`), animations: "disabled" })
        await page.locator(".malik-answer-flow").screenshot({ path: path.join(out, `illustrated-answer-${engine}-${width}-flow.png`), animations: "disabled" })
      }
      assert.deepEqual(errors, [])
      // Exact reported regression: abstract business bullets must NOT fetch images.
      await page.evaluate(() => window.qaRender({ text: "## Архитектура процессов\n\n- **Анализ рынка:** исследование аудитории.\n- **Регламенты и SOP:** инструкции сотрудникам.\n- **Контент-маркетинг:** статьи и материалы.", visualContext: { question: "Бизнес под ключ с Claude и ChatGPT", isLatest: true } }))
      await page.waitForFunction(() => document.querySelector(".malik-md")?.textContent.includes("Регламенты"))
      assert.equal(await page.locator("[data-malik-reference-topic]").count(), 0)
      assert.equal(catalogues.length, 0)
      console.log(`PASS ${engine} ${width}: real renderer, live logos, source hero, flow, full table, pricing, no abstract searches/overflow`)
      await page.close()
    }
  } finally { await browser.close() }
}
