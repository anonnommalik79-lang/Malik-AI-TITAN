"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, Check, Copy, Download } from "lucide-react"
import { TexMath } from "./malik-tex"
import { OilChart, type OilChartSeries } from "./oil-report/OilChart"
import { OilWellHeatmap } from "./oil-report/OilWellHeatmap"
import type { OilLanguage } from "@/lib/work/petroleum/analysis-contract"
import { isRtl, oilCode, oilConclusion, oilCount, oilNumber, oilPercent, oilPeriod, oilRate, oilUnit, oilWord, type OilWordKey } from "@/lib/work/petroleum/analysis-i18n"
import { CROSS_CHECK_ENGINE } from "@/lib/work/petroleum/cross-check"
import { oilColumn, oilCsv, oilKpis, oilPeriodContext, oilProductionTable, oilWellName, readOilReportBlock, type OilReportView } from "@/lib/work/petroleum/visual-report"
import "./oil-report.css"

/**
 * The visual oil report (```malik-oil-report). Everything on it is computed
 * here from the validated request by the deterministic engine; the stored
 * metrics are only compared with the recalculation.
 */
export function MalikOilReport({ raw }: { raw: string }) {
  const view = useMemo(() => readOilReportBlock(raw), [raw])
  if (!view) return <p className="malik-md-p" role="status">Malik Oil AI: блок отчёта повреждён и не показан. / The report block is damaged.</p>
  return <OilReport view={view} />
}

const SERIES_TONE: Record<string, OilChartSeries["tone"]> = { oil: 0, water: 1, liquid: 2, gas: 0, gor: 0, wc: 0, wor: 0, worDerivative: 1, linear: 1, exponential: 2, harmonic: 3 }
const ANOMALY_CODES = new Set(["ZERO_OIL", "GAP", "OIL_JUMP", "LIQUID_JUMP", "GOR_JUMP", "WC_JUMP", "RESIDUAL_OUTLIER"])
const VISIBLE_ROWS = 12

function OilSection({ title, open = false, children, id }: { title: string; open?: boolean; children: ReactNode; id: string }) {
  if (open) return <section className="malik-oil__section" data-oil-section={id}><h4 className="malik-oil__h">{title}</h4>{children}</section>
  return (
    <details className="malik-oil__section malik-oil__more" data-oil-section={id}>
      <summary className="malik-oil__h">{title}</summary>
      <div className="malik-oil__more-body">{children}</div>
    </details>
  )
}

function OilTableView({ columns, rows, limit, language, numericFrom = 1 }: { columns: string[]; rows: string[][]; limit?: number; language: OilLanguage; numericFrom?: number }) {
  const [all, setAll] = useState(false)
  const shown = limit && !all ? rows.slice(0, limit) : rows
  return (
    <>
      <div className="malik-oil__table-wrap" dir="ltr">
        <table className="malik-oil__table">
          <thead><tr>{columns.map((column, index) => {
            const split = column.lastIndexOf(", ")
            return <th key={index} scope="col" className={index >= numericFrom ? "is-num" : undefined}>{split > 0 ? <><span>{column.slice(0, split)}</span><span className="malik-oil__th-unit">{column.slice(split + 2)}</span></> : column}</th>
          })}</tr></thead>
          <tbody>{shown.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index} className={index >= numericFrom ? "is-num" : undefined}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {limit && rows.length > limit ? (
        <button type="button" className="malik-oil__button" aria-expanded={all} onClick={() => setAll((value) => !value)}>
          {all ? oilWord(language, "hideRows") : oilWord(language, "showRows", { n: rows.length })}
        </button>
      ) : null}
    </>
  )
}

function OilReport({ view }: { view: OilReportView }) {
  const { result, crossCheck, tampered } = view
  const language = result.language
  const [wellIndex, setWellIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])
  const well = result.wells[Math.min(wellIndex, result.wells.length - 1)]
  const context = oilPeriodContext(result)
  const units = result.validatedInputs.units
  const L = oilUnit(units.liquid, language), G = oilUnit(units.gas, language), R = oilUnit(units.gor, language)
  const sections = new Map(result.analysisSections.map((section) => [section.id, section]))
  const computed = (id: string) => sections.get(id as never)?.status === "computed"
  const word = (key: OilWordKey, values?: Record<string, string | number>) => oilWord(language, key, values)
  const periodLabel = (t: number, short = false) => {
    const index = well.t.indexOf(t)
    return oilPeriod(t, context, language, index >= 0 ? well.period[index] : undefined, short)
  }
  const kind = result.sourceSummary.granularity === "month" ? "month" : result.sourceSummary.granularity === "day" ? "day" : "index"
  const perStep = kind === "month" ? oilWord(language, "perMonth") : kind === "day" ? oilWord(language, "perDayWord") : oilWord(language, "perPeriod")
  const root = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(false)
  const toggleAll = () => {
    const next = !expanded
    root.current?.querySelectorAll<HTMLDetailsElement>("details.malik-oil__more").forEach((item) => { item.open = next })
    setExpanded(next)
  }

  const chart = (chartId: string, title: string, format: (value: number) => string, options: { zero?: boolean; unit?: string } = {}) => {
    const source = result.chartSeries.find((item) => item.id === chartId && item.well === well.id)
    if (!source) return null
    return (
      <OilChart
        key={`${well.id}-${chartId}`}
        title={title}
        unit={options.unit ?? oilUnit(source.unit, language)}
        x={source.x}
        series={source.series.map((item) => ({ id: item.id, label: item.id === "pressure" ? "Pwf" : item.id.startsWith("pwf:") ? item.id.slice(4) : word(item.id as OilWordKey), values: item.values, style: item.style, role: item.role, tone: SERIES_TONE[item.id] ?? 0 }))}
        formatX={periodLabel}
        formatY={format}
        zero={options.zero}
        forecastFrom={source.forecastFrom}
        forecastLabel={word("forecastZone")}
        toggleLabel={(name) => word("toggleSeries", { name })}
      />
    )
  }

  const rate = (value: number) => oilRate(value, language)
  const table = oilProductionTable(result, well, language)
  const copyTable = async () => {
    const text = [table.columns, ...table.rows].map((row) => row.join("\t")).join("\n")
    try { await navigator.clipboard.writeText(text); setCopied(true); window.clearTimeout(copyTimer.current); copyTimer.current = window.setTimeout(() => setCopied(false), 1600) } catch {}
  }
  const downloadCsv = () => {
    const csv = oilCsv(oilProductionTable(result, well, language, true))
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `malik-oil-${result.analysisId}-${well.id === "__field__" ? "field" : well.id.replace(/[^\p{L}\p{N}_-]/gu, "_")}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const badge = tampered.length ? "tampered" : crossCheck.status
  const badgeText = badge === "tampered" ? word("tampered") : badge === "passed" ? word("crossPassed") : badge === "failed" ? word("crossFailed") : word("crossSkipped")
  const kpis = oilKpis(result, well, language)
  const conclusion = oilConclusion(result, well, language)
  const blockedReason = well.forecastBlocked ? oilCode(language, well.forecastBlocked) : null
  const qualityFlags = result.qualityFlags.filter((flag) => !ANOMALY_CODES.has(flag.code) && (flag.well === null || flag.well === well.id))
  const multiwell = result.tableDatasets.find((item) => item.id === "multiwell")
  const losses = multiwell ? multiwell.rows.map((row) => ({ id: String(row[0]), loss: typeof row[4] === "number" ? row[4] : 0 })) : []
  const totalLoss = losses.reduce((sum, item) => sum + Math.max(0, item.loss), 0)
  const maxLoss = Math.max(1e-12, ...losses.map((item) => Math.abs(item.loss)))
  const price = result.economicOutputs
  const formatPrice = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${oilNumber(value, language, 0)} ${price?.currency || ""}`
  const oilGas = well.last.gas !== null && well.last.gor ? (well.last.gas as number) / (well.last.gor as number) : null

  const formulas: Array<{ id: string; tex: string; values: string | null }> = result.formulaDefinitions.map((formula) => {
    const f = well.first, l = well.last
    const values = (() => {
      switch (formula.id) {
        case "wc": return l.water !== null && l.wc !== null ? `${rate(l.water as number)} / (${rate(l.oil as number)} + ${rate(l.water as number)}) · 100 % = ${oilPercent(l.wc, language)}` : null
        case "gor": return l.gor !== null && oilGas !== null ? `${rate(l.gas as number)} / ${rate(oilGas)} = ${rate(l.gor as number)} ${R}` : null
        case "wor": return l.wor !== null ? `${rate(l.water as number)} / ${rate(l.oil as number)} = ${oilNumber(l.wor, language, 3)}` : null
        case "liquid": return l.liquid !== null ? `${rate(l.oil as number)} + ${rate(l.water as number)} = ${rate(l.liquid as number)} ${L}` : null
        case "decline": return well.decline.total !== null ? `(${rate(f.oil as number)} − ${rate(l.oil as number)}) / ${rate(f.oil as number)} · 100 % = ${oilPercent(well.decline.total, language)}` : null
        case "decline-rate": return well.decline.perPeriod !== null ? `1 − (${rate(l.oil as number)} / ${rate(f.oil as number)})^(1/${oilNumber(well.elapsed, language, 0)}) = ${oilPercent(well.decline.perPeriod, language)}` : null
        default: {
          const fit = well.models.find((item) => item.model === formula.id)
          if (fit?.valid) return fit.model === "linear" ? `a = ${rate(fit.a as number)} ${L}, b = ${oilNumber(fit.b, language, 4, { trim: true })} ${L} ${perStep}` : `qᵢ = ${rate(fit.qi as number)} ${L}, D = ${oilNumber(fit.D, language, 5)} ${perStep}`
          if (formula.id === "cumulative" && well.cumulative) return `Nₚ = ${rate(well.cumulative.oil)} ${oilUnit(units.liquid.replace("/day", ""), language)}`
          return null
        }
      }
    })()
    return { id: formula.id, tex: formula.tex, values }
  }).filter((formula) => formula.values !== null)

  return (
    <section ref={root} className="malik-oil" dir={isRtl(language) ? "rtl" : "ltr"} lang={language} data-oil-report={result.analysisId} aria-label={`${word("brand")} — ${word("title")}`}>
      <header className="malik-oil__head">
        <span className="malik-oil__brand">{word("brand")} · {word("product")}</span>
        <h3 className="malik-oil__title">{word("title")}</h3>
        <div className="malik-oil__chips">
          <span className={`malik-oil__badge is-${badge}`} data-oil-badge={badge}>{badge === "passed" || badge === "skipped" ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}{badgeText}</span>
          <span className="malik-oil__chip">{oilCount(language, result.sourceSummary.periods, kind)} · {oilCount(language, result.sourceSummary.wells, "well")}</span>
          <span className="malik-oil__chip">{word(result.sourceSummary.dataKind === "synthetic" ? "synthetic" : "userData")}</span>
          <span className="malik-oil__chip" dir="ltr">{L}{G ? ` · ${G}` : ""}</span>
        </div>
        {tampered.length ? <p className="malik-oil__alert" role="alert">{word("tampered")}</p> : null}
        {result.sourceSummary.omittedWells ? <p className="malik-oil__note">{word("wellsOmitted", { n: result.sourceSummary.wells, m: result.sourceSummary.omittedWells })}</p> : null}
      </header>

      {result.wells.length > 1 ? (
        result.wells.length <= 8 ? (
          <div className="malik-oil__tabs" role="tablist" aria-label={word("wells")}>
            {result.wells.map((item, index) => (
              <button key={item.id} type="button" role="tab" aria-selected={index === wellIndex} className="malik-oil__tab" onClick={() => setWellIndex(index)}>{oilWellName(item, language)}</button>
            ))}
          </div>
        ) : (
          <label className="malik-oil__select">
            <span>{word("wells")}</span>
            <select value={wellIndex} onChange={(event) => setWellIndex(Number(event.target.value))}>
              {result.wells.map((item, index) => <option key={item.id} value={index}>{oilWellName(item, language)}</option>)}
            </select>
          </label>
        )
      ) : null}
      {well.isField ? <p className="malik-oil__note">{word("fieldTitle", { n: well.wellsInField })}</p> : null}

      <OilSection id="summary" title={word("conclusion")} open>
        <div className="malik-oil__conclusion">{conclusion.map((line, index) => <p key={index}>{line}</p>)}</div>
      </OilSection>

      <div className="malik-oil__kpis" role="list" aria-label={word("kpis")}>
        {kpis.map((kpi) => (
          <div key={kpi.key} role="listitem" className="malik-oil__kpi" data-direction={kpi.direction || undefined}>
            <span className="malik-oil__kpi-label">{kpi.label}</span>
            <strong className="malik-oil__kpi-value" dir="ltr">{kpi.direction === "down" ? "▼ " : kpi.direction === "up" ? "▲ " : ""}{kpi.value}</strong>
            {kpi.detail ? <span className="malik-oil__kpi-detail" dir="auto">{kpi.detail}</span> : null}
          </div>
        ))}
      </div>

      <section className="malik-oil__section" data-oil-section="rates">{chart("rates", word("s.rates"), rate, { zero: true })}</section>

      {result.wells.filter((item) => !item.isField).length > 1 ? (
        <OilSection id="well-heatmap" title={{
          ru: "Дебиты скважин по периодам", en: "Oil rates by well and period",
          kk: "Ұңғымалар дебиті кезеңдер бойынша", ar: "معدلات النفط حسب البئر والفترة",
        }[language]} open>
          <OilWellHeatmap wells={result.wells} language={language} unit={L} />
          {computed("water-cut") ? <OilWellHeatmap wells={result.wells} language={language} unit="%" metric="water-cut" /> : null}
        </OilSection>
      ) : null}

      {computed("water-cut") || computed("gor") ? (
        <div className="malik-oil__pair">
          {computed("water-cut") ? chart("water-cut", word("s.water-cut"), (value) => oilNumber(value, language, 2, { trim: true }), { zero: true, unit: "%" }) : null}
          {computed("gor") ? chart("gor", word("s.gor"), rate) : null}
        </div>
      ) : null}

      {result.chartSeries.some(c => c.id === "pressure" && c.well === well.id) ? <OilSection id="pressure" title="Pwf · psi" open>
        {chart("pressure", "Pwf · psi", rate, { unit: "psi" })}
        <p className="malik-oil__note">{oilCode(language, "PRESSURE_DATUM_NOT_STATED")}</p>
      </OilSection> : null}

      <OilSection id="forecast" title={word("s.forecast")} open>
        {well.forecast ? (
          <>
            {chart("forecast", word("forecastChart"), rate, { zero: true })}
            <p className="malik-oil__note">{word("unitsCaption", { unit: L })}</p>
            <OilTableView
              language={language}
              columns={[word("period"), word("linearShort"), word("exponentialShort"), word("harmonicShort")]}
              rows={well.forecast.t.map((t, index) => [periodLabel(t), ...(["linear", "exponential", "harmonic"] as const).map((model) => oilColumn(well.forecast![model], language)(well.forecast![model][index]))])}
            />
            <p className="malik-oil__caveat">{word("forecastCaveat")}</p>
            {well.forecast.linearZeroT !== null ? <p className="malik-oil__note">{word("linearZero", { period: oilPeriod(Math.ceil(well.forecast.linearZeroT), context, language) })}</p> : null}
          </>
        ) : <p className="malik-oil__note">{word("forecastBlocked", { reason: blockedReason || "—" })}</p>}
      </OilSection>

      <OilSection id="table" title={word("s.table")} open>
        <OilTableView language={language} columns={table.columns} rows={table.rows} limit={VISIBLE_ROWS} />
        <div className="malik-oil__actions">
          <button type="button" className="malik-oil__button" onClick={copyTable}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? word("copied") : word("copyTable")}</button>
          <button type="button" className="malik-oil__button" onClick={downloadCsv}><Download size={15} aria-hidden="true" />{word("downloadCsv")}</button>
        </div>
      </OilSection>

      {computed("formulas") && formulas.length ? (
        <OilSection id="formulas" title={word("s.formulas")} open>
          <ul className="malik-oil__formulas">
            {formulas.map((formula) => (
              <li key={formula.id}>
                <TexMath tex={formula.tex} display />
                <span className="malik-oil__formula-values" dir="ltr">{formula.values}</span>
              </li>
            ))}
          </ul>
        </OilSection>
      ) : null}

      <div className="malik-oil__actions malik-oil__expand">
        <button type="button" className="malik-oil__button" aria-expanded={expanded} onClick={toggleAll}>{expanded ? word("collapseAll") : word("expandAll")}</button>
      </div>

      {computed("oil-decline") ? (
        <OilSection id="oil-decline" title={word("s.oil-decline")}>
          <dl className="malik-oil__facts">
            <div><dt>{word("k.oil")}</dt><dd dir="ltr">{oilPercent(well.decline.total === null ? null : -well.decline.total, language, { sign: true })}</dd></div>
            <div><dt>{word("k.decline")}</dt><dd dir="ltr">{oilPercent(well.decline.perPeriod, language)} {perStep}</dd></div>
            {well.decline.effectiveAnnual !== null ? <div><dt>{word("perYear")}</dt><dd dir="ltr">{oilPercent(well.decline.effectiveAnnual, language)}</dd></div> : null}
            <div><dt>{word("loss")}</dt><dd dir="ltr">{rate(Math.abs(well.change.oilAbs ?? 0))} {L}</dd></div>
          </dl>
        </OilSection>
      ) : null}

      {computed("decline-models") ? (
        <OilSection id="decline-models" title={word("s.decline-models")}>
          <OilTableView
            language={language}
            columns={[word("model"), word("parameters"), "R²", `RMSE, ${L}`, word("best")]}
            rows={well.models.map((fit) => [
              word(`${fit.model}Short` as OilWordKey),
              !fit.valid ? `${word("notValid")} (${oilCode(language, fit.reason || "")})` : fit.model === "linear" ? `a = ${rate(fit.a as number)}; b = ${oilNumber(fit.b, language, 4)}` : `qᵢ = ${rate(fit.qi as number)}; D = ${oilNumber(fit.D, language, 5)}`,
              fit.r2 === null ? "—" : oilNumber(fit.r2, language, 4),
              fit.rmse === null ? "—" : oilNumber(fit.rmse, language, 3),
              fit.model === well.selected ? "✓" : "",
            ])}
          />
        </OilSection>
      ) : null}

      {computed("wor") ? <OilSection id="wor" title={word("s.wor")}>{chart("wor", "WOR = qw / qo", (value) => oilNumber(value, language, 2), { zero: true, unit: "" })}</OilSection> : null}

      {computed("liquid") && well.liquidStats ? (
        <OilSection id="liquid" title={word("s.liquid")}>
          <dl className="malik-oil__facts">
            <div><dt>{word("k.liquid")}</dt><dd dir="ltr">{rate(well.liquidStats.mean)} {L}</dd></div>
            <div><dt>σ</dt><dd dir="ltr">{oilNumber(well.liquidStats.std, language, 3)} {L}</dd></div>
            <div><dt>CV</dt><dd dir="ltr">{oilPercent(well.liquidStats.cv, language)}</dd></div>
            <div><dt>{word("liquid")}</dt><dd>{well.liquidStats.stable ? word("k.stable", { cv: oilNumber((well.liquidStats.cv ?? 0) * 100, language, 2) }) : oilPercent(well.change.liquid, language, { sign: true })}</dd></div>
          </dl>
        </OilSection>
      ) : null}

      {computed("period-changes") ? (
        <OilSection id="period-changes" title={word("s.period-changes")}>
          <OilTableView
            language={language}
            limit={VISIBLE_ROWS}
            columns={[word("period"), `Δ ${word("oil")}, %`, ...(well.water.some((value) => value !== null) ? [`Δ ${word("water")}, %`, `Δ WC, ${word("pp")}`] : []), ...(well.gas.some((value) => value !== null) ? [`Δ ${word("gas")}, %`, "Δ GOR, %"] : [])]}
            rows={well.periodChanges.map((item) => [periodLabel(item.t), oilPercent(item.oil, language, { sign: true }), ...(well.water.some((value) => value !== null) ? [oilPercent(item.water, language, { sign: true }), oilNumber(item.wcPP, language, 2, { sign: true })] : []), ...(well.gas.some((value) => value !== null) ? [oilPercent(item.gas, language, { sign: true }), oilPercent(item.gorRel, language, { sign: true })] : [])])}
          />
        </OilSection>
      ) : null}

      <OilSection id="anomalies" title={word("s.anomalies")}>
        {well.anomalies.length ? (
          <ul className="malik-oil__list">{well.anomalies.map((item, index) => <li key={index}>{oilCode(language, item.code, { period: periodLabel(item.t) })}</li>)}</ul>
        ) : <p className="malik-oil__note">{word("noAnomalies")}</p>}
      </OilSection>

      <OilSection id="data-quality" title={word("s.data-quality")}>
        <p className="malik-oil__note">{word("rowsAccepted", { a: result.validatedInputs.acceptedRows, r: result.validatedInputs.rejectedRows })}</p>
        <p className="malik-oil__note" dir="auto">{word("unitsLine", { liquid: L, gas: units.gas ? word("gasUnitPart", { gas: G, gor: R }) : "" })}</p>
        {qualityFlags.length ? <ul className="malik-oil__list">{qualityFlags.map((flag, index) => <li key={index} data-severity={flag.severity}>{oilCode(language, flag.code, { row: flag.row ?? "", column: flag.column ?? "" })}</li>)}</ul> : null}
      </OilSection>

      {computed("cumulative") && well.cumulative ? (
        <OilSection id="cumulative" title={word("s.cumulative")}>
          <dl className="malik-oil__facts">
            <div><dt>{word("oil")}</dt><dd dir="ltr">{rate(well.cumulative.oil)} {oilUnit(units.liquid.replace("/day", ""), language)}</dd></div>
            {well.cumulative.water !== null ? <div><dt>{word("water")}</dt><dd dir="ltr">{rate(well.cumulative.water)} {oilUnit(units.liquid.replace("/day", ""), language)}</dd></div> : null}
            {well.cumulative.gas !== null && units.gas ? <div><dt>{word("gas")}</dt><dd dir="ltr">{rate(well.cumulative.gas)} {oilUnit(units.gas.replace("/day", ""), language)}</dd></div> : null}
            <div><dt>Σ Δt</dt><dd dir="ltr">{oilCount(language, well.cumulative.days, "day")}</dd></div>
          </dl>
          <p className="malik-oil__note">{word("cumulativeNote")}</p>
        </OilSection>
      ) : null}

      {computed("gas") ? (
        <OilSection id="gas" title={word("s.gas")}>
          {chart("gas", word("k.gas"), rate, { zero: true })}
          <dl className="malik-oil__facts">
            <div><dt>{word("k.gas")}</dt><dd dir="ltr">{rate(well.first.gas as number)} → {rate(well.last.gas as number)} {G}</dd></div>
            <div><dt>Δ {word("gas")}</dt><dd dir="ltr">{oilPercent(well.change.gas, language, { sign: true })}</dd></div>
            <div><dt>Δ {word("oil")}</dt><dd dir="ltr">{oilPercent(well.change.oil, language, { sign: true })}</dd></div>
          </dl>
        </OilSection>
      ) : null}

      {computed("water-oil-balance") && well.balance ? (
        <OilSection id="water-oil-balance" title={word("s.water-oil-balance")}>
          <dl className="malik-oil__facts">
            <div><dt>Δ {word("oil")}</dt><dd dir="ltr">{oilNumber(well.balance.deltaOil, language, 2, { sign: true, trim: true })} {L}</dd></div>
            <div><dt>Δ {word("water")}</dt><dd dir="ltr">{oilNumber(well.balance.deltaWater, language, 2, { sign: true, trim: true })} {L}</dd></div>
            <div><dt>Δ {word("liquid")}</dt><dd dir="ltr">{oilNumber(well.balance.deltaLiquid, language, 2, { sign: true, trim: true })} {L}</dd></div>
            {well.balance.replacement !== null ? <div><dt>Δ {word("water")} / |Δ {word("oil")}|</dt><dd dir="ltr">{oilPercent(well.balance.replacement, language)}</dd></div> : null}
          </dl>
        </OilSection>
      ) : null}

      {computed("hypotheses") && well.hypotheses.measurements.length ? (
        <OilSection id="hypotheses" title={word("s.hypotheses")}>
          <p className="malik-oil__note">{word("hypothesesIntro")}</p>
          <div className="malik-oil__hypotheses">
            {([["hWater", well.hypotheses.water], ["hGas", well.hypotheses.gas], ["hProductivity", well.hypotheses.productivity]] as const).filter(([, codes]) => codes.length).map(([key, codes]) => (
              <div key={key}><strong>{word(key)}</strong><ul className="malik-oil__list">{codes.map((code) => <li key={code}>{oilCode(language, code)}</li>)}</ul></div>
            ))}
            <div><strong>{word("measurements")}</strong><ul className="malik-oil__list">{well.hypotheses.measurements.map((code) => <li key={code}>{oilCode(language, code)}</li>)}</ul></div>
          </div>
        </OilSection>
      ) : null}

      {computed("multiwell") && multiwell ? (
        <OilSection id="multiwell" title={word("s.multiwell")}>
          <ol className="malik-oil__bars">
            {[...losses].sort((a, b) => b.loss - a.loss).slice(0, 30).map((item) => (
              <li key={item.id}>
                <span className="malik-oil__bar-name">{item.id}</span>
                <span className="malik-oil__bar-track"><span className="malik-oil__bar" style={{ width: `${Math.max(1, Math.abs(item.loss) / maxLoss * 100)}%` }} /></span>
                <span className="malik-oil__bar-value" dir="ltr">{oilNumber(-item.loss, language, 2, { sign: true, trim: true })} {L}{totalLoss > 0 && item.loss > 0 ? ` · ${oilPercent(item.loss / totalLoss, language)}` : ""}</span>
              </li>
            ))}
          </ol>
          <OilTableView
            language={language}
            limit={VISIBLE_ROWS}
            columns={[word("well"), `${word("oil")} 1, ${L}`, `${word("oil")} n, ${L}`, `Δ ${word("oil")}, %`, `${word("loss")}, ${L}`, `Δ WC, ${word("pp")}`, "Δ GOR, %"]}
            rows={multiwell.rows.map((row) => [String(row[0]), oilColumn(multiwell.rows.map((item) => item[1] as number | null), language)(row[1] as number | null), oilColumn(multiwell.rows.map((item) => item[2] as number | null), language)(row[2] as number | null), oilNumber(row[3] as number | null, language, 2, { sign: true }), oilNumber(row[4] as number | null, language, 2, { trim: true }), oilNumber(row[5] as number | null, language, 2, { sign: true }), oilNumber(row[6] as number | null, language, 2, { sign: true })])}
          />
        </OilSection>
      ) : null}

      <OilSection id="economics" title={word("s.economics")}>
        {computed("economics") && price && well.economics ? (
          <>
            <dl className="malik-oil__facts">
              <div><dt>{word("dailyGap")}</dt><dd dir="ltr">{formatPrice(well.economics.dailyGap)} {word("perDayWord")}</dd></div>
              <div><dt>{word("monthGap")}</dt><dd dir="ltr">{formatPrice(well.economics.monthGap)}</dd></div>
              {well.economics.historicalGap !== null ? <div><dt>{word("historicalGap")}</dt><dd dir="ltr">{formatPrice(well.economics.historicalGap)}</dd></div> : null}
              {well.economics.forecastRevenue ? (["linear", "exponential", "harmonic"] as const).map((model) => <div key={model}><dt>{word("forecastRevenue")} — {word(model)}</dt><dd dir="ltr">{formatPrice(well.economics!.forecastRevenue![model])}</dd></div>) : null}
            </dl>
            <p className="malik-oil__note">{word("economicsNote", { price: `${oilNumber(price.price, language, 2, { trim: true })} ${price.currency}/${price.per}` })}</p>
          </>
        ) : <p className="malik-oil__note">{oilCode(language, sections.get("economics")?.reason || "NO_PRICE")}</p>}
      </OilSection>

      {computed("chan") && well.chan ? (
        <OilSection id="chan" title={word("s.chan")}>
          {chart("chan", word("worDerivative"), (value) => oilNumber(value, language, 3), { unit: "" })}
          <p className="malik-oil__note">{word("chanSlope", { slope: oilNumber(well.chan.slope, language, 3), trend: well.chan.derivativeTrend ? word(well.chan.derivativeTrend) : "—" })}</p>
          <p className="malik-oil__note">{word("chanNote")}</p>
        </OilSection>
      ) : null}

      <OilSection id="limitations" title={word("s.limitations")}>
        <ul className="malik-oil__list">{[...result.warnings, ...result.limitations].map((code) => <li key={code}>{oilCode(language, code)}</li>)}</ul>
        <p className="malik-oil__provenance" dir="ltr">{word("provenance", { engine: result.engineVersion, schema: result.schemaVersion, id: result.analysisId })}</p>
        {result.sourceSummary.sourceHash ? <p className="malik-oil__provenance" dir="ltr">{word("sourceHash", { hash: result.sourceSummary.sourceHash })}</p> : null}
        <p className="malik-oil__provenance">{crossCheck.status === "passed" ? word("crossDetail", { engine: CROSS_CHECK_ENGINE, n: crossCheck.checked }) : crossCheck.status === "failed" ? word("crossMismatch", { engine: CROSS_CHECK_ENGINE, list: crossCheck.mismatches.slice(0, 6).join(", ") }) : word("crossNone", { reason: oilCode(language, `CC_${crossCheck.reason || "NONE"}`) })}</p>
        <p className="malik-oil__review"><strong>{word("engineerReview")}</strong></p>
      </OilSection>
    </section>
  )
}

