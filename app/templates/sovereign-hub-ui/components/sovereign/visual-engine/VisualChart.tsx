"use client"

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react"
import { ChartColumn, ChartLine, ChartPie, Download } from "lucide-react"
import type { ChartBlock, ChartDataset, ChartKind } from "@/lib/visual/schema"
import { formatCompact, formatNumber, formatPercent, withUnit } from "@/lib/visual/format"
import { AXIS, GRID, INK_2, SERIES_COLORS, Fullscreen, Skeleton, VisualCard, csvCell, download, fileName, isIndex, isStringArray, useToast, useVisualField } from "./shared"

type Recharts = typeof import("recharts")
let loaded: Recharts | null = null
let loading: Promise<Recharts> | null = null

/** Recharts arrives as its own chunk, only when a chart is on screen. */
export function useRecharts() {
  const [lib, setLib] = useState<Recharts | null>(loaded)
  useEffect(() => {
    if (lib) return
    let alive = true
    loading ||= import("recharts").then((module) => (loaded = module))
    loading.then((module) => { if (alive) setLib(module) }).catch(() => { loading = null })
    return () => { alive = false }
  }, [lib])
  return lib
}

export function formatValue(value: number | null | undefined, unit?: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  if (unit === "%") return formatPercent(value)
  return withUnit(formatNumber(value), unit)
}

function tick(value: number, unit?: string) {
  if (unit === "%") return `${formatCompact(value)}%`
  if (unit === "$" || unit === "€") return `${unit}${formatCompact(value)}`
  return formatCompact(value)
}

type Row = Record<string, number | string | null>
export function rowsOf(data: ChartDataset): Row[] {
  return data.labels.map((label, index) => {
    const row: Row = { label }
    data.series.forEach((item, at) => { row[`s${at}`] = item.values[index] ?? null })
    return row
  })
}

function TooltipBox({ active, payload, label, unit, names }: { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number; color?: string; payload?: Row }>; label?: string; unit?: string; names: string[] }) {
  if (!active || !payload?.length) return null
  return <div className="mv-tooltip">
    <div className="mv-tooltip__label">{label ?? String(payload[0]?.payload?.label ?? "")}</div>
    {payload.map((item) => {
      const at = Number(String(item.dataKey).replace(/^s/, ""))
      return <div key={String(item.dataKey)} className="mv-tooltip__row"><span className="mv-dot" style={{ background: item.color }} />{names[at] ?? ""}<b>{formatValue(item.value, unit)}</b></div>
    })}
  </div>
}

export type ChartViewProps = {
  kind: ChartKind | "line" | "area" | "bar"
  data: ChartDataset
  unit?: string
  height: number
  hidden?: string[]
  seriesKinds?: Array<"line" | "bar" | "area" | undefined>
  scatter?: ChartBlock["scatter"]
  xLabel?: string
  yLabel?: string
}

/** The plot alone: axes, marks, tooltip. Shared by charts and dashboards. */
export function ChartView({ kind, data, unit, height, hidden = [], seriesKinds, scatter, xLabel, yLabel }: ChartViewProps) {
  const R = useRecharts()
  const rows = useMemo(() => rowsOf(data), [data])
  if (!R) return <Skeleton height={height} />
  const names = data.series.map((item) => item.name)
  const isHidden = (at: number) => hidden.includes(names[at])
  const tooltip = <R.Tooltip cursor={kind.includes("bar") ? { fill: "rgba(255,255,255,0.04)" } : { stroke: "#3a3a3a" }} content={(props: object) => <TooltipBox {...(props as object)} unit={unit} names={names} />} />
  const grid = <R.CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
  const xAxis = <R.XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} interval="preserveStartEnd" minTickGap={10} tickMargin={8} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -2, fill: "#8f8f8f", fontSize: 11 } : undefined} />
  const yAxis = <R.YAxis tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} width={46} tickFormatter={(value: number) => tick(value, unit)} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#8f8f8f", fontSize: 11 } : undefined} />
  const brush = rows.length > 30 && !["pie", "donut", "radar"].includes(kind)
    ? <R.Brush dataKey="label" height={20} stroke="#4a4a4a" fill="#101010" travellerWidth={8} tickFormatter={() => ""} />
    : null
  const margin = { top: 10, right: 12, left: 0, bottom: brush ? 4 : 0 }
  const color = (at: number) => SERIES_COLORS[at % SERIES_COLORS.length]

  let chart: ReactNode = null
  if (kind === "line") {
    chart = <R.LineChart data={rows} margin={margin}>{grid}{xAxis}{yAxis}{tooltip}
      {data.series.map((_, at) => <R.Line key={at} type="linear" dataKey={`s${at}`} name={names[at]} stroke={color(at)} strokeWidth={2} dot={rows.length <= 40 ? { r: 3.5, fill: color(at), stroke: color(at) } : false} activeDot={{ r: 5, stroke: "#0a0a0a", strokeWidth: 2 }} hide={isHidden(at)} connectNulls isAnimationActive={rows.length <= 120} />)}
      {brush}</R.LineChart>
  } else if (kind === "area" || kind === "stacked-area") {
    chart = <R.AreaChart data={rows} margin={margin}>
      <defs>{data.series.map((_, at) => <linearGradient key={at} id={`mv-area-${at}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color(at)} stopOpacity={0.35} /><stop offset="100%" stopColor={color(at)} stopOpacity={0.02} /></linearGradient>)}</defs>
      {grid}{xAxis}{yAxis}{tooltip}
      {data.series.map((_, at) => <R.Area key={at} type="monotone" dataKey={`s${at}`} name={names[at]} stroke={color(at)} strokeWidth={2} fill={`url(#mv-area-${at})`} stackId={kind === "stacked-area" ? "a" : undefined} hide={isHidden(at)} connectNulls isAnimationActive={rows.length <= 120} />)}
      {brush}</R.AreaChart>
  } else if (kind === "bar" || kind === "stacked-bar") {
    const stacked = kind === "stacked-bar"
    chart = <R.BarChart data={rows} margin={margin} barCategoryGap="14%">{grid}{xAxis}{yAxis}{tooltip}
      {data.series.map((_, at) => <R.Bar key={at} dataKey={`s${at}`} name={names[at]} fill={color(at)} fillOpacity={0.78} radius={stacked && at < data.series.length - 1 ? 0 : [7, 7, 0, 0]} maxBarSize={96} stackId={stacked ? "a" : undefined} stroke={stacked ? "#0a0a0a" : undefined} strokeWidth={stacked ? 1 : 0} hide={isHidden(at)} />)}
      {brush}</R.BarChart>
  } else if (kind === "hbar") {
    chart = <R.BarChart data={rows} layout="vertical" margin={{ ...margin, left: 4 }} barCategoryGap="18%">
      <R.CartesianGrid stroke={GRID} strokeDasharray="4 4" horizontal={false} />
      <R.XAxis type="number" tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} tickFormatter={(value: number) => tick(value, unit)} />
      <R.YAxis type="category" dataKey="label" tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} width={Math.min(140, 12 + Math.max(...data.labels.map((label) => label.length)) * 6.4)} />
      {tooltip}
      {data.series.map((_, at) => <R.Bar key={at} dataKey={`s${at}`} name={names[at]} fill={color(at)} fillOpacity={0.78} radius={[0, 7, 7, 0]} maxBarSize={34} hide={isHidden(at)} />)}
    </R.BarChart>
  } else if (kind === "composed") {
    chart = <R.ComposedChart data={rows} margin={margin}>{grid}{xAxis}{yAxis}{tooltip}
      {data.series.map((_, at) => {
        const own = seriesKinds?.[at] || (at === 0 ? "bar" : "line")
        if (own === "bar") return <R.Bar key={at} dataKey={`s${at}`} name={names[at]} fill={color(at)} fillOpacity={0.78} radius={[7, 7, 0, 0]} maxBarSize={80} hide={isHidden(at)} />
        if (own === "area") return <R.Area key={at} type="monotone" dataKey={`s${at}`} name={names[at]} stroke={color(at)} fill={color(at)} fillOpacity={0.15} hide={isHidden(at)} />
        return <R.Line key={at} type="linear" dataKey={`s${at}`} name={names[at]} stroke={color(at)} strokeWidth={2} dot={{ r: 3, fill: color(at) }} hide={isHidden(at)} />
      })}
      {brush}</R.ComposedChart>
  } else if (kind === "radar") {
    chart = <R.RadarChart data={rows} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
      <R.PolarGrid stroke={GRID} />
      <R.PolarAngleAxis dataKey="label" tick={{ fill: INK_2, fontSize: 11 }} />
      <R.PolarRadiusAxis tick={{ fill: "#6b6b6b", fontSize: 10 }} axisLine={false} tickFormatter={(value: number) => tick(value, unit)} />
      {tooltip}
      {data.series.map((_, at) => <R.Radar key={at} dataKey={`s${at}`} name={names[at]} stroke={color(at)} strokeWidth={2} fill={color(at)} fillOpacity={0.16} hide={isHidden(at)} />)}
    </R.RadarChart>
  } else if (kind === "pie" || kind === "donut") {
    const slices = pieSlices(data).filter((slice) => !hidden.includes(slice.label))
    chart = <R.PieChart>
      <R.Tooltip content={(props: object) => {
        const item = (props as { active?: boolean; payload?: Array<{ payload: { label: string; value: number; share: number; color: string } }> })
        if (!item.active || !item.payload?.length) return null
        const slice = item.payload[0].payload
        return <div className="mv-tooltip"><div className="mv-tooltip__label">{slice.label}</div><div className="mv-tooltip__row"><span className="mv-dot" style={{ background: slice.color }} />{formatValue(slice.value, unit)}<b>{formatPercent(slice.share)}</b></div></div>
      }} />
      <R.Pie data={slices} dataKey="value" nameKey="label" innerRadius={kind === "donut" ? "52%" : 0} outerRadius="86%" stroke="#0a0a0a" strokeWidth={2} isAnimationActive startAngle={90} endAngle={-270}>
        {slices.map((slice) => <R.Cell key={slice.label} fill={slice.color} />)}
      </R.Pie>
    </R.PieChart>
  } else if (kind === "scatter" || kind === "bubble") {
    chart = <R.ScatterChart margin={margin}>
      <R.CartesianGrid stroke={GRID} strokeDasharray="4 4" />
      <R.XAxis type="number" dataKey="x" name={xLabel || "x"} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} tickFormatter={(value: number) => formatCompact(value)} />
      <R.YAxis type="number" dataKey="y" name={yLabel || "y"} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: INK_2, fontSize: 11 }} width={46} tickFormatter={(value: number) => tick(value, unit)} />
      {kind === "bubble" ? <R.ZAxis type="number" dataKey="size" range={[40, 600]} /> : <R.ZAxis range={[64, 64]} />}
      <R.Tooltip cursor={{ stroke: "#3a3a3a" }} content={(props: object) => {
        const item = (props as { active?: boolean; payload?: Array<{ payload: { x: number; y: number; label?: string; size?: number } }> })
        if (!item.active || !item.payload?.length) return null
        const point = item.payload[0].payload
        return <div className="mv-tooltip"><div className="mv-tooltip__label">{point.label || "Точка"}</div>
          <div className="mv-tooltip__row">{xLabel || "x"}<b>{formatNumber(point.x)}</b></div>
          <div className="mv-tooltip__row">{yLabel || "y"}<b>{formatValue(point.y, unit)}</b></div>
          {point.size !== undefined ? <div className="mv-tooltip__row">Размер<b>{formatNumber(point.size)}</b></div> : null}</div>
      }} />
      {(scatter || []).map((item, at) => hidden.includes(item.name) ? null : <R.Scatter key={item.name} name={item.name} data={item.points} fill={color(at)} fillOpacity={0.85} stroke="#0a0a0a" strokeWidth={1} />)}
    </R.ScatterChart>
  }
  return <div className="mv-chart" style={{ height }}>
    <R.ResponsiveContainer width="100%" height="100%" minWidth={0}>{chart as ReactElement}</R.ResponsiveContainer>
  </div>
}

export function pieSlices(data: ChartDataset) {
  const values = data.series[0].values.map((value) => Math.max(0, value || 0))
  let entries = data.labels.map((label, at) => ({ label, value: values[at] }))
  // Past eight slices the colours stop being distinguishable: fold the tail.
  if (entries.length > 8) {
    const sorted = [...entries].sort((a, b) => b.value - a.value)
    entries = [...sorted.slice(0, 7), { label: "Другое", value: sorted.slice(7).reduce((sum, item) => sum + item.value, 0) }]
  }
  const total = entries.reduce((sum, item) => sum + item.value, 0) || 1
  return entries.map((item, at) => ({ ...item, share: (item.value / total) * 100, color: SERIES_COLORS[at % SERIES_COLORS.length] }))
}

export function Legend({ items, hidden, onToggle }: { items: Array<{ name: string; color: string }>; hidden: string[]; onToggle?: (name: string) => void }) {
  return <ul className="mv-legend">
    {items.map((item) => <li key={item.name}>
      <button type="button" aria-pressed={!hidden.includes(item.name)} onClick={() => onToggle?.(item.name)} disabled={!onToggle} title={onToggle ? "Показать или скрыть" : undefined}>
        <span className="mv-dot" style={{ background: item.color }} />{item.name}
      </button>
    </li>)}
  </ul>
}

function svgExport(container: HTMLElement | null, title: string, format: "svg" | "png") {
  const svg = container?.querySelector("svg.recharts-surface") as SVGSVGElement | null
  if (!svg) return
  const clone = svg.cloneNode(true) as SVGSVGElement
  const { width, height } = svg.getBoundingClientRect()
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(width))
  clone.setAttribute("height", String(height))
  clone.insertAdjacentHTML("afterbegin", `<rect width="100%" height="100%" fill="#0a0a0a"/>`)
  clone.querySelectorAll("text").forEach((text) => { if (!text.getAttribute("fill")) text.setAttribute("fill", INK_2); text.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, sans-serif") })
  const source = new XMLSerializer().serializeToString(clone)
  if (format === "svg") return download(fileName(title, "svg"), source, "image/svg+xml")
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * 2)
    canvas.height = Math.round(height * 2)
    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(2, 2)
    context.drawImage(image, 0, 0, width, height)
    canvas.toBlob((blob) => { if (blob) download(fileName(title, "png"), blob, "image/png") })
  }
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

export function datasetsOf(block: ChartBlock): Array<ChartDataset & { label: string }> {
  if (block.periods) return block.periods
  return [{ label: "", labels: block.labels || [], series: block.series || [] }]
}

function ChartBody({ block, storeKey, persist, big }: { block: ChartBlock; storeKey: string; persist: boolean; big?: boolean }) {
  const datasets = useMemo(() => datasetsOf(block), [block])
  const [period, setPeriod] = useVisualField(storeKey, persist, "period", 0, isIndex(datasets.length))
  const [hidden, setHidden] = useVisualField<string[]>(storeKey, persist, "hidden", [], isStringArray)
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [toast, say] = useToast()
  const data = datasets[period] || datasets[0]
  const pie = block.chart === "pie" || block.chart === "donut"
  const scatter = block.chart === "scatter" || block.chart === "bubble"
  const toggle = (name: string) => {
    const visible = (pie ? pieSlices(data).length : scatter ? block.scatter!.length : data.series.length) - hidden.length
    if (!hidden.includes(name) && visible <= 1) return say("Нужна хотя бы одна серия")
    setHidden(hidden.includes(name) ? hidden.filter((item) => item !== name) : [...hidden, name])
  }
  const legendItems = pie
    ? pieSlices(data).map((slice) => ({ name: slice.label, color: slice.color }))
    : scatter
      ? block.scatter!.map((item, at) => ({ name: item.name, color: SERIES_COLORS[at] }))
      : data.series.map((item, at) => ({ name: item.name, color: SERIES_COLORS[at % SERIES_COLORS.length] }))
  const height = big ? 460 : pie ? 260 : block.chart === "hbar" ? Math.min(520, 70 + data.labels.length * 34) : 250
  const csv = () => {
    const lines = scatter
      ? [["series", block.xLabel || "x", block.yLabel || "y", "label"].map(csvCell).join(","), ...block.scatter!.flatMap((item) => item.points.map((point) => [item.name, point.x, point.y, point.label || ""].map(csvCell).join(",")))]
      : [["", ...data.series.map((item) => item.name)].map(csvCell).join(","), ...data.labels.map((label, at) => [label, ...data.series.map((item) => item.values[at])].map(csvCell).join(","))]
    download(fileName(block.title, "csv"), "﻿" + lines.join("\n"), "text/csv;charset=utf-8")
    setMenu(false)
  }
  return <>
    {datasets.length > 1 ? <div className="mv-tabs" role="tablist" aria-label="Период">
      {datasets.map((item, at) => <button key={item.label} type="button" role="tab" className="mv-tab" aria-selected={at === period} onClick={() => setPeriod(at)}>{item.label}</button>)}
    </div> : null}
    <div className="mv-section" style={{ marginTop: datasets.length > 1 ? 10 : 14 }}>
      <div className={pie && !big ? "mv-split" : undefined}>
        <div ref={box} className={pie ? "mv-well is-flat" : "mv-well is-flat"}>
          <ChartView kind={block.chart} data={data} unit={block.unit} height={height} hidden={hidden} seriesKinds={data.series.map((item) => item.kind)} scatter={block.scatter} xLabel={block.xLabel} yLabel={block.yLabel} />
          <Legend items={legendItems} hidden={hidden} onToggle={legendItems.length > 1 ? toggle : undefined} />
        </div>
        {pie ? <div>
          <p className="mv-dist__title">Распределение</p>
          <ul className="mv-dist">{pieSlices(data).map((slice) => <li key={slice.label} style={{ opacity: hidden.includes(slice.label) ? 0.4 : 1 }}><span className="mv-dot" style={{ background: slice.color }} />{slice.label}<b>{formatPercent(slice.share)}</b></li>)}</ul>
        </div> : null}
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6, position: "relative" }}>
      <button type="button" className="mv-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}><Download />Экспорт</button>
      {menu ? <div role="menu" style={{ position: "absolute", right: 0, bottom: 36, zIndex: 4, display: "grid", gap: 4, padding: 6, border: "1px solid #2c2c2c", borderRadius: 12, background: "#0d0d0d" }}>
        <button type="button" role="menuitem" className="mv-btn" onClick={csv}>CSV — данные</button>
        <button type="button" role="menuitem" className="mv-btn" onClick={() => { svgExport(box.current, block.title, "png"); setMenu(false) }}>PNG — картинка</button>
        <button type="button" role="menuitem" className="mv-btn" onClick={() => { svgExport(box.current, block.title, "svg"); setMenu(false) }}>SVG — вектор</button>
      </div> : null}
    </div>
    {toast}
  </>
}

export function VisualChart({ block, storeKey, persist }: { block: ChartBlock; storeKey: string; persist: boolean }) {
  const [full, setFull] = useState(false)
  const icon = block.chart === "pie" || block.chart === "donut" ? <ChartPie /> : block.chart.includes("bar") ? <ChartColumn /> : <ChartLine />
  return <>
    <VisualCard block={block} icon={icon} label="График" onFullscreen={() => setFull(true)}>
      <ChartBody block={block} storeKey={storeKey} persist={persist} />
    </VisualCard>
    <Fullscreen open={full} onClose={() => setFull(false)}>
      <VisualCard block={block} icon={icon} label="График" big>
        <ChartBody block={block} storeKey={storeKey} persist={persist} big />
      </VisualCard>
    </Fullscreen>
  </>
}
