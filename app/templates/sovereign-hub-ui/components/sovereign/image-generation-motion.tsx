"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { playImageGenerationCompleteSound, playImageGenerationStartSound } from "@/lib/media/image-generation-sound"
import { resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

type Status = "queued" | "thinking" | "generating" | "rendering" | "ready" | "failed"

type ImageGenerationMotionProps = {
  prompt?: string
  resultUrl?: string
  fallbackUrl?: string
  status?: Status
  startedAt?: string
  provider?: string
  understood?: string
  failed?: boolean
  error?: string
  progress?: number
}

const GENERATION_WATCHDOG_MS = 3 * 60 * 1000
const READY_RESULT_GRACE_MS = 8_000
const HAND = "/malik/image-loader/hand.webp"
const DEMOS = [
  "/malik/image-loader/demo-01.webp",
  "/malik/image-loader/demo-02.webp",
  "/malik/image-loader/demo-03.webp",
  "/malik/image-loader/demo-04.webp",
] as const

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

function loadImage(src: string, timeout = 25_000) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    const timer = window.setTimeout(() => reject(new Error("image timeout")), timeout)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("image failed")) }
    image.src = src
  })
}

function progressFor(status: Status | undefined, phaseSeconds: number) {
  const ranges: Record<Status, [number, number, number]> = {
    queued: [5, 12, 8],
    thinking: [12, 28, 10],
    generating: [28, 76, 42],
    rendering: [76, 96, 24],
    ready: [96, 99, 6],
    failed: [100, 100, 1],
  }
  const [from, to, seconds] = ranges[status || "queued"]
  return Math.round(from + (to - from) * clamp(phaseSeconds / seconds, 0, 1))
}

function stageFor(status?: Status) {
  if (status === "queued") return "Подготавливаю модель"
  if (status === "thinking") return "Анализирую промпт"
  if (status === "generating") return "Прорисовываю сцену"
  if (status === "rendering" || status === "ready") return "Финальная детализация"
  if (status === "failed") return "Генерация остановлена"
  return "Создаю изображение"
}

export function ImageGenerationMotion({ resultUrl, fallbackUrl, status, startedAt, failed, error, progress }: ImageGenerationMotionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const finalUrlRef = useRef("")
  const phaseStartedAtRef = useRef(Date.now())
  const lastStatusRef = useRef<Status | undefined>(status)
  const [resolvedResultUrl, setResolvedResultUrl] = useState("")
  const [imageLoaded, setImageLoaded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [phaseSeconds, setPhaseSeconds] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [readyWithoutResult, setReadyWithoutResult] = useState(false)
  const [assetError, setAssetError] = useState("")

  if (lastStatusRef.current !== status) {
    lastStatusRef.current = status
    phaseStartedAtRef.current = Date.now()
  }

  const missingReadyResult = status === "ready" && !resultUrl && !fallbackUrl
  const actuallyFailed = Boolean(failed || status === "failed" || timedOut || readyWithoutResult)

  useEffect(() => {
    const start = Number.isFinite(Date.parse(startedAt || "")) ? Date.parse(startedAt || "") : Date.now()
    const tick = () => {
      const now = Date.now()
      const elapsed = now - start
      setSeconds(Math.max(0, Math.floor(elapsed / 1000)))
      setPhaseSeconds(Math.max(0, Math.floor((now - phaseStartedAtRef.current) / 1000)))
      if (!imageLoaded && !actuallyFailed && elapsed >= GENERATION_WATCHDOG_MS) setTimedOut(true)
    }
    tick()
    const timer = window.setInterval(tick, 500)
    return () => window.clearInterval(timer)
  }, [startedAt, imageLoaded, actuallyFailed])

  useEffect(() => {
    if (!missingReadyResult) { setReadyWithoutResult(false); return }
    const timer = window.setTimeout(() => setReadyWithoutResult(true), READY_RESULT_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [missingReadyResult])

  useEffect(() => {
    let cancelled = false
    const candidate = resultUrl || fallbackUrl || ""
    if (!candidate) { setResolvedResultUrl(""); setImageLoaded(false); return }
    resolveGeneratedImageUrl(candidate)
      .then((url) => { if (!cancelled) { setResolvedResultUrl(url); setAssetError("") } })
      .catch(() => {
        if (!cancelled && fallbackUrl && fallbackUrl !== candidate) setResolvedResultUrl(fallbackUrl)
        else if (!cancelled) setAssetError("Сохранённое изображение недоступно.")
      })
    return () => { cancelled = true }
  }, [resultUrl, fallbackUrl])

  useEffect(() => { finalUrlRef.current = resolvedResultUrl }, [resolvedResultUrl])
  useEffect(() => { if (!actuallyFailed && !imageLoaded) playImageGenerationStartSound() }, [actuallyFailed, imageLoaded])
  useEffect(() => { if (imageLoaded) playImageGenerationCompleteSound() }, [imageLoaded])

  const shownProgress = useMemo(() => {
    if (imageLoaded || actuallyFailed) return 100
    if (typeof progress === "number" && Number.isFinite(progress)) return Math.round(clamp(progress, 4, 99))
    return progressFor(status, phaseSeconds)
  }, [imageLoaded, actuallyFailed, progress, status, phaseSeconds])

  const shownStage = actuallyFailed ? "Генерация остановлена" : imageLoaded ? "Готово" : stageFor(status)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || actuallyFailed || imageLoaded) return
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) return

    let disposed = false
    let width = 1
    let height = 1
    let dpr = 1
    let hand: HTMLImageElement | null = null
    let demos: HTMLImageElement[] = []
    let demoIndex = Math.floor(Math.random() * DEMOS.length)
    let cycleStarted = performance.now()
    let lastFinalUrl = ""
    let finalImage: HTMLImageElement | null = null

    const source = document.createElement("canvas")
    const sourceCtx = source.getContext("2d", { alpha: false })!
    const mask = document.createElement("canvas")
    const maskCtx = mask.getContext("2d", { alpha: true })!

    const roundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
    }

    const sizeTo = (element: HTMLCanvasElement) => {
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      const c = element.getContext("2d")!
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.imageSmoothingEnabled = true
      c.imageSmoothingQuality = "high"
    }

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      sizeTo(source); sizeTo(mask)
    }

    const drawContain = (c: CanvasRenderingContext2D, img: HTMLImageElement) => {
      const k = Math.min(width / img.naturalWidth, height / img.naturalHeight)
      const w = img.naturalWidth * k
      const h = img.naturalHeight * k
      c.drawImage(img, (width - w) / 2, (height - h) / 2, w, h)
    }

    const prepareSource = (img: HTMLImageElement) => {
      sourceCtx.fillStyle = "#000"; sourceCtx.fillRect(0, 0, width, height); drawContain(sourceCtx, img)
      maskCtx.clearRect(0, 0, width, height)
    }

    const drawHand = (x: number, y: number, dir: number, alpha: number) => {
      if (!hand) return
      const w = Math.min(210, width * 0.31)
      const h = w * (hand.naturalHeight / hand.naturalWidth)
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(dir, 1); ctx.drawImage(hand, -w * 0.24, -h * 0.06, w, h); ctx.restore()
    }

    const renderReveal = (img: HTMLImageElement, t: number) => {
      prepareSource(img)
      const rows = 6
      const active = clamp(t, 0, 1) * rows
      for (let row = 0; row < rows; row++) {
        const amount = clamp(active - row, 0, 1)
        if (!amount) continue
        const y = row * (height / rows)
        const h = height / rows + 2
        const leftToRight = row % 2 === 0
        const w = width * amount
        maskCtx.fillStyle = "#fff"
        maskCtx.fillRect(leftToRight ? 0 : width - w, y, w, h)
      }
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height)
      ctx.save(); roundRect(ctx, 0, 0, width, height, 28); ctx.clip(); ctx.drawImage(source, 0, 0, width, height); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask, 0, 0, width, height); ctx.globalCompositeOperation = "source-over"
      const rawRow = Math.min(rows - 1, Math.floor(clamp(t, 0, .999) * rows))
      const rowT = clamp(t * rows - rawRow, 0, 1)
      const dir = rawRow % 2 === 0 ? 1 : -1
      const x = dir === 1 ? width * rowT : width * (1 - rowT)
      const y = (rawRow + .56) * (height / rows)
      drawHand(x, y, dir, t > .96 ? clamp((1 - t) / .04, 0, 1) : 1)
      ctx.restore()
      ctx.save(); roundRect(ctx, .5, .5, width - 1, height - 1, 28); ctx.strokeStyle = "rgba(218,174,76,.94)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore()
    }

    const loop = (now: number) => {
      if (disposed) return
      const finalUrl = finalUrlRef.current
      if (finalUrl && finalUrl !== lastFinalUrl) {
        lastFinalUrl = finalUrl
        loadImage(finalUrl).then((img) => { if (!disposed) { finalImage = img; cycleStarted = performance.now() } }).catch(() => {})
      }

      const duration = finalImage ? 2100 : 3600
      const t = clamp((now - cycleStarted) / duration, 0, 1)
      const current = finalImage || demos[demoIndex]
      if (current) renderReveal(current, t)

      if (t >= 1) {
        if (finalImage) { setImageLoaded(true); return }
        demoIndex = (demoIndex + 1) % demos.length
        cycleStarted = now + 180
      }
      requestAnimationFrame(loop)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement || canvas)
    resize()
    Promise.all([loadImage(HAND), ...DEMOS.map((src) => loadImage(src))])
      .then(([loadedHand, ...loadedDemos]) => {
        if (disposed) return
        hand = loadedHand
        demos = loadedDemos
        setAssetError("")
        requestAnimationFrame(loop)
      })
      .catch(() => setAssetError("Не удалось загрузить V7-анимацию изображения."))

    return () => { disposed = true; observer.disconnect() }
  }, [actuallyFailed, imageLoaded])

  const failureText = error || assetError || (timedOut
    ? "Генерация заняла больше трёх минут и была остановлена. Повторите запрос."
    : readyWithoutResult
      ? "Провайдер завершил задачу, но не вернул файл изображения."
      : "Генерация изображения не завершилась.")

  return (
    <section className="malik-photo-motion malik-hand-loader-v7" data-malik-image-ready={imageLoaded ? "1" : "0"} data-malik-loader-assets="final-zip-v7">
      <div className={`malik-photo-stage malik-art-stage ${imageLoaded ? "is-finished" : "is-generating"}`}>
        {!actuallyFailed && !imageLoaded ? <canvas ref={canvasRef} className="malik-hand-loader-v7__canvas" /> : null}
        {imageLoaded && resolvedResultUrl ? <img className="malik-art-result is-visible" src={resolvedResultUrl} alt="Сгенерированное изображение Malik AI" draggable={false} /> : null}
        {actuallyFailed ? <div className="malik-hand-loader-v7__failure"><strong>Генерация остановлена</strong><span>{failureText}</span></div> : null}
      </div>

      <div className="malik-hand-loader-v7__progress" aria-live="polite">
        <div className="malik-hand-loader-v7__meta">
          <span>{imageLoaded ? "Готово" : actuallyFailed ? "Генерация остановлена" : "Генерирую изображение"}</span>
          <strong>{shownProgress}%</strong>
        </div>
        <div className="malik-hand-loader-v7__track" aria-hidden="true"><span style={{ width: `${shownProgress}%` }} /></div>
        <div className="malik-hand-loader-v7__status">{imageLoaded ? `Готово за ${seconds} с` : actuallyFailed ? failureText : `${shownStage} · ${seconds} с`}</div>
      </div>

      <style jsx global>{`
        .malik-photo-motion.malik-hand-loader-v7{width:min(100%,680px)!important;max-width:680px!important;margin:2px 0 0!important;padding:0!important;display:grid!important;gap:12px!important;background:#000!important;border:0!important;box-shadow:none!important;color:#fff!important}
        .malik-hand-loader-v7 .malik-photo-stage,.malik-hand-loader-v7 .malik-art-stage{position:relative!important;width:100%!important;aspect-ratio:1/1!important;min-height:0!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(218,174,76,.94)!important;background:#000!important;box-shadow:0 0 0 1px rgba(255,227,163,.04) inset!important;isolation:isolate!important}
        .malik-hand-loader-v7__canvas,.malik-hand-loader-v7 .malik-art-result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;background:#000!important;object-fit:contain!important;object-position:50% 50%!important}
        .malik-hand-loader-v7__canvas{will-change: transform;transform:translateZ(0)}
        .malik-hand-loader-v7 .malik-art-result{opacity:1!important;filter:none!important;transform:none!important;animation:malik-v7-in 180ms ease-out both!important}@keyframes malik-v7-in{from{opacity:.82}to{opacity:1}}
        #malik-root .malik-photo-motion.malik-hand-loader-v7 .malik-hand-loader-v7__progress{width:100%!important;display:grid!important;visibility:visible!important;opacity:1!important;gap:7px!important;padding:0 1px!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
        .malik-hand-loader-v7__meta{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;font-size:12px!important;line-height:1.2!important;color:rgba(255,255,255,.92)!important}.malik-hand-loader-v7__meta strong{font-size:12px!important;font-weight:700!important;color:#fff!important;font-variant-numeric:tabular-nums!important}
        .malik-hand-loader-v7__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.18)!important}.malik-hand-loader-v7__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#fff!important;transition:width 240ms linear!important}
        .malik-hand-loader-v7__status{display:block!important;min-height:16px!important;font-size:11px!important;line-height:1.35!important;color:rgba(255,255,255,.58)!important}.malik-hand-loader-v7__failure{position:absolute!important;inset:0!important;display:grid!important;place-content:center!important;gap:8px!important;padding:28px!important;text-align:center!important;background:#000!important;color:#fff!important}.malik-hand-loader-v7__failure span{max-width:440px!important;font-size:12px!important;line-height:1.55!important;color:rgba(255,255,255,.58)!important}
        @media(max-width:640px){.malik-photo-motion.malik-hand-loader-v7{width:100%!important;max-width:none!important;gap:10px!important}.malik-hand-loader-v7 .malik-photo-stage,.malik-hand-loader-v7 .malik-art-stage{border-radius:22px!important}.malik-hand-loader-v7__canvas,.malik-hand-loader-v7 .malik-art-result{border-radius:21px!important}}
        @media(prefers-reduced-motion:reduce){.malik-hand-loader-v7__track>span,.malik-hand-loader-v7 .malik-art-result{transition:none!important;animation:none!important}}
      `}</style>
    </section>
  )
}

export default ImageGenerationMotion
