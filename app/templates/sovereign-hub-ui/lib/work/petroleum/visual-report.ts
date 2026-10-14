import { OIL_REPORT_FENCE, oilReportBlockSchema, type MpceReceipt, type OilLanguage, type OilReportBlock, type OilWellAnalysis, type PetroleumAnalysisRequest, type PetroleumAnalysisResult } from "./analysis-contract"
import { FIELD_ID, analyzePetroleumDataset, compareOilMetrics, oilMetricPairs } from "./analysis"
import { CROSS_CHECK_ENGINE, crossCheckOil, type OilCrossCheck } from "./cross-check"
import { oilBidi, oilCode, oilConclusion, oilCount, oilNumber, oilPercent, oilPeriod, oilRate, oilUnit, oilWord, type PeriodContext } from "./analysis-i18n"
import {verifyOilAnalysis} from "./verify-analysis"
import {screenProductionRisk} from "./risk"
import {oilEvidenceLedger} from "./evidence-ledger"

/**
 * The visual oil report inside a chat answer: a ```malik-oil-report fence
 * carrying the validated request and the metrics shown when it was written.
 *
 * Reading a block always recalculates. The stored metrics are only compared:
 * if a model or an edit changed a number, the report shows the engine's value
 * and says so. The cross-check against the upload engine is re-run too.
 */

export type OilReportView = {
  request: PetroleumAnalysisRequest
  result: PetroleumAnalysisResult
  crossCheck: OilCrossCheck
  tampered: string[]
  execution?:MpceReceipt
  risk:ReturnType<typeof screenProductionRisk>
  evidenceLedger:ReturnType<typeof oilEvidenceLedger>
}

export function oilReportFence(request: PetroleumAnalysisRequest, result = analyzePetroleumDataset(request), execution?:MpceReceipt) {
  const block: OilReportBlock = { kind: "malik-oil-report", request, metrics: oilMetricPairs(result),...(execution?{execution}:{}) }
  return `\`\`\`${OIL_REPORT_FENCE}\n${JSON.stringify(block)}\n\`\`\``
}

export function readOilReportBlock(raw: string): OilReportView | null {
  let json: unknown
  try { json = JSON.parse(raw) } catch { return null }
  const parsed = oilReportBlockSchema.safeParse(json)
  if (!parsed.success) return null
  let result: PetroleumAnalysisResult
  try { result = analyzePetroleumDataset(parsed.data.request) } catch { return null }
  const verification=verifyOilAnalysis(parsed.data.request,result), other=crossCheckOil(parsed.data.request,result)
  const tampered=compareOilMetrics(parsed.data.metrics,oilMetricPairs(result))
  const execution=parsed.data.execution
  const receiptValid=!execution || execution.datasetRef===parsed.data.request.metadata.sourceHash && execution.engineVersion===result.engineVersion && execution.parameters.timeUnit===parsed.data.request.dataset.granularity && JSON.stringify(execution.parameters.forecastTargets)===JSON.stringify(parsed.data.request.parameters.forecastTargets??null) && execution.validation.status===(verification.ok?"passed":"failed") && execution.validation.checked===verification.checked
  if(!receiptValid) tampered.push("execution:receipt-mismatch")
  return {
    request: parsed.data.request,
    result,
    crossCheck: {status:verification.ok&&other.status!=="failed"?"passed":"failed",checked:verification.checked+other.checked,mismatches:[...verification.mismatches,...other.mismatches],reason:other.reason},
    tampered,
    execution:receiptValid?execution:undefined,
    risk:screenProductionRisk(parsed.data.request,result),
    evidenceLedger:oilEvidenceLedger(parsed.data.request,result),
  }
}

export function oilPeriodContext(result: PetroleumAnalysisResult): PeriodContext {
  const summary = result.sourceSummary
  return { granularity: summary.granularity, calendar: summary.calendar, firstT: summary.firstT, lastT: summary.lastT }
}

export function oilWellName(well: OilWellAnalysis, language: OilLanguage) {
  return well.id === FIELD_ID ? oilWord(language, "field") : well.id
}

export type OilKpi = { key: string; label: string; value: string; detail: string; direction: "down" | "up" | "flat" | null }

const direction = (value: number | null | undefined): OilKpi["direction"] => value === null || value === undefined ? null : value > 0 ? "up" : value < 0 ? "down" : "flat"

/** The headline cards: each value and detail is a formatted engine number. */
export function oilKpis(result: PetroleumAnalysisResult, well: OilWellAnalysis, language: OilLanguage): OilKpi[] {
  const units = result.validatedInputs.units
  const L = oilUnit(units.liquid, language), G = oilUnit(units.gas, language), R = oilUnit(units.gor, language)
  const pp = oilWord(language, "pp")
  const from = ["с", "from", "бастап", "من"][["ru", "en", "kk", "ar"].indexOf(language)]
  const cards: OilKpi[] = []
  const { first, last, change } = well
  if (well.t.length >= 2) cards.push({ key: "oil", label: oilWord(language, "k.oil"), value: oilPercent(change.oil, language, { sign: true }), detail: `${oilRate(first.oil, language)} → ${oilRate(last.oil, language)} ${L}`, direction: direction(change.oil) })
  else cards.push({ key: "oil", label: oilWord(language, "k.oil"), value: `${oilRate(last.oil, language)} ${L}`, detail: "", direction: null })
  if (last.wc !== null && last.wc !== undefined) cards.push({ key: "wc", label: units.basis === "mass" ? oilWord(language, "wcMass") : oilWord(language, "k.wc"), value: oilPercent(last.wc, language), detail: change.wcPP === null ? "" : `${oilNumber(change.wcPP, language, 2, { sign: true })} ${pp} (${from} ${oilPercent(first.wc, language)})`, direction: direction(change.wcPP) })
  if (last.gor !== null && last.gor !== undefined) cards.push({ key: "gor", label: oilWord(language, "k.gor"), value: `${oilRate(last.gor, language)} ${R}`, detail: change.gorRel === null ? "" : `${oilPercent(change.gorRel, language, { sign: true })} (${from} ${oilRate(first.gor, language)})`, direction: direction(change.gorRel) })
  if (last.liquid !== null && last.liquid !== undefined) {
    const stats = well.liquidStats
    const cv = stats?.cv === null || stats?.cv === undefined ? null : oilNumber(stats.cv * 100, language, 2)
    cards.push({ key: "liquid", label: oilWord(language, "k.liquid"), value: `${oilRate(stats?.stable ? stats.mean : last.liquid, language)} ${L}`, detail: stats?.stable ? oilWord(language, "k.stable", { cv: cv || "0" }) : `${oilPercent(change.liquid, language, { sign: true })}${cv ? ` · ${oilWord(language, "k.varies", { cv })}` : ""}`, direction: stats?.stable ? "flat" : direction(change.liquid) })
  }
  if (last.wor !== null && last.wor !== undefined) cards.push({ key: "wor", label: oilWord(language, "k.wor"), value: oilNumber(last.wor, language, 3), detail: first.wor === null ? "" : `${from} ${oilNumber(first.wor, language, 3)}`, direction: direction(change.worAbs) })
  if (last.gas !== null && last.gas !== undefined && well.t.length >= 2) cards.push({ key: "gas", label: oilWord(language, "k.gas"), value: oilPercent(change.gas, language, { sign: true }), detail: `${oilRate(first.gas, language)} → ${oilRate(last.gas, language)} ${G}`, direction: direction(change.gas) })
  if (well.decline.perPeriod !== null && well.decline.declining) {
    const per = result.sourceSummary.granularity === "month" ? oilWord(language, "perMonth") : result.sourceSummary.granularity === "day" ? oilWord(language, "perDayWord") : oilWord(language, "perPeriod")
    cards.push({ key: "decline", label: oilWord(language, "k.decline"), value: `${oilPercent(well.decline.perPeriod, language)} ${per}`, detail: well.decline.effectiveAnnual === null ? "" : `≈ ${oilPercent(well.decline.effectiveAnnual, language)} ${oilWord(language, "perYear")}`, direction: "down" })
  }
  return cards.map((card) => ({ ...card, detail: oilBidi(card.detail, language) }))
}

export type OilTable = { columns: string[]; rows: string[][] }

/** One decimal style per table column: whole numbers stay whole, otherwise two decimals throughout. */
export function oilColumn(values: Array<number | null | undefined>, language: OilLanguage, digits = 2) {
  const whole = values.every((value) => value === null || value === undefined || Number.isInteger(value))
  return (value: number | null | undefined) => oilNumber(value, language, whole ? 0 : digits)
}

/** The production table as shown (formatted), and the same numbers raw for CSV. */
export function oilProductionTable(result: PetroleumAnalysisResult, well: OilWellAnalysis, language: OilLanguage, raw = false): OilTable {
  const units = result.validatedInputs.units
  const context = oilPeriodContext(result)
  const hasWater = well.water.some((value) => value !== null), hasGas = well.gas.some((value) => value !== null)
  const unit = (text: string | null) => text ? `, ${oilUnit(text, language)}` : ""
  const columns = [oilWord(language, "period"), `${oilWord(language, "oil")}${unit(units.liquid)}`]
  if (hasWater) columns.push(`${oilWord(language, "water")}${unit(units.liquid)}`, `${oilWord(language, "liquid")}${unit(units.liquid)}`, `WC, %`, "WOR")
  if (hasGas) columns.push(`${oilWord(language, "gas")}${unit(units.gas)}`, `GOR${unit(units.gor)}`)
  const formats = { oil: oilColumn(well.oil, language), water: oilColumn(well.water, language), liquid: oilColumn(well.liquid, language), gas: oilColumn(well.gas, language), gor: oilColumn(well.gor, language) }
  const value = (number: number | null | undefined, kind: "percent" | "ratio" | keyof typeof formats) => {
    if (raw) return number === null || number === undefined ? "" : String(kind === "percent" ? number * 100 : number)
    return kind === "percent" ? oilNumber(number === null || number === undefined ? null : number * 100, language, 2) : kind === "ratio" ? oilNumber(number, language, 3) : formats[kind](number)
  }
  const rows = well.t.map((t, index) => {
    const row = [raw && context.calendar ? oilPeriod(t, context, "en", well.period[index]) : oilPeriod(t, context, language, well.period[index]), value(well.oil[index], "oil")]
    if (hasWater) row.push(value(well.water[index], "water"), value(well.liquid[index], "liquid"), value(well.wc[index], "percent"), value(well.wor[index], "ratio"))
    if (hasGas) row.push(value(well.gas[index], "gas"), value(well.gor[index], "gor"))
    return row
  })
  return { columns, rows }
}

export function oilCsv(table: OilTable) {
  const cell = (text: string) => /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  return [table.columns, ...table.rows].map((row) => row.map(cell).join(",")).join("\n")
}

/** The report as Markdown text: for copying, sharing and export, where the drawing cannot go. */
export function oilReportText(view: OilReportView): string {
  const { result } = view
  const language = result.language
  const well = result.wells[0]
  const context = oilPeriodContext(result)
  const summary = result.sourceSummary
  const kind = summary.granularity === "month" ? "month" : summary.granularity === "day" ? "day" : "index"
  const lines = [
    `**${oilWord(language, "brand")} — ${oilWord(language, "title")}**`,
    "",
    [oilCount(language, summary.periods, kind), oilCount(language, summary.wells, "well"), oilWord(language, summary.dataKind === "synthetic" ? "synthetic" : "userData")].join(" · "),
    "",
  ]
  if (view.tampered.length) lines.push(`> ${oilWord(language, "tampered")}`, "")
  lines.push(`### ${oilWord(language, "conclusion")}${result.wells.length > 1 ? ` — ${oilWellName(well, language)}` : ""}`, "", ...oilConclusion(result, well, language), "")
  const kpis = oilKpis(result, well, language)
  lines.push(`### ${oilWord(language, "kpis")}`, "", `| ${oilWord(language, "kpis")} | ${oilWord(language, "value")} | |`, "|---|---|---|", ...kpis.map((kpi) => `| ${kpi.label} | ${kpi.value} | ${kpi.detail} |`), "")
  const table = oilProductionTable(result, well, language)
  lines.push(`### ${oilWord(language, "s.table")}`, "", `| ${table.columns.join(" | ")} |`, `|${table.columns.map(() => "---").join("|")}|`, ...table.rows.slice(0, 120).map((row) => `| ${row.join(" | ")} |`), "")
  if (well.forecast) {
    const L = oilUnit(result.validatedInputs.units.liquid, language)
    lines.push(`### ${oilWord(language, "s.forecast")}`, "", `| ${oilWord(language, "period")} | ${oilWord(language, "linear")}, ${L} | ${oilWord(language, "exponential")}, ${L} | ${oilWord(language, "harmonic")}, ${L} |`, "|---|---|---|---|",
      ...well.forecast.t.map((t, index) => `| ${oilPeriod(t, context, language)} | ${oilRate(well.forecast!.linear[index], language)} | ${oilRate(well.forecast!.exponential[index], language)} | ${oilRate(well.forecast!.harmonic[index], language)} |`),
      "", oilWord(language, "forecastCaveat"), "")
  }
  // Every fit uses the same raw series. Sum-of-well extrapolation is a different
  // method from fitting field totals; show both, never silently substitute.
  lines.push("### DCA — "+result.sourceSummary.granularity,"","| Well | Model | qi fitted | D nominal | b (Arps) | R²(rate) | R²(log) |","|---|---|---|---|---|---|---|",
    ...result.wells.flatMap(w=>w.models.filter(f=>f.valid).map(f=>`| ${oilWellName(w,language)} | ${f.model} | ${f.qi??f.a} | ${f.D??f.b} | ${f.arpsB??"—"} | ${f.r2??"—"} | ${f.r2Log??"—"} |`)),"")
  for(const w of result.wells.filter(w=>!w.isField&&w.forecast)) lines.push(`#### ${w.id}: MODELLED`,"","| Period | Exponential |","|---|---|",...w.forecast!.t.map((t,i)=>`| ${oilPeriod(t,context,language)} | ${oilRate(w.forecast!.exponential[i],language)} ${result.validatedInputs.units.liquid} |`),"")
  const summed=result.tableDatasets.find(t=>t.id==="summed-well-forecast")
  if(summed) lines.push("#### MODELLED — sum of well fits (not field-total fit)","","| Period | Exponential |","|---|---|",...summed.rows.map(row=>`| ${oilPeriod(Number(row[0]),context,language)} | ${oilRate(Number(row[1]),language)} ${result.validatedInputs.units.liquid} |`),"")
  const pressure=result.tableDatasets.find(t=>t.id==="pressure"&&t.well===well.id)
  if(pressure) lines.push(`### Pressure — ${result.validatedInputs.units.pressure}`,"","| Period | Pressure |","|---|---|",...pressure.rows.map(row=>`| ${row[0]} | ${row[1]??"—"} |`),"")
  if(view.execution) lines.push("### MPCE — execution receipt", "", `Version: ${view.execution.version}; code executed: true; AI model calls: 0; validation: ${view.execution.validation.status} (${view.execution.validation.checked} checks).`, `Dataset: ${view.execution.datasetRef}; input SHA256: ${view.execution.inputHash}.`,...view.execution.functions.map(f=>`- ${f.id}: ${f.module} (${f.version}), executed=true.`),"")
  lines.push("### Evidence ledger", "",...view.evidenceLedger.map(c=>`- **${c.status}** — ${c.scope}: ${c.qualification}.`),"")
  if (well.hypotheses.measurements.length) {
    lines.push(`### ${oilWord(language, "s.hypotheses")}`, "", oilWord(language, "hypothesesIntro"), "",
      ...[...well.hypotheses.water, ...well.hypotheses.gas, ...well.hypotheses.productivity].map((code) => `- ${oilCode(language, code)}`), "",
      `**${oilWord(language, "measurements")}:** ${well.hypotheses.measurements.map((code) => oilCode(language, code)).join("; ")}.`, "")
  }
  lines.push(`### ${oilWord(language, "s.limitations")}`, "", ...[...result.warnings, ...result.limitations].map((code) => `- ${oilCode(language, code)}`), "",
    oilWord(language, "provenance", { engine: result.engineVersion, schema: result.schemaVersion, id: result.analysisId }),
    view.crossCheck.status === "passed" ? oilWord(language, "crossDetail", { engine: CROSS_CHECK_ENGINE, n: view.crossCheck.checked }) : "")
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Every ```malik-oil-report fence in an answer as readable text (copy, share, speech). */
export function oilReportBlocksToText(markdown: string) {
  // The stream ends fence headers with CR (a transport guard); read both.
  return String(markdown || "").replace(/```malik-oil-report[^\S\n]*\r(?!\n)/gu, "```malik-oil-report\n").replace(/```malik-oil-report[^\n]*\n([\s\S]*?)\n```/gu, (whole, body: string) => {
    const view = readOilReportBlock(body)
    return view ? oilReportText(view) : whole
  })
}
