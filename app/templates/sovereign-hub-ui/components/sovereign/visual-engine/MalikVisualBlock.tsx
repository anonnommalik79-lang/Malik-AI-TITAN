"use client"

import { useMemo } from "react"
import { ChartColumn, ChartLine, ChartNoAxesColumnIncreasing, Network, Table2 } from "lucide-react"
import { parseVisualBlock, type VisualBlock, type VisualEngineType } from "@/lib/visual/schema"
import { visualBlockToText } from "@/lib/visual/to-text"
import { VisualCalculator } from "./VisualCalculator"
import { VisualChart } from "./VisualChart"
import { VisualDashboard } from "./VisualDashboard"
import { VisualGraph } from "./VisualGraph"
import { VisualTable } from "./VisualTable"
import { Skeleton, VisualBoundary, blockHash } from "./shared"
import "./visual-engine.css"

/**
 * The one entry point Markdown uses for interactive blocks. It only ever
 * receives a block that already passed validation; it picks the component from
 * this fixed registry - never from anything in the answer - and isolates it, so
 * a block that fails to draw shows its text and leaves the message intact.
 */
export function MalikVisualBlock({ block, stateKey }: { block: VisualBlock; stateKey?: string }) {
  const storeKey = stateKey || `anon:${blockHash(JSON.stringify(block))}`
  const persist = Boolean(stateKey)
  const fallback = <VisualFallback title={block.title} text={visualBlockToText(block)} />
  return <VisualBoundary fallback={fallback}>
    {block.type === "chart" ? <VisualChart block={block} storeKey={storeKey} persist={persist} />
      : block.type === "dashboard" ? <VisualDashboard block={block} storeKey={storeKey} persist={persist} />
        : block.type === "calculator" ? <VisualCalculator block={block} storeKey={storeKey} persist={persist} />
          : block.type === "table" ? <VisualTable block={block} storeKey={storeKey} persist={persist} />
            : block.type === "graph" ? <VisualGraph block={block} />
              : fallback}
  </VisualBoundary>
}

/**
 * What Markdown renders for a closed fence that claims a Visual Engine type:
 * validated here with Zod, drawn when valid, a short text note when not.
 */
export function MalikVisualEngineBlock({ raw, stateKey }: { raw: string; stateKey?: string }) {
  const parsed = useMemo(() => parseVisualBlock(raw), [raw])
  if (!parsed.ok) return <VisualFallback title={parsed.title} />
  return <MalikVisualBlock block={parsed.block} stateKey={stateKey} />
}

const PENDING_ICON: Record<VisualEngineType, typeof ChartLine> = {
  chart: ChartColumn, dashboard: ChartLine, calculator: ChartNoAxesColumnIncreasing, table: Table2, graph: Network,
}
const PENDING_TEXT: Record<VisualEngineType, string> = {
  chart: "Строю график…", dashboard: "Собираю аналитику…", calculator: "Готовлю калькулятор…", table: "Собираю таблицу…", graph: "Рисую схему…",
}

/** While the block streams in: the right shape, never raw JSON. */
export function MalikVisualPending({ type, title }: { type: VisualEngineType; title?: string }) {
  const Icon = PENDING_ICON[type]
  return <section className="mv-card" data-malik-visual-pending={type} data-preserve-brand-color="true" aria-busy="true" aria-label={PENDING_TEXT[type]}>
    <div className="mv-head">
      <span className="mv-head__icon" aria-hidden="true"><Icon /></span>
      <div className="mv-head__text"><h3 className="mv-title">{title || PENDING_TEXT[type]}</h3><p className="mv-subtitle" role="status">{PENDING_TEXT[type]}</p></div>
    </div>
    <div style={{ marginTop: 14 }}><Skeleton height={type === "table" ? 150 : type === "calculator" ? 210 : 190} /></div>
  </section>
}

/** A block that cannot be drawn still says what it contained. */
export function VisualFallback({ title, text, reason }: { title?: string; text?: string; reason?: string }) {
  return <div className="mv-fallback" data-malik-visual-fallback role="note">
    <strong>{title ? `Визуализация «${title}» не показана` : "Визуализация не показана"}</strong>
    {text || reason || "Данные блока не прошли проверку, поэтому интерактивный элемент скрыт. Ответ выше и ниже остаётся полным."}
  </div>
}
