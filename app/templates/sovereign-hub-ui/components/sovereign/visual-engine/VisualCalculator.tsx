"use client"

import { useMemo, useState } from "react"
import { ChartNoAxesColumnIncreasing, CircleCheck, RotateCcw } from "lucide-react"
import type { CalculatorBlock } from "@/lib/visual/schema"
import { CALCULATOR_MODELS, calculatorInputs, clamp, computeCalculator, type CalculatorInputState, type CalculatorOutput } from "@/lib/visual/calculators"
import { formatCurrency, formatNumber, formatPercent, plural, type VisualCurrency } from "@/lib/visual/format"
import { Fullscreen, VisualCard, isIndex, useVisualField } from "./shared"

const isValues = (value: unknown): value is Record<string, number> => Boolean(value && typeof value === "object" && !Array.isArray(value)
  && Object.values(value as object).every((item) => typeof item === "number" && Number.isFinite(item)))

export function formatOutput(item: CalculatorOutput, currency: VisualCurrency) {
  if (item.value === null) return item.empty || "—"
  const locale = currency === "USD" || currency === "EUR" ? "en-US" : "ru-RU"
  if (item.format === "currency") return formatCurrency(item.value, currency)
  if (item.format === "percent") return formatPercent(item.value, locale)
  if (item.format === "months") return `${formatNumber(item.value, "ru-RU", 1)} ${plural(item.value, "месяц", "месяца", "месяцев")}`
  if (item.format === "years") return `${formatNumber(item.value, "ru-RU", 1)} ${plural(item.value, "год", "года", "лет")}`
  if (item.format === "ratio") return `${formatNumber(item.value, "ru-RU", 1)}×`
  return `${formatNumber(Math.round(item.value), "ru-RU", 0)}${item.noun ? ` ${plural(item.value, ...item.noun)}` : ""}`
}

function inputText(input: CalculatorInputState, value: number, currency: VisualCurrency) {
  if (input.kind === "money") return formatCurrency(value, currency)
  if (input.kind === "percent") return `${formatNumber(value, "ru-RU", 1)}%`
  if (input.kind === "years") return `${formatNumber(value)} ${plural(value, "год", "года", "лет")}`
  if (input.kind === "months") return `${formatNumber(value)} мес.`
  return formatNumber(value, "ru-RU", 0)
}

function Slider({ input, value, currency, onChange }: { input: CalculatorInputState; value: number; currency: VisualCurrency; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = `mv-in-${input.key}`
  const commit = () => {
    if (draft === null) return
    const parsed = Number(draft.replace(/[^\d.,-]/g, "").replace(",", "."))
    if (Number.isFinite(parsed)) onChange(clamp(parsed, input.min, input.max))
    setDraft(null)
  }
  return <div className="mv-slider">
    <div className="mv-slider__top">
      <label className="mv-slider__label" htmlFor={id}>{input.label}</label>
      <input className="mv-slider__value" aria-label={`${input.label}: точное значение`} inputMode="decimal"
        value={draft ?? inputText(input, value, currency)}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setDraft(null) }} />
    </div>
    <input id={id} className="mv-range" type="range" min={input.min} max={input.max} step={input.step} value={value}
      aria-valuetext={inputText(input, value, currency)}
      onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}

function CalculatorBody({ block, storeKey, persist }: { block: CalculatorBlock; storeKey: string; persist: boolean }) {
  const inputs = useMemo(() => calculatorInputs(block.model, block.inputs || {}), [block])
  const defaults = useMemo(() => Object.fromEntries(inputs.map((input) => [input.key, input.value])), [inputs])
  const [values, setValues, resetValues] = useVisualField<Record<string, number>>(storeKey, persist, "values", defaults, isValues)
  const [scenario, setScenario, resetScenario] = useVisualField<number>(storeKey, persist, "scenario", -1, (value): value is number => value === -1 || isIndex(block.scenarios?.length || 0)(value))
  const current = Object.fromEntries(inputs.map((input) => [input.key, clamp(values[input.key] ?? input.value, input.min, input.max)]))
  const result = computeCalculator(block.model, current)
  const currency = block.currency
  const update = (key: string, value: number) => { setValues({ ...current, [key]: value }); if (scenario !== -1) setScenario(-1) }
  const choose = (at: number) => {
    const preset = block.scenarios?.[at]
    if (!preset) return
    const next = { ...current }
    for (const input of inputs) if (preset.values[input.key] !== undefined) next[input.key] = clamp(preset.values[input.key], input.min, input.max)
    setValues(next)
    setScenario(at)
  }
  const reset = () => { resetValues(); resetScenario() }
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const input = inputs.find((item) => item.key === key)
    return input ? inputText(input, current[key], currency) : ""
  })
  const changed = inputs.some((input) => current[input.key] !== defaults[input.key])
  return <>
    <div className="mv-hero" aria-live="polite">
      <div className="mv-hero__label">{result.headline.label}</div>
      <div className="mv-hero__value">{formatOutput(result.headline, currency)}</div>
      <div className="mv-hero__note"><CircleCheck aria-hidden="true" />Интерактивная модель: {CALCULATOR_MODELS[block.model].label}</div>
    </div>
    {block.scenarios?.length ? <div className="mv-tabs" role="group" aria-label="Сценарий">
      {block.scenarios.map((item, at) => <button key={item.label} type="button" className="mv-tab" aria-pressed={scenario === at} onClick={() => choose(at)}>{item.label}</button>)}
    </div> : null}
    <div className="mv-sliders">
      {inputs.map((input) => <Slider key={input.key} input={input} value={current[input.key]} currency={currency} onChange={(value) => update(input.key, value)} />)}
    </div>
    <div className="mv-kpis" role="list" aria-live="polite">
      {result.outputs.map((item) => <div key={item.key} className="mv-kpi" role="listitem">
        <div className="mv-kpi__label">{item.label}</div>
        <div className={`mv-kpi__value${item.tone ? ` is-${item.tone}` : ""}`} data-output={item.key}>{formatOutput(item, currency)}</div>
      </div>)}
    </div>
    {result.details.length ? <div className="mv-rows">
      {result.details.map((item) => <div key={item.key} className="mv-row"><span>{item.label}</span><b className={item.tone ? `is-${item.tone}` : undefined} data-output={item.key}>{formatOutput(item, currency)}</b></div>)}
    </div> : null}
    <div className="mv-foot">
      <span>{fill(result.assumptions[0] || "")}</span>
      <button type="button" className="mv-btn" onClick={reset} disabled={!changed && scenario === -1} aria-label="Сбросить к исходным значениям"><RotateCcw aria-hidden="true" />Сброс</button>
    </div>
    {result.assumptions.slice(1).map((line) => <p key={line} className="mv-disclaimer">{fill(line)}</p>)}
  </>
}

export function VisualCalculator({ block, storeKey, persist }: { block: CalculatorBlock; storeKey: string; persist: boolean }) {
  const [full, setFull] = useState(false)
  return <>
    <VisualCard block={block} icon={<ChartNoAxesColumnIncreasing />} label="Калькулятор" onFullscreen={() => setFull(true)}>
      <CalculatorBody block={block} storeKey={storeKey} persist={persist} />
    </VisualCard>
    <Fullscreen open={full} onClose={() => setFull(false)}>
      <VisualCard block={block} icon={<ChartNoAxesColumnIncreasing />} label="Калькулятор" big>
        <CalculatorBody block={block} storeKey={storeKey} persist={persist} />
      </VisualCard>
    </Fullscreen>
  </>
}
