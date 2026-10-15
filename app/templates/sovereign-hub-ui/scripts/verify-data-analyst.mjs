// Malik Analyst: any table in the chat gets an oil-style report with exact,
// independently re-computed numbers, valid Visual Engine blocks, three
// languages, and the model's takeaways after it — through the real stream route.
//
//   node scripts/verify-data-analyst.mjs
import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const after = []
const modelCalls = []
let modelMode = "ok"
const fakeModel = async (body, selection, _progress, onToken) => {
  modelCalls.push({ evidence: body?.metadata?.computedEvidence, attachments: body?.attachments, modelId: selection?.modelId })
  if (modelMode === "fail") throw new Error("provider down")
  const content = "Рост держится на весне: это гипотеза, её стоит проверить по чекам."
  onToken?.(content)
  return { content, provider: "mock-model", model: selection?.modelId, selectedModelId: selection?.modelId, usedWeb: false, sources: [], attempts: [] }
}
const forbidden = () => { throw new Error("Forbidden provider/tool invoked") }
class RouteError extends Error {}
const owner = { userId: "fixture-account", authenticated: true, plan: "pro" }
const load = workTestLoader({
  "./oil-report.css": {}, "./malik-tex.css": {},
  "next/server": { after: (fn) => after.push(fn) },
  "@/lib/malik-god-router": { asPlainText: (answer) => answer.content, malikGodAnswer: fakeModel, gatherSourcesForPrompt: forbidden, sourceContext: () => "" },
  "@/lib/server/plugin-runtime": { parsePluginCommand: () => null },
  "@/lib/server/plugin-model-answer": { runPluginModelAnswer: forbidden },
  "@/lib/ai/project-builder": { generateProjectWithBrain: forbidden },
  "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: true }), recordChatUsage: async () => {} },
  "@/lib/server/malik-model-router": { resolveStrictMalikSelection: async (_request, body) => ({ modelId: body?.model || "malik-20b", entitlement: owner }), MalikModelRouteError: RouteError, malikModelErrorPayload: (error) => ({ error: error.message }) },
  "@/lib/server/malik-coder-orchestrator": { runMalikCoderOrchestrator: forbidden },
  "@/lib/server/malik-agent-runtime": { prepareMalikAgentRuntime: async () => null },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner },
  "@/lib/server/work-quota": { reserveWorkQuota: async () => ({ ok: true, receipt: { id: "fixture" } }), refundWorkQuota: async () => {}, WorkQuotaError: RouteError },
  "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: (body) => body },
  "@/lib/server/project-artifact-store": { putProjectArtifact: forbidden },
  "@/lib/server/multimodal-router": { estimateMultimodalTokens: () => 0, hasMalikAttachments: (items) => Array.isArray(items) && items.length > 0, routeMalikAttachments: forbidden },
  "@/lib/server/daily-multimodal-quota": { DAILY_MULTIMODAL_TOKEN_LIMIT: 10000, getDailyMultimodalQuota: () => ({ remaining: 10000 }), recordDailyMultimodalTokens: () => {} },
  "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: true }) },
  "@/lib/server/scheduled-tasks": { createScheduledTask: forbidden, scheduledTasksStatus: () => ({ ready: false }) },
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler, observeComputeResult: () => {} },
})

const { parseNumber, timeKey, analyzeTable, linearTrend } = load("lib/analysis/engine.ts")
const { findMessageTable, wantsAnalysis, guessMeasureName } = load("lib/analysis/detect.ts")
const { analyzeChatData, computedEvidenceInstruction } = load("lib/analysis/chat.ts")
const { parseVisualBlock } = load("lib/visual/schema.ts")
const { buildXlsx } = load("lib/work/documents/xlsx.ts")
const { POST } = load("app/api/stream/route-impl.ts")

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
// The stream route ends fence headers with CR as a transport guard; the chat reads both.
const blocks = (markdown) => [...markdown.matchAll(/```malik-visual(?:\r\n?|\n)([\s\S]*?)\r?\n```/g)].map((match) => match[1])

const SALES = "Проанализируй продажи кофейни по месяцам:\nЯнварь — 1 200 000 ₸\nФевраль — 980 000 ₸\nМарт — 1 450 000 ₸\nАпрель — 1 610 000 ₸\nМай — 1 720 000 ₸\nИюнь — 2 050 000 ₸"
const SALES_VALUES = [1_200_000, 980_000, 1_450_000, 1_610_000, 1_720_000, 2_050_000]

test("numbers: every common way of writing them", () => {
  const cases = { "1 200 000 ₸": 1_200_000, "1 234,5": 1234.5, "1,234.5": 1234.5, "1.234.567": 1_234_567, "12,5": 12.5, "12%": 12, "$1,200": 1200, "2,5 млн": 2_500_000, "120 тыс.": 120_000, "(50)": -50, "−7": -7, "+3": 3, "4,5 млн тг": 4_500_000 }
  for (const [text, value] of Object.entries(cases)) close(parseNumber(text, "ru"), value)
  close(parseNumber("1,234", "en"), 1234)
  close(parseNumber("1,234", "ru"), 1.234)
  for (const text of ["abc", "", "12-15", "v2.0.1", "2024-01-05"]) assert.equal(parseNumber(text, "ru"), null, text)
})

test("periods: months in three languages, years, quarters, dates — and not city names", () => {
  for (const label of ["Январь", "янв", "Jan", "қаңтар", "2024", "2024-03", "03.2024", "Q1 2024", "2 кв", "III квартал", "2024-01-15", "15.01.2024", "Неделя 3", "Day 7", "фев 2025"]) assert.ok(timeKey(label), label)
  for (const label of ["Алматы", "Қазақстан", "Kaspi", "Маркетинг", "12345", "Март-Апрель скидки"]) assert.equal(timeKey(label), null, label)
  assert.ok(timeKey("2024-03").key > timeKey("2024-02").key)
})

test("engine: monthly sales re-computed independently", () => {
  const table = findMessageTable(SALES)
  assert.deepEqual(table.header, ["", "Продажи"])
  const analysis = analyzeTable(table, { locale: "ru", focus: table.rest })
  const sales = analysis.measures[0]
  assert.equal(analysis.axis, "time")
  const sum = SALES_VALUES.reduce((a, b) => a + b, 0)
  close(sales.sum, sum); close(sales.mean, sum / 6)
  close(sales.changePct, (2_050_000 - 1_200_000) / 1_200_000 * 100)
  assert.equal(sales.max.label, "Июнь"); assert.equal(sales.min.label, "Февраль")
  assert.equal(sales.biggestRise.label, "Март"); close(sales.biggestRise.delta, 470_000)
  assert.equal(sales.biggestDrop.label, "Февраль"); close(sales.biggestDrop.delta, -220_000)
  assert.equal(sales.currency, "KZT")
  // Least squares by hand.
  const xs = [0, 1, 2, 3, 4, 5], mx = 2.5, my = sum / 6
  const slope = xs.reduce((t, x) => t + (x - mx) * (SALES_VALUES[x] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0)
  close(sales.trend.slope, slope)
  assert.deepEqual(sales.trend.forecast.map((point) => point.label), ["Июль", "Август", "Сентябрь"])
  close(sales.trend.forecast[0].value, my - slope * mx + slope * 6)
  close(linearTrend([1, 2, 3, 4]).r2, 1)
})

test("engine: categories get shares, years get CAGR, outliers are found", () => {
  const branches = analyzeTable(findMessageTable("Сравни филиалы\n| Филиал | Выручка, тг | Чеков |\n|---|---|---|\n| Алматы | 4 500 000 | 3100 |\n| Астана | 3 200 000 | 2400 |\n| Шымкент | 1 100 000 | 900 |\n| Караганда | 900 000 | 700 |"), { locale: "ru" })
  assert.equal(branches.axis, "category")
  close(branches.measures[0].shares[0].share, 4_500_000 / 9_700_000 * 100)
  assert.equal(branches.measures[0].shares[0].label, "Алматы")
  const years = analyzeTable(findMessageTable("Год\tВыручка\tПрибыль\n2019\t100\t12\n2020\t90\t8\n2021\t130\t15\n2022\t170\t22\n2023\t210\t30"), { locale: "ru" })
  close(years.measures[0].cagrPct, ((210 / 100) ** (1 / 4) - 1) * 100)
  assert.equal(years.measures[0].cagrYears, 4)
  assert.ok(years.correlations[0].r > 0.95)
  const spiky = analyzeTable({ header: ["День", "Заказы"], rows: [["Day 1", "10"], ["Day 2", "11"], ["Day 3", "9"], ["Day 4", "10"], ["Day 5", "95"], ["Day 6", "11"], ["Day 7", "10"]] }, { locale: "ru" })
  assert.deepEqual(spiky.measures[0].anomalies.map((item) => item.label), ["Day 5"])
})

test("engine: long tables collapse by period, averages are averaged, totals by region", () => {
  const rows = [["2024-01", "Алматы", "100", "10"], ["2024-01", "Астана", "50", "20"], ["2024-02", "Алматы", "120", "12"], ["2024-02", "Астана", "60", "18"], ["2024-03", "Алматы", "130", "11"], ["2024-03", "Астана", "70", "16"]]
  const analysis = analyzeTable({ header: ["Месяц", "Город", "Продажи", "Средний чек"], rows }, { locale: "ru" })
  assert.equal(analysis.aggregatedDuplicates, true)
  assert.deepEqual(analysis.measures[0].steps.map((step) => step.value), [150, 180, 200])
  assert.equal(analysis.measures[1].aggregation, "mean")
  assert.deepEqual(analysis.measures[1].steps.map((step) => step.value), [15, 15, 13.5])
  assert.equal(analysis.categoryTotals.by, "Город")
  assert.deepEqual(analysis.categoryTotals.rows.map((row) => [row.label, row.value]), [["Алматы", 350], ["Астана", 180]])
})

test("detection: every paste shape, and requests that are not an analysis", () => {
  const shapes = [
    "Посчитай\nМесяц;Выручка\nЯнварь;12,5\nФевраль;14,1\nМарт;13,2",
    "Проанализируй\nmonth,revenue\njan,10\nfeb,12\nmar,15",
    "какой месяц лучший? янв 120, фев 95, мар 140, апр 160",
    "- Kaspi: 320\n- Halyk: 280\n- Jusan: 150\nсравни банки",
    "| A | B |\n|---|---|\n| x | 1 |\n| y | 2 |\n| z | 3 |",
  ]
  for (const prompt of shapes) assert.ok(analyzeChatData({ prompt }), prompt)
  const notAnalysis = [
    "переведи на английский:\nЯнварь — 120\nФевраль — 95\nМарт — 140",
    "Напиши код на python который читает\nmonth,revenue\njan,10\nfeb,12\nmar,15",
    "Преобразуй в json\nmonth,revenue\njan,10\nfeb,12\nmar,15",
    "Привет, как дела, что нового у тебя сегодня",
    "Расскажи про 3 главных события 2024 года",
    "Кто такой Абай?",
  ]
  for (const prompt of notAnalysis) assert.equal(analyzeChatData({ prompt }), null, prompt)
  assert.equal(guessMeasureName("Проанализируй выручку по месяцам", "ru"), "Выручка")
  assert.equal(guessMeasureName("analyze monthly sales", "en"), "Sales")
  assert.equal(wantsAnalysis("", "message"), true)
  assert.equal(wantsAnalysis("", "file"), false)
})

test("files: one CSV or XLSX is analysed; photos and documents are not", () => {
  const csv = "Месяц,Пользователи\n2024-01,1200\n2024-02,1500\n2024-03,1900\n2024-04,2600"
  const fromCsv = analyzeChatData({ prompt: "Проанализируй рост", attachments: [{ name: "users.csv", mime: "text/csv", kind: "file", text: csv }] })
  assert.equal(fromCsv.source, "file"); assert.equal(fromCsv.rows, 4)
  assert.match(fromCsv.report, /Анализ данных: users/)
  const xlsx = Buffer.from(buildXlsx([{ name: "Sheet", header: ["Quarter", "Revenue"], rows: [["Q1 2024", 10], ["Q2 2024", 14], ["Q3 2024", 13], ["Q4 2024", 19]] }])).toString("base64")
  const fromXlsx = analyzeChatData({ prompt: "Analyze the revenue trend", attachments: [{ name: "q.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file", base64: xlsx }] })
  assert.equal(fromXlsx.locale, "en"); assert.equal(fromXlsx.rows, 4)
  assert.match(fromXlsx.report, /Q1 2025/)
  assert.equal(analyzeChatData({ prompt: "Проанализируй", attachments: [{ name: "photo.jpg", mime: "image/jpeg", kind: "image", base64: "AAAA" }] }), null)
  assert.equal(analyzeChatData({ prompt: "Проанализируй", attachments: [{ name: "a.csv", text: csv }, { name: "b.csv", text: csv }] }), null)
})

test("report: valid Visual Engine blocks, real numbers, three languages, no junk", () => {
  const reports = [
    analyzeChatData({ prompt: SALES }),
    analyzeChatData({ prompt: "Analyze sales:\nJanuary — 120\nFebruary — 95\nMarch — 140\nApril — 160\nMay — 170" }),
    analyzeChatData({ prompt: "Сатылымды талдап бер:\nҚаңтар — 120\nАқпан — 95\nНаурыз — 140\nСәуір — 160" }),
  ]
  assert.deepEqual(reports.map((report) => report.locale), ["ru", "en", "kk"])
  for (const report of reports) {
    const list = blocks(report.report)
    assert.ok(list.length >= 3 && list.length <= 6, `${list.length} blocks`)
    for (const block of list) assert.equal(parseVisualBlock(block).ok, true, block.slice(0, 160))
    assert.doesNotMatch(report.report, /NaN|undefined|Infinity|\[object/)
    assert.match(report.report, /<details><summary>/)
    assert.match(report.report, /SHA-256 [a-f0-9]{12}/)
  }
  assert.match(reports[0].report, /рост с 1\s200\s000\s₸ до 2\s050\s000\s₸ \(\+70,8%\)/)
  assert.match(reports[0].report, /Пик — Июнь/)
  assert.match(reports[1].report, /Key figures/)
  assert.match(reports[1].report, /rise from 120 to 170/)
  assert.match(reports[2].report, /Негізгі көрсеткіштер/)
  assert.match(reports[0].narrativeHeading, /Выводы Malik AI/)
  // Big files keep every block under the Visual Engine limit.
  const big = ["day,visits"]
  for (let i = 0; i < 5000; i++) big.push(`2024-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")},${100 + (i % 37)}`)
  const huge = analyzeChatData({ prompt: "Проанализируй посещаемость", attachments: [{ name: "visits.csv", text: big.join("\n") }] })
  for (const block of blocks(huge.report)) assert.equal(parseVisualBlock(block).ok, true)
})

test("evidence: the model gets the computed facts and the rule to quote them exactly", () => {
  const report = analyzeChatData({ prompt: SALES })
  assert.match(report.evidence, /total=9 010 000/)
  assert.match(report.evidence, /biggest rise Февраль→Март/)
  const instruction = computedEvidenceInstruction({ computedEvidence: report.evidence })
  assert.match(instruction, /never recompute/)
  assert.equal(computedEvidenceInstruction({}), "")
})

async function stream(body) {
  const response = await POST(new Request("http://fixture/api/stream", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ stream: true, workspaceMode: "chat", ...body }) }))
  assert.equal(response.status, 200)
  const events = (await response.text()).split("\n\n").filter((frame) => frame.includes("data: ")).map((frame) => JSON.parse(frame.split("\ndata: ")[1]))
  for (const deferred of after.splice(0)) await deferred()
  const done = events.filter((event) => event.type === "done")
  const streamed = events.filter((event) => event.type === "content").map((event) => event.content).join("")
  return { events, done, answer: done[0]?.finalContent ?? streamed }
}

test("chat: the report streams first, the model's takeaways follow, with the evidence", async () => {
  modelMode = "ok"; modelCalls.length = 0
  const { answer, done } = await stream({ originalQuestion: SALES })
  assert.equal(done.length, 1)
  assert.equal(modelCalls.length, 1)
  assert.match(modelCalls[0].evidence, /MEASURE "Продажи"/)
  assert.deepEqual(modelCalls[0].attachments, [])
  assert.ok(answer.indexOf("```malik-visual") < answer.indexOf("### Выводы Malik AI"))
  assert.ok(answer.indexOf("### Выводы Malik AI") < answer.indexOf("Рост держится на весне"))
  assert.equal(done[0].provider, "mock-model")
})

test("chat: without a model the verified report still arrives, honestly labelled", async () => {
  modelMode = "fail"; modelCalls.length = 0
  const { answer, done } = await stream({ originalQuestion: SALES })
  assert.equal(done.length, 1)
  assert.equal(done[0].provider, "malik-analyst-local")
  assert.match(answer, /Расчёты выше проверены/)
  assert.equal(blocks(answer).length >= 3, true, answer.slice(0, 600))
  modelMode = "ok"
})

test("chat: ordinary questions and oil data keep their own paths", async () => {
  modelCalls.length = 0
  const { answer } = await stream({ originalQuestion: "Кто такой Абай Кунанбаев?" })
  assert.doesNotMatch(answer, /malik-visual|Анализ данных/)
  assert.equal(modelCalls[0].evidence, undefined)
  const oil = "Month,Oil_Rate_bbl_day,Water_Rate_bbl_day\n2026-01,100,20\n2026-02,95,25\n2026-03,90,30\n2026-04,85,35"
  const { answer: oilAnswer, done } = await stream({ originalQuestion: "Проанализируй скважину\n" + oil })
  assert.match(oilAnswer, /```malik-oil-report/)
  assert.doesNotMatch(oilAnswer, /Анализ данных/)
  assert.equal(done[0].provider, "malik-petroleum-local")
})

test("language: the words around an oil report follow the question's language", () => {
  const { oilInterpretationHeading, oilModelsUnavailable } = load("lib/ai/oil-answer-copy.ts")
  assert.equal(oilInterpretationHeading("ru"), "### Инженерная интерпретация моделей — требует проверки\n\n")
  assert.match(oilInterpretationHeading("en"), /Engineering interpretation/)
  assert.match(oilInterpretationHeading("kk"), /түсіндірмесі/)
  assert.match(oilInterpretationHeading("ar"), /التفسير/)
  assert.equal(oilModelsUnavailable("ru", "ensemble", true), "Участие моделей: 0/3 — ответы провайдеров не получены. Детерминированные расчёты сохранены.")
  assert.match(oilModelsUnavailable("en", "model", false), /^The model returned no final answer/)
})

test("any subject: an analysis question without data gets a professional analyst's structure", () => {
  const { asksAnalysis, analysisFrame, buildAnalystContract } = load("lib/ai/analysis-shape.ts")
  const { buildMalikResponseSystemPrompt } = load("lib/ai/response-intelligence.ts")
  const { shouldUseWeb } = load("lib/ai/web-search-policy.ts")

  const market = buildMalikResponseSystemPrompt({ prompt: "проанализируй рынок кофеен в Алматы", currentDate: "2026-10-15" })
  assert.match(market, /ANALYST CONTRACT/)
  assert.match(market, /MARKET frame/)
  assert.match(market, /Актуально на 2026-10-15/)
  assert.match(market, /dashboard \(KPI panel/, "KPI cards are available to the analyst")
  assert.match(market, /риск \| вероятность \| влияние/)
  assert.ok(shouldUseWeb("проанализируй рынок кофеен в Алматы"), "a market analysis checks current numbers")
  assert.ok(shouldUseWeb("стоит ли открывать кофейню в Шымкенте"), "a business decision checks current numbers")

  const poem = buildMalikResponseSystemPrompt({ prompt: "проанализируй стихотворение Абая «Қараңғы түнде тау қалғып»" })
  assert.match(poem, /WORK OF ART\/TEXT frame/)
  assert.doesNotMatch(poem, /dashboard \(KPI panel/, "no KPI cards for a poem")

  for (const prompt of ["привет, как дела?", "проанализируй мой код на python", "разбери слово по составу: подоконник", "мой анализ крови показал низкий гемоглобин", "что такое анализ данных"]) {
    assert.equal(asksAnalysis(prompt), false, prompt)
    assert.doesNotMatch(buildMalikResponseSystemPrompt({ prompt }), /ANALYST CONTRACT/, prompt)
  }
  assert.equal(analysisFrame("сделай SWOT анализ Kaspi"), "company")
  assert.equal(analysisFrame("разбери причины инфляции в Казахстане"), "event")
  assert.equal(analysisFrame("стоит ли открывать кофейню"), "decision")
  assert.ok(asksAnalysis("нарықты талдап бер"), "Kazakh")
  assert.ok(asksAnalysis("analyze the EV market in Europe"), "English")
  assert.match(buildAnalystContract("стоит ли открывать кофейню", "2026-10-15"), /Вес %/)
  // A short question is still a full report, with room to finish it.
  const { analyzeResponseRequest } = load("lib/ai/response-intelligence.ts")
  const { answerBudget } = load("lib/ai/answer-budget.ts")
  assert.equal(analyzeResponseRequest("проанализируй рынок кофеен в Алматы").complexity, "complex")
  assert.ok(answerBudget({}, "проанализируй рынок кофеен в Алматы", 4500) >= 7000)
  assert.equal(answerBudget({}, "привет", 700), 700)
})
