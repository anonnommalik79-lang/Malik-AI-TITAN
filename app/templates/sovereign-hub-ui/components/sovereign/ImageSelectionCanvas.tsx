"use client"

import { useEffect, useRef } from "react"
import type { MalikImageSelection } from "@/lib/media/image-editor-events"

type Point = { x: number; y: number }

export function ImageSelectionCanvas({
  active,
  brushSize,
  resetKey,
  onSelectionChange,
}: {
  active: boolean
  brushSize: number
  resetKey: number
  onSelectionChange: (selection?: MalikImageSelection) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<Point | null>(null)
  const boundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number; points: number } | null>(null)

  const resizeCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const width = Math.max(1, Math.round(rect.width * ratio))
    const height = Math.max(1, Math.round(rect.height * ratio))
    if (canvas.width === width && canvas.height === height) return

    const snapshot = document.createElement("canvas")
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const snapshotContext = snapshot.getContext("2d")
    if (snapshotContext && canvas.width && canvas.height) snapshotContext.drawImage(canvas, 0, 0)

    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (context && snapshot.width && snapshot.height) {
      context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    boundsRef.current = null
    lastRef.current = null
    drawingRef.current = false
    onSelectionChange(undefined)
  }, [resetKey, onSelectionChange])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY)),
    }
  }

  const includePoint = (point: Point, radius: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const next = boundsRef.current || {
      minX: canvas.width,
      minY: canvas.height,
      maxX: 0,
      maxY: 0,
      points: 0,
    }
    next.minX = Math.max(0, Math.min(next.minX, point.x - radius))
    next.minY = Math.max(0, Math.min(next.minY, point.y - radius))
    next.maxX = Math.min(canvas.width, Math.max(next.maxX, point.x + radius))
    next.maxY = Math.min(canvas.height, Math.max(next.maxY, point.y + radius))
    next.points += 1
    boundsRef.current = next
  }

  const emitSelection = () => {
    const canvas = canvasRef.current
    const bounds = boundsRef.current
    if (!canvas || !bounds || bounds.points < 1 || !canvas.width || !canvas.height) {
      onSelectionChange(undefined)
      return
    }
    const left = bounds.minX / canvas.width * 100
    const top = bounds.minY / canvas.height * 100
    const width = Math.max(0, (bounds.maxX - bounds.minX) / canvas.width * 100)
    const height = Math.max(0, (bounds.maxY - bounds.minY) / canvas.height * 100)
    onSelectionChange({
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      coverage: Number(Math.min(100, width * height / 100).toFixed(2)),
    })
  }

  const drawTo = (point: Point) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    const rect = canvas.getBoundingClientRect()
    const ratio = rect.width ? canvas.width / rect.width : 1
    const radius = Math.max(5, brushSize * ratio / 2)
    const previous = lastRef.current || point

    context.save()
    context.strokeStyle = "rgba(255,255,255,.72)"
    context.fillStyle = "rgba(255,255,255,.72)"
    context.lineWidth = radius * 2
    context.lineCap = "round"
    context.lineJoin = "round"
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
    context.restore()

    includePoint(point, radius)
    includePoint(previous, radius)
    lastRef.current = point
  }

  return (
    <canvas
      ref={canvasRef}
      className={`malik-image-selection-canvas${active ? " is-active" : ""}`}
      aria-label="Выделение области изображения"
      onPointerDown={(event) => {
        if (!active) return
        const point = pointFromEvent(event)
        if (!point) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drawingRef.current = true
        lastRef.current = point
        drawTo(point)
      }}
      onPointerMove={(event) => {
        if (!active || !drawingRef.current) return
        const point = pointFromEvent(event)
        if (!point) return
        event.preventDefault()
        drawTo(point)
      }}
      onPointerUp={(event) => {
        if (!drawingRef.current) return
        drawingRef.current = false
        lastRef.current = null
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
        emitSelection()
      }}
      onPointerCancel={() => {
        drawingRef.current = false
        lastRef.current = null
        emitSelection()
      }}
    />
  )
}

export default ImageSelectionCanvas
