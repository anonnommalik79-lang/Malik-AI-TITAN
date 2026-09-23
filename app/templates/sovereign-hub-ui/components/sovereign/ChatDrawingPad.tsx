"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Eraser, Paperclip, X } from "lucide-react"

type ChatDrawingPadProps = {
  open: boolean
  onClose: () => void
  onAttach: (file: File) => void | Promise<void>
}

function paintWhite(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.save()
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

export function ChatDrawingPad({ open, onClose, onAttach }: ChatDrawingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 1200
    canvas.height = 720
    paintWhite(canvas)
  }, [open])

  if (!open || typeof document === "undefined") return null

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastRef.current = point(event)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const previous = lastRef.current
    if (!canvas || !previous) return
    const next = point(event)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.strokeStyle = "#111111"
    ctx.lineWidth = 7
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(previous.x, previous.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastRef.current = next
  }

  const stop = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (canvas) paintWhite(canvas)
  }

  const attach = async () => {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Не удалось сохранить рисунок")), "image/png")
      })
      await onAttach(new File([blob], `malik-drawing-${Date.now()}.png`, { type: "image/png" }))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Нарисовать">
      <div className="w-full max-w-[760px] overflow-hidden rounded-[22px] border border-white/10 bg-[#151516] shadow-[0_30px_120px_rgba(0,0,0,.7)]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold text-white">Нарисовать</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Нарисуйте и прикрепите изображение к сообщению</div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.07] hover:text-white" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          <canvas
            ref={canvasRef}
            className="block aspect-[5/3] w-full touch-none rounded-[15px] bg-white shadow-inner"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-4 py-3">
          <button type="button" onClick={clear} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-zinc-300 hover:bg-white/[0.06]">
            <Eraser className="h-4 w-4" /> Очистить
          </button>
          <button type="button" onClick={() => void attach()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[12px] font-bold text-black disabled:opacity-50">
            <Paperclip className="h-4 w-4" /> {saving ? "Сохраняю…" : "Прикрепить"}
          </button>
        </div>
      </div>
    </div>
    , document.body)
}
