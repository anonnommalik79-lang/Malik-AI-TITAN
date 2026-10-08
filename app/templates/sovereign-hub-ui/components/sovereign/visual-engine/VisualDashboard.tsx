"use client"

import { useState } from "react"
import { ChartLine, TrendingDown, TrendingUp } from "lucide-react"
import type { DashboardBlock } from "@/lib/visual/schema"
import { formatCompact, formatCurrency, formatDuration, formatNumber, formatPercent } from "@/lib/visual/format"
import { ChartView, Legend } from "./VisualChart"
import { Fullscreen, SERIES_COLORS, VisualCard, isIndex, isStringArray, useVisualField } from "./shared"

type Metric = DashboardBlock["periods"][number]["metrics"][number]

export function metricValue(metric: Metric) {
  if (metric.format === "currency") return formatCurrency(metric.value, metric.currency || "USD")
  if (metric.format === "percent") return formatPercent(metric.value)
  if (metric.format === "duration") return formatDuration(metric.value)
  if (metric.format === "compact") return formatCompact(metric.value)
  const text = formatNumber(metric.value)
  return metric.unit ? `${text} ${metric.unit}` : text
}

function MetricNote({ metric }: { metric: Metric }) {
  if (metric.delta === undefined) return metric.note ? <div className="mv-kpi__note">{metric.note}</div> : null
  const rising = metric.delta > 0
  const flat = metric.delta === 0
  const good = flat ? undefined : (metric.better || "up") === "up" ? rising : !rising
  const sign = rising ? "+" : metric.delta < 0 ? "−" : ""
  const Icon = rising ? TrendingUp : TrendingDown
  return <div className={`mv-kpi__note${good === undefined ? "" : good ? " is-good" : " is-bad"}`} title="Изменение к предыдущему периоду">
    {flat ? null : <Icon aria-hidden="true" />}
    <span>{sign}{formatNumber(Math.abs(metric.delta), "ru-RU", 1)}%{metric.note ? ` · ${metric.note}` : ""}</span>
  </div>
}

function DashboardBody({ block, storeKey, persist, big }: { block: DashboardBlock; storeKey: string; persist: boolean; big?: boolean }) {
  const [period, setPeriod] = useVisualField(storeKey, persist, "period", 0, isIndex(block.periods.length))
  const [hidden, setHidden] = useVisualField<string[]>(storeKey, persist, "hidden", [], isStringArray)
  const current = block.periods[period] || block.periods[0]
  const chart = current.chart
  const toggle = (name: string) => {
    if (!chart) return
    if (!hidden.includes(name) && chart.series.length - hidden.length <= 1) return
    setHidden(hidden.includes(name) ? hidden.filter((item) => item !== name) : [...hidden, name])
  }
  return <>
    {block.periods.length > 1 ? <div className="mv-tabs" role="tablist" aria-label="Период">
      {block.periods.map((item, at) => <button key={item.label} type="button" role="tab" className="mv-tab" aria-selected={at === period} onClick={() => setPeriod(at)}>{item.label}</button>)}
    </div> : null}
    <div className={`mv-kpis${current.metrics.length >= 5 && big ? " is-three" : ""}`} role="list" aria-live="polite">
      {current.metrics.map((metric) => <div key={metric.label} className="mv-kpi" role="listitem">
        <div className="mv-kpi__label">{metric.label}</div>
        <div className="mv-kpi__value">{metricValue(metric)}</div>
        <MetricNote metric={metric} />
      </div>)}
    </div>
    {chart ? <div className="mv-section">
      {chart.title ? <h4 className="mv-section__title">{chart.title}</h4> : null}
      {chart.subtitle ? <p className="mv-section__sub">{chart.subtitle}</p> : <div style={{ height: 10 }} />}
      <div className="mv-well">
        <ChartView kind={chart.chart} data={chart} unit={chart.unit} height={big ? 380 : 220} hidden={hidden} />
        <Legend items={chart.series.map((item, at) => ({ name: item.name, color: SERIES_COLORS[at % SERIES_COLORS.length] }))} hidden={hidden} onToggle={chart.series.length > 1 ? toggle : undefined} />
      </div>
    </div> : null}
  </>
}

export function VisualDashboard({ block, storeKey, persist }: { block: DashboardBlock; storeKey: string; persist: boolean }) {
  const [full, setFull] = useState(false)
  return <>
    <VisualCard block={block} icon={<ChartLine />} label="Аналитика" onFullscreen={() => setFull(true)}>
      <DashboardBody block={block} storeKey={storeKey} persist={persist} />
    </VisualCard>
    <Fullscreen open={full} onClose={() => setFull(false)}>
      <VisualCard block={block} icon={<ChartLine />} label="Аналитика" big>
        <DashboardBody block={block} storeKey={storeKey} persist={persist} big />
      </VisualCard>
    </Fullscreen>
  </>
}
