"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Network, Scan, ZoomIn, ZoomOut } from "lucide-react"
import type { GraphBlock } from "@/lib/visual/schema"
import { layoutGraph, type LaidNode } from "@/lib/visual/graph-layout"
import { Fullscreen, VisualCard } from "./shared"

const KIND_STYLE: Record<string, { fill: string; stroke: string; text: string; dash?: string; label: string }> = {
  input: { fill: "#0a0a0a", stroke: "#d4d4d4", text: "#f5f5f5", label: "Вход" },
  router: { fill: "#0a0a0a", stroke: "#9a9a9a", text: "#f5f5f5", dash: "2 3", label: "Маршрутизация" },
  module: { fill: "#0b2545", stroke: "#1f4372", text: "#a9cdff", label: "Модуль" },
  process: { fill: "#0b2545", stroke: "#1f4372", text: "#a9cdff", label: "Процесс" },
  check: { fill: "#0a0a0a", stroke: "#4a78b0", text: "#f5f5f5", dash: "2 3", label: "Проверка" },
  output: { fill: "#04140b", stroke: "#1fa463", text: "#f5f5f5", label: "Результат" },
  data: { fill: "#121212", stroke: "#4a4a4a", text: "#e5e5e5", label: "Данные" },
  note: { fill: "transparent", stroke: "transparent", text: "#a3a3a3", label: "Заметка" },
}

type View = { k: number; x: number; y: number }
const MIN_K = 0.3
const MAX_K = 2.5
/** Below this a 12px label is no longer readable; the graph pans instead. */
const READABLE_K = 0.62

function GraphBody({ block, big }: { block: GraphBlock; big?: boolean }) {
  const layout = useMemo(() => layoutGraph(block.nodes, block.edges, block.direction), [block])
  const nodes = useMemo(() => new Map(block.nodes.map((node) => [node.id, node])), [block])
  const frame = useRef<HTMLDivElement>(null)
  const marker = `mv-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const [width, setWidth] = useState(0)
  const [view, setView] = useState<View | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: boolean; start: View; x: number; y: number; distance: number } | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])

  const fitK = width ? Math.min(1, width / layout.width) : 1
  const initial = useCallback((): View => {
    const k = big ? fitK : Math.max(fitK, Math.min(1, READABLE_K))
    return { k, x: Math.max(0, (width - layout.width * k) / 2), y: 0 }
  }, [big, fitK, width, layout.width])
  useEffect(() => { if (width) setView(initial()) }, [width, initial])
  const current = view || { k: fitK, x: 0, y: 0 }
  const frameHeight = Math.round(Math.min(big ? 0.78 * (typeof window === "undefined" ? 800 : window.innerHeight) : 640, layout.height * (view ? Math.max(current.k, fitK) : fitK)) + 4)
  const overflow = layout.width * current.k > width + 2

  const zoom = (factor: number, cx = width / 2, cy = frameHeight / 2) => setView((old) => {
    const base = old || current
    const k = Math.min(MAX_K, Math.max(MIN_K, base.k * factor))
    return { k, x: cx - ((cx - base.x) * k) / base.k, y: cy - ((cy - base.y) * k) / base.k }
  })
  const fit = () => setView({ k: fitK, x: Math.max(0, (width - layout.width * fitK) / 2), y: 0 })
  const focus = (id: string) => {
    setSelected(id)
    const node = layout.nodes.find((item) => item.id === id)
    if (!node) return
    setView((old) => {
      const base = old || current
      return { ...base, x: width / 2 - (node.x + node.w / 2) * base.k, y: Math.min(0, frameHeight / 2 - (node.y + node.h / 2) * base.k) }
    })
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    if ((event.target as Element).closest("button")) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    gesture.current = {
      moved: false,
      start: current,
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
    }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    const g = gesture.current
    if (!g.moved && Math.hypot(x - g.x, y - g.y) < 5 && points.length < 2) return
    if (!g.moved) {
      // Capture only once it is a drag: a tap must still reach the node.
      for (const id of pointers.current.keys()) { try { frame.current?.setPointerCapture(id) } catch { /* pointer already gone */ } }
    }
    g.moved = true
    setDragging(true)
    const rect = frame.current!.getBoundingClientRect()
    let k = g.start.k
    if (points.length > 1 && g.distance) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      k = Math.min(MAX_K, Math.max(MIN_K, g.start.k * (distance / g.distance)))
    }
    const cx = g.x - rect.left
    const cy = g.y - rect.top
    setView({ k, x: cx - ((cx - g.start.x) * k) / g.start.k + (x - g.x), y: cy - ((cy - g.start.y) * k) / g.start.k + (y - g.y) })
  }
  const onPointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (!pointers.current.size) {
      setDragging(false)
      window.setTimeout(() => { gesture.current = null }, 0)
    } else if (gesture.current) {
      const rest = [...pointers.current.values()][0]
      gesture.current = { ...gesture.current, start: current, x: rest.x, y: rest.y, distance: 0 }
    }
  }
  // Ctrl/⌘ + wheel (and a trackpad pinch) zooms; a plain wheel scrolls the
  // chat as usual. React's wheel listener is passive, so this one is native.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomRef.current(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top)
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])
  const choose = (node: LaidNode) => {
    if (gesture.current?.moved) return
    setSelected(selected === node.id ? null : node.id)
  }

  const near = new Set<string>()
  if (selected) {
    near.add(selected)
    for (const edge of block.edges) {
      if (edge.from === selected) near.add(edge.to)
      if (edge.to === selected) near.add(edge.from)
    }
  }
  const chosen = selected ? nodes.get(selected) : null
  const incoming = selected ? block.edges.filter((edge) => edge.to === selected) : []
  const outgoing = selected ? block.edges.filter((edge) => edge.from === selected) : []

  return <>
    <div className="mv-graph__tools" role="toolbar" aria-label="Масштаб схемы">
      <button type="button" className="mv-iconbtn" onClick={() => zoom(1.25)} aria-label="Приблизить" title="Приблизить (или Ctrl + колесо)"><ZoomIn /></button>
      <button type="button" className="mv-iconbtn" onClick={() => zoom(0.8)} aria-label="Отдалить" title="Отдалить"><ZoomOut /></button>
      <button type="button" className="mv-iconbtn" onClick={fit} aria-label="Показать целиком" title="Показать целиком"><Scan /></button>
    </div>
    <div ref={frame} className={`mv-graph${dragging ? " is-dragging" : ""}${selected ? " has-focus" : ""}`} style={{ height: frameHeight }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      role="group" aria-label={`Схема: ${block.title}. ${block.nodes.length} узлов, ${block.edges.length} связей`}>
      <svg width="100%" height={frameHeight} role="img" aria-hidden="false">
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8a8a" />
          </marker>
          <marker id={`${marker}-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f5f5f5" />
          </marker>
        </defs>
        <g transform={`translate(${current.x} ${current.y}) scale(${current.k})`}>
          {layout.edges.map((edge) => {
            const isNear = Boolean(selected && (edge.from === selected || edge.to === selected))
            return <g key={edge.id} className={`mv-edge${isNear ? " is-near" : ""}`}>
              <path d={edge.points.map((point, at) => `${at ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ")} strokeDasharray={edge.dashed ? "4 3" : undefined} markerEnd={`url(#${isNear ? `${marker}-on` : marker})`} />
            </g>
          })}
          {layout.edges.filter((edge) => edge.label && edge.labelAt).map((edge) => {
            const width = edge.label!.length * 6 + 16
            return <g key={`${edge.id}-label`} className={`mv-edge-label mv-edge${selected && (edge.from === selected || edge.to === selected) ? " is-near" : ""}`} transform={`translate(${edge.labelAt![0] - width / 2} ${edge.labelAt![1] - 9})`}>
              <rect width={width} height={18} rx={9} />
              <text x={width / 2} y={12.5} textAnchor="middle">{edge.label}</text>
            </g>
          })}
          {layout.nodes.map((node) => {
            const style = KIND_STYLE[node.kind] || KIND_STYLE.process
            const isSelected = selected === node.id
            return <g key={node.id} className={`mv-node${near.has(node.id) ? " is-near" : ""}`} transform={`translate(${node.x} ${node.y})`}
              role="button" tabIndex={0} aria-pressed={isSelected} aria-label={`${nodes.get(node.id)?.label}. ${style.label}`}
              onClick={() => choose(node)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focus(node.id) } }}>
              <rect width={node.w} height={node.h} rx={11} fill={style.fill} stroke={isSelected ? "#ffffff" : style.stroke} strokeWidth={isSelected ? 2 : 1.2} strokeDasharray={isSelected ? undefined : style.dash} />
              <text fill={style.text} textAnchor="middle">
                {node.lines.map((line, at) => <tspan key={at} x={node.w / 2} y={node.h / 2 + (at - (node.lines.length - 1) / 2) * 15 + 4}>{line}</tspan>)}
              </text>
            </g>
          })}
        </g>
      </svg>
    </div>
    {chosen ? <div className="mv-graph__detail" aria-live="polite">
      <h4>{chosen.label}</h4>
      <p>{chosen.detail || KIND_STYLE[chosen.kind]?.label}</p>
      {incoming.length || outgoing.length ? <div className="mv-graph__links">
        {incoming.map((edge) => <button key={`in-${edge.from}`} type="button" className="mv-chip" onClick={() => focus(edge.from)}>← {nodes.get(edge.from)?.label}{edge.label ? ` · ${edge.label}` : ""}</button>)}
        {outgoing.map((edge) => <button key={`out-${edge.to}`} type="button" className="mv-chip" onClick={() => focus(edge.to)}>→ {nodes.get(edge.to)?.label}{edge.label ? ` · ${edge.label}` : ""}</button>)}
      </div> : null}
    </div> : <p className="mv-hint">{overflow ? "Перетащите схему, чтобы увидеть её целиком. " : ""}Нажмите на узел — подсветятся его связи.</p>}
  </>
}

export function VisualGraph({ block }: { block: GraphBlock }) {
  const [full, setFull] = useState(false)
  return <>
    <VisualCard block={block} icon={<Network />} label="Схема" onFullscreen={() => setFull(true)}>
      <GraphBody block={block} />
    </VisualCard>
    <Fullscreen open={full} onClose={() => setFull(false)}>
      <VisualCard block={block} icon={<Network />} label="Схема" big>
        <GraphBody block={block} big />
      </VisualCard>
    </Fullscreen>
  </>
}
