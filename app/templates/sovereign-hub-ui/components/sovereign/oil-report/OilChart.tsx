"use client"

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react"

/**
 * A line chart for engine numbers, in black and white.
 *
 * Series are told apart by line pattern and grey level (never by colour
 * alone): solid, dashed, dotted, dash-dot. Gaps stay gaps. Hover or touch shows
 * every value for that period; the legend hides and shows series. The chart is
 * drawn at its real pixel width so labels stay readable on a phone.
 */

export type OilChartSeries = {
  id: string
  label: string
  values: Array<number | null>
  style: "solid" | "dash" | "dot" | "dashdot"
  role: "fact" | "model"
  tone: 0 | 1 | 2 | 3
}

type Props = {
  title: string
  unit: string
  x: number[]
  series: OilChartSeries[]
  formatX: (t: number, short?: boolean) => string
  formatY: (value: number) => string
  zero?: boolean
  forecastFrom?: number | null
  forecastLabel?: string
  toggleLabel: (name: string) => string
}

const TONES = ["#fafafa", "#a3a3a3", "#d4d4d4", "#737373"] as const
const DASH: Record<OilChartSeries["style"], string | undefined> = { solid: undefined, dash: "7 5", dot: "0.5 5", dashdot: "10 4 2 4" }
const isNum = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value)

export function niceTicks(low: number, high: number, count = 5) {
  if (!(high > low)) { const pad = Math.abs(high) * 0.1 || 1; low -= pad; high += pad }
  const raw = (high - low) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normal = raw / magnitude
  const step = (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 2.5 ? 2.5 : normal <= 5 ? 5 : 10) * magnitude
  const start = Math.floor(low / step) * step, end = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step * 1e-9 && ticks.length < 12; value += step) ticks.push(Number(value.toPrecision(12)))
  return ticks
}

export function OilChart({ title, unit, x, series, formatX, formatY, zero = false, forecastFrom = null, forecastLabel, toggleLabel }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setWidth(Math.max(240, Math.round(element.clientWidth || 640)))
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A finger lifts off the chart: the values stay until the next touch elsewhere.
  useEffect(() => {
    if (hover === null) return
    const away = (event: Event) => { if (!frame.current?.contains(event.target as Node)) setHover(null) }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [hover])

  const visible = series.filter((item) => !hidden.has(item.id))
  const height = width < 480 ? 220 : 250
  const margin = { top: 18, right: 14, bottom: 30, left: width < 480 ? 46 : 56 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom

  const scale = useMemo(() => {
    const values = visible.flatMap((item) => item.values.filter(isNum))
    const low = values.length ? Math.min(...values) : 0
    const high = values.length ? Math.max(...values) : 1
    const span = high - low || Math.abs(high) || 1
    const ticks = niceTicks(zero ? Math.min(0, low) : low - span * 0.08, high + span * 0.04, width < 480 ? 4 : 5)
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks }
  }, [visible, zero, width])

  const tMin = x[0] ?? 0, tMax = x[x.length - 1] ?? 1
  const px = (t: number) => margin.left + (tMax === tMin ? plotWidth / 2 : (t - tMin) / (tMax - tMin) * plotWidth)
  const py = (value: number) => margin.top + plotHeight - (value - scale.min) / (scale.max - scale.min || 1) * plotHeight
  const labelEvery = Math.max(1, Math.ceil(x.length / Math.max(2, Math.floor(plotWidth / (width < 480 ? 52 : 64)))))
  const markers = x.length <= 36

  const path = (values: Array<number | null>) => {
    let d = "", open = false
    values.forEach((value, index) => {
      if (!isNum(value)) { open = false; return }
      d += `${open ? "L" : "M"}${px(x[index]).toFixed(1)} ${py(value).toFixed(1)}`
      open = true
    })
    return d
  }

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - box.left) / (box.width || 1) * plotWidth + margin.left
    let best = 0, distance = Infinity
    x.forEach((t, index) => { const gap = Math.abs(px(t) - position); if (gap < distance) { distance = gap; best = index } })
    setHover(best)
  }

  const toggle = (seriesId: string) => setHidden((current) => {
    const next = new Set(current)
    if (next.has(seriesId)) next.delete(seriesId)
    else if (series.length - next.size > 1) next.add(seriesId)
    return next
  })

  const hoverX = hover === null ? null : px(x[hover])
  const tooltipLeft = hoverX === null ? 0 : Math.min(Math.max(hoverX - 90, 4), width - 184)

  return (
    <figure className="malik-oil-chart" aria-labelledby={`${id}-title`}>
      <figcaption className="malik-oil-chart__head">
        <span id={`${id}-title`} className="malik-oil-chart__title">{title}</span>
        {unit ? <span className="malik-oil-chart__unit">{unit}</span> : null}
      </figcaption>
      {series.length > 1 ? (
        <div className="malik-oil-chart__legend">
          {series.map((item) => (
            <button key={item.id} type="button" aria-pressed={!hidden.has(item.id)} aria-label={toggleLabel(item.label)} className="malik-oil-chart__key" onClick={() => toggle(item.id)}>
              <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke={TONES[item.tone]} strokeWidth="2.4" strokeDasharray={DASH[item.style]} strokeLinecap="round" /></svg>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div ref={frame} className="malik-oil-chart__frame" dir="ltr">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}${unit ? `, ${unit}` : ""}`} className="malik-oil-chart__svg">
          {forecastFrom !== null && forecastFrom < tMax ? (
            <g>
              <rect x={px(forecastFrom)} y={margin.top} width={margin.left + plotWidth - px(forecastFrom)} height={plotHeight} fill="#ffffff" fillOpacity="0.05" />
              {forecastLabel ? <text x={px(forecastFrom) + 6} y={margin.top + 12} className="malik-oil-chart__zone">{forecastLabel}</text> : null}
            </g>
          ) : null}
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={margin.left + plotWidth} y1={py(tick)} y2={py(tick)} stroke="#262626" strokeWidth="1" />
              <text x={margin.left - 8} y={py(tick) + 4} textAnchor="end" className="malik-oil-chart__tick">{formatY(tick)}</text>
            </g>
          ))}
          {x.map((t, index) => index % labelEvery === 0 || index === x.length - 1 && (x.length - 1) % labelEvery >= labelEvery / 2 ? (
            <text key={t} x={px(t)} y={height - 9} textAnchor={index === 0 ? "start" : index === x.length - 1 ? "end" : "middle"} className="malik-oil-chart__tick">{formatX(t, true)}</text>
          ) : null)}
          {visible.map((item) => (
            <path key={item.id} d={path(item.values)} fill="none" stroke={TONES[item.tone]} strokeWidth="2" strokeDasharray={DASH[item.style]} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {markers ? visible.map((item) => item.values.map((value, index) => isNum(value) && (item.role === "fact" || index > 0 && isNum(item.values[index - 1]) || index === item.values.length - 1) ? (
            <circle key={`${item.id}-${index}`} cx={px(x[index])} cy={py(value)} r={item.role === "fact" ? 3.5 : 3} fill={item.role === "fact" ? TONES[item.tone] : "#000"} stroke={TONES[item.tone]} strokeWidth={item.role === "fact" ? 2 : 1.6} />
          ) : null)) : null}
          {hoverX !== null ? <line x1={hoverX} x2={hoverX} y1={margin.top} y2={margin.top + plotHeight} stroke="#737373" strokeWidth="1" /> : null}
          {hover !== null ? visible.map((item) => isNum(item.values[hover]) ? <circle key={`hover-${item.id}`} cx={px(x[hover])} cy={py(item.values[hover] as number)} r="5" fill="#000" stroke={TONES[item.tone]} strokeWidth="2.4" /> : null) : null}
          <rect x={margin.left - 8} y={margin.top} width={plotWidth + 16} height={plotHeight} fill="transparent" style={{ touchAction: "pan-y" }}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={(event) => { if (event.pointerType === "mouse") setHover(null) }} />
        </svg>
        {hover !== null ? (
          <div className="malik-oil-chart__tip" style={{ left: tooltipLeft }} role="status">
            <strong>{formatX(x[hover])}</strong>
            {visible.map((item) => isNum(item.values[hover]) ? (
              <span key={item.id}><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={TONES[item.tone]} strokeWidth="2.2" strokeDasharray={DASH[item.style]} strokeLinecap="round" /></svg>{item.label}: <b>{formatY(item.values[hover] as number)}</b></span>
            ) : null)}
          </div>
        ) : null}
      </div>
    </figure>
  )
}
