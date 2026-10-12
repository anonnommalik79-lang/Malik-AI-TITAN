// Malik Oil AI visual report: golden benchmark, 30+ engineering scenarios,
// the data contract, tamper detection, the independent cross-check, four
// languages, the chat stream path and the rendered report.
//
//   node scripts/verify-oil-report.mjs
//
// Real TypeScript is executed; only server boundaries of the stream route are
// stubbed (and throw if a model, provider or media tool is reached).
import test from "node:test"
import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const after = []
const forbidden = () => { throw new Error("Forbidden provider/tool invoked during the oil report") }
const comprehensiveCalls = []
const fakeDeepModel = async (body, selection, _progress, onToken) => {
  if (!String(body?.originalQuestion || body?.prompt || "").includes("GRAND CHALLENGE FIXTURE")) return forbidden()
  comprehensiveCalls.push({ modelId: selection?.modelId, evidence: body?.metadata?.petroleumComputedEvidence, domain: body?.metadata?.petroleumDomain })
  const content = "MULTIDISCIPLINARY MODEL ANALYSIS: 8 months; water cut, GOR, reservoir pressure and NPV need review."
  onToken?.(content)
  return { content, provider: "mock-selected-model", model: selection?.modelId, selectedModelId: selection?.modelId, usedWeb: false, sources: [], attempts: [{ provider: "mock-selected-model", model: selection?.modelId, ok: true }] }
}
class RouteError extends Error {}
const owner = { userId: "fixture-account", authenticated: true, plan: "pro" }
const load = workTestLoader({
  "./oil-report.css": {}, "./malik-tex.css": {},
  "next/server": { after: (fn) => after.push(fn) },
  "@/lib/malik-god-router": { asPlainText: (answer) => answer.content, malikGodAnswer: fakeDeepModel, gatherSourcesForPrompt: forbidden, sourceContext: () => "" },
  "@/lib/server/plugin-runtime": { parsePluginCommand: () => null },
  "@/lib/server/plugin-model-answer": { runPluginModelAnswer: forbidden },
  "@/lib/ai/project-builder": { generateProjectWithBrain: forbidden },
  "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: true }), recordChatUsage: async () => {} },
  "@/lib/server/malik-model-router": { resolveStrictMalikSelection: async (_request, body) => ({ modelId: body?.modelId || "malik-20b", entitlement: owner }), MalikModelRouteError: RouteError, malikModelErrorPayload: (error) => ({ error: error.message }) },
  "@/lib/server/malik-coder-orchestrator": { runMalikCoderOrchestrator: forbidden },
  "@/lib/server/malik-agent-runtime": { prepareMalikAgentRuntime: forbidden },
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

const contract = load("lib/work/petroleum/analysis-contract.ts")
const { analyzePetroleumDataset, compareOilMetrics, oilMetricPairs, fitDeclineModels, daysInMonthT, FIELD_ID } = load("lib/work/petroleum/analysis.ts")
const { parseProductionTable, readUnit, readPrice } = load("lib/work/petroleum/table-input.ts")
const { crossCheckOil } = load("lib/work/petroleum/cross-check.ts")
const { oilReportFence, readOilReportBlock, oilReportText, oilReportBlocksToText, oilKpis } = load("lib/work/petroleum/visual-report.ts")
const { oilConclusion, oilNumber, oilPercent } = load("lib/work/petroleum/analysis-i18n.ts")
const { executePetroleumTable, withOilVisual } = load("lib/work/petroleum/table-message.ts")
const { executePetroleumMessage } = load("lib/work/petroleum/message.ts")
const { routePetroleum } = load("lib/work/petroleum/router.ts")
const { MalikOilReport } = load("components/sovereign/MalikOilReport.tsx")

const close = (actual, expected, tolerance = 1e-9) => assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
const GOLDEN = "Month,Oil_Rate_bbl_day,Water_Rate_bbl_day,Gas_Rate_scf_day\n2026-01,100,20,50000\n2026-02,95,25,48000\n2026-03,90,30,47000\n2026-04,85,35,46000\n2026-05,80,40,45000\n2026-06,75,45,44000\n2026-07,70,50,43000\n2026-08,65,55,42000"
const OIL = [100, 95, 90, 85, 80, 75, 70, 65], WATER = [20, 25, 30, 35, 40, 45, 50, 55], GAS = [50000, 48000, 47000, 46000, 45000, 44000, 43000, 42000]
const ok = (prompt) => { const parsed = parseProductionTable(prompt); assert.equal(parsed?.kind, "ok", JSON.stringify(parsed && parsed.kind !== "ok" ? parsed : null)); return parsed.request }
const analyze = (prompt) => analyzePetroleumDataset(ok(prompt))
const golden = () => analyze(`Проанализируй синтетические данные скважины\n${GOLDEN}`)

// ── Phase 4 golden benchmark ───────────────────────────────────────────────
test("golden: water cut, GOR, liquid and WOR for all 8 months, computed independently", () => {
  const well = golden().wells[0]
  for (let index = 0; index < 8; index++) {
    close(well.wc[index], WATER[index] / (OIL[index] + WATER[index]))
    close(well.gor[index], GAS[index] / OIL[index])
    close(well.liquid[index], OIL[index] + WATER[index])
    close(well.wor[index], WATER[index] / OIL[index])
  }
})
test("golden: control values 35 %, 16.6667 %, 45.8333 %, 500, 646.1538, 120 bbl/day", () => {
  const result = golden(), well = result.wells[0]
  close(well.decline.total, 0.35); close(well.change.oil, -0.35)
  assert.equal(Number((well.first.wc * 100).toFixed(4)), 16.6667)
  assert.equal(Number((well.last.wc * 100).toFixed(4)), 45.8333)
  close(well.first.gor, 500); assert.equal(Number(well.last.gor.toFixed(4)), 646.1538)
  assert.ok(well.liquid.every((value) => value === 120)); assert.equal(well.liquidStats.cv, 0); assert.equal(well.liquidStats.stable, true)
  close(well.change.wcPP, (55 / 120 - 20 / 120) * 100)
  close(well.change.gorRel, (42000 / 65) / 500 - 1)
  close(well.change.gas, -0.16)
  assert.deepEqual(well.periodChanges.map((item) => Number((item.gas * 100).toFixed(6))), GAS.slice(1).map((value, index) => Number(((value / GAS[index] - 1) * 100).toFixed(6))))
  close(well.balance.replacement, 1); assert.equal(well.balance.liquidConserved, true)
})
test("golden: three decline models, linear continuation 60/55/50 and zero in Sep 2027", () => {
  const well = golden().wells[0]
  assert.equal(well.selected, "linear")
  const linear = well.models.find((fit) => fit.model === "linear")
  close(linear.a, 100); close(linear.b, -5); close(linear.r2, 1)
  assert.deepEqual(well.forecast.linear.map((value) => Number(value.toFixed(9))), [60, 55, 50])
  assert.equal(well.forecast.linearZeroT, 2027 * 12 + 8)
  assert.ok(well.forecast.exponential.every((value, index) => value > well.forecast.linear[index]))
  const exponential = well.models.find((fit) => fit.model === "exponential")
  const tau = [0, 1, 2, 3, 4, 5, 6, 7], y = OIL.map(Math.log)
  const mx = 3.5, my = y.reduce((a, b) => a + b) / 8
  const slope = tau.reduce((a, t, i) => a + (t - mx) * (y[i] - my), 0) / tau.reduce((a, t) => a + (t - mx) ** 2, 0)
  close(exponential.D, -slope); close(exponential.qi, Math.exp(my - slope * mx))
})
test("golden: cumulative uses calendar days; effective annual decline", () => {
  const well = golden().wells[0]
  const days = [31, 28, 31, 30, 31, 30, 31, 31]
  close(well.cumulative.oil, OIL.reduce((sum, q, i) => sum + q * days[i], 0))
  close(well.cumulative.gas, GAS.reduce((sum, q, i) => sum + q * days[i], 0))
  assert.equal(well.cumulative.days, 243)
  close(well.decline.perPeriod, 1 - 0.65 ** (1 / 7)); close(well.decline.effectiveAnnual, 1 - 0.65 ** (12 / 7))
  assert.equal(daysInMonthT(2024 * 12 + 1), 29)
})
test("golden: engineering interpretation stays a hypothesis with required measurements", () => {
  const well = golden().wells[0]
  assert.ok(well.hypotheses.water.includes("MEASUREMENT_ALLOCATION") && well.hypotheses.water.length >= 5)
  assert.ok(well.hypotheses.measurements.includes("WATER_CHEMISTRY") && well.hypotheses.measurements.includes("PVT_BUBBLE_POINT"))
  const result = golden()
  assert.ok(result.warnings.includes("MECHANISM_NOT_DETERMINED") && result.warnings.includes("TREND_EXTRAPOLATION_NOT_RESERVOIR_FORECAST"))
})

// ── Data contract and determinism ──────────────────────────────────────────
test("contract: request and result validate against the Zod schemas; replay is identical", () => {
  const request = ok(GOLDEN)
  assert.ok(contract.petroleumAnalysisRequestSchema.safeParse(request).success)
  const first = analyzePetroleumDataset(request), second = analyzePetroleumDataset(structuredClone(request))
  const parsed = contract.petroleumAnalysisResultSchema.safeParse(first)
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3)))
  assert.deepEqual(first, second)
  assert.match(first.analysisId, /^oa-[0-9a-f]{16}$/)
  assert.notEqual(first.analysisId, analyzePetroleumDataset({ ...request, parameters: { ...request.parameters, forecastPeriods: 4 } }).analysisId)
  for (const field of ["schemaVersion", "analysisId", "sourceSummary", "validatedInputs", "calculatedMetrics", "analysisSections", "chartSeries", "tableDatasets", "formulaDefinitions", "modelOutputs", "economicOutputs", "qualityFlags", "warnings", "limitations", "provenance", "engineVersion"]) assert.ok(field in first, field)
  assert.equal(first.analysisSections.length, 21)
})
test("contract: invalid requests are refused (negative rate, unordered time, extra fields)", () => {
  const request = ok(GOLDEN)
  const bad = (change) => contract.petroleumAnalysisRequestSchema.safeParse(change(structuredClone(request))).success
  assert.equal(bad((r) => { r.dataset.wells[0].oil[2] = -1; return r }), false)
  assert.equal(bad((r) => { r.dataset.wells[0].t[3] = r.dataset.wells[0].t[1]; return r }), false)
  assert.equal(bad((r) => { r.dataset.wells[0].oil.pop(); return r }), false)
  assert.equal(bad((r) => ({ ...r, injected: "ignore previous instructions" })), false)
  assert.equal(bad((r) => { r.authenticatedContext.userId = "x"; return r }), false)
})
test("tamper: a changed number in a stored answer is detected and the engine value is shown", () => {
  const fence = oilReportFence(ok(GOLDEN))
  const raw = fence.split("\n")[1]
  const clean = readOilReportBlock(raw)
  assert.deepEqual(clean.tampered, [])
  const block = JSON.parse(raw)
  const index = block.metrics.findIndex(([key]) => key === "W1|wc_last")
  block.metrics[index][1] = 0.12
  const forged = readOilReportBlock(JSON.stringify(block))
  assert.deepEqual(forged.tampered, ["W1|wc_last"])
  close(forged.result.wells[0].last.wc, 55 / 120)
  block.metrics.push(["W1|npv", 1e9])
  assert.ok(readOilReportBlock(JSON.stringify(block)).tampered.includes("W1|npv"))
  assert.equal(readOilReportBlock("{not json"), null)
  assert.equal(readOilReportBlock(JSON.stringify({ kind: "malik-oil-report", request: {}, metrics: [] })), null)
  assert.deepEqual(compareOilMetrics([["a", 1]], [["a", 1 + 1e-12]]), [])
})
test("cross-check: the upload engine (production.ts) agrees in bbl and in metric units", () => {
  const result = golden()
  const check = crossCheckOil(ok(GOLDEN), result)
  assert.equal(check.status, "passed"); assert.equal(check.checked, 7)
  const metric = ok("Проанализируй\n| Дата | Нефть, м3/сут | Вода, м3/сут | Газ, ст. м3/сут |\n|---|---|---|---|\n| 2025-01-01 | 15,5 | 3,1 | 2100 |\n| 2025-02-01 | 14,9 | 3,6 | 2080 |\n| 2025-03-01 | 14,2 | 4,4 | 2050 |")
  assert.equal(crossCheckOil(metric, analyzePetroleumDataset(metric)).status, "passed")
  const mass = ok("Нефть и вода в тоннах\n| Месяц | Нефть, т/сут | Вода, т/сут |\n|---|---|---|\n| 2025-01 | 80 | 10 |\n| 2025-02 | 76 | 13 |")
  assert.deepEqual([crossCheckOil(mass, analyzePetroleumDataset(mass)).status, crossCheckOil(mass, analyzePetroleumDataset(mass)).reason], ["skipped", "MASS_BASIS"])
  // A wrong number in the analysis is caught by the independent engine.
  const broken = structuredClone(result); broken.wells[0].last.wc = 0.5
  assert.equal(crossCheckOil(ok(GOLDEN), broken).status, "failed")
})

// ── Thirty engineering and input scenarios ─────────────────────────────────
const scenario = (name, fn) => test(`scenario: ${name}`, fn)
scenario("01 units missing → asks, computes nothing", () => {
  const parsed = parseProductionTable("Проанализируй добычу\n| Месяц | Нефть | Вода |\n|---|---|---|\n| 1 | 100 | 20 |\n| 2 | 90 | 30 |")
  assert.equal(parsed.kind, "needs-input"); assert.equal(parsed.code, "UNITS_MISSING"); assert.deepEqual(parsed.columns, ["Нефть", "Вода"])
})
scenario("02 units stated in the message are applied and noted", () => {
  const request = ok("Дебиты в м3/сут\n| Месяц | Нефть | Вода |\n|---|---|---|\n| 1 | 100 | 20 |\n| 2 | 90 | 30 |")
  assert.equal(request.units.liquid, "m3/day"); assert.ok(request.metadata.notes.includes("UNITS_FROM_MESSAGE")); assert.equal(request.dataset.calendar, false)
})
scenario("03 monthly volumes are not rates → asks for a daily basis", () => assert.equal(parseProductionTable("| Month | Oil, bbl/month |\n|---|---|\n| 2026-01 | 3000 |\n| 2026-02 | 2800 |").code, "RATE_BASIS_MISSING"))
scenario("04 oil in tonnes with water in m3 needs density", () => assert.equal(parseProductionTable("Дата;Нефть, т/сут;Вода, м3/сут\n01.01.2026;85;20\n01.02.2026;80;24").code, "OIL_DENSITY_REQUIRED"))
scenario("05 density converts tonnes to m3 exactly", () => {
  const request = ok("Плотность 850 кг/м3\nДата;Нефть, т/сут;Вода, м3/сут\n01.01.2026;85;20\n01.02.2026;80;24\n01.03.2026;76;29")
  close(request.dataset.wells[0].oil[0], 85 * 1000 / 850); assert.equal(request.dataset.granularity, "month"); assert.ok(request.metadata.notes.includes("OIL_MASS_TO_VOLUME_BY_DENSITY"))
})
scenario("06 both phases in tonnes → water cut by mass, GOR sm3/t", () => {
  const result = analyze("| Месяц | Нефть, т/сут | Вода, т/сут | Газ, м3/сут |\n|---|---|---|---|\n| 2025-01 | 80 | 20 | 6400 |\n| 2025-02 | 76 | 24 | 6200 |")
  close(result.wells[0].first.wc, 0.2); assert.equal(result.validatedInputs.units.basis, "mass"); assert.equal(result.validatedInputs.units.gor, "sm3/t"); close(result.wells[0].first.gor, 80)
  assert.ok(result.qualityFlags.some((flag) => flag.code === "MASS_BASIS"))
})
scenario("07 water in m3 with oil in bbl is converted with the exact barrel", () => {
  const request = ok("| Month | Oil, bbl/day | Water, m3/day |\n|---|---|---|\n| 2026-01 | 100 | 15.8987294928 |\n| 2026-02 | 90 | 15.8987294928 |")
  close(request.dataset.wells[0].water[0], 100); assert.ok(request.metadata.notes.includes("WATER_CONVERTED_TO_OIL_UNIT"))
})
scenario("08 gas in thousand m3 and Mscf is expanded ×1000", () => {
  assert.equal(readUnit("Газ, тыс. м3/сут").factor, 1000); assert.equal(readUnit("Gas (Mscf/d)").factor, 1000); assert.equal(readUnit("Gas MMscf/d").factor, 1e6)
  const request = ok("| Month | Oil, bbl/day | Gas, Mscf/day |\n|---|---|---|\n| 2026-01 | 100 | 50 |\n| 2026-02 | 95 | 48 |")
  assert.equal(request.dataset.wells[0].gas[0], 50000)
})
scenario("09 GOR in sm3/m3 when gas is metric", () => {
  const result = analyze("| Month | Oil, m3/day | Gas, sm3/day |\n|---|---|---|\n| 2026-01 | 20 | 2400 |\n| 2026-02 | 19 | 2300 |")
  assert.equal(result.validatedInputs.units.gor, "sm3/m3"); close(result.wells[0].first.gor, 120)
})
scenario("10 GOR in scf/bbl when oil is m3 and gas scf (oil converted, gas untouched)", () => {
  const result = analyze("| Month | Oil, m3/day | Gas, scf/day |\n|---|---|---|\n| 2026-01 | 15.8987294928 | 50000 |\n| 2026-02 | 15.8987294928 | 40000 |")
  close(result.wells[0].first.gor, 500)
})
scenario("11 decimal comma (RU sheet) is read per column", () => {
  const request = ok("Месяц;Нефть, м3/сут;Вода, м3/сут\n2026-01;15,9;3,2\n2026-02;15,1;4,0")
  assert.deepEqual(request.dataset.wells[0].oil, [15.9, 15.1])
})
scenario("12 thousands commas in an English table", () => {
  const request = ok("Analyze this well\n| Month | Oil (bopd) | Gas (scf/d) |\n|---|---|---|\n| Jan 2026 | 1,200 | 600,000 |\n| Feb 2026 | 1,150 | 590,000 |")
  assert.deepEqual(request.dataset.wells[0].oil, [1200, 1150]); assert.ok(request.metadata.notes.includes("COMMA_READ_AS_THOUSANDS"))
})
scenario("13 month names cross into the next year without a calendar", () => {
  const request = ok("| Месяц | Нефть, bbl/day |\n|---|---|\n| Ноябрь | 100 |\n| Декабрь | 98 |\n| Январь | 95 |")
  assert.deepEqual(request.dataset.wells[0].t, [10, 11, 12]); assert.equal(request.dataset.calendar, false)
})
scenario("14 Arabic digits and Arabic language", () => {
  const request = ok("حلل إنتاج النفط\n| الشهر | النفط bbl/day | الماء bbl/day |\n|---|---|---|\n| 2026-01 | ١٠٠ | ٢٠ |\n| 2026-02 | ٩٥ | ٢٥ |")
  assert.equal(request.language, "ar"); assert.deepEqual(request.dataset.wells[0].oil, [100, 95])
})
scenario("15 Kazakh request", () => assert.equal(ok("Мұнай ұңғымасын талда\n| Ай | Мұнай, м3/тәул |\n|---|---|\n| 2026-01 | 50 |\n| 2026-02 | 48 |").language, "kk"))
scenario("16 daily DD.MM.YYYY data keep day granularity and consecutive cumulative", () => {
  const result = analyze("Дата;Нефть, м3/сут\n01.03.2026;50\n02.03.2026;49\n03.03.2026;48\n04.03.2026;47")
  assert.equal(result.sourceSummary.granularity, "day"); close(result.wells[0].cumulative.oil, 194); assert.equal(result.wells[0].cumulative.basis, "daily")
})
scenario("17 duplicate periods are all excluded and reported", () => {
  const request = ok("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 100 |\n| 2026-01 | 105 |\n| 2026-02 | 95 |\n| 2026-03 | 90 |")
  assert.deepEqual(request.dataset.wells[0].oil, [95, 90]); assert.equal(request.metadata.rejectedRows, 2); assert.ok(request.metadata.issues.every((issue) => issue.code === "DUPLICATE_PERIOD"))
})
scenario("18 negative, unreadable and missing oil rows are rejected, never repaired", () => {
  const request = ok("| Month | Oil, bbl/day | Water, bbl/day |\n|---|---|---|\n| 2026-01 | 100 | 20 |\n| 2026-02 | -5 | 20 |\n| 2026-03 | abc | 20 |\n| 2026-04 | — | 20 |\n| 2026-05 | 80 | |")
  assert.deepEqual(request.metadata.issues.map((issue) => issue.code), ["NEGATIVE_RATE", "NUMBER_UNREADABLE", "MISSING_OIL"])
  assert.deepEqual(request.dataset.wells[0].water, [20, null])
})
scenario("19 a gap of months is flagged, not interpolated", () => {
  const result = analyze("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 100 |\n| 2026-02 | 96 |\n| 2026-05 | 85 |\n| 2026-06 | 82 |")
  assert.ok(result.wells[0].anomalies.some((item) => item.code === "GAP" && item.value === 2)); assert.equal(result.wells[0].t.length, 4)
})
scenario("20 water derived from liquid minus oil", () => {
  const request = ok("| Month | Oil, bbl/day | Liquid, bbl/day |\n|---|---|---|\n| 2026-01 | 100 | 120 |\n| 2026-02 | 95 | 120 |")
  assert.deepEqual(request.dataset.wells[0].water, [20, 25]); assert.ok(request.metadata.notes.includes("WATER_DERIVED_FROM_LIQUID"))
})
scenario("21 derived columns (WC %, GOR) in the source are ignored, never trusted", () => {
  const result = analyze("| Month | Oil, bbl/day | Water, bbl/day | WC, % |\n|---|---|---|---|\n| 2026-01 | 80 | 20 | 99 |\n| 2026-02 | 70 | 30 | 99 |")
  close(result.wells[0].first.wc, 0.2)
})
scenario("22 several wells: field total over shared periods and ranking", () => {
  const result = analyze("well_id,date,oil_bbl_day,water_bbl_day\nA,2025-01-01,100,10\nA,2025-02-01,90,20\nA,2025-03-01,80,30\nB,2025-01-01,50,5\nB,2025-02-01,49,6\nB,2025-03-01,48,7\nB,2025-04-01,47,8")
  assert.equal(result.wells[0].id, FIELD_ID); assert.deepEqual(result.wells[0].oil, [150, 139, 128]); close(result.wells[0].last.wc, 37 / 165)
  assert.ok(result.qualityFlags.some((flag) => flag.code === "FIELD_PARTIAL_PERIODS"))
  const table = result.tableDatasets.find((item) => item.id === "multiwell"); assert.deepEqual(table.rows.map((row) => row[4]), [20, 3])
})
scenario("23 more than 120 wells: the largest oil losses stay, the rest are counted", () => {
  const rows = ["well_id,date,oil_bbl_day"]
  for (let well = 0; well < 130; well++) for (let month = 1; month <= 2; month++) rows.push(`W${well},2025-0${month}-01,${month === 1 ? 100 : 100 - well * 0.5}`)
  const request = ok(rows.join("\n"))
  assert.equal(request.dataset.wells.length, 120); assert.equal(request.metadata.omittedWells, 10); assert.ok(!request.dataset.wells.some((well) => well.id === "W0"))
})
scenario("24 rising production: no decline model, no scenarios", () => {
  const well = analyze("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 50 |\n| 2026-02 | 55 |\n| 2026-03 | 61 |\n| 2026-04 | 66 |").wells[0]
  assert.equal(well.forecast, null); assert.equal(well.forecastBlocked, "NO_DECLINING_TREND"); assert.equal(well.selected, null)
})
scenario("25 zero rate: exponential and harmonic refuse, linear stays, shut-in flagged", () => {
  const well = analyze("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 100 |\n| 2026-02 | 90 |\n| 2026-03 | 0 |\n| 2026-04 | 70 |\n| 2026-05 | 60 |").wells[0]
  assert.equal(well.models.find((fit) => fit.model === "exponential").reason, "ZERO_RATES")
  assert.ok(well.anomalies.some((item) => item.code === "ZERO_OIL")); assert.ok(well.anomalies.some((item) => item.code === "OIL_JUMP"))
})
scenario("26 exact exponential history is recovered by the exponential model", () => {
  const rates = Array.from({ length: 10 }, (_, index) => 200 * Math.exp(-0.05 * index))
  const fits = fitDeclineModels(rates.map((_, index) => index), rates)
  const fit = fits.find((item) => item.model === "exponential")
  close(fit.qi, 200, 1e-9); close(fit.D, 0.05, 1e-9); assert.ok(fit.rmse < 1e-9)
})
scenario("27 exact harmonic history is recovered by the harmonic model", () => {
  const rates = Array.from({ length: 10 }, (_, index) => 120 / (1 + 0.1 * index))
  const fit = fitDeclineModels(rates.map((_, index) => index), rates).find((item) => item.model === "harmonic")
  close(fit.qi, 120, 1e-9); close(fit.D, 0.1, 1e-9)
})
scenario("28 long horizon: the linear trend is clamped at zero, never negative", () => {
  const well = analyze("Прогноз на 24 месяца\n" + GOLDEN).wells[0]
  assert.equal(well.forecast.t.length, 24); assert.ok(well.forecast.linear.every((value) => value >= 0)); assert.equal(well.forecast.linearClamped, true)
  assert.ok(well.forecast.exponential.every((value) => value > 0) && well.forecast.harmonic.every((value) => value > 0))
})
scenario("29 fewer than 4 points: no scenarios; one point: no trends at all", () => {
  assert.equal(analyze("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 100 |\n| 2026-02 | 95 |\n| 2026-03 | 91 |").wells[0].forecastBlocked, "TOO_FEW_POINTS")
  const one = analyze("| Month | Oil, bbl/day |\n|---|---|\n| 2026-01 | 100 |")
  assert.equal(one.wells[0].decline.total, null); assert.match(oilConclusion(one, one.wells[0], "ru")[0], /Одна точка/)
})
scenario("30 economics only with a stated price; price in USD/m3 converts exactly", () => {
  assert.equal(golden().economicOutputs, null)
  assert.deepEqual(readPrice("цена нефти 70 USD/bbl"), { value: 70, currency: "USD", per: "bbl" })
  assert.deepEqual(readPrice("price $440/m3"), { value: 440, currency: "USD", per: "m3" })
  const well = analyze("Цена 70 USD/bbl\n" + GOLDEN).wells[0]
  close(well.economics.dailyGap, 35 * 70); close(well.economics.monthGap, 35 * 70 * 365.25 / 12)
  const days = [31, 28, 31, 30, 31, 30, 31, 31]
  close(well.economics.historicalGap, OIL.reduce((sum, q, i) => sum + (100 - q) * days[i] * 70, 0))
  const perM3 = analyze("price 440 USD/m3\n" + GOLDEN).wells[0]
  close(perM3.economics.dailyGap, 35 * 0.158987294928 * 440)
})
scenario("31 tonnes price needs density when rates are volumes", () => {
  const result = analyze("цена 500 USD/т\n" + GOLDEN)
  assert.equal(result.economicOutputs, null); assert.equal(result.analysisSections.find((section) => section.id === "economics").reason, "PRICE_UNIT_NEEDS_DENSITY")
})
scenario("32 synthetic marking, forecast horizon and gas reference from the message", () => {
  const request = ok("Синтетические данные, прогноз на 6 месяцев, газ при 60°F 14.7 psia\n" + GOLDEN)
  assert.equal(request.metadata.dataKind, "synthetic"); assert.equal(request.parameters.forecastPeriods, 6); assert.match(request.units.gasReference, /60/)
})
scenario("33 a table that is not production data is left to the normal chat", () => {
  assert.equal(parseProductionTable("| Month | Oil price |\n|---|---|\n| 2026-01 | 70 |"), null)
  assert.equal(parseProductionTable("Как дела? нефть дорожает"), null)
  assert.equal(executePetroleumTable({ prompt: "| Город | Население |\n|---|---|\n| Алматы | 2000000 |" }), null)
  assert.equal(executePetroleumTable({ prompt: "Write a Python function to analyze\n" + GOLDEN }), null)
})
scenario("34 performance: 100 wells × 18 months analysed and cross-checked quickly", () => {
  const rows = ["well_id,date,oil_bbl_day,water_bbl_day,gas_scf_day"]
  for (let well = 0; well < 100; well++) for (let month = 0; month < 18; month++) rows.push(`SYN-${well},${new Date(Date.UTC(2024, month, 1)).toISOString().slice(0, 10)},${(100 + well) * Math.exp(-0.03 * month)},${20 + month},${(100 + well) * 500}`)
  const start = performance.now()
  const request = ok(rows.join("\n")), result = analyzePetroleumDataset(request), check = crossCheckOil(request, result)
  const elapsed = performance.now() - start
  assert.equal(result.wells.length, 101); assert.equal(check.status, "passed"); assert.ok(elapsed < 4000, `${elapsed} ms`)
  console.log(`# 100 wells × 18 months: ${elapsed.toFixed(0)} ms`)
})

// ── Languages and text ─────────────────────────────────────────────────────
test("four languages: same numbers, translated words, formatted for each language", () => {
  const result = golden(), well = result.wells[0]
  const ru = oilConclusion(result, well, "ru").join(" "), en = oilConclusion(result, well, "en").join(" "), kk = oilConclusion(result, well, "kk").join(" "), ar = oilConclusion(result, well, "ar").join(" ")
  assert.match(ru, /35,00\u00a0%.*100 до 65 bbl\/day/); assert.match(ru, /16,67\u00a0% до 45,83\u00a0% \(\+29,17 п\.п\.\)/); assert.match(ru, /646,15 scf\/bbl/)
  assert.match(en, /fell by 35\.00\u00a0%, from 100 to 65 bbl\/day/); assert.match(en, /\+29\.17 pp/)
  assert.match(kk, /35,00\u00a0%/); assert.match(ar, /35\.00\u00a0%/); assert.ok(ar.includes("\u2066"))
  assert.equal(oilNumber(-35, "ru", 2), "−35,00"); assert.equal(oilNumber(50000, "ru", 0), "50\u00a0000"); assert.equal(oilNumber(50000, "en", 0), "50,000"); assert.equal(oilPercent(0.458333, "en"), "45.83\u00a0%")
  const cards = oilKpis(result, well, "ru").map((card) => card.key)
  assert.deepEqual(cards, ["oil", "wc", "gor", "liquid", "wor", "gas", "decline"])
})
test("copy/share text replaces the block with a readable report", () => {
  const content = executePetroleumTable({ prompt: "Проанализируй\n" + GOLDEN }).content
  const text = oilReportBlocksToText(`До\n\n${content}\n\nПосле`)
  assert.ok(!text.includes("malik-oil-report")); assert.match(text, /45,83\u00a0%/); assert.match(text, /\| авг 2026 \| 65 \| 55 \| 120 \| 45,83 \|/); assert.match(text, /не прогноз пласта/)
  assert.ok(text.startsWith("До") && text.endsWith("После"))
  assert.match(oilReportBlocksToText(content.replace("```malik-oil-report\n", "```malik-oil-report\r")), /45,83\u00a0%/)
})

// ── Stream route and rendered report ───────────────────────────────────────
const POST = load("app/api/stream/route-impl.ts").POST
async function stream(body) {
  const response = await POST(new Request("http://fixture/api/stream", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ stream: true, workspaceMode: "chat", ...body }) }))
  assert.equal(response.status, 200)
  const events = (await response.text()).split("\n\n").filter((frame) => frame.includes("data: ")).map((frame) => JSON.parse(frame.split("\ndata: ")[1]))
  for (const deferred of after.splice(0)) await deferred()
  return { events, answer: events.filter((event) => event.type === "content").map((event) => event.content).join(""), done: events.filter((event) => event.type === "done") }
}
test("stream: a pasted table is answered locally with the report — no model, one answer", async () => {
  for (const prompt of ["Проанализируй синтетические данные скважины\n" + GOLDEN, GOLDEN, "Нарисуй график добычи\n" + GOLDEN]) {
    const { answer, done } = await stream({ originalQuestion: prompt })
    assert.equal(done.length, 1); assert.equal(done[0].provider, "malik-petroleum-local"); assert.equal(done[0].model, contract.OIL_ANALYSIS_ENGINE_VERSION)
    assert.equal(answer.match(/```malik-oil-report/g).length, 1); assert.ok(!answer.includes("generatedMedia"))
    const view = readOilReportBlock(answer.split(/\r\n?|\n/)[1]); assert.ok(view, answer.slice(0, 300)); assert.deepEqual(view.tampered, []); assert.equal(view.crossCheck.status, "passed")
    assert.match(view.request.metadata.sourceHash, /^[a-f0-9]{64}$/)
  }
})
test("grand challenge: Ling and MAX both receive a real model call and the verified charts remain in one answer", async () => {
  const { requiresPetroleumExpertSynthesis } = load("lib/work/petroleum/expert-routing.ts")
  assert.equal(requiresPetroleumExpertSynthesis("Проанализируй добычу нефти\n" + GOLDEN), false)
  assert.equal(requiresPetroleumExpertSynthesis("UAE PETROLEUM ENGINEERING GRAND CHALLENGE"), true)
  const prompt = [
    "@Malik Oil AI UAE PETROLEUM ENGINEERING GRAND CHALLENGE FIXTURE",
    "Analyze water cut, GOR, pressure, hypotheses, H2S safety, CAPEX OPEX and NPV; provide a multidisciplinary investment assessment.",
    GOLDEN,
  ].join("\n")
  for (const modelId of ["ling-3.1-flash", "malik-max"]) {
    const { answer, done } = await stream({ originalQuestion: prompt, modelId })
    assert.equal(done.length, 1)
    assert.equal(done[0].provider, "mock-selected-model")
    assert.equal(done[0].selectedModelId, modelId)
    assert.equal(answer.match(/MULTIDISCIPLINARY MODEL ANALYSIS/g)?.length, 1)
    assert.equal(answer.match(/```malik-oil-report/g)?.length, 1)
    const recent = comprehensiveCalls.at(-1)
    assert.equal(recent.modelId, modelId)
    assert.equal(recent.domain, true)
    assert.match(recent.evidence, /8/)
    assert.match(recent.evidence, /500/)
  }
  assert.equal(comprehensiveCalls.length, 2)
})

test("stream: missing units get a question, not numbers", async () => {
  const { answer, done } = await stream({ originalQuestion: "Проанализируй добычу нефти\n| Месяц | Нефть | Вода |\n|---|---|---|\n| 1 | 100 | 20 |\n| 2 | 90 | 30 |" })
  assert.equal(done[0].provider, "malik-petroleum-local"); assert.match(answer, /не угадываю единицы/); assert.ok(!answer.includes("malik-oil-report"))
})
test("stream: an uploaded CSV gets the report plus the collapsed upload-engine protocol", async () => {
  const csv = "well_id,date,oil_bbl_day,water_bbl_day\nA,2025-01-01,80,20\nA,2025-02-01,60,40"
  const { answer, done } = await stream({ originalQuestion: "Проанализируй нефтяную скважину", selectedSkillId: "petroleum.analyze", attachments: [{ name: "production.csv", mime: "text/csv", kind: "file", text: csv }] })
  assert.equal(done.length, 1); assert.equal(answer.match(/# Malik Oil AI/g).length, 1); assert.ok(answer.includes("SHA-256"))
  assert.ok(answer.indexOf("```malik-oil-report") < answer.indexOf("<details>")); assert.ok(!answer.includes("```malik-visual"))
  const view = readOilReportBlock(answer.split(/\r\n?|\n/)[1]); close(view.result.wells[0].last.wc, 0.4); assert.equal(view.result.sourceSummary.source, "csv")
  // The upload engine's own result is unchanged by the visual layer.
  const direct = executePetroleumMessage({ prompt: "Проанализируй нефтяную скважину", selectedSkillId: "petroleum.analyze", attachments: [{ name: "production.csv", mime: "text/csv", text: csv }] })
  assert.equal(withOilVisual({ ...direct, receipt: { ...direct.receipt, ok: false } }, "x"), direct.content)
})
test("router: production tables count as oil data; code requests stay code", () => {
  assert.equal(routePetroleum(GOLDEN).domain, true); assert.equal(routePetroleum("Нарисуй график добычи\n" + GOLDEN).engine, "petroleum")
  assert.equal(routePetroleum("Write a Python function to analyze\n" + GOLDEN).engine, "code"); assert.equal(routePetroleum("Как отмыть масло с рук?").domain, false)
  assert.equal(routePetroleum("soil volume 5 m3").domain, false)
})
test("render: the report shows the engine's numbers, sections, charts and Arabic right-to-left", () => {
  const fence = executePetroleumTable({ prompt: "Проанализируй, цена 70 USD/bbl\n" + GOLDEN }).content
  const html = renderToStaticMarkup(React.createElement(MalikOilReport, { raw: fence.split("\n")[1] }))
  for (const text of ["Инженерный вывод", "−35,00", "45,83", "646,15", "120 bbl/day", "Данные по периодам", "Сравнение моделей падения", "Гипотезы и необходимые замеры", "Экономический эффект", "Скачать CSV", "Копировать таблицу", "data-oil-badge=\"passed\"", "<svg", "Это продолжение тренда истории"]) assert.ok(html.includes(text), text)
  for (const id of ["summary", "rates", "forecast", "table", "formulas", "oil-decline", "decline-models", "wor", "liquid", "period-changes", "anomalies", "data-quality", "cumulative", "gas", "water-oil-balance", "hypotheses", "economics", "chan", "limitations"]) assert.ok(html.includes(`data-oil-section="${id}"`), id)
  const ar = renderToStaticMarkup(React.createElement(MalikOilReport, { raw: executePetroleumTable({ prompt: "حلل إنتاج النفط\n" + GOLDEN }).content.split("\n")[1] }))
  assert.ok(ar.includes('dir="rtl"') && ar.includes('lang="ar"') && ar.includes("الاستنتاج الهندسي"))
  assert.match(renderToStaticMarkup(React.createElement(MalikOilReport, { raw: "{broken" })), /повреждён/)
})
