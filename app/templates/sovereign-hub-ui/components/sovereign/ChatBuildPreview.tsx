"use client"

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { ExternalLink, Minus, Monitor, Plus, RefreshCw, Smartphone, Tablet, X } from "lucide-react"
import { createCanvasBlobUrl } from "@/lib/canvas-preview"
import { ruCount, type ChatBuildKind } from "@/lib/ai/chat-build"
import "./chat-build.css"

/**
 * The large Live Preview beside the chat: one at a time, opened by a finished
 * build (or its «Открыть превью» button) and closed when the chat changes.
 * The page runs in the same isolated sandbox as the inline preview.
 */

export type BuildPreview = { id: string; title: string; filename: string; srcDoc: string; kind: ChatBuildKind; lines: number }

let current: BuildPreview | null = null
let hosts = 0
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function openBuildPreview(preview: BuildPreview) { current = preview; emit() }
export function closeBuildPreview(id?: string) {
  if (!current || (id && current.id !== id)) return
  current = null
  emit()
}
export function useBuildPreview() {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
/** A finished build opens the panel by itself only beside the main chat on a wide screen. */
export function buildPreviewCanAutoOpen() {
  return hosts > 0 && typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 1024px)").matches)
}

type Device = "desktop" | "tablet" | "mobile"
const DEVICES: Record<Exclude<Device, "desktop">, { width: number; height: number }> = { tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } }
/** A desktop page is laid out at least this wide, then scaled down to the panel. */
const DESKTOP_WIDTH = 1280
const ZOOMS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150]
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function fitZoom(device: Device, stage: { width: number; height: number }) {
  if (!stage.width || !stage.height) return 100
  const fit = device === "desktop"
    ? stage.width / DESKTOP_WIDTH
    : Math.min((stage.width - 32) / DEVICES[device].width, (stage.height - 32) / DEVICES[device].height)
  const percent = Math.min(100, fit * 100)
  return [...ZOOMS].reverse().find((zoom) => zoom <= percent) || ZOOMS[0]
}

export function ChatBuildPreviewPanel({ variant = "aside" }: { variant?: "aside" | "overlay" }) {
  const preview = useBuildPreview()
  useEffect(() => {
    if (variant !== "aside") return
    hosts += 1
    return () => { hosts -= 1 }
  }, [variant])
  if (!preview) return null
  return <PreviewWindow key={preview.id} preview={preview} variant={variant} />
}

function PreviewWindow({ preview, variant }: { preview: BuildPreview; variant: "aside" | "overlay" }) {
  // A phone shows the page as a phone first; a computer as a computer.
  const [device, setDevice] = useState<Device>(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? "mobile" : "desktop")
  const [zoom, setZoom] = useState(100)
  const [reload, setReload] = useState(0)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const fitted = useRef<Device | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [check, setCheck] = useState<{ status: "booted" | "running" | "error"; frames?: number; message?: string } | null>(null)

  useIsoLayoutEffect(() => {
    const element = stageRef.current
    if (!element) return
    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // Each device starts at the zoom that fits it; after that the zoom is the person's.
  useEffect(() => {
    if (!stage.width || fitted.current === device) return
    fitted.current = device
    setZoom(fitZoom(device, stage))
  }, [device, stage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && (variant === "overlay" || !window.matchMedia("(min-width: 1024px)").matches)) closeBuildPreview() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [variant])

  // A Malik game reports from inside the preview whether it really runs in this browser.
  useEffect(() => {
    setCheck(null)
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const data = event.data as { type?: unknown; frames?: unknown; playFrames?: unknown; message?: unknown } | null
      if (!data || typeof data.type !== "string") return
      if (data.type === "malik-game-error") setCheck({ status: "error", message: String(data.message || "").slice(0, 200) })
      else if (data.type === "malik-game-ready") setCheck({ status: "running", frames: Number(data.playFrames || data.frames) || undefined })
      else if (data.type === "malik-game-booted") setCheck((value) => value?.status === "running" || value?.status === "error" ? value : { status: "booted" })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [reload, device])

  const openInTab = () => {
    const url = createCanvasBlobUrl(preview.srcDoc)
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const scale = zoom / 100
  const size = device === "desktop"
    ? { width: Math.max(1, Math.round(stage.width / scale)), height: Math.max(1, Math.round(stage.height / scale)) }
    : DEVICES[device]
  const step = (direction: 1 | -1) => {
    const index = ZOOMS.indexOf(zoom)
    const next = index < 0 ? ZOOMS.findIndex((value) => value > zoom) : index + direction
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, next))])
  }

  return <aside className={`malik-build-preview is-${variant}`} aria-label="Live Preview" data-malik-build-preview={preview.id}>
    <header className="malik-build-preview__bar">
      <div className="malik-build-preview__title">
        <span className="malik-build-preview__mark" aria-hidden="true" />
        <strong>LIVE PREVIEW</strong>
        <span title={preview.title || preview.filename}>{preview.title || preview.filename}</span>
      </div>
      <div className="malik-build-preview__actions">
        <button type="button" onClick={() => setReload((value) => value + 1)} aria-label="Обновить предпросмотр"><RefreshCw aria-hidden="true" /><span>Обновить</span></button>
        <button type="button" onClick={openInTab} aria-label="Открыть в новой вкладке"><ExternalLink aria-hidden="true" /><span>Открыть</span></button>
        <button type="button" className="is-icon" onClick={() => closeBuildPreview()} aria-label="Закрыть предпросмотр"><X aria-hidden="true" /></button>
      </div>
    </header>
    <div className="malik-build-preview__tools">
      <div className="malik-build-preview__devices" role="group" aria-label="Устройство">
        {([["desktop", Monitor, "Компьютер"], ["tablet", Tablet, "Планшет"], ["mobile", Smartphone, "Телефон"]] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" aria-pressed={device === id} aria-label={label} title={label} onClick={() => setDevice(id)}><Icon aria-hidden="true" /></button>
        ))}
      </div>
      <span className="malik-build-preview__size">{size.width} × {size.height}</span>
      <div className="malik-build-preview__zoom" role="group" aria-label="Масштаб">
        <button type="button" onClick={() => step(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Уменьшить"><Minus aria-hidden="true" /></button>
        <button type="button" className="malik-build-preview__zoom-value" onClick={() => setZoom(fitZoom(device, stage))} title="Вписать в окно">{zoom}%</button>
        <button type="button" onClick={() => step(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Увеличить"><Plus aria-hidden="true" /></button>
      </div>
    </div>
    <div ref={stageRef} className={`malik-build-preview__stage is-${device}`}>
      {stage.width ? <div className="malik-build-preview__device" style={{ width: size.width * scale, height: size.height * scale }}>
        <iframe
          ref={frame}
          key={`${reload}:${device}`}
          srcDoc={preview.srcDoc}
          title={`Предпросмотр ${preview.filename}`}
          style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
          // The same isolation as the inline preview: scripts run, nothing reaches Malik AI's origin.
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
        />
      </div> : null}
    </div>
    <footer className="malik-build-preview__report" role="status" data-browser-check={check?.status || undefined}>
      <span>ОТЧЁТ</span>
      {check?.status === "running"
        ? <p>Проверено в вашем браузере: игра запущена{check.frames ? `, ${check.frames} кадров` : ""} без ошибок</p>
        : check?.status === "error"
          ? <p>Ошибка в вашем браузере: {check.message || "игра остановилась"}. Напишите «исправь игру».</p>
          : check?.status === "booted"
            ? <p>Меню игры загрузилось · нажмите «Играть», чтобы проверить запуск</p>
            : <p>{preview.filename} · {ruCount(preview.lines, ["строка", "строки", "строк"])} · изолированный sandbox</p>}
    </footer>
  </aside>
}
