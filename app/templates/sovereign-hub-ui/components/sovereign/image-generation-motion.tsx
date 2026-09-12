"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cacheGeneratedImageByUrl, readCachedGeneratedImage, resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

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
const PREVIEW_FRAMES = [
  "https://images-assets.nasa.gov/image/PIA15985/PIA15985~large.jpg",
  "https://images-assets.nasa.gov/image/PIA10957/PIA10957~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04628/PIA04628~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04230/PIA04230~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04921/PIA04921~large.jpg",
] as const

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const smooth = (value: number) => {
  const x = clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

function loadImage(src: string, timeout = 25_000) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.referrerPolicy = "no-referrer"
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
  if (status === "queued") return "Генерирую варианты"
  if (status === "thinking" || status === "generating") return "Строю свет и форму"
  if (status === "rendering" || status === "ready") return "Проявляю финальный кадр"
  if (status === "failed") return "Генерация остановлена"
  return "Генерирую варианты"
}

export function ImageGenerationMotion({ resultUrl, fallbackUrl, status, startedAt, understood, failed, error, progress }: ImageGenerationMotionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
    if (imageLoaded || actuallyFailed) return
    const timer = window.setInterval(tick, 1000)
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

  useEffect(() => {
    if (!resolvedResultUrl || imageLoaded || actuallyFailed) return
    let cancelled = false
    loadImage(resolvedResultUrl)
      .then(() => {
        if (cancelled) return
        setAssetError("")
        setImageLoaded(true)
        void cacheGeneratedImageByUrl(resolvedResultUrl)
      })
      .catch(async () => {
        if (cancelled) return
        const cached = await readCachedGeneratedImage(resolvedResultUrl)
        if (cancelled) return
        if (cached) {
          setResolvedResultUrl(cached)
          setAssetError("")
          return
        }
        setAssetError("Сохранённое изображение недоступно.")
      })
    return () => { cancelled = true }
  }, [resolvedResultUrl, imageLoaded, actuallyFailed])

  const shownProgress = useMemo(() => {
    if (imageLoaded || actuallyFailed) return 100
    if (typeof progress === "number" && Number.isFinite(progress)) return Math.round(clamp(progress, 4, 99))
    return progressFor(status, phaseSeconds)
  }, [imageLoaded, actuallyFailed, progress, status, phaseSeconds])

  const activeStep = shownProgress < 34 ? 0 : shownProgress < 78 ? 1 : 2
  const steps = ["Генерирую варианты", "Строю свет и форму", "Проявляю финальный кадр"]
  const shownStage = imageLoaded ? "Готово" : stageFor(status)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || actuallyFailed || imageLoaded) return
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) return

    let disposed = false
    let width = 1
    let height = 1
    let dpr = 1
    let lastFrameAt = 0
    let animationStartedAt = performance.now()
    let frames: HTMLImageElement[] = []
    let preparedIndex = -1

    const currentSurface = document.createElement("canvas")
    const nextSurface = document.createElement("canvas")
    const softSurface = document.createElement("canvas")
    const maskSurface = document.createElement("canvas")
    const transitionSurface = document.createElement("canvas")
    const currentCtx = currentSurface.getContext("2d", { alpha: false })!
    const nextCtx = nextSurface.getContext("2d", { alpha: false })!
    const softCtx = softSurface.getContext("2d", { alpha: false })!
    const maskCtx = maskSurface.getContext("2d", { alpha: true })!
    const transitionCtx = transitionSurface.getContext("2d", { alpha: true })!

    const setSurfaceSize = (surface: HTMLCanvasElement, surfaceCtx: CanvasRenderingContext2D) => {
      surface.width = Math.max(1, Math.round(width * dpr))
      surface.height = Math.max(1, Math.round(height * dpr))
      surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      surfaceCtx.imageSmoothingEnabled = true
      surfaceCtx.imageSmoothingQuality = "high"
    }

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      const cap = window.innerWidth <= 640 ? 1.35 : 1.6
      dpr = Math.min(window.devicePixelRatio || 1, cap)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      setSurfaceSize(currentSurface, currentCtx)
      setSurfaceSize(nextSurface, nextCtx)
      setSurfaceSize(softSurface, softCtx)
      setSurfaceSize(maskSurface, maskCtx)
      setSurfaceSize(transitionSurface, transitionCtx)
      preparedIndex = -1
    }

    const drawCover = (surfaceCtx: CanvasRenderingContext2D, image: HTMLImageElement) => {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale
      surfaceCtx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
    }

    const prepareSurface = (surfaceCtx: CanvasRenderingContext2D, image: HTMLImageElement, filter: string) => {
      surfaceCtx.save()
      surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      surfaceCtx.clearRect(0, 0, width, height)
      surfaceCtx.fillStyle = "#060607"
      surfaceCtx.fillRect(0, 0, width, height)
      surfaceCtx.filter = filter
      drawCover(surfaceCtx, image)
      surfaceCtx.restore()
    }

    const preparePair = (index: number) => {
      if (!frames.length || preparedIndex === index) return
      const current = frames[index % frames.length]
      const next = frames[(index + 1) % frames.length]
      prepareSurface(currentCtx, current, "grayscale(1) contrast(1.2) brightness(.56)")
      prepareSurface(nextCtx, next, "grayscale(1) contrast(1.22) brightness(.62)")
      prepareSurface(softCtx, next, "grayscale(1) blur(7px) contrast(.92) brightness(.5)")
      preparedIndex = index
    }

    const renderMask = (p: number) => {
      maskCtx.save()
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      maskCtx.clearRect(0, 0, width, height)
      maskCtx.filter = "blur(11px)"
      maskCtx.fillStyle = "#fff"

      const rows = 7
      const rowHeight = height / rows + 12
      for (let row = 0; row < rows; row += 1) {
        const delay = row * .045
        const amount = smooth((p - delay) / .46)
        if (amount <= 0) continue
        const y = row * (height / rows) - 6
        const span = width * (.28 + amount * .92)
        const x = row % 2 === 0 ? -width * .18 : width - span + width * .18
        maskCtx.beginPath()
        maskCtx.roundRect(x, y, span, rowHeight, Math.min(34, rowHeight * .42))
        maskCtx.fill()
      }
      maskCtx.restore()
    }

    const drawMasked = (surface: HTMLCanvasElement, alpha: number) => {
      transitionCtx.save()
      transitionCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      transitionCtx.clearRect(0, 0, width, height)
      transitionCtx.globalCompositeOperation = "source-over"
      transitionCtx.globalAlpha = 1
      transitionCtx.drawImage(surface, 0, 0, width, height)
      transitionCtx.globalCompositeOperation = "destination-in"
      transitionCtx.drawImage(maskSurface, 0, 0, width, height)
      transitionCtx.restore()

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.drawImage(transitionSurface, 0, 0, width, height)
      ctx.restore()
    }

    const drawFallback = (now: number) => {
      const t = (now - animationStartedAt) / 1000
      ctx.fillStyle = "#060607"
      ctx.fillRect(0, 0, width, height)
      const glow = ctx.createRadialGradient(width * .5, height * .45, 0, width * .5, height * .45, width * .65)
      glow.addColorStop(0, "rgba(255,255,255,.065)")
      glow.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
      const sweepX = ((t * .95) % 1.35) * width * 1.35 - width * .25
      const sweep = ctx.createLinearGradient(sweepX - 48, 0, sweepX + 48, 0)
      sweep.addColorStop(0, "rgba(255,255,255,0)")
      sweep.addColorStop(.5, "rgba(255,255,255,.16)")
      sweep.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = sweep
      ctx.fillRect(sweepX - 48, 0, 96, height)
    }

    const render = (now: number) => {
      if (disposed) return
      if (now - lastFrameAt < 32) {
        requestAnimationFrame(render)
        return
      }
      lastFrameAt = now

      ctx.save()
      ctx.clearRect(0, 0, width, height)
      if (!frames.length) {
        drawFallback(now)
        ctx.restore()
        requestAnimationFrame(render)
        return
      }

      const cycleMs = 610
      const holdMs = 105
      const elapsed = Math.max(0, now - animationStartedAt)
      const cycleNumber = Math.floor(elapsed / cycleMs)
      const index = cycleNumber % frames.length
      const withinCycle = elapsed % cycleMs
      preparePair(index)

      ctx.fillStyle = "#060607"
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(currentSurface, 0, 0, width, height)

      if (withinCycle > holdMs) {
        const p = smooth((withinCycle - holdMs) / (cycleMs - holdMs))
        renderMask(p)
        drawMasked(softSurface, .64)
        const photoAlpha = smooth((p - .12) / .64)
        if (photoAlpha > 0) drawMasked(nextSurface, .96 * photoAlpha)
        const settle = smooth((p - .76) / .24)
        if (settle > 0) {
          ctx.globalAlpha = settle
          ctx.drawImage(nextSurface, 0, 0, width, height)
          ctx.globalAlpha = 1
        }
      }

      const shimmerX = ((elapsed / 1000 * 1.55) % 1.4) * width * 1.4 - width * .2
      const shimmer = ctx.createLinearGradient(shimmerX - 34, 0, shimmerX + 34, 0)
      shimmer.addColorStop(0, "rgba(255,255,255,0)")
      shimmer.addColorStop(.5, "rgba(255,255,255,.08)")
      shimmer.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = shimmer
      ctx.fillRect(shimmerX - 34, 0, 68, height)
      ctx.restore()
      requestAnimationFrame(render)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement || canvas)
    resize()
    requestAnimationFrame(render)

    Promise.allSettled(PREVIEW_FRAMES.map((src) => loadImage(src)))
      .then((results) => {
        if (disposed) return
        frames = results
          .filter((result): result is PromiseFulfilledResult<HTMLImageElement> => result.status === "fulfilled")
          .map((result) => result.value)
        if (!frames.length) {
          setAssetError("")
          return
        }
        animationStartedAt = performance.now()
        preparedIndex = -1
      })

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [actuallyFailed, imageLoaded])

  const failureText = error || assetError || (timedOut
    ? "Генерация заняла больше трёх минут и была остановлена. Повторите запрос."
    : readyWithoutResult
      ? "Провайдер завершил задачу, но не вернул файл изображения."
      : "Генерация изображения не завершилась.")

  return (
    <section
      className="malik-photo-v22"
      data-malik-image-motion="1"
      data-malik-image-ready={imageLoaded ? "1" : "0"}
      data-malik-image-state={actuallyFailed ? "failed" : imageLoaded ? "ready" : "generating"}
      data-malik-loader-assets="grayscale-photo-sequence-v22"
    >
      <div className={`malik-photo-v22__heading${imageLoaded ? " is-ready" : ""}`}>
        <div className="malik-photo-v22__title-row">
          <span className="malik-photo-v22__spark" aria-hidden="true"><i /><b /></span>
          <span className="malik-photo-v22__title">{imageLoaded ? "Готово" : actuallyFailed ? "Генерация остановлена" : "Создаю изображение"}</span>
        </div>

        {!imageLoaded && !actuallyFailed ? (
          <div className="malik-photo-v22__steps" aria-live="polite">
            {steps.map((step, index) => (
              <div className={`malik-photo-v22__step${index === activeStep ? " is-active" : ""}${index < activeStep ? " is-done" : ""}`} key={step}>
                <span className="malik-photo-v22__step-mark" aria-hidden="true">{index === 0 ? "⌕" : index === 1 ? "✦" : "◷"}</span>
                <span>{step}</span>
              </div>
            ))}
            <div className="malik-photo-v22__timer"><span className="malik-photo-v22__pulse" aria-hidden="true" /><span>Генерация {seconds.toFixed(1)}s · {shownProgress}%</span></div>
          </div>
        ) : null}
      </div>

      {actuallyFailed ? (
        <div className="malik-photo-v22__failure" role="status">
          <strong>Генерация остановлена</strong>
          <span>{failureText}</span>
        </div>
      ) : (
        <div className={`malik-photo-v22__frame${imageLoaded ? " is-ready" : ""}`}>
          {!imageLoaded ? <canvas ref={canvasRef} className="malik-photo-v22__canvas" /> : null}
          {imageLoaded && resolvedResultUrl ? <img className="malik-photo-v22__result" src={resolvedResultUrl} alt="Сгенерированное изображение Malik AI" draggable={false} decoding="async" /> : null}
          {!imageLoaded ? <span className="malik-photo-v22__sweep" aria-hidden="true" /> : null}
        </div>
      )}

      {!actuallyFailed ? (
        <div className="malik-photo-v22__progress" aria-live="polite">
          <div className="malik-photo-v22__track" aria-hidden="true"><span style={{ width: `${shownProgress}%` }} /></div>
          <div className="malik-photo-v22__status">{imageLoaded ? `Готово за ${seconds} с` : shownStage}</div>
          {understood ? <div className="malik-photo-understood"><strong>Malik понял</strong><span>{understood}</span></div> : null}
        </div>
      ) : null}

      <style jsx global>{`
        .malik-photo-v22{width:min(100%,430px)!important;max-width:430px!important;margin:4px auto 0!important;padding:0!important;display:grid!important;gap:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#fff!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
        .malik-photo-v22__heading{display:grid!important;justify-items:center!important;gap:9px!important;width:100%!important;text-align:center!important}
        .malik-photo-v22__title-row{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:30px!important}
        .malik-photo-v22__spark{position:relative!important;width:16px!important;height:16px!important;flex:0 0 16px!important;color:#f5f5f6!important;opacity:.64!important;animation:malik-photo-v22-spark .92s ease-in-out infinite!important}
        .malik-photo-v22__spark:before,.malik-photo-v22__spark:after,.malik-photo-v22__spark i,.malik-photo-v22__spark b{content:""!important;position:absolute!important;left:50%!important;top:50%!important;border-radius:999px!important;background:currentColor!important;transform:translate(-50%,-50%)!important}.malik-photo-v22__spark:before{width:2px!important;height:16px!important}.malik-photo-v22__spark:after{width:16px!important;height:2px!important}.malik-photo-v22__spark i{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(45deg)!important}.malik-photo-v22__spark b{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(-45deg)!important}
        .malik-photo-v22__title{font-size:24px!important;font-weight:590!important;line-height:1.15!important;letter-spacing:-.025em!important;color:transparent!important;background:linear-gradient(90deg,#5d5e64 0%,#77787f 24%,#a8a9af 39%,#fff 50%,#a8a9af 61%,#77787f 76%,#5d5e64 100%)!important;background-size:220% 100%!important;background-position:-220% 50%!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;animation:malik-photo-v22-title .58s linear infinite!important;animation-play-state:running!important;will-change:background-position!important}
        .malik-photo-v22__heading.is-ready .malik-photo-v22__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important;animation:none!important}.malik-photo-v22__heading.is-ready .malik-photo-v22__spark{animation:none!important;opacity:.82!important}
        .malik-photo-v22__steps{display:grid!important;gap:6px!important;width:max-content!important;max-width:100%!important;text-align:left!important}
        .malik-photo-v22__step{display:flex!important;align-items:center!important;gap:8px!important;min-height:18px!important;color:#505158!important;font-size:12px!important;line-height:1.4!important;transition:color .18s ease,transform .18s ease!important}.malik-photo-v22__step.is-active{color:#d0d0d4!important;transform:translateX(1px)!important}.malik-photo-v22__step.is-done{color:#707078!important}
        .malik-photo-v22__step-mark{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;flex:0 0 13px!important;color:#66676e!important;font-size:11px!important}.malik-photo-v22__step.is-active .malik-photo-v22__step-mark{color:#f4f4f5!important}.malik-photo-v22__step.is-done .malik-photo-v22__step-mark{font-size:0!important}.malik-photo-v22__step.is-done .malik-photo-v22__step-mark:after{content:""!important;width:4px!important;height:4px!important;border-radius:50%!important;background:#66676e!important}
        .malik-photo-v22__timer{display:flex!important;align-items:center!important;gap:8px!important;margin-top:2px!important;color:#505158!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}.malik-photo-v22__pulse{width:5px!important;height:5px!important;border-radius:50%!important;background:#ededee!important;animation:malik-photo-v22-pulse 1.1s ease-out infinite!important}
        .malik-photo-v22__frame{position:relative!important;width:100%!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(255,255,255,.09)!important;background:#060607!important;box-shadow:18px 18px 0 -12px #080809,20px 20px 0 -11px rgba(255,255,255,.025)!important;isolation:isolate!important}
        .malik-photo-v22__canvas,.malik-photo-v22__result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;background:#060607!important;object-position:50% 50%!important}.malik-photo-v22__canvas{will-change:transform;transform:translateZ(0);filter:grayscale(1)!important}.malik-photo-v22__result{object-fit:contain!important;opacity:1!important;filter:none!important;animation:malik-photo-v22-result 180ms ease-out both!important}
        .malik-photo-v22__sweep{position:absolute!important;inset:-12% -24%!important;z-index:3!important;pointer-events:none!important;background:linear-gradient(112deg,transparent 45%,rgba(255,255,255,.008) 48%,rgba(255,255,255,.075) 50%,rgba(255,255,255,.008) 52%,transparent 55%)!important;transform:translateX(-120%)!important;mix-blend-mode:screen!important;animation:malik-photo-v22-sweep .58s linear infinite!important}
        .malik-photo-v22__progress{display:grid!important;gap:7px!important;width:100%!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.malik-photo-v22__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.075)!important}.malik-photo-v22__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#ededee!important;transition:width 240ms linear!important}
        .malik-photo-v22__status{min-height:15px!important;color:rgba(255,255,255,.5)!important;font-size:11px!important;line-height:1.35!important;text-align:center!important}.malik-photo-v22__failure{width:100%!important;min-height:104px!important;display:grid!important;place-content:center!important;gap:7px!important;padding:20px 22px!important;border-radius:18px!important;border:1px solid rgba(255,255,255,.08)!important;background:#070708!important;text-align:center!important}.malik-photo-v22__failure strong{font-size:13px!important;color:#f2f2f3!important}.malik-photo-v22__failure span{font-size:11px!important;line-height:1.5!important;color:rgba(255,255,255,.52)!important}
        #malik-root .malik-photo-v22 .malik-photo-understood{display:grid!important;gap:3px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;color:rgba(255,255,255,.72)!important;font-size:12px!important;line-height:1.5!important;text-align:left!important}#malik-root .malik-photo-v22 .malik-photo-understood strong{font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;text-transform:uppercase!important;color:rgba(255,255,255,.4)!important}
        #malik-root [data-malik-message='assistant']:has(.malik-photo-v22[data-malik-image-ready='0']) .malik-message-actions{display:none!important}
        @keyframes malik-photo-v22-title{0%{background-position:-220% 50%}100%{background-position:220% 50%}}@keyframes malik-photo-v22-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}@keyframes malik-photo-v22-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.15)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-photo-v22-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}@keyframes malik-photo-v22-result{from{opacity:.78}to{opacity:1}}
        @media(max-width:640px){.malik-photo-v22{width:min(100%,390px)!important;max-width:390px!important;gap:10px!important;margin-left:auto!important;margin-right:auto!important}.malik-photo-v22__title-row{transform:translateX(-10px)!important}.malik-photo-v22__title{font-size:21px!important}.malik-photo-v22__frame{border-radius:24px!important;box-shadow:12px 12px 0 -8px #080809,14px 14px 0 -7px rgba(255,255,255,.02)!important}.malik-photo-v22__canvas,.malik-photo-v22__result{border-radius:23px!important}.malik-photo-v22__failure{min-height:92px!important}}
        @media(prefers-reduced-motion:reduce){.malik-photo-v22__title,.malik-photo-v22__spark,.malik-photo-v22__pulse,.malik-photo-v22__sweep,.malik-photo-v22__result{animation:none!important}.malik-photo-v22__track>span{transition:none!important}.malik-photo-v22__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important}}
      `}</style>
    </section>
  )
}

export default ImageGenerationMotion
