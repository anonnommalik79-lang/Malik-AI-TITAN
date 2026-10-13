// Offline checks for the 100 analysis *specifications* and real deterministic physics calculators.
// Run after every change in this area: npm run test:analysis-100
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
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
    if (name.startsWith("./") || name.startsWith("@/")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      const found = [base, base + ".ts", base + ".tsx", path.join(base, "index.ts")].find((file) => fs.existsSync(file) && fs.statSync(file).isFile())
      assert.ok(found, "Missing source dependency: " + name)
      return load(found)
    }
    return require(name)
  }, box, box.exports)
  return box.exports
}

const { ANALYSIS_PRESETS, classifyAnalysisDomain, suggestAnalysisPresets } = load("lib/visual/analysis-presets.ts")
const { selectVisualKinds, visualEngineContract } = load("lib/visual/intent.ts")
const { computeCalculator, calculatorInputs, CALCULATOR_MODELS } = load("lib/visual/calculators.ts")
const { parseVisualBlock } = load("lib/visual/schema.ts")
const { scienceCurve } = load("lib/visual/science-charts.ts")
const { buildOilRateHeatmap } = load("lib/visual/oil-heatmap.ts")

assert.equal(ANALYSIS_PRESETS.length, 100)
assert.deepEqual(ANALYSIS_PRESETS.map((s) => s.id), Array.from({ length: 100 }, (_, i) => i + 1))
assert.equal(new Set(ANALYSIS_PRESETS.map((s) => s.name)).size, 100)
assert.equal(ANALYSIS_PRESETS.filter((s) => s.domain === "petroleum").length, 70)
assert.ok(ANALYSIS_PRESETS.every((s) => s.required.length >= 10 && s.keywords.length > 0))
assert.deepEqual(ANALYSIS_PRESETS.filter((s) => s.readiness === "tested-core").map((s) => s.id), [2,73,76,80])
assert.equal(ANALYSIS_PRESETS.filter((s) => s.readiness === "specification").length, 96)
assert.equal(classifyAnalysisDomain("Нефтяная скважина: обводнённость"), "petroleum")
assert.equal(classifyAnalysisDomain("Рассчитай по закону Ома"), "physics")
assert.equal(classifyAnalysisDomain("Таблица истинности A AND B"), "logic")
assert.equal(classifyAnalysisDomain("What is cooking oil?"), null)
assert.equal(classifyAnalysisDomain("Нарисуй oil painting в стиле импрессионизма"), null)
assert.ok(suggestAnalysisPresets("Проанализируй water cut по скважинам").some((s) => s.id === 6))
assert.ok(suggestAnalysisPresets("Рассчитай по закону Ома напряжение и ток").some((s) => s.id === 76))
assert.ok(suggestAnalysisPresets("График функции y=x^2").some((s) => s.id === 81))
assert.ok(suggestAnalysisPresets("Таблица истинности булевой логики").some((s) => s.id === 88))
assert.equal(suggestAnalysisPresets("только текст: объясни закон Ома").length, 0)
assert.equal(selectVisualKinds("Напиши Python код для графика по физике").length, 0)
assert.equal(selectVisualKinds("Выполни фото генерацию нефтяной платформы").length, 0)
assert.ok(selectVisualKinds("Рассчитай ток по закону Ома").includes("calculator"))
assert.ok(selectVisualKinds("Таблица истинности A AND B").includes("table"))
assert.ok(selectVisualKinds("Построй график функции y=x²").includes("chart"))
assert.match(visualEngineContract("Рассчитай дальность броска тела"), /never invent plots|without drag/)
assert.ok(!visualEngineContract("Привет!").includes("ANALYSIS PRESETS"))
assert.equal(suggestAnalysisPresets("Анализ нефтяного месторождения", 200).length <= 3, true)

for (const model of ["projectile-motion", "ohms-law", "ideal-gas"]) {
  assert.ok(CALCULATOR_MODELS[model], model)
  assert.ok(calculatorInputs(model).length >= 2)
  assert.equal(parseVisualBlock(JSON.stringify({ version: 2, type: "calculator", model, title: model, dataKind: "example" })).ok, true)
}
const value = (result, key) => [result.headline, ...result.outputs, ...result.details].find((o) => o.key === key)?.value
const close = (a, b, name) => assert.ok(typeof a === "number" && Number.isFinite(a) && Math.abs(a-b) <= Math.max(1,Math.abs(b))*1e-10, name + " got " + a + " expected " + b)

const ball = computeCalculator("projectile-motion", { speed: 20, angleDegrees: 45, gravity: 9.81 })
close(value(ball, "range"), 400/9.81, "trajectory horizontal range")
close(value(ball, "flight"), 20*Math.SQRT2/9.81, "flight time")
close(value(ball, "height"), 100/9.81, "max height")
close(value(computeCalculator("projectile-motion", { speed: 20, angleDegrees: 0, gravity: 9.81 }), "range"), 0, "horizontal shot equal height")
assert.equal(value(computeCalculator("projectile-motion", { speed: 20, angleDegrees: 45, gravity: 0 }), "range"), null)

const ohm = computeCalculator("ohms-law", { voltage: 12, resistance: 6 })
close(value(ohm, "current"), 2, "I=U/R")
close(value(ohm, "power"), 24, "P=UI")
close(value(ohm, "conductance"), 1/6, "G=1/R")
assert.equal(value(computeCalculator("ohms-law", { voltage: 12, resistance: 0 }), "current"), null)

const ideal = computeCalculator("ideal-gas", { moles: 1, temperatureK: 273.15, pressurePa: 101325 })
const liters = (8.31446261815324 * 273.15 / 101325) * 1000
close(value(ideal, "volumeL"), liters, "ideal gas molar volume")
close(value(ideal, "volumeM3"), liters / 1000, "ideal gas m3")
assert.equal(value(computeCalculator("ideal-gas", { moles: 1, temperatureK: 0, pressurePa: 101325 }), "volumeL"), null)
assert.equal(value(computeCalculator("ideal-gas", { moles: 1, temperatureK: 300, pressurePa: 0 }), "volumeL"), null)
for (const model of ["projectile-motion", "ohms-law", "ideal-gas"]) {
  const inputs = model === "projectile-motion"
    ? { speed: 20, angleDegrees: 45, gravity: 9.81 }
    : model === "ohms-law" ? { voltage: 12, resistance: 6 }
      : { moles: 1, temperatureK: 273.15, pressurePa: 101325 }
  const curve = scienceCurve(model, inputs)
  assert.ok(curve && curve.data.labels.length === 21 && curve.data.series[0].values.length === 21, model)
  const schema = parseVisualBlock(JSON.stringify({
    version: 2, type: "chart", chart: "line", title: curve.title, unit: curve.unit,
    dataKind: "user", labels: curve.data.labels, series: curve.data.series,
  }))
  assert.equal(schema.ok, true, `Calculated chart rejected by visual schema: ${model} (${schema.reason})`)
  assert.ok(curve.data.series[0].values.every((v) => Number.isFinite(v)), model)
}
const closeCurve = (got, want, label) => assert.ok(Math.abs(got - want) <= 1e-7, label + ": " + got + " vs " + want)
const ballCurve = scienceCurve("projectile-motion", { speed: 20, angleDegrees: 45, gravity: 9.81 })
closeCurve(ballCurve.data.series[0].values[10], 100/9.81, "computed trajectory apex")
const gasCurve = scienceCurve("ideal-gas", { moles: 1, temperatureK: 273.15, pressurePa: 101325 })
closeCurve(gasCurve.data.series[0].values[10], liters, "isotherm at supplied p")
const ohmCurve = scienceCurve("ohms-law", { voltage: 12, resistance: 6 })
closeCurve(ohmCurve.data.series[0].values[20], 2, "I-U curve at supplied U")
assert.equal(scienceCurve("ohms-law", { voltage: 10, resistance: 0 }), null)
assert.equal(scienceCurve("ideal-gas", { moles: 1, temperatureK: 273, pressurePa: 0 }), null)
assert.equal(scienceCurve("projectile-motion", { speed: 20, angleDegrees: 45, gravity: -9 }), null)

const heat = buildOilRateHeatmap([
  { id: "W-A", isField: false, t: [1,2], period: ["2026-01","2026-02"], oil: [100,90] },
  { id: "W-B", isField: false, t: [2,3], period: ["2026-02","2026-03"], oil: [0,50] },
  { id: "Field", isField: true, t: [1,2,3], period: ["2026-01","2026-02","2026-03"], oil: [100,90,50] },
])
assert.deepEqual(heat.periods.map((v) => v.label), ["2026-01","2026-02","2026-03"])
assert.deepEqual(heat.wells.map((v) => v.values), [[100,90,null],[null,0,50]], "Missing wells/timestamps cannot be invented")
assert.equal(heat.maximum,100)
assert.equal(buildOilRateHeatmap([{ id: "only", isField: false, t: [1], period: ["2026-01"], oil: [5] }]), null)
const oilUi = fs.readFileSync("components/sovereign/MalikOilReport.tsx", "utf8")
assert.match(oilUi, /<OilWellHeatmap wells=\{result.wells\}/)
assert.match(fs.readFileSync("components/sovereign/oil-report/OilWellHeatmap.tsx","utf8"), /data-observed="true"/)

const calculatorUi = fs.readFileSync("components/sovereign/visual-engine/VisualCalculator.tsx", "utf8")
assert.match(calculatorUi, /scienceCurve\(block\.model, current\)/)
assert.match(calculatorUi, /<ChartView kind="line" data=\{curve\.data\}/)

console.log("PASS: 100 registered (specifications only), domain/no-photo/no-code routing, Zod-calculator schemas, deterministic physics numerical references curves, schema validation and invalid inputs.")
