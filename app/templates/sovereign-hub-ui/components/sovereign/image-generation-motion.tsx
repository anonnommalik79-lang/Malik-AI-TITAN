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

const DEMOS = [
  "https://images-assets.nasa.gov/image/PIA15985/PIA15985~large.jpg",
  "https://images-assets.nasa.gov/image/PIA10957/PIA10957~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04222/PIA04222~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04628/PIA04628~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04230/PIA04230~large.jpg",
  "https://images-assets.nasa.gov/image/PIA04921/PIA04921~large.jpg",
  "https://images-assets.nasa.gov/image/PIA21923/PIA21923~large.jpg",
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
  if (status === "thinking") return "Строю свет и форму"
  if (status === "generating") return "Строю свет и форму"
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
    let demos: HTMLImageElement[] = []
    let preparedIndex = -1
    let animationStartedAt = performance.now()
    let lastFrameAt = 0

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

    const setCanvasSize = (element: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
      element.width = Math.max(1, Math.round(width * dpr))
      element.height = Math.max(1, Math.round(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
    }

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      const mobileCap = window.innerWidth <= 640 ? 1.25 : 1.5
      dpr = Math.min(window.devicePixelRatio || 1, mobileCap)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      setCanvasSize(currentSurface, currentCtx)
      setCanvasSize(nextSurface, nextCtx)
      setCanvasSize(softSurface, softCtx)
      setCanvasSize(maskSurface, maskCtx)
      setCanvasSize(transitionSurface, transitionCtx)
      preparedIndex = -1
    }

    const drawCover = (c: CanvasRenderingContext2D, img: HTMLImageElement) => {
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight)
      const drawWidth = img.naturalWidth * scale
      const drawHeight = img.naturalHeight * scale
      c.drawImage(img, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
    }

    const prepareSurface = (c: CanvasRenderingContext2D, img: HTMLImageElement, filter = "none") => {
      c.save()
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, width, height)
      c.fillStyle = "#070708"
      c.fillRect(0, 0, width, height)
      c.filter = filter
      drawCover(c, img)
      c.restore()
    }

    const preparePair = (index: number) => {
      if (!demos.length || preparedIndex === index) return
      const current = demos[index % demos.length]
      const next = demos[(index + 1) % demos.length]
      prepareSurface(currentCtx, current, "saturate(1.05) contrast(1.05) brightness(.86)")
      prepareSurface(nextCtx, next, "saturate(1.05) contrast(1.06) brightness(.9)")
      prepareSurface(softCtx, next, "grayscale(1) contrast(.78) brightness(.62)")
      preparedIndex = index
    }

    const renderMask = (progressValue: number) => {
      maskCtx.save()
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      maskCtx.clearRect(0, 0, width, height)
      const rows = 7
      const rowHeight = height / rows + 3
      const edge = Math.max(20, Math.min(46, width * .1))

      for (let row = 0; row < rows; row++) {
        const delay = row * .045
        const amount = smooth((progressValue - delay) / .48)
        if (amount <= 0) continue
        const y = row * (height / rows) - 2
        const frontier = width * amount
        const leftToRight = row % 2 === 0

        if (leftToRight) {
          const solidEnd = Math.max(0, frontier - edge)
          maskCtx.fillStyle = "#fff"
          maskCtx.fillRect(0, y, solidEnd, rowHeight)
          const gradient = maskCtx.createLinearGradient(solidEnd, 0, Math.min(width, frontier + edge), 0)
          gradient.addColorStop(0, "rgba(255,255,255,1)")
          gradient.addColorStop(1, "rgba(255,255,255,0)")
          maskCtx.fillStyle = gradient
          maskCtx.fillRect(solidEnd, y, Math.max(0, frontier + edge - solidEnd), rowHeight)
        } else {
          const solidStart = Math.min(width, width - frontier + edge)
          maskCtx.fillStyle = "#fff"
          maskCtx.fillRect(solidStart, y, width - solidStart, rowHeight)
          const gradientStart = Math.max(0, width - frontier - edge)
          const gradient = maskCtx.createLinearGradient(gradientStart, 0, solidStart, 0)
          gradient.addColorStop(0, "rgba(255,255,255,0)")
          gradient.addColorStop(1, "rgba(255,255,255,1)")
          maskCtx.fillStyle = gradient
          maskCtx.fillRect(gradientStart, y, Math.max(0, solidStart - gradientStart), rowHeight)
        }
      }
      maskCtx.restore()
    }

    const drawMasked = (surface: HTMLCanvasElement, alpha: number) => {
      transitionCtx.save()
      transitionCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      transitionCtx.clearRect(0, 0, width, height)
      transitionCtx.globalAlpha = 1
      transitionCtx.globalCompositeOperation = "source-over"
      transitionCtx.drawImage(surface, 0, 0, width, height)
      transitionCtx.globalCompositeOperation = "destination-in"
      transitionCtx.drawImage(maskSurface, 0, 0, width, height)
      transitionCtx.restore()

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.drawImage(transitionSurface, 0, 0, width, height)
      ctx.restore()
    }

    const render = (now: number) => {
      if (disposed) return
      if (now - lastFrameAt < 32) {
        requestAnimationFrame(render)
        return
      }
      lastFrameAt = now

      if (!demos.length) {
        requestAnimationFrame(render)
        return
      }

      const cycleMs = 720
      const holdMs = 150
      const elapsed = Math.max(0, now - animationStartedAt)
      const cycleNumber = Math.floor(elapsed / cycleMs)
      const index = cycleNumber % demos.length
      const withinCycle = elapsed % cycleMs
      preparePair(index)

      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = "#070708"
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(currentSurface, 0, 0, width, height)

      if (withinCycle > holdMs) {
        const p = smooth((withinCycle - holdMs) / (cycleMs - holdMs))
        renderMask(p)
        drawMasked(softSurface, .54)
        const photoAlpha = smooth((p - .13) / .66)
        if (photoAlpha > 0) drawMasked(nextSurface, .94 * photoAlpha)
        const settle = smooth((p - .76) / .24)
        if (settle > 0) {
          ctx.globalAlpha = settle
          ctx.drawImage(nextSurface, 0, 0, width, height)
          ctx.globalAlpha = 1
        }
      }
      ctx.restore()
      requestAnimationFrame(render)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement || canvas)
    resize()

    Promise.allSettled(DEMOS.map((src) => loadImage(src)))
      .then((results) => {
        if (disposed) return
        demos = results
          .filter((result): result is PromiseFulfilledResult<HTMLImageElement> => result.status === "fulfilled")
          .map((result) => result.value)
        if (!demos.length) {
          setAssetError("Не удалось загрузить анимацию генерации изображения.")
          return
        }
        setAssetError("")
        animationStartedAt = performance.now()
        preparedIndex = -1
        requestAnimationFrame(render)
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
    <section className="malik-photo-v20" data-malik-image-motion="1" data-malik-image-ready={imageLoaded ? "1" : "0"} data-malik-loader-assets="nasa-paint-sequence-v20">
      <div className={`malik-photo-v20__heading${imageLoaded ? " is-ready" : ""}`}>
        <div className="malik-photo-v20__title-row">
          <span className="malik-photo-v20__spark" aria-hidden="true"><i /><b /></span>
          <span className="malik-photo-v20__title">{imageLoaded ? "Готово" : "Создаю изображение"}</span>
        </div>

        {!imageLoaded && !actuallyFailed ? (
          <div className="malik-photo-v20__steps" aria-live="polite">
            {steps.map((step, index) => (
              <div className={`malik-photo-v20__step${index === activeStep ? " is-active" : ""}${index < activeStep ? " is-done" : ""}`} key={step}>
                <span className="malik-photo-v20__step-mark" aria-hidden="true">{index === 0 ? "⌕" : index === 1 ? "✦" : "◷"}</span>
                <span>{step}</span>
              </div>
            ))}
            <div className="malik-photo-v20__timer"><span className="malik-photo-v20__pulse" aria-hidden="true" /><span>Генерация {seconds.toFixed(1)}s · {shownProgress}%</span></div>
          </div>
        ) : null}
      </div>

      <div className={`malik-photo-v20__frame${imageLoaded ? " is-ready" : ""}`}>
        {!actuallyFailed && !imageLoaded ? <canvas ref={canvasRef} className="malik-photo-v20__canvas" /> : null}
        {imageLoaded && resolvedResultUrl ? <img className="malik-photo-v20__result" src={resolvedResultUrl} alt="Сгенерированное изображение Malik AI" draggable={false} decoding="async" /> : null}
        {!actuallyFailed && !imageLoaded ? <span className="malik-photo-v20__sweep" aria-hidden="true" /> : null}
        {actuallyFailed ? <div className="malik-photo-v20__failure"><strong>Генерация остановлена</strong><span>{failureText}</span></div> : null}
      </div>

      <div className="malik-photo-v20__progress" aria-live="polite">
        <div className="malik-photo-v20__track" aria-hidden="true"><span style={{ width: `${shownProgress}%` }} /></div>
        <div className="malik-photo-v20__status">{imageLoaded ? `Готово за ${seconds} с` : actuallyFailed ? failureText : shownStage}</div>
        {understood && !actuallyFailed ? <div className="malik-photo-understood"><strong>Malik понял</strong><span>{understood}</span></div> : null}
      </div>

      <style jsx global>{`
        .malik-photo-v20{width:min(100%,430px)!important;max-width:430px!important;margin:4px auto 0!important;padding:0!important;display:grid!important;gap:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#fff!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
        .malik-photo-v20__heading{display:grid;justify-items:center;gap:9px;width:100%!important;text-align:center!important}
        .malik-photo-v20__title-row{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:30px!important}
        .malik-photo-v20__spark{position:relative!important;width:16px!important;height:16px!important;flex:0 0 16px!important;color:#f5f5f6!important;opacity:.64!important;animation:malik-photo-v20-spark 1.05s ease-in-out infinite!important}
        .malik-photo-v20__spark:before,.malik-photo-v20__spark:after,.malik-photo-v20__spark i,.malik-photo-v20__spark b{content:""!important;position:absolute!important;left:50%!important;top:50%!important;border-radius:999px!important;background:currentColor!important;transform:translate(-50%,-50%)!important}.malik-photo-v20__spark:before{width:2px!important;height:16px!important}.malik-photo-v20__spark:after{width:16px!important;height:2px!important}.malik-photo-v20__spark i{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(45deg)!important}.malik-photo-v20__spark b{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(-45deg)!important}
        .malik-photo-v20__title{font-size:24px!important;font-weight:590!important;line-height:1.15!important;letter-spacing:-.025em!important;color:transparent!important;background:linear-gradient(90deg,#626269 0%,#7d7e85 25%,#9a9aa2 39%,#fff 50%,#9a9aa2 61%,#7d7e85 75%,#626269 100%)!important;background-size:190% 100%!important;background-position:-190% 50%!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;animation:malik-photo-v20-title .66s linear infinite!important}
        .malik-photo-v20__heading.is-ready .malik-photo-v20__title{color:#d9d9dd!important;background:none!important;-webkit-text-fill-color:currentColor!important;animation:none!important}.malik-photo-v20__heading.is-ready .malik-photo-v20__spark{animation:none!important;opacity:.82!important}
        .malik-photo-v20__steps{display:grid!important;gap:6px!important;width:max-content!important;max-width:100%!important;text-align:left!important}
        .malik-photo-v20__step{display:flex!important;align-items:center!important;gap:8px!important;min-height:18px!important;color:#505158!important;font-size:12px!important;line-height:1.4!important;transition:color .18s ease,transform .18s ease!important}.malik-photo-v20__step.is-active{color:#c9c9ce!important;transform:translateX(1px)!important}.malik-photo-v20__step.is-done{color:#707078!important}
        .malik-photo-v20__step-mark{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;flex:0 0 13px!important;color:#66676e!important;font-size:11px!important}.malik-photo-v20__step.is-active .malik-photo-v20__step-mark{color:#f0f0f2!important}.malik-photo-v20__step.is-done .malik-photo-v20__step-mark{font-size:0!important}.malik-photo-v20__step.is-done .malik-photo-v20__step-mark:after{content:""!important;width:4px!important;height:4px!important;border-radius:50%!important;background:#66676e!important}
        .malik-photo-v20__timer{display:flex!important;align-items:center!important;gap:8px!important;margin-top:2px!important;color:#505158!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}.malik-photo-v20__pulse{width:5px!important;height:5px!important;border-radius:50%!important;background:#ededee!important;animation:malik-photo-v20-pulse 1.1s ease-out infinite!important}
        .malik-photo-v20__frame{position:relative!important;width:100%!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(255,255,255,.09)!important;background:#070708!important;box-shadow:18px 18px 0 -12px #080809,20px 20px 0 -11px rgba(255,255,255,.025)!important;isolation:isolate!important}
        .malik-photo-v20__canvas,.malik-photo-v20__result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;background:#070708!important;object-position:50% 50%!important}.malik-photo-v20__canvas{will-change:transform;transform:translateZ(0)}.malik-photo-v20__result{object-fit:contain!important;opacity:1!important;filter:none!important;animation:malik-photo-v20-result 180ms ease-out both!important}
        .malik-photo-v20__sweep{position:absolute!important;inset:-12% -24%!important;z-index:3!important;pointer-events:none!important;background:linear-gradient(112deg,transparent 44%,rgba(255,255,255,.008) 48%,rgba(255,255,255,.075) 50%,rgba(255,255,255,.008) 52%,transparent 56%)!important;transform:translateX(-120%)!important;mix-blend-mode:screen!important;animation:malik-photo-v20-sweep .58s linear infinite!important}
        .malik-photo-v20__progress{display:grid!important;gap:7px!important;width:100%!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.malik-photo-v20__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.075)!important}.malik-photo-v20__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#e7e7e9!important;transition:width 240ms linear!important}
        .malik-photo-v20__status{min-height:15px!important;color:rgba(255,255,255,.5)!important;font-size:11px!important;line-height:1.35!important;text-align:center!important}.malik-photo-v20__failure{position:absolute!important;inset:0!important;display:grid!important;place-content:center!important;gap:8px!important;padding:28px!important;text-align:center!important;background:#070708!important;color:#fff!important}.malik-photo-v20__failure span{max-width:360px!important;font-size:12px!important;line-height:1.55!important;color:rgba(255,255,255,.58)!important}
        #malik-root .malik-photo-v20 .malik-photo-understood{display:grid!important;gap:3px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;color:rgba(255,255,255,.72)!important;font-size:12px!important;line-height:1.5!important;text-align:left!important}#malik-root .malik-photo-v20 .malik-photo-understood strong{font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;text-transform:uppercase!important;color:rgba(255,255,255,.4)!important}
        @keyframes malik-photo-v20-title{0%{background-position:-190% 50%}100%{background-position:190% 50%}}@keyframes malik-photo-v20-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}@keyframes malik-photo-v20-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.15)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-photo-v20-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}@keyframes malik-photo-v20-result{from{opacity:.78}to{opacity:1}}
        @media(max-width:640px){.malik-photo-v20{width:min(100%,390px)!important;max-width:390px!important;gap:10px!important;margin-left:auto!important;margin-right:auto!important}.malik-photo-v20__title-row{transform:translateX(-10px)!important}.malik-photo-v20__title{font-size:21px!important}.malik-photo-v20__frame{border-radius:24px!important;box-shadow:12px 12px 0 -8px #080809,14px 14px 0 -7px rgba(255,255,255,.02)!important}.malik-photo-v20__canvas,.malik-photo-v20__result{border-radius:23px!important}.malik-photo-v20__steps{font-size:12px!important}}
        @media(prefers-reduced-motion:reduce){.malik-photo-v20__title,.malik-photo-v20__spark,.malik-photo-v20__pulse,.malik-photo-v20__sweep,.malik-photo-v20__result{animation:none!important}.malik-photo-v20__track>span{transition:none!important}.malik-photo-v20__title{color:#d9d9dd!important;background:none!important;-webkit-text-fill-color:currentColor!important}}
      `}</style>
    </section>
  )
}

export default ImageGenerationMotion
