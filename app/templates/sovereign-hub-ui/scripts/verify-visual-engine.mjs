// MALIK VISUAL ENGINE — contract, formulas, routing, layout and rendering.
//
// Offline and deterministic: real modules (Zod, React, lucide), the real
// MalikMarkdown and real components rendered on the server. Interactive
// behaviour in a browser is covered by verify-visual-engine-live.mjs.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const box = { exports: {} }
  cache.set(absolute, box)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    fileName: absolute,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name.endsWith(".css")) return {}
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      const found = [base, base + ".ts", base + ".tsx", path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!found) throw new Error(`cannot resolve ${name} from ${file}`)
      return load(found)
    }
    return require(name)
  }, box, box.exports)
  return box.exports
}

let checks = 0
async function check(name, run) {
  await run()
  checks += 1
  console.log(`  ok  ${name}`)
}

const { parseVisualBlock, VISUAL_LIMITS } = load("lib/visual/schema.ts")
const { detectVisualFence, sniffPendingVisual } = load("lib/visual/detect.ts")
const { computeCalculator, calculatorInputs } = load("lib/visual/calculators.ts")
const { selectVisualKinds, visualEngineContract } = load("lib/visual/intent.ts")
const { layoutGraph } = load("lib/visual/graph-layout.ts")
const { visualFenceToText } = load("lib/visual/to-text.ts")
const { answerVisualsToText } = load("lib/ai/answer-visuals.ts")

const fence = (value) => "```malik-visual\n" + (typeof value === "string" ? value : JSON.stringify(value)) + "\n```"
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const dashboard = { version: 2, type: "dashboard", title: "Malik Analytics", subtitle: "Демонстрационная панель", dataKind: "example", periods: [
  { label: "7 дней", metrics: [{ label: "Активные пользователи", value: 86, delta: 12.4, note: "Рост активности" }, { label: "Запросы за период", value: 1329, note: "Текстовые запросы" }, { label: "Доступность API", value: 99.7, format: "percent" }, { label: "Средний ответ", value: 1.8, format: "duration" }],
    chart: { title: "Активность пользователей", chart: "line", labels: days, series: [{ name: "Активные пользователи", values: [38, 46, 42, 57, 63, 75, 86] }] } },
  { label: "30 дней", metrics: [{ label: "Активные пользователи", value: 412 }], chart: { chart: "line", labels: ["Нед 1", "Нед 2"], series: [{ name: "Активные пользователи", values: [210, 412] }] } }] }
const bars = { version: 2, type: "chart", chart: "bar", title: "Использование моделей и инструментов", dataKind: "example", unit: "%", labels: ["Чат", "Work", "Фото", "Видео", "Музыка"], series: [{ name: "Доля запросов", values: [52, 19, 16, 8, 5] }] }
const donut = { version: 2, type: "chart", chart: "donut", title: "Типы задач", dataKind: "example", unit: "%", labels: ["Код", "Исследования", "Контент", "Другое"], series: [{ name: "Доля", values: [38, 25, 22, 15] }] }
const calc = { version: 2, type: "calculator", title: "Malik Financial Intelligence", subtitle: "Revenue & growth simulator", dataKind: "example", model: "saas", currency: "USD",
  inputs: { users: { value: 650, min: 0, max: 1500, step: 10 }, price: { value: 17, min: 1, max: 50 }, fixedCosts: { value: 1120, min: 0, max: 3000, step: 10 }, variableCost: { value: 1.8, min: 0, max: 10, step: 0.1 } },
  scenarios: [{ label: "Консервативный", values: { users: 300 } }, { label: "Базовый", values: { users: 650 } }] }
const graph = { version: 2, type: "graph", title: "Malik AI Architecture", dataKind: "example", nodes: [
  { id: "req", label: "Malik AI · User Request", kind: "input" }, { id: "router", label: "Intelligent Router", kind: "router" },
  { id: "llm", label: "Malik LLM", kind: "module" }, { id: "work", label: "Malik Work", kind: "module" }, { id: "media", label: "Media Generation", kind: "module" }, { id: "repair", label: "Repair & Verify", kind: "module" },
  { id: "reason", label: "Reasoning & Sources", kind: "process" }, { id: "tools", label: "Tools & Execution", kind: "process" }, { id: "imgs", label: "Images / Video / Audio", kind: "process" },
  { id: "qv", label: "Quality Validation", kind: "check" }, { id: "ve", label: "Malik Visual Engine", kind: "output" }, { id: "out", label: "Interactive Response", kind: "output" }],
  edges: [{ from: "req", to: "router" }, { from: "router", to: "llm" }, { from: "router", to: "work" }, { from: "router", to: "media" }, { from: "llm", to: "reason" }, { from: "work", to: "tools" }, { from: "media", to: "imgs" },
    { from: "reason", to: "qv" }, { from: "tools", to: "qv" }, { from: "imgs", to: "qv" }, { from: "repair", to: "qv" }, { from: "qv", to: "repair", label: "Retry" }, { from: "qv", to: "ve", label: "Pass" }, { from: "ve", to: "out" }] }
const table = { version: 2, type: "table", title: "Сравнение моделей", dataKind: "example", columns: [{ label: "Модель" }, { label: "Тип" }, { label: "Скорость", kind: "number", unit: "ток/с" }],
  rows: Array.from({ length: 12 }, (_, at) => [`M${at}`, at % 2 ? "Код" : "Чат", 160 - at * 10]), highlight: { column: 2, best: "max" } }

console.log("\nVisual Engine: contract")

await check("every screenshot block validates", async () => {
  for (const block of [dashboard, bars, donut, calc, graph, table]) {
    const parsed = parseVisualBlock(JSON.stringify(block))
    assert.equal(parsed.ok, true, `${block.type}: ${parsed.reason}`)
  }
})

await check("invalid data is rejected with a reason, never thrown", async () => {
  const bad = [
    [{ ...bars, series: [{ name: "x", values: [1, 2] }] }, /align/],
    [{ ...donut, series: [{ name: "x", values: [10, -5, 3, 1] }] }, /non-negative/],
    [{ ...donut, series: [{ name: "a", values: [1, 1, 1, 1] }, { name: "b", values: [1, 1, 1, 1] }] }, /one series/],
    [{ ...calc, inputs: { salary: { value: 1 } } }, /unknown input/],
    [{ ...calc, inputs: { users: { value: 1, min: 10, max: 5 } } }, /min must be below max/],
    [{ ...table, rows: [["a", "b", "fast"]] }, /numeric column/],
    [{ ...table, rows: [["a", "b"]] }, /match columns/],
    [{ ...graph, edges: [{ from: "req", to: "ghost" }] }, /unknown node/],
    [{ ...graph, edges: [{ from: "req", to: "req" }] }, /self loop/],
    [{ ...bars, sources: [{ title: "x", url: "javascript:alert(1)" }] }, /https/],
    [{ ...bars, sources: [{ title: "x", url: "http://example.com" }] }, /https/],
    [{ ...bars, sources: [{ title: "x", url: "https://user:pass@example.com" }] }, /https/],
    [{ ...bars, labels: ["a"], series: [{ name: "s", values: [Number.MAX_VALUE] }] }, /./],
  ]
  for (const [value, pattern] of bad) {
    const parsed = parseVisualBlock(JSON.stringify(value))
    assert.equal(parsed.ok, false, `accepted: ${JSON.stringify(value).slice(0, 80)}`)
    assert.match(parsed.reason, pattern)
  }
  assert.equal(parseVisualBlock("{not json").reason, "invalid-json")
  assert.equal(parseVisualBlock("[1,2]").reason, "not-an-object")
  assert.equal(parseVisualBlock(JSON.stringify({ type: "html", title: "x" })).reason, "unknown-type")
})

await check("payload limits: size, rows, nodes and points", async () => {
  assert.equal(parseVisualBlock(" ".repeat(VISUAL_LIMITS.bytes + 1)).reason, "too-large")
  const rows = Array.from({ length: VISUAL_LIMITS.tableRows + 1 }, (_, at) => [`r${at}`, "a", at])
  assert.equal(parseVisualBlock(JSON.stringify({ ...table, rows })).ok, false)
  const nodes = Array.from({ length: VISUAL_LIMITS.graphNodes + 1 }, (_, at) => ({ id: `n${at}`, label: `N${at}` }))
  assert.equal(parseVisualBlock(JSON.stringify({ ...graph, nodes, edges: [{ from: "n0", to: "n1" }] })).ok, false)
  const labels = Array.from({ length: 400 }, (_, at) => `p${at}`)
  const series = Array.from({ length: 8 }, (_, at) => ({ name: `s${at}`, values: labels.map(() => 1) }))
  assert.match(parseVisualBlock(JSON.stringify({ ...bars, labels, series })).reason, /too many points/)
})

await check("prototype pollution keys are refused anywhere in the payload", async () => {
  for (const raw of [
    '{"type":"table","title":"t","columns":[{"label":"a"}],"rows":[["x"]],"__proto__":{"polluted":true}}',
    '{"type":"calculator","title":"t","model":"saas","inputs":{"constructor":{"value":1}}}',
    '{"type":"chart","chart":"bar","title":"t","labels":["a"],"series":[{"name":"s","values":[1],"prototype":1}]}',
  ]) assert.equal(parseVisualBlock(raw).ok, false)
  assert.equal({}.polluted, undefined)
})

await check("text is cleaned: control characters, whitespace and length", async () => {
  const parsed = parseVisualBlock(JSON.stringify({ ...bars, title: "  Рост\u0000‮  выручки  " + "x".repeat(300), dataKind: undefined }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.block.title.length, 100)
  assert.match(parsed.block.title, /^Рост выручки x/)
  assert.equal(parsed.block.dataKind, "estimate", "unlabelled numbers are shown as an estimate, never as real data")
})

await check("streaming: type and title are known before the JSON closes", async () => {
  const partial = '{"version":2,"type":"calculator","title":"Финансовая \\"модель\\"","inputs":{"us'
  assert.deepEqual(sniffPendingVisual(partial), { type: "calculator", title: 'Финансовая "модель"' })
  assert.equal(sniffPendingVisual('{"type":"script"'), null)
  assert.deepEqual(detectVisualFence(JSON.stringify(calc)), { type: "calculator", title: "Malik Financial Intelligence" })
  assert.equal(detectVisualFence(JSON.stringify({ type: "bars", title: "v1" })), null)
})

console.log("\nVisual Engine: deterministic formulas")

await check("SaaS simulator reproduces the reference numbers", async () => {
  const result = computeCalculator("saas", { users: 650, price: 17, fixedCosts: 1120, variableCost: 1.8 })
  const out = Object.fromEntries([result.headline, ...result.outputs, ...result.details].map((item) => [item.key, item.value]))
  assert.equal(out.mrr, 11050)
  assert.equal(out.costs, 2290)
  assert.equal(out.profit, 8760)
  assert.equal(Math.round(out.margin * 10) / 10, 79.3)
  assert.equal(out.breakEven, 74)
  assert.equal(out.arr, 132600)
  assert.equal(Math.round(out.grossMargin * 10) / 10, 89.4)
})

await check("slider changes recompute; edge cases stay honest", async () => {
  const more = computeCalculator("saas", { users: 700, price: 17, fixedCosts: 1120, variableCost: 1.8 })
  assert.equal(more.headline.value, 11900)
  const underwater = computeCalculator("saas", { users: 100, price: 2, fixedCosts: 500, variableCost: 3 })
  assert.equal(underwater.details.find((item) => item.key === "breakEven").value, null, "no break-even when price is below variable cost")
  assert.equal(underwater.outputs.find((item) => item.key === "profit").tone, "bad")
  const ltv = computeCalculator("saas", { users: 100, price: 20, fixedCosts: 0, variableCost: 0, churn: 5, cac: 100 })
  assert.equal(ltv.details.find((item) => item.key === "ltv").value, 400)
  assert.equal(ltv.details.find((item) => item.key === "ltvCac").value, 4)
  assert.equal(computeCalculator("saas", { users: 0, price: 10, fixedCosts: 0, variableCost: 0 }).outputs.find((item) => item.key === "margin").value, null)
})

await check("loan annuity, unit economics and runway", async () => {
  const loan = computeCalculator("loan", { principal: 10_000_000, rate: 18, years: 5 })
  assert.equal(Math.round(loan.headline.value), 253934)
  assert.equal(Math.round(computeCalculator("loan", { principal: 1200, rate: 0, years: 1 }).headline.value), 100)
  const units = computeCalculator("unit-economics", { units: 500, price: 40, unitCost: 22, fixedCosts: 5000 })
  assert.equal(units.headline.value, 20000)
  assert.equal(units.outputs.find((item) => item.key === "profit").value, 4000)
  assert.equal(units.details[0].value, 278)
  let cash = 120000, revenue = 6000, months = 0
  while (cash - (18000 - revenue) >= 0 && revenue < 18000 && months < 120) { cash -= 18000 - revenue; revenue *= 1.05; months += 1 }
  const runway = computeCalculator("runway", { cash: 120000, burn: 18000, revenue: 6000, growth: 5 })
  assert.ok(runway.headline.value === null ? revenue >= 18000 : runway.headline.value === months, `runway ${runway.headline.value} vs ${months}`)
})

await check("block ranges are respected and defaults filled", async () => {
  const inputs = calculatorInputs("saas", { users: { value: 5000, min: 0, max: 2000 } })
  assert.equal(inputs.find((input) => input.key === "users").value, 2000, "starting value is clamped into its range")
  assert.ok(!inputs.some((input) => input.key === "churn"), "optional inputs stay hidden unless the block asks for them")
  assert.ok(calculatorInputs("saas", { churn: { value: 3 } }).some((input) => input.key === "churn"))
})

console.log("\nVisual Engine: Dynamic UI routing")

await check("the request decides the block; plain questions stay plain", async () => {
  const cases = {
    "Покажи рост моего бизнеса": ["chart"],
    "Построй архитектуру моей нейросети": ["graph"],
    "Посчитай прибыль при 1000 клиентов": ["calculator"],
    "Сравни 10 моделей ИИ": ["table"],
    "Сделай дашборд аналитики для моего приложения": ["dashboard"],
    "Сколько я заработаю если подписка 15$ и 300 клиентов": ["calculator"],
    "Нарисуй блок-схему алгоритма сортировки": ["graph"],
    "Привет, как дела?": [],
    "Объясни солнечную систему": [],
    "Напиши код графика на python": [],
    "Покажи график продаж, только текст без графиков": [],
  }
  for (const [prompt, expected] of Object.entries(cases)) assert.deepEqual(selectVisualKinds(prompt), expected, prompt)
})

await check("the system prompt carries only the schemas this request needs", async () => {
  const { buildMalikResponseSystemPrompt } = load("lib/ai/response-intelligence.ts")
  const calcPrompt = buildMalikResponseSystemPrompt({ prompt: "Посчитай прибыль SaaS при 1000 клиентов и подписке 20$" })
  assert.match(calcPrompt, /VISUAL ENGINE/)
  assert.match(calcPrompt, /calculator \(sliders/)
  assert.doesNotMatch(calcPrompt, /graph \(interactive architecture/)
  assert.match(calcPrompt, /dataKind is mandatory and honest/)
  const plain = buildMalikResponseSystemPrompt({ prompt: "Привет, как дела?" })
  assert.doesNotMatch(plain, /VISUAL ENGINE/, "ordinary chat pays no extra prompt tokens")
  assert.ok(visualEngineContract("Построй архитектуру API").length < 2600, "the injected contract stays compact")
})

console.log("\nVisual Engine: text export")

await check("copy, speech and export read blocks as text with the same numbers", async () => {
  const text = answerVisualsToText(["До.", fence(calc), "После."].join("\n\n"))
  assert.match(text, /Прогнозируемая выручка \/ месяц: \$11,050/)
  assert.match(text, /Точка безубыточности: 74 клиента/)
  assert.match(text, /Налоги не учтены/)
  assert.doesNotMatch(text, /malik-visual|"type"/)
  assert.match(visualFenceToText(JSON.stringify(graph)), /Quality Validation → Repair & Verify \(Retry\)/)
  assert.match(visualFenceToText(JSON.stringify(dashboard)), /Активные пользователи: 86 \(\+12,4%\)/)
  assert.equal(visualFenceToText("{broken"), "")
  assert.equal(visualFenceToText(JSON.stringify({ type: "chart", title: "x", chart: "line" })), "", "malformed blocks export nothing rather than crash")
})

console.log("\nVisual Engine: graph layout")

await check("nodes never overlap and every edge touches its nodes", async () => {
  const layout = layoutGraph(graph.nodes, graph.edges, "down")
  for (const a of layout.nodes) for (const b of layout.nodes) {
    if (a === b) continue
    const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
    assert.ok(apart, `${a.id} overlaps ${b.id}`)
  }
  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const onEdge = (point, node) => point[0] >= node.x - 0.5 && point[0] <= node.x + node.w + 0.5 && point[1] >= node.y - 0.5 && point[1] <= node.y + node.h + 0.5
  for (const edge of layout.edges) {
    assert.ok(onEdge(edge.points[0], byId.get(edge.from)), `${edge.id} starts off its node`)
    assert.ok(onEdge(edge.points[edge.points.length - 1], byId.get(edge.to)), `${edge.id} ends off its node`)
    for (let at = 1; at < edge.points.length; at += 1) {
      const [a, b] = [edge.points[at - 1], edge.points[at]]
      assert.ok(a[0] === b[0] || a[1] === b[1], `${edge.id} is not orthogonal`)
    }
  }
  const retry = layout.edges.find((edge) => edge.id === "qv->repair")
  assert.equal(retry.back, true, "the Retry edge is the loop, drawn along the outside")
  assert.equal(layout.edges.find((edge) => edge.id === "repair->qv").back, false)
  assert.ok(layout.nodes.find((node) => node.id === "req").y < layout.nodes.find((node) => node.id === "out").y)
  assert.deepEqual(layoutGraph(graph.nodes, graph.edges, "down"), layout, "deterministic")
  const sideways = layoutGraph(graph.nodes, graph.edges, "right")
  assert.ok(sideways.nodes.find((node) => node.id === "req").x < sideways.nodes.find((node) => node.id === "out").x)
})

console.log("\nVisual Engine: rendering inside answers")

const { MalikMarkdown } = load("components/sovereign/MalikMarkdown.tsx")
const render = (text, question = "Покажи аналитику и калькулятор", streaming = false) =>
  renderToStaticMarkup(React.createElement(MalikMarkdown, { text, visualContext: { question, messageId: "m1", streaming, isLatest: true } }))

await check("every block type renders in place, beside the old v1 visuals", async () => {
  const timeline = fence({ version: 1, type: "timeline", title: "План", steps: [{ label: "Старт" }, { label: "Запуск" }] })
  const html = render(["Введение.", fence(dashboard), fence(bars), fence(donut), fence(calc), fence(graph), fence(table), timeline, "Итог."].join("\n\n"))
  for (const type of ["dashboard", "chart", "calculator", "graph", "table"]) assert.match(html, new RegExp(`data-malik-visual-engine="${type}"`))
  assert.match(html, /data-malik-answer-visual="timeline"/)
  assert.ok(html.indexOf("Введение.") < html.indexOf("data-malik-visual-engine") && html.lastIndexOf("Итог.") > html.lastIndexOf("data-malik-visual-engine"), "blocks sit where the model put them")
  assert.doesNotMatch(html, /malik-visual\n|&quot;type&quot;/, "no raw JSON reaches the page")
  assert.match(html, /data-preserve-brand-color="true"/, "data colours are exempt from the interface's blue-removal pass")
})

await check("server-rendered numbers are the computed ones", async () => {
  const html = render(fence(calc) + "\n\n" + fence(dashboard) + "\n\n" + fence(table))
  assert.match(html, /\$11,050/)
  assert.match(html, /\$8,760/)
  assert.match(html, /74 клиента/)
  assert.match(html, />86</)
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>7 дней/)
  assert.match(html, /Demo/, "example data is labelled as such")
  assert.equal((html.match(/<tr>/g) || []).length, 1 + 10, "the table paginates to ten rows")
  assert.match(html, /class="is-num is-best"[^>]*>160</)
})

await check("the graph draws every node and edge as SVG", async () => {
  const html = render(fence(graph), "Покажи архитектуру")
  assert.equal((html.match(/class="mv-node/g) || []).length, graph.nodes.length)
  assert.equal((html.match(/class="mv-edge"/g) || []).length + (html.match(/class="mv-edge is-near"/g) || []).length, graph.edges.length)
  assert.match(html, />Retry</)
  assert.match(html, />Pass</)
})

await check("streaming shows a skeleton of the right type, not JSON", async () => {
  const html = render("Считаю.\n\n```malik-visual\n" + '{"version":2,"type":"chart","title":"Рост выручки","labels":["Янв"', "Покажи рост", true)
  assert.match(html, /data-malik-visual-pending="chart"/)
  assert.match(html, /Рост выручки/)
  assert.doesNotMatch(html, /&quot;labels&quot;|"labels"/)
})

await check("an invalid block becomes a short note; the rest of the message stays", async () => {
  const html = render(["Начало ответа.", fence({ ...bars, series: [{ name: "x", values: [1] }] }), "Конец ответа."].join("\n\n"))
  assert.match(html, /data-malik-visual-fallback/)
  assert.match(html, /Использование моделей и инструментов/)
  assert.match(html, /Начало ответа\./)
  assert.match(html, /Конец ответа\./)
})

await check("hostile text is escaped, never markup", async () => {
  const html = render(fence({ ...bars, title: '<img src=x onerror="alert(1)">', labels: ["<script>alert(1)</script>", "b", "c", "d", "e"] }))
  assert.doesNotMatch(html, /<img src=x|<script>alert/)
  assert.match(html, /&lt;img src=x/)
})

await check("«без графиков» is honoured and one answer draws at most six blocks", async () => {
  assert.doesNotMatch(render(fence(bars), "Покажи продажи без графиков"), /data-malik-visual-engine/)
  const many = Array.from({ length: 9 }, (_, at) => fence({ ...bars, title: `График ${at}` })).join("\n\n")
  assert.equal((render(many).match(/data-malik-visual-engine="chart"/g) || []).length, VISUAL_LIMITS.blocksPerAnswer)
})

await check("history: the same saved text restores the same blocks", async () => {
  const saved = ["Ответ.", fence(calc), fence(graph)].join("\n\n")
  assert.equal(render(saved), render(saved))
  assert.match(render(saved), /data-malik-visual-engine="calculator"[\s\S]*data-malik-visual-engine="graph"/)
})

console.log(`\n${checks}/${checks} visual engine checks passed`)
