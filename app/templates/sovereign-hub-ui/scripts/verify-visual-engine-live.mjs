// MALIK VISUAL ENGINE — live browser checks against a running Malik AI.
//
// Streams a mocked answer with every block type into the real guest chat (the
// network call is stubbed in the page; no model, quota or provider is used)
// and checks what a person does with them: period tabs recalculate, sliders
// and typed values recompute, scenarios and reset work, the table sorts,
// searches, highlights and exports, the graph selects and highlights, nothing
// overflows the page, and reopening the chat restores blocks and slider state.
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-visual-engine-live.mjs [width] [screenshot-dir]
//
// Without MALIK_QA_BASE_URL or Playwright it skips (it is not part of the build).
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live visual engine checks: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live visual engine checks: Playwright is not installed"); process.exit(0) }
const width = Number(process.argv[2] || 1280)
const out = process.argv[3] || ""

const f = (o) => "```malik-visual\n" + JSON.stringify(o) + "\n```"
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const fxDashboard = { version: 2, type: "dashboard", title: "Malik Analytics", subtitle: "Демонстрационная панель", dataKind: "example", periods: [
  { label: "7 дней", metrics: [
    { label: "Активные пользователи", value: 86, delta: 12.4, note: "Рост активности" },
    { label: "Запросы за период", value: 1329, note: "Текстовые запросы" },
    { label: "Доступность API", value: 99.7, format: "percent", note: "Пример мониторинга" },
    { label: "Средний ответ", value: 1.8, format: "duration", note: "Пример задержки" } ],
    chart: { title: "Активность пользователей", subtitle: "Переключай период выше — график меняется", chart: "line", labels: days, series: [{ name: "Активные пользователи", values: [38, 46, 42, 57, 63, 75, 86] }] } },
  { label: "30 дней", metrics: [
    { label: "Активные пользователи", value: 412, delta: 8.1, note: "Рост активности" },
    { label: "Запросы за период", value: 6120, note: "Текстовые запросы" },
    { label: "Доступность API", value: 99.5, format: "percent", note: "Пример мониторинга" },
    { label: "Средний ответ", value: 2.1, format: "duration", note: "Пример задержки" } ],
    chart: { title: "Активность пользователей", subtitle: "Переключай период выше — график меняется", chart: "line", labels: ["Нед 1", "Нед 2", "Нед 3", "Нед 4"], series: [{ name: "Активные пользователи", values: [210, 260, 330, 412] }] } },
  { label: "90 дней", metrics: [
    { label: "Активные пользователи", value: 1080, delta: -3.2, note: "Сезонный спад" },
    { label: "Запросы за период", value: 18540, note: "Текстовые запросы" },
    { label: "Доступность API", value: 99.2, format: "percent", note: "Пример мониторинга" },
    { label: "Средний ответ", value: 2.4, format: "duration", note: "Пример задержки" } ],
    chart: { title: "Активность пользователей", subtitle: "Переключай период выше — график меняется", chart: "area", labels: ["Июль", "Август", "Сентябрь"], series: [{ name: "Активные пользователи", values: [980, 1115, 1080] }] } } ] }
const fxBars = { version: 2, type: "chart", chart: "bar", title: "Использование моделей и инструментов", dataKind: "example", unit: "%", labels: ["Чат", "Work", "Фото", "Видео", "Музыка"], series: [{ name: "Доля запросов", values: [52, 19, 16, 8, 5] }] }
const fxDonut = { version: 2, type: "chart", chart: "donut", title: "Типы задач", dataKind: "example", unit: "%", labels: ["Код", "Исследования", "Контент", "Другое"], series: [{ name: "Доля", values: [38, 25, 22, 15] }] }
const fxCalc = { version: 2, type: "calculator", title: "Malik Financial Intelligence", subtitle: "Revenue & growth simulator", dataKind: "example", model: "saas", currency: "USD",
  inputs: { users: { value: 650, min: 0, max: 1500, step: 10 }, price: { value: 17, min: 1, max: 50, step: 1 }, fixedCosts: { value: 1120, min: 0, max: 3000, step: 10 }, variableCost: { value: 1.8, min: 0, max: 10, step: 0.1 } },
  scenarios: [{ label: "Консервативный", values: { users: 300, price: 12 } }, { label: "Базовый", values: { users: 650, price: 17 } }, { label: "Агрессивный", values: { users: 1200, price: 24 } }] }
const fxGraph = { version: 2, type: "graph", title: "Malik AI Architecture", subtitle: "Демонстрация целевой архитектуры, а не подтверждённая схема работающего backend", dataKind: "example", nodes: [
 { id: "req", label: "Malik AI · User Request", kind: "input", detail: "Сообщение пользователя и контекст диалога" }, { id: "router", label: "Intelligent Router", kind: "router", detail: "Определяет тип задачи и выбирает исполнителя" },
 { id: "llm", label: "Malik LLM", kind: "module" }, { id: "work", label: "Malik Work", kind: "module" }, { id: "media", label: "Media Generation", kind: "module" }, { id: "repair", label: "Repair & Verify", kind: "module", detail: "Исправляет ответ, не прошедший проверку" },
 { id: "reason", label: "Reasoning & Sources", kind: "process" }, { id: "tools", label: "Tools & Execution", kind: "process" }, { id: "imgs", label: "Images / Video / Audio", kind: "process" },
 { id: "qv", label: "Quality Validation", kind: "check", detail: "Проверка фактов, формата и полноты" }, { id: "ve", label: "Malik Visual Engine", kind: "output" }, { id: "out", label: "Interactive Response", kind: "output" } ],
 edges: [ { from: "req", to: "router" }, { from: "router", to: "llm" }, { from: "router", to: "work" }, { from: "router", to: "media" }, { from: "llm", to: "reason" }, { from: "work", to: "tools" }, { from: "media", to: "imgs" },
 { from: "reason", to: "qv" }, { from: "tools", to: "qv" }, { from: "imgs", to: "qv" }, { from: "repair", to: "qv" }, { from: "qv", to: "repair", label: "Retry" }, { from: "qv", to: "ve", label: "Pass" }, { from: "ve", to: "out" } ] }
const fxTable = { version: 2, type: "table", title: "Сравнение моделей", subtitle: "Пример структуры: цифры условные", dataKind: "example", columns: [
  { label: "Модель", kind: "text" }, { label: "Тип", kind: "text" }, { label: "Контекст", kind: "number", unit: "тыс. токенов" }, { label: "Цена за 1M", kind: "currency", currency: "USD" }, { label: "Скорость", kind: "number", unit: "ток/с" } ],
  rows: [["Alpha", "Чат", 128, 2.5, 90], ["Beta", "Код", 200, 3, 70], ["Gamma", "Чат", 32, 0.4, 210], ["Delta", "Мультимодальная", 1000, 7, 45], ["Epsilon", "Код", 64, 1.2, 130], ["Zeta", "Чат", 128, 0.9, 160], ["Eta", "Мультимодальная", 256, 5, 60], ["Theta", "Чат", 8, 0.1, 300], ["Iota", "Код", 128, 2, 110], ["Kappa", "Чат", 64, 0.6, 180], ["Lambda", "Код", 512, 4, 55], ["Mu", "Чат", 16, 0.2, 260]],
  highlight: { column: 4, best: "max" } }
const answer = [
  "## 1. Интерактивная аналитика Malik AI", f(fxDashboard),
  "## 2. Красивые графики и распределения", f(fxBars), f(fxDonut),
  "## 3. Malik Financial Simulator", "Настоящий интерактивный калькулятор. Двигай ползунки — все показатели пересчитываются.", f(fxCalc),
  "## 4. Malik AI Network Graph", f(fxGraph),
  "## 5. Сравнение моделей", f(fxTable),
  "Готово: все блоки работают прямо в ответе.",
].join("\n\n")

const browser = await engines.chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: width < 800 ? 2 : 1, acceptDownloads: true })
await ctx.addCookies([{ name: "malik-guest", value: "1", url: base }])
await ctx.addInitScript(({ answer }) => {
  const real = window.fetch.bind(window)
  const enc = new TextEncoder()
  const ev = (type, rest = {}) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
    const method = String(init.method || "GET").toUpperCase()
    if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && method === "POST") {
      const turnId = new Headers(init.headers || {}).get("x-malik-background-turn-id") || "6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f"
      const stream = new ReadableStream({ async start(c) {
        c.enqueue(ev("progress", { phase: "thinking", text: "Думает…" })); await sleep(500)
        for (const part of answer.match(/[\s\S]{1,90}/g)) { c.enqueue(ev("content", { content: part })); await sleep(10) }
        c.enqueue(ev("done", { provider: "mock", model: "mock", selectedModelId: "malik-max", sources: [], usedWeb: false })); c.close()
      } })
      return new Response(stream, { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": turnId } })
    }
    return real(input, init)
  }
}, { answer })
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
const log = (...a) => console.log(...a)
let failures = 0
const ok = (name, cond, extra = "") => { if (!cond) failures += 1; log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }
await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
const box = page.locator("textarea").first()
await box.waitFor({ timeout: 120000 }); await page.waitForTimeout(1500)
await box.fill("Покажи аналитику, графики, калькулятор и архитектуру Malik AI")
await page.keyboard.press("Enter")
await page.waitForFunction(() => document.body.innerText.includes("Готово: все блоки работают"), null, { timeout: 90000 })
await page.waitForTimeout(2500)
const kinds = await page.locator("[data-malik-visual-engine]").evaluateAll((els) => els.map((e) => e.getAttribute("data-malik-visual-engine")))
ok("all six blocks render", kinds.join(",") === "dashboard,chart,chart,calculator,graph,table", kinds.join(","))
ok("no raw JSON in the answer", !(await page.evaluate(() => document.body.innerText)).includes('"type":"'))
const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
ok("no horizontal page overflow", over <= 0, String(over))
const lineColor = await page.locator("[data-malik-visual-engine=dashboard] .recharts-line-curve").first().evaluate((el) => getComputedStyle(el).stroke).catch(() => "none")
ok("chart keeps its blue series colour", /57, 135, 229|#3987e5/i.test(lineColor), lineColor)
const rangeStyle = await page.locator(".mv-range").first().evaluate((el) => { const s = getComputedStyle(el); return { h: s.height, bg: s.backgroundColor, border: s.borderTopWidth } })
ok("slider is not restyled as a text field", rangeStyle.h === "22px" && rangeStyle.border === "0px", JSON.stringify(rangeStyle))

// dashboard: period switch recalculates
const dash = page.locator("[data-malik-visual-engine=dashboard]")
const firstValue = await dash.locator(".mv-kpi__value").first().innerText()
await dash.getByRole("tab", { name: "30 дней" }).click(); await page.waitForTimeout(400)
const secondValue = await dash.locator(".mv-kpi__value").first().innerText()
const ticks = await dash.locator(".recharts-cartesian-axis-tick-value").evaluateAll((els) => els.map((e) => e.textContent || ""))
ok("period tab changes KPIs and chart", firstValue === "86" && secondValue === "412" && ticks.some((t) => t.includes("Нед")), `${firstValue} → ${secondValue}; ticks ${ticks.slice(0, 3).join("/")}`)

// calculator: slider recomputes deterministically
const calc = page.locator("[data-malik-visual-engine=calculator]")
const mrr = () => calc.locator('[data-output="mrr"]').innerText()
const before = await mrr()
const users = calc.locator("input.mv-range").first()
await users.focus(); for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight")
await page.waitForTimeout(200)
const after = await mrr()
ok("slider recomputes MRR (650→700 users × $17)", before === "$11,050" && after === "$11,900", `${before} → ${after}`)
const breakEven = await calc.locator('[data-output="breakEven"]').innerText()
ok("break-even computed", breakEven === "74 клиента", breakEven)
const exact = calc.locator("input.mv-slider__value").nth(1)
await exact.click(); await exact.fill("20"); await exact.press("Enter"); await page.waitForTimeout(200)
ok("typing an exact price recomputes", (await mrr()) === "$14,000", await mrr())
await calc.getByRole("button", { name: "Агрессивный" }).click(); await page.waitForTimeout(200)
ok("scenario applies its values", (await mrr()) === "$28,800", await mrr())
await calc.getByRole("button", { name: /Сбросить/ }).click(); await page.waitForTimeout(200)
ok("reset returns to the answer's numbers", (await mrr()) === "$11,050", await mrr())
await users.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight")
const persisted = await mrr()

// table: sort, search, filter, CSV
const table = page.locator("[data-malik-visual-engine=table]")
await table.getByRole("button", { name: /Скорость/ }).click(); await page.waitForTimeout(200)
const firstRow = await table.locator("tbody tr").first().locator("td").first().innerText()
ok("sorting by speed puts the fastest first", firstRow === "Theta", firstRow)
const best = await table.locator("td.is-best").allInnerTexts()
ok("best value highlighted", best.length === 1 && best[0].includes("300"), best.join(","))
await table.locator(".mv-search input").fill("Код"); await page.waitForTimeout(200)
ok("search filters rows", (await table.locator("tbody tr").count()) === 4, String(await table.locator("tbody tr").count()))
await table.locator(".mv-search input").fill("")
const [download] = await Promise.all([page.waitForEvent("download"), table.getByRole("button", { name: "CSV" }).click()])
ok("CSV export downloads", download.suggestedFilename().endsWith(".csv"), download.suggestedFilename())
ok("pagination shows pages", (await table.locator(".mv-pager").innerText()).includes("1 / 2"), await table.locator(".mv-pager").innerText())

// graph: click a node highlights neighbours and shows detail
const graph = page.locator("[data-malik-visual-engine=graph]")
await graph.scrollIntoViewIfNeeded()
await graph.locator(".mv-node", { hasText: "Quality Validation" }).click(); await page.waitForTimeout(200)
const detail = await graph.locator(".mv-graph__detail").innerText().catch(() => "")
ok("graph node opens its detail and links", detail.includes("Проверка фактов") && detail.includes("Retry") && detail.includes("Pass"), detail.replace(/\n/g, " | ").slice(0, 160))
const near = await graph.locator(".mv-edge.is-near").count()
ok("connected edges highlighted", near >= 6, String(near))

// hide fixed chrome, screenshot each block
await page.evaluate(() => document.querySelectorAll("body *").forEach((el) => { const s = getComputedStyle(el); if ((s.position === "fixed" || s.position === "sticky") && !el.closest(".mv-card") && !el.querySelector(".mv-card")) el.style.visibility = "hidden" }))
const cards = page.locator("[data-malik-visual-engine]")
await page.setViewportSize({ width, height: 2200 })
await graph.locator(".mv-node", { hasText: "Quality Validation" }).click(); await page.waitForTimeout(200)
for (let i = 0; i < await cards.count(); i++) {
  await cards.nth(i).evaluate((el) => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(500)
  if (out) await cards.nth(i).screenshot({ path: `${out}/${width}-${i}-${kinds[i]}.png`, animations: "disabled" })
}
await page.setViewportSize({ width, height: 900 })

// history: reload restores the blocks and the slider position
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(5000)
if (!(await page.locator("[data-malik-visual-engine]").count())) {
  const item = page.getByText("Покажи аналитику, графики", { exact: false }).first()
  if (!(await item.isVisible().catch(() => false))) await page.locator("button[aria-label='Меню'], button[aria-label='Menu']").first().click().catch(() => {}); await page.waitForTimeout(800)
  await page.getByText("Покажи аналитику, графики", { exact: false }).filter({ visible: true }).first().click({ timeout: 8000 }).catch(async (e) => {
    const drawer = await page.evaluate(() => document.body.innerText)
    log("history item not found:", e.message.split("\n")[0], "| history section:", drawer.slice(drawer.indexOf("ИСТОРИЯ"), drawer.indexOf("ИСТОРИЯ") + 120).replace(/\n/g, " / "))
  })
  await page.waitForTimeout(3000)
}
const restored = await page.locator("[data-malik-visual-engine]").count()
const restoredMrr = await page.locator('[data-malik-visual-engine=calculator] [data-output="mrr"]').innerText().catch(() => "missing")
ok("reopening the chat restores blocks and slider state", restored === 6 && restoredMrr === persisted, `${restored} blocks, MRR ${restoredMrr} (was ${persisted})`)
log("page errors:", errors.slice(0, 4))
if (failures) { console.error(`${failures} live visual engine check(s) failed at ${width}px`); process.exitCode = 1 }
await browser.close()
