"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Download, Eraser, Grid3x3, Highlighter, ImagePlus, Moon, Paperclip, PenLine, Redo2, Square, Trash2, Undo2, X } from "lucide-react"
import {
  CANVAS,
  DRAW_COLORS,
  DRAW_SIZES,
  addPoint,
  drawingFileName,
  emptyHistory,
  fitContain,
  hasInk,
  pushAction,
  redoAction,
  sheetForPhoto,
  sheetForStage,
  smoothSegments,
  strokeWidth,
  undoAction,
  visibleStrokes,
  type DrawBackground,
  type DrawHistory,
  type DrawPoint,
  type DrawSheet,
  type DrawStroke,
  type DrawTool,
} from "./drawing/drawing-model"
import "./drawing/drawing-pad.css"

type ChatDrawingPadProps = {
  open: boolean
  onClose: () => void
  onAttach: (file: File) => void | Promise<void>
}

const TOOLS: Array<{ id: DrawTool; label: string; key: string; icon: typeof PenLine }> = [
  { id: "pen", label: "Ручка", key: "P", icon: PenLine },
  { id: "marker", label: "Маркер", key: "M", icon: Highlighter },
  { id: "eraser", label: "Ластик", key: "E", icon: Eraser },
]
const BACKGROUNDS: Array<{ id: DrawBackground; label: string; icon: typeof Square }> = [
  { id: "white", label: "Белый лист", icon: Square },
  { id: "grid", label: "Сетка", icon: Grid3x3 },
  { id: "dark", label: "Тёмный лист", icon: Moon },
]

function paintStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke) {
  const segments = smoothSegments(stroke.points)
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over"
  ctx.globalAlpha = stroke.tool === "marker" ? 0.38 : 1
  if (stroke.points.length === 1 || !segments.length) {
    const point = stroke.points[0]
    ctx.beginPath()
    ctx.arc(point.x, point.y, strokeWidth(stroke.tool, stroke.size, point.p) / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  if (stroke.tool === "pen") {
    // A pen follows pressure: each segment has its own width.
    for (const segment of segments) {
      ctx.lineWidth = strokeWidth("pen", stroke.size, segment.control.p)
      ctx.beginPath()
      ctx.moveTo(segment.from.x, segment.from.y)
      ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y)
      ctx.stroke()
    }
  } else {
    // A marker is one path, so its see-through ink does not darken where it overlaps itself.
    ctx.lineWidth = strokeWidth(stroke.tool, stroke.size)
    ctx.beginPath()
    ctx.moveTo(segments[0].from.x, segments[0].from.y)
    for (const segment of segments) ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y)
    ctx.stroke()
  }
  ctx.restore()
}

function paintBackground(ctx: CanvasRenderingContext2D, sheet: DrawSheet, background: DrawBackground, photo: HTMLImageElement | null) {
  const { width, height } = sheet
  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = background === "dark" ? "#141416" : "#ffffff"
  ctx.fillRect(0, 0, width, height)
  if (background === "grid") {
    ctx.strokeStyle = "#e6e6ea"
    ctx.lineWidth = 1.5
    for (let x = 40; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 40; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }
  }
  if (photo) {
    const box = fitContain(photo.naturalWidth, photo.naturalHeight, width, height)
    ctx.drawImage(photo, box.x, box.y, box.width, box.height)
  }
  ctx.restore()
}

/**
 * «Нарисовать»: a sketch, a scheme or notes on top of a photo, attached to
 * the message as a PNG. Pen (with stylus pressure), marker and eraser, eight
 * colours, three widths, undo/redo, a white, grid or dark sheet.
 */
export function ChatDrawingPad({ open, onClose, onAttach }: ChatDrawingPadProps) {
  const backgroundRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [sheet, setSheet] = useState<DrawSheet>(CANVAS)
  const [paper, setPaper] = useState<{ width: number; height: number } | null>(null)
  const current = useRef<DrawStroke | null>(null)
  const drawnUpTo = useRef(0)
  const [tool, setTool] = useState<DrawTool>("pen")
  const [color, setColor] = useState(DRAW_COLORS[0].value)
  const [size, setSize] = useState(DRAW_SIZES[1].value)
  const [background, setBackground] = useState<DrawBackground>("white")
  const [photo, setPhoto] = useState<{ image: HTMLImageElement; url: string; name: string } | null>(null)
  const [history, setHistory] = useState<DrawHistory>(emptyHistory)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)

  const dirty = hasInk(history) || Boolean(photo)

  // A fresh sheet every time the pad opens.
  useEffect(() => {
    if (!open) return
    setHistory(emptyHistory())
    setTool("pen")
    setBackground("white")
    setColor(DRAW_COLORS[0].value)
    setError("")
    setConfirmClose(false)
    setPhoto((previous) => { if (previous) URL.revokeObjectURL(previous.url); return null })
    const frame = requestAnimationFrame(() => {
      const rect = stageRef.current?.getBoundingClientRect()
      setSheet(rect ? sheetForStage(rect.width, rect.height) : CANVAS)
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  // The paper is the largest box of the sheet's proportions that fits the stage.
  useLayoutEffect(() => {
    if (!open) return
    const stage = stageRef.current
    if (!stage) return
    const fit = () => {
      const style = getComputedStyle(stage)
      const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      if (width <= 0 || height <= 0) return
      const box = fitContain(sheet.width, sheet.height, width, height)
      setPaper({ width: Math.floor(box.width), height: Math.floor(box.height) })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [open, sheet])

  const redrawInk = useCallback((done: DrawHistory["done"]) => {
    const ctx = inkRef.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    for (const stroke of visibleStrokes(done)) paintStroke(ctx, stroke)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const ctx = backgroundRef.current?.getContext("2d")
    if (ctx) paintBackground(ctx, sheet, background, photo?.image || null)
  }, [open, sheet, background, photo])

  useLayoutEffect(() => {
    if (open) redrawInk(history.done)
  }, [open, sheet, history, redrawInk])

  const requestClose = useCallback(() => {
    if (saving) return
    if (dirty) { setConfirmClose(true); return }
    onClose()
  }, [dirty, saving, onClose])

  const undo = useCallback(() => setHistory((value) => undoAction(value)), [])
  const redo = useCallback(() => setHistory((value) => redoAction(value)), [])
  const clear = useCallback(() => setHistory((value) => visibleStrokes(value.done).length ? pushAction(value, { kind: "clear" }) : value), [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(?:INPUT|TEXTAREA|SELECT)$/u.test(target.tagName)) return
      const mod = event.metaKey || event.ctrlKey
      if (event.key === "Escape") { event.preventDefault(); if (confirmClose) setConfirmClose(false); else requestClose(); return }
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return }
      if (mod || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "p" || key === "з") setTool("pen")
      else if (key === "m" || key === "ь") setTool("marker")
      else if (key === "e" || key === "у") setTool("eraser")
      else if (key === "1" || key === "2" || key === "3") setSize(DRAW_SIZES[Number(key) - 1].value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, confirmClose, requestClose, undo, redo])

  if (!open || typeof document === "undefined") return null

  const toCanvas = (event: { clientX: number; clientY: number; pressure?: number; pointerType?: string }): DrawPoint => {
    const rect = inkRef.current!.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (sheet.width / rect.width),
      y: (event.clientY - rect.top) * (sheet.height / rect.height),
      // A mouse reports 0.5 while pressed; only a stylus varies.
      p: event.pointerType === "pen" ? Number(event.pressure) || 0.5 : 0.5,
    }
  }

  const paintLive = () => {
    const stroke = current.current
    const ink = inkRef.current?.getContext("2d")
    if (!stroke || !ink) return
    if (stroke.tool === "marker") {
      // The marker is previewed on its own layer and laid down on release.
      const live = liveRef.current?.getContext("2d")
      if (!live) return
      live.clearRect(0, 0, sheet.width, sheet.height)
      paintStroke(live, stroke)
      return
    }
    // Pen and eraser: only the new part of the line is drawn each frame.
    const from = Math.max(0, drawnUpTo.current - 2)
    paintStroke(ink, { ...stroke, points: stroke.points.slice(from) })
    drawnUpTo.current = stroke.points.length
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setError("")
    current.current = { tool, color: tool === "eraser" ? "#000000" : color, size, points: [toCanvas(event)] }
    drawnUpTo.current = 0
    paintLive()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current
    if (!stroke) return
    const samples = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent]
    for (const sample of samples.length ? samples : [event.nativeEvent]) addPoint(stroke.points, toCanvas(sample))
    paintLive()
  }

  const onPointerUp = () => {
    const stroke = current.current
    if (!stroke) return
    current.current = null
    liveRef.current?.getContext("2d")?.clearRect(0, 0, sheet.width, sheet.height)
    setHistory((value) => pushAction(value, { kind: "stroke", stroke: { ...stroke, points: [...stroke.points] } }))
  }

  const render = async () => {
    const out = document.createElement("canvas")
    out.width = sheet.width
    out.height = sheet.height
    const ctx = out.getContext("2d")
    if (!ctx || !backgroundRef.current || !inkRef.current) throw new Error("Холст недоступен")
    ctx.drawImage(backgroundRef.current, 0, 0)
    ctx.drawImage(inkRef.current, 0, 0)
    return new Promise<Blob>((resolve, reject) => out.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Не удалось сохранить рисунок")), "image/png"))
  }

  const attach = async () => {
    if (saving || !dirty) return
    setSaving(true)
    setError("")
    try {
      const blob = await render()
      await onAttach(new File([blob], drawingFileName(), { type: "image/png" }))
      onClose()
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "Не удалось прикрепить рисунок")
    } finally {
      setSaving(false)
    }
  }

  const download = async () => {
    try {
      const blob = await render()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = drawingFileName()
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось скачать рисунок")
    }
  }

  const choosePhoto = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) { setError("Выберите изображение: JPG, PNG, WebP или GIF."); return }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setPhoto((previous) => { if (previous) URL.revokeObjectURL(previous.url); return { image, url, name: file.name } })
      // Nothing drawn yet: the sheet takes the photo's shape, so no bands around it.
      if (!visibleStrokes(history.done).length) {
        setSheet(sheetForPhoto(image.naturalWidth, image.naturalHeight))
        setHistory(emptyHistory())
      }
      setError("")
    }
    image.onerror = () => { URL.revokeObjectURL(url); setError("Это изображение не открывается в браузере. Попробуйте JPG или PNG.") }
    image.src = url
  }

  const switchBackground = (next: DrawBackground) => {
    setBackground(next)
    // Black ink on a dark sheet would be invisible; white on white likewise.
    if (next === "dark" && color === DRAW_COLORS[0].value) setColor(DRAW_COLORS[1].value)
    if (next !== "dark" && color === DRAW_COLORS[1].value) setColor(DRAW_COLORS[0].value)
  }

  const canUndo = history.done.length > 0
  const canRedo = history.undone.length > 0

  return createPortal(
    <div className="mdp-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section className="mdp" role="dialog" aria-modal="true" aria-label="Нарисовать" data-preserve-brand-color="true">
        <header className="mdp-head">
          <div className="mdp-head__text">
            <h2>Нарисовать</h2>
            <p>Набросок, схема или пометки поверх фото — прикрепится к сообщению</p>
          </div>
          <button type="button" className="mdp-icon" onClick={requestClose} aria-label="Закрыть"><X aria-hidden="true" /></button>
        </header>

        <div className="mdp-toolbar" role="toolbar" aria-label="Инструменты рисования">
          <div className="mdp-seg" role="radiogroup" aria-label="Инструмент">
            {TOOLS.map(({ id, label, key, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={tool === id} className="mdp-tool" title={`${label} (${key})`} onClick={() => setTool(id)}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>

          <div className="mdp-colors" role="radiogroup" aria-label="Цвет">
            {DRAW_COLORS.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={color === item.value} aria-label={item.label} title={item.label}
                className="mdp-swatch" style={{ "--swatch": item.value } as React.CSSProperties} disabled={tool === "eraser"} onClick={() => setColor(item.value)} />
            ))}
          </div>

          <div className="mdp-seg" role="radiogroup" aria-label="Толщина">
            {DRAW_SIZES.map((item, index) => (
              <button key={item.id} type="button" role="radio" aria-checked={size === item.value} className="mdp-size" title={`${item.label} (${index + 1})`} aria-label={item.label} onClick={() => setSize(item.value)}>
                <span style={{ width: 4 + index * 5, height: 4 + index * 5 }} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="mdp-spacer" />

          <div className="mdp-seg" aria-label="История">
            <button type="button" className="mdp-icon" onClick={undo} disabled={!canUndo} aria-label="Отменить" title="Отменить (Ctrl+Z)"><Undo2 aria-hidden="true" /></button>
            <button type="button" className="mdp-icon" onClick={redo} disabled={!canRedo} aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)"><Redo2 aria-hidden="true" /></button>
            <button type="button" className="mdp-icon" onClick={clear} disabled={!visibleStrokes(history.done).length} aria-label="Очистить рисунок" title="Очистить (можно отменить)"><Trash2 aria-hidden="true" /></button>
          </div>

          <div className="mdp-seg" role="radiogroup" aria-label="Фон">
            {BACKGROUNDS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={background === id} className="mdp-icon" aria-label={label} title={label} onClick={() => switchBackground(id)}><Icon aria-hidden="true" /></button>
            ))}
          </div>

          <button type="button" className="mdp-photo" onClick={() => photoInputRef.current?.click()} title="Рисовать поверх своего фото">
            <ImagePlus aria-hidden="true" /><span>{photo ? "Другое фото" : "Фото"}</span>
          </button>
          {photo ? <button type="button" className="mdp-icon" onClick={() => setPhoto((previous) => { if (previous) URL.revokeObjectURL(previous.url); return null })} aria-label="Убрать фото" title="Убрать фото"><X aria-hidden="true" /></button> : null}
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(event) => { choosePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} />
        </div>

        <div className="mdp-stage" ref={stageRef}>
          <div className="mdp-paper" data-tool={tool} style={paper ? { width: paper.width, height: paper.height } : { visibility: "hidden" }}>
            <canvas ref={backgroundRef} width={sheet.width} height={sheet.height} aria-hidden="true" />
            <canvas ref={inkRef} width={sheet.width} height={sheet.height} aria-hidden="true" />
            <canvas
              ref={liveRef}
              width={sheet.width}
              height={sheet.height}
              role="img"
              aria-label={photo ? `Холст для рисования поверх фото ${photo.name}` : "Холст для рисования"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onLostPointerCapture={onPointerUp}
            />
          </div>
        </div>

        <footer className="mdp-foot">
          {confirmClose ? (
            <div className="mdp-confirm" role="alertdialog" aria-label="Закрыть без сохранения?">
              <span>Рисунок не прикреплён. Закрыть без сохранения?</span>
              <button type="button" className="mdp-btn" onClick={() => setConfirmClose(false)} autoFocus>Остаться</button>
              <button type="button" className="mdp-btn is-danger" onClick={onClose}>Закрыть</button>
            </div>
          ) : (
            <>
              <span className={error ? "mdp-status is-error" : "mdp-status"} role={error ? "alert" : undefined}>
                {error || <><span className="mdp-hint-keys">{dirty ? "P — ручка · M — маркер · E — ластик · 1–3 — толщина · Ctrl+Z — отменить" : "Рисуйте мышью, пальцем или стилусом"}</span><span className="mdp-hint-touch">Рисуйте пальцем или стилусом</span></>}
              </span>
              <button type="button" className="mdp-btn" onClick={() => void download()} disabled={!dirty}><Download aria-hidden="true" />Скачать</button>
              <button type="button" className="mdp-btn is-primary" onClick={() => void attach()} disabled={!dirty || saving}>
                <Paperclip aria-hidden="true" />{saving ? "Прикрепляю…" : "Прикрепить"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  )
}
