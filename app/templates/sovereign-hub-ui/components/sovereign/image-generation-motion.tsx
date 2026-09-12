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
  "/images/titan-hero.jpg",
  "/images/earth-candidate-1.jpg",
  "/images/earth-candidate-3.jpg",
  "/images/welcome-earth-orbit.jpg",
  "/images/auth-mobile-dragon-bg.jpg",
  "/images/malik-chat-legend-space.png",
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
    const timer = window.setTimeout(() => reject(new Error("image timeout")), timeout)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error("image failed"))
    }
    image.src = src
  })
}

function stageFor(status?: Status) {
  if (status === "queued") return "Генерирую варианты"
  if (status === "thinking" || status === "generating") return "Строю свет и форму"
  if (status === "rendering" || status === "ready") return "Проявляю финальный кадр"
  if (status === "failed") return "Генерация остановлена"
  return "Генерирую варианты"
}

function progressFor(status: Status | undefined, phaseSeconds: number) {
  const ranges: Record<Status, [number, number, number]> = {
    queued: [5, 14, 7],
    thinking: [14, 30, 10],
    generating: [30, 76, 40],
    rendering: [76, 96, 22],
    ready: [96, 99, 5],
    failed: [100, 100, 1],
  }
  const [from, to, seconds] = ranges[status || "queued"]
  return Math.round(from + (to - from) * clamp(phaseSeconds / seconds, 0, 1))
}

export function ImageGenerationMotion({
  resultUrl,
  fallbackUrl,
  status,
  startedAt,
  understood,
  failed,
  error,
  progress,
}: ImageGenerationMotionProps) {
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
    const parsed = Date.parse(startedAt || "")
    const started = Number.isFinite(parsed) ? parsed : Date.now()
    const tick = () => {
      const now = Date.now()
      const elapsed = now - started
      setSeconds(Math.max(0, Math.round(elapsed / 100) / 10))
      setPhaseSeconds(Math.max(0, Math.round((now - phaseStartedAtRef.current) / 100) / 10))
      if (!imageLoaded && !actuallyFailed && elapsed >= GENERATION_WATCHDOG_MS) setTimedOut(true)
    }
    tick()
    if (imageLoaded || actuallyFailed) return
    const timer = window.setInterval(tick, 100)
    return () => window.clearInterval(timer)
  }, [startedAt, imageLoaded, actuallyFailed])

  useEffect(() => {
    if (!missingReadyResult) {
      setReadyWithoutResult(false)
      return
    }
    const timer = window.setTimeout(() => setReadyWithoutResult(true), READY_RESULT_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [missingReadyResult])

  useEffect(() => {
    let cancelled = false
    const candidate = resultUrl || fallbackUrl || ""
    if (!candidate) {
      setResolvedResultUrl("")
      setImageLoaded(false)
      return
    }

    resolveGeneratedImageUrl(candidate)
      .then((url) => {
        if (cancelled) return
        setResolvedResultUrl(url)
        setAssetError("")
      })
      .catch(() => {
        if (!cancelled && fallbackUrl && fallbackUrl !== candidate) setResolvedResultUrl(fallbackUrl)
        else if (!cancelled) setAssetError("Сохранённое изображение недоступно.")
      })

    return () => {
      cancelled = true
    }
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

    return () => {
      cancelled = true
    }
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
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })
    if (!ctx) return

    let disposed = false
    let frames: HTMLImageElement[] = []
    let width = 1
    let height = 1
    let dpr = 1
    let lastFrameAt = 0
    let animationStartedAt = performance.now()

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth <= 640 ? 1.25 : 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
    }

    const drawCover = (image: HTMLImageElement, filter: string, alpha = 1) => {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.filter = filter
      ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      ctx.restore()
    }

    const render = (now: number) => {
      if (disposed) return
      if (now - lastFrameAt < 32) {
        requestAnimationFrame(render)
        return
      }
      lastFrameAt = now

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      if (!frames.length) {
        ctx.restore()
        requestAnimationFrame(render)
        return
      }

      const elapsed = Math.max(0, now - animationStartedAt)
      const cycleMs = 560
      const holdMs = 90
      const cycleNumber = Math.floor(elapsed / cycleMs)
      const currentIndex = cycleNumber % frames.length
      const nextIndex = (currentIndex + 1) % frames.length
      const withinCycle = elapsed % cycleMs

      const current = frames[currentIndex]
      const next = frames[nextIndex]
      drawCover(current, "grayscale(1) contrast(1.22) brightness(.72)")

      if (withinCycle > holdMs) {
        const p = smooth((withinCycle - holdMs) / (cycleMs - holdMs))
        const rows = 7
        const rowHeight = height / rows + 12

        for (let row = 0; row < rows; row += 1) {
          const delay = row * .05
          const amount = smooth((p - delay) / .46)
          if (amount <= 0) continue

          const y = row * (height / rows) - 6
          const span = width * (.26 + amount * .98)
          const x = row % 2 === 0 ? -width * .18 : width - span + width * .18

          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x, y, span, rowHeight, Math.min(34, rowHeight * .42))
          ctx.clip()
          drawCover(next, "grayscale(1) contrast(1.25) brightness(.78)", .98)
          ctx.restore()
        }
      }

      const sweepX = ((elapsed / 1000 * 1.9) % 1.45) * width * 1.45 - width * .24
      const shimmer = ctx.createLinearGradient(sweepX - 34, 0, sweepX + 34, 0)
      shimmer.addColorStop(0, "rgba(255,255,255,0)")
      shimmer.addColorStop(.5, "rgba(255,255,255,.07)")
      shimmer.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = shimmer
      ctx.fillRect(sweepX - 34, 0, 68, height)

      ctx.restore()
      requestAnimationFrame(render)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement || canvas)
    resize()

    Promise.allSettled(PREVIEW_FRAMES.map((src) => loadImage(src))).then((results) => {
      if (disposed) return
      frames = results
        .filter((result): result is PromiseFulfilledResult<HTMLImageElement> => result.status === "fulfilled")
        .map((result) => result.value)
      animationStartedAt = performance.now()
    })

    requestAnimationFrame(render)

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
      className="malik-photo-final"
      data-malik-image-motion="1"
      data-malik-image-state={actuallyFailed ? "failed" : imageLoaded ? "ready" : "generating"}
    >
      <div className={`malik-photo-final__heading${imageLoaded ? " is-ready" : ""}`}>
        <div className="malik-photo-final__title-row">
          <span className="malik-photo-final__spark" aria-hidden="true"><i /><b /></span>
          <span className="malik-photo-final__title">
            {imageLoaded ? "Готово" : actuallyFailed ? "Генерация остановлена" : "Создаю изображение"}
          </span>
        </div>

        {!imageLoaded && !actuallyFailed ? (
          <div className="malik-photo-final__steps" aria-live="polite">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`malik-photo-final__step${index === activeStep ? " is-active" : ""}${index < activeStep ? " is-done" : ""}`}
              >
                <span className="malik-photo-final__mark" aria-hidden="true">{index === 0 ? "⌕" : index === 1 ? "✦" : "◷"}</span>
                <span>{step}</span>
              </div>
            ))}
            <div className="malik-photo-final__timer">
              <span className="malik-photo-final__pulse" />
              <span>Генерация {seconds.toFixed(1)}s · {shownProgress}%</span>
            </div>
          </div>
        ) : null}
      </div>

      {actuallyFailed ? (
        <div className="malik-photo-final__failure" role="status">
          <strong>Генерация остановлена</strong>
          <span>{failureText}</span>
        </div>
      ) : (
        <div className="malik-photo-final__frame">
          {!imageLoaded ? (
            <>
              <img className="malik-photo-final__backdrop" src={PREVIEW_FRAMES[0]} alt="" aria-hidden="true" />
              <canvas ref={canvasRef} className="malik-photo-final__canvas" />
              <span className="malik-photo-final__sweep" />
            </>
          ) : null}

          {imageLoaded && resolvedResultUrl ? (
            <img
              className="malik-photo-final__result"
              src={resolvedResultUrl}
              alt="Сгенерированное изображение Malik AI"
              draggable={false}
              decoding="async"
            />
          ) : null}
        </div>
      )}

      {!actuallyFailed ? (
        <div className="malik-photo-final__progress">
          <div className="malik-photo-final__track"><span style={{ width: `${shownProgress}%` }} /></div>
          <div className="malik-photo-final__status">{imageLoaded ? `Готово за ${seconds.toFixed(1)} с` : shownStage}</div>
          {understood ? <div className="malik-photo-understood"><strong>Malik понял</strong><span>{understood}</span></div> : null}
        </div>
      ) : null}

      <style jsx global>{`
        .malik-photo-final{width:min(100%,430px)!important;max-width:430px!important;margin:4px auto 0!important;padding:0!important;display:grid!important;gap:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#fff!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
        .malik-photo-final__heading{display:grid!important;justify-items:center!important;gap:9px!important;width:100%!important;text-align:center!important}
        .malik-photo-final__title-row{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:30px!important}
        .malik-photo-final__spark{position:relative!important;width:16px!important;height:16px!important;flex:0 0 16px!important;color:#f5f5f6!important;opacity:.64!important;animation:malik-photo-final-spark .92s ease-in-out infinite!important}
        .malik-photo-final__spark:before,.malik-photo-final__spark:after,.malik-photo-final__spark i,.malik-photo-final__spark b{content:""!important;position:absolute!important;left:50%!important;top:50%!important;border-radius:999px!important;background:currentColor!important;transform:translate(-50%,-50%)!important}
        .malik-photo-final__spark:before{width:2px!important;height:16px!important}.malik-photo-final__spark:after{width:16px!important;height:2px!important}.malik-photo-final__spark i{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(45deg)!important}.malik-photo-final__spark b{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(-45deg)!important}
        .malik-photo-final__title{font-size:24px!important;font-weight:590!important;line-height:1.15!important;letter-spacing:-.025em!important;color:transparent!important;background:linear-gradient(90deg,#5d5e64 0%,#77787f 24%,#a8a9af 39%,#fff 50%,#a8a9af 61%,#77787f 76%,#5d5e64 100%)!important;background-size:220% 100%!important;background-position:-220% 50%!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;animation:malik-photo-final-title .58s linear infinite!important;will-change:background-position!important}
        .malik-photo-final__heading.is-ready .malik-photo-final__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important;animation:none!important}
        .malik-photo-final__steps{display:grid!important;gap:6px!important;width:max-content!important;max-width:100%!important;text-align:left!important}
        .malik-photo-final__step{display:flex!important;align-items:center!important;gap:8px!important;min-height:18px!important;color:#505158!important;font-size:12px!important;line-height:1.4!important}.malik-photo-final__step.is-active{color:#d0d0d4!important}.malik-photo-final__step.is-done{color:#707078!important}
        .malik-photo-final__mark{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;flex:0 0 13px!important;color:#66676e!important;font-size:11px!important}.malik-photo-final__step.is-active .malik-photo-final__mark{color:#f4f4f5!important}
        .malik-photo-final__timer{display:flex!important;align-items:center!important;gap:8px!important;margin-top:2px!important;color:#505158!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}.malik-photo-final__pulse{width:5px!important;height:5px!important;border-radius:50%!important;background:#ededee!important;animation:malik-photo-final-pulse 1.1s ease-out infinite!important}
        .malik-photo-final__frame{position:relative!important;width:100%!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(255,255,255,.09)!important;background:#050506!important;box-shadow:18px 18px 0 -12px #080809,20px 20px 0 -11px rgba(255,255,255,.025)!important;isolation:isolate!important}
        .malik-photo-final__backdrop,.malik-photo-final__canvas,.malik-photo-final__result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;object-position:50% 50%!important}
        .malik-photo-final__backdrop{z-index:0!important;object-fit:cover!important;filter:grayscale(1) contrast(1.22) brightness(.72)!important}.malik-photo-final__canvas{z-index:1!important;background:transparent!important;transform:translateZ(0)!important;will-change:transform!important}.malik-photo-final__result{z-index:2!important;object-fit:contain!important;background:#050506!important;animation:malik-photo-final-result 180ms ease-out both!important}
        .malik-photo-final__sweep{position:absolute!important;inset:-12% -24%!important;z-index:3!important;pointer-events:none!important;background:linear-gradient(112deg,transparent 45%,rgba(255,255,255,.008) 48%,rgba(255,255,255,.075) 50%,rgba(255,255,255,.008) 52%,transparent 55%)!important;transform:translateX(-120%)!important;mix-blend-mode:screen!important;animation:malik-photo-final-sweep .58s linear infinite!important}
        .malik-photo-final__progress{display:grid!important;gap:7px!important;width:100%!important}.malik-photo-final__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.075)!important}.malik-photo-final__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#ededee!important;transition:width 180ms linear!important}.malik-photo-final__status{min-height:15px!important;color:#66676e!important;font-size:10px!important;line-height:1.4!important;text-align:center!important}
        .malik-photo-understood{margin-top:3px!important;display:grid!important;gap:4px!important;color:#9a9ba1!important;font-size:11px!important;line-height:1.45!important;text-align:left!important}.malik-photo-understood strong{color:#676870!important;font-size:9px!important;letter-spacing:.08em!important;text-transform:uppercase!important}
        .malik-photo-final__failure{width:100%!important;min-height:120px!important;padding:22px!important;display:grid!important;place-items:center!important;align-content:center!important;gap:8px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:22px!important;background:#060607!important;color:#dddde1!important;text-align:center!important}.malik-photo-final__failure strong{font-size:13px!important;color:#f3f3f4!important}.malik-photo-final__failure span{max-width:330px!important;color:#777880!important;font-size:11px!important;line-height:1.45!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="generating"]) .malik-message-actions,.malik-message-row:has(.malik-photo-final[data-malik-image-state="failed"]) .malik-message-actions{display:none!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="ready"]) .malik-message-actions{display:flex!important;align-items:center!important;gap:8px!important;min-height:30px!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="ready"]) .malik-message-actions>button{width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;padding:0!important;display:grid!important;place-items:center!important;border-radius:8px!important;line-height:1!important}
        @keyframes malik-photo-final-title{0%{background-position:-220% 50%}100%{background-position:220% 50%}}@keyframes malik-photo-final-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}@keyframes malik-photo-final-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.16)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-photo-final-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}@keyframes malik-photo-final-result{from{opacity:0;transform:scale(1.012);filter:blur(3px)}to{opacity:1;transform:scale(1);filter:blur(0)}}
        @media(max-width:640px){.malik-photo-final{width:min(92vw,390px)!important;max-width:390px!important;gap:11px!important;margin-left:auto!important;margin-right:auto!important}.malik-photo-final__title-row{gap:8px!important;transform:translateX(-10px)!important}.malik-photo-final__title{font-size:22px!important}.malik-photo-final__steps{width:min(100%,286px)!important}.malik-photo-final__frame{border-radius:24px!important;box-shadow:12px 12px 0 -8px #080809,14px 14px 0 -7px rgba(255,255,255,.025)!important}.malik-photo-final__backdrop,.malik-photo-final__canvas,.malik-photo-final__result{border-radius:23px!important}}
      `}</style>
    </section>
  )
}
