// MALIK Generative UI: the layout router, the protocol's validation and repair,
// streaming, the text fallback and the safety of computed values.
//
//   npm run test:generative-ui
import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader({})
const { routeUiLayout, buildGenerativeUiContract, wantsVisualAnswer } = load("lib/generative-ui/router.ts")
const { validateUi } = load("lib/generative-ui/validate.ts")
const { parsePartialUi } = load("lib/generative-ui/partial.ts")
const { uiToText, uiFencesToText, rawFallbackText } = load("lib/generative-ui/fallback.ts")
const { evaluate, parseExpr } = load("lib/generative-ui/expr.ts")

test("the router keeps small talk, code, maths and text tasks plain", () => {
  for (const prompt of ["Привет", "привет!", "Как дела?", "спасибо", "hello", "напиши функцию на python для сортировки", "исправь ошибку в коде", "переведи на английский: доброе утро", "реши уравнение 2x + 3 = 7", "сравни GPT и Claude, только текст"]) {
    assert.equal(routeUiLayout(prompt).layout, "plain", prompt)
    assert.equal(buildGenerativeUiContract(prompt), "", prompt)
  }
})

test("the router picks a form for each kind of task", () => {
  const cases = [
    ["Сравни 5 лучших LLM 2026 года", "comparison"],
    ["GPT-5 vs Claude Opus для кода", "comparison"],
    ["Покажи архитектуру AI-агента с инструментами и памятью", "architecture"],
    ["Сделай стратегию развития MALIK AI на 2027 год", "report"],
    ["Инвестиционный тезис по Kaspi", "report"],
    ["Построй график продаж: январь 120, февраль 150, март 170", "data"],
    ["История развития проекта MALIK AI по годам", "timeline"],
    ["Калькулятор ипотеки: сумма, ставка, срок", "calculator"],
    ["План изучения машинного обучения за 3 месяца", "plan"],
    ["Дашборд KPI интернет-магазина", "dashboard"],
    ["Объясни, как работает трансформер в нейросетях", "explainer"],
    ["Как работает нейросеть?", "explainer"],
    ["How do neural networks work?", "explainer"],
    ["Нейрондық желі қалай жұмыс істейді?", "explainer"],
    ["Үш ЖИ моделін салыстыр", "comparison"],
    ["Draw the architecture of a web app", "architecture"],
    ["Нарисуй блок-схему алгоритма сортировки", "diagram"],
    ["Нарисуй схему фотосинтеза", "diagram"],
    ["Сделай mind map по теме маркетинг", "diagram"],
    ["Дерево решений: стоит ли брать ипотеку", "diagram"],
    ["Decision tree for choosing a database", "diagram"],
    ["Покажи граф связей между отделами компании", "diagram"],
    ["Make a flowchart of user login", "diagram"],
    ["Этапы жизненного цикла звезды", "diagram"],
  ]
  for (const [prompt, layout] of cases) {
    const route = routeUiLayout(prompt)
    assert.equal(route.layout, layout, prompt)
    const contract = buildGenerativeUiContract(prompt)
    assert.match(contract, /```malik-ui/u, prompt)
    assert.ok(contract.includes(route.recipe), prompt)
  }
})

test("valid compositions pass; unknown blocks, URL photos and bad expressions are dropped", () => {
  const { doc, issues } = validateUi({
    v: 1, title: "T", state: { qty: 2, price: 10 },
    blocks: [
      { type: "heading", text: "Hello" },
      { type: "script", code: "alert(1)" },
      { type: "image", image: { query: "https://evil.example/x.png" } },
      { type: "image", image: { query: "Burj Khalifa" } },
      { type: "metric", label: "Итого", value: { expr: "price * qty" }, unit: "$" },
      { type: "metric", label: "Bad", value: { expr: "window.location" } },
      { type: "text", text: { expr: "secret + 1" } },
    ],
  })
  assert.ok(doc)
  assert.deepEqual(doc.blocks.map((block) => block.type), ["heading", "image", "metric"])
  assert.equal(doc.blocks[1].image.query, "Burj Khalifa")
  assert.ok(issues.some((issue) => /unknown block type/u.test(issue)))
  assert.ok(issues.some((issue) => /search subject, not a URL/u.test(issue)))
  assert.ok(issues.some((issue) => /unknown variable secret/u.test(issue)))
})

test("charts must state their origin; ragged tables are squared; links are checked", () => {
  const { doc, fixes } = validateUi({
    blocks: [
      { type: "chart", kind: "bar", labels: ["A", "B", "C"], series: [{ name: "x", values: [1, 2] }] },
      { type: "table", columns: [{ key: "a", label: "A" }, { key: "b", label: "B" }], rows: [{ a: 1 }, ["x", "y", "z"]] },
      { type: "citation", ref: 3 },
      { type: "citation", url: "https://unknown.example/page" },
      { type: "card", title: "Link", href: "javascript:alert(1)" },
      { type: "file", name: "report.pdf", href: "http://insecure.example/a.pdf" },
    ],
  }, { sources: [{ url: "https://openai.com/research" }] })
  const [chart, table, citation, card, file] = doc.blocks
  assert.equal(chart.origin, "illustrative")
  assert.equal(chart.series[0].values.length, 3)
  assert.deepEqual(table.rows[0], { a: 1, b: null })
  assert.deepEqual(table.rows[1], { a: "x", b: "y" })
  assert.equal(citation.unverified, true, "a link outside the answer's sources is marked")
  assert.equal(card.href, undefined)
  assert.equal(file.href, undefined)
  assert.ok(fixes.some((fix) => /labelled as an illustration/u.test(fix)))
  assert.ok(validateUi({ blocks: [{ type: "chart", labels: ["a"], series: [{ name: "x", values: ["n/a"] }] }]}).doc === null, "a chart without numbers is not drawn")
})

test("controls declare their state and limits hold", () => {
  const { doc } = validateUi({ blocks: [{ type: "control", kind: "slider", bind: "rate", label: "Ставка", min: 20, max: 1 }, { type: "metric", label: "x", value: { expr: "rate * 2" } }] })
  assert.equal(doc.state.rate, 1)
  assert.equal(doc.blocks.length, 2, "the metric may read a variable a control declared before it")
  const many = validateUi({ blocks: Array.from({ length: 400 }, () => ({ type: "text", text: "x" })) })
  assert.equal(many.doc.blocks.length, 160)
  let deep = { type: "text", text: "leaf" }
  for (let i = 0; i < 12; i += 1) deep = { type: "stack", items: [deep] }
  assert.doesNotThrow(() => validateUi({ blocks: [deep] }))
})

test("expressions compute but cannot reach the page", () => {
  assert.equal(evaluate("price * qty * (1 - discount / 100)", { price: 100, qty: 3, discount: 10 }), 270)
  assert.equal(evaluate("2 ^ 3 ^ 2", {}), 512)
  assert.equal(evaluate("round(10 / 3, 2)", {}), 3.33)
  assert.equal(evaluate("x > 5 ? 'много' : 'мало'", { x: 7 }), "много")
  assert.equal(evaluate("1 / 0", {}), null)
  for (const attack of ["constructor", "this", "a.b", "alert(1)", "x = 1", "globalThis", "process.exit()", "[1,2]", "`x`"]) {
    assert.equal(evaluate(attack, { a: 1, x: 1 }), null, attack)
  }
  assert.throws(() => parseExpr("x".repeat(500)))
})

test("streaming draws complete blocks as they arrive", () => {
  const full = JSON.stringify({ v: 1, title: "S", state: { n: 1 }, blocks: [{ type: "text", text: "one" }, { type: "grid", items: [{ type: "metric", label: "a", value: 1 }] }, { type: "chart", kind: "bar", origin: "user", labels: ["a"], series: [{ name: "s", values: [1] }] }] })
  const first = full.indexOf("},{") + 1
  const partial = parsePartialUi(full.slice(0, first + 20))
  assert.equal(partial.doc.blocks.length, 1)
  assert.equal(partial.pendingType, "grid")
  assert.equal(parsePartialUi(full.slice(0, -2)).doc.blocks.length, 3)
  assert.equal(parsePartialUi("{\"v\":1,\"blocks\":[{\"type\":\"te").doc, null)
})

test("broken JSON falls back to its text; copies and exports read the fence as text", () => {
  const broken = "{\"v\":1,\"blocks\":[{\"type\":\"heading\",\"text\":\"Итоги\"},{\"type\":\"text\",\"text\":\"Рост 20%\"}"
  assert.equal(validateUi(null).doc, null)
  assert.match(rawFallbackText(broken), /Итоги[\s\S]*Рост 20%/u)
  const answer = "Вот сравнение:\n\n```malik-ui\n{\"v\":1,\"blocks\":[{\"type\":\"table\",\"columns\":[{\"key\":\"m\",\"label\":\"Модель\"},{\"key\":\"s\",\"label\":\"Балл\"}],\"rows\":[{\"m\":\"A\",\"s\":90},{\"m\":\"B\",\"s\":85}],\"origin\":\"sources\"}]}\n```\n\nИтог."
  const text = uiFencesToText(answer)
  assert.ok(!text.includes("malik-ui") && !text.includes("{\""))
  assert.match(text, /\| Модель \| Балл \|[\s\S]*\| A \| 90 \|/u)
  const cut = uiFencesToText("Начало\n```malik-ui\n{\"v\":1,\"blocks\":[{\"type\":\"text\",\"text\":\"готово\"},{\"type\":\"tab")
  assert.match(cut, /готово/u)
  const { doc } = validateUi({ state: { k: 3 }, blocks: [{ type: "metric", label: "k", value: { expr: "k * 2" } }, { type: "chart", kind: "line", labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }] }] })
  assert.match(uiToText(doc), /\*\*k:\*\* 6/u)
  assert.match(uiToText(doc), /иллюстрация/u)
})

test("a diagram keeps its arrows when edges name nodes by label", () => {
  const { doc } = validateUi({ blocks: [{ type: "flow", nodes: [{ id: "a", label: "Вход" }, { id: "b", label: "Проверка" }, { id: "c", label: "Результат" }], links: [{ source: "Вход", target: "проверка", label: "да" }, { from: "b", to: "c" }, { from: "b", to: "нет такого" }] }] })
  const flow = doc.blocks[0]
  assert.deepEqual(flow.edges, [{ from: "a", to: "b", label: "да" }, { from: "b", to: "c" }])
})

test("a request to see something keeps the visual contracts", () => {
  for (const prompt of ["Покажи орла", "Show me an eagle", "Как выглядит Эйфелева башня?", "Сделай mind map по теме маркетинг", "Как работает нейросеть?"]) assert.equal(wantsVisualAnswer(prompt), true, prompt)
  for (const prompt of ["Привет", "Hello.", "Какая столица Франции?", "спасибо"]) assert.equal(wantsVisualAnswer(prompt), false, prompt)
  assert.match(buildGenerativeUiContract("Сделай mind map по теме маркетинг"), /Mind map: the first node/u)
  assert.match(buildGenerativeUiContract("Decision tree for choosing a database"), /Decision tree: each decision node/u)
})
