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

// These are bundled, grayscale photo frames. No external URL is required,
// so the loader never falls back to an empty procedural rectangle field.
const PREVIEW_FRAMES = [
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgwKCA0MCwwPDg0QFCIWFBISFCkdHxgiMSszMjArLy42PE1CNjlJOi4vQ1xESVBSV1dXNEFfZl5UZU1VV1P/2wBDAQ4PDxQSFCcWFidTNy83U1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1P/wAARCADcANwDASIAAhEBAxEB/8QAGgABAQEBAQEBAAAAAAAAAAAAAAECBAMGBf/EAC4QAQACAgAFAgUDBAMAAAAAAAABEQIDBBMUUZEFEiExQVJhBiJiMkJxoSOB4f/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwD5ey0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0AWy0ASy2QGrLZAastkBqy2QGrLZAastkBqy2QGrLZAastkBqy2QGrLZAastkBqy2QGrLZAQZssGhmywaGbLBoZssGhmywaGbLBoZssGhmywaGbLBoZssGhmywaGbLBoZssGhmywQSywUSywUSywUSywUSywUSywUSywUSywUSywUSywUSywUSywUSywUSywZEssFEssFEssFEssFEssFEssFEssFEssFEssFEssFEssFEssFEssEHhhxGGXz/AGz+XrYNCAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAPzWsc8sP6ZpkB04cTH98V+Ya6nX/Lw5AHX1Ovvl4Op198vDkpAdnU6++Xg6nX3y8OMB2dTr75eDqdffLw4wHZ1Ovvl4Op198vDjAdnU6++Xg6nX3y8OMB2dTr75eDqdffLw5p07I1RsnGfZP1YB2dTr75eDqdffLw4wHZ1Ovvl4Op198vDy4SdOO6+IiZwr6PLZ7Z2Zez4Y38AdXU6++Xg6nX3y8OMB2dTr75eDqdffLw4wHZ1Ovvl4Op198vDjXGPdlEXVyDr6nX3y8HU6++Xh7+p+ma+D4bVsw2+6cvnD8wFAAAASVJBAAAAAABrXlGOcTlFx2TOYyzmYion6A9J4jZOiNM5fsj6PIAAAB6cPq52/DX7ox901c/R6cfwvR8TOqM4zr6wDnAAAB3Z7uGngIwjH/l/w4QBcs8soiMspmI+VygAoAAAAAILU9pPbl9s+AQa9mX2ycvP7QZG+Vn2OVn+PIMD6b9I/pjV616jGrjuJnh9HsnKPZMe7Oe0X5/6dfon6d9Fz/VfHcB6j6hjlwuiJjTnGyMI2z+cvx+PnQPjh3eo8Jo0+pcTq4PfzuGw2ZY6tkx/Vjfwlzcn+X+geQ9uTH3HJjvIPEmZmbmbl78nH8nKw/PkHgOjlYdv9k6sK+QOcJiYmYkAAAABQAAdPCa9WcZTsn5fQHNUkTU3Dv43jde7h8NGvTGMYf3d3ADpxy92NwrluYj4TMJc95B1pcd4coDq92P3R5TmYfdDmAd3XZRp5Xv/AGf4eHNwr/x4Na4xnOIymoB687H8pzo7S89kYxnMYTcMg9ef/H/Zzp+2HkA9Odl2g5uc9nmA9tvO1ZRGce2Zi/k8+Zn9xnnlnN55TM/L4sgTMzNzNgAAAAAoAAAAACKgAAAAAAOzRwUbeEy2znUx9HGsZ5RjMRlMRP0QBZxmIuYmkeue6c8IxoHkAAAAAAAAACgAAAAAJKpIAAAAAAAAAAAAAAAAAAAAKAAAAAASAIAAAAAAAAAAAAAAAAAAACgAAAAAAAgSAAAAAAAAAAAAAAAAAAA//9k=",
] as const

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const smooth = (value: number) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x) }

function loadImage(src: string, timeout = 10_000) {
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
    queued: [5, 12, 8], thinking: [12, 28, 10], generating: [28, 76, 42], rendering: [76, 96, 24], ready: [96, 99, 6], failed: [100, 100, 1],
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

  if (lastStatusRef.current !== status) { lastStatusRef.current = status; phaseStartedAtRef.current = Date.now() }
  const missingReadyResult = status === "ready" && !resultUrl && !fallbackUrl
  const actuallyFailed = Boolean(failed || status === "failed" || timedOut || readyWithoutResult)

  useEffect(() => {
    const start = Number.isFinite(Date.parse(startedAt || "")) ? Date.parse(startedAt || "") : Date.now()
    const tick = () => {
      const now = Date.now(); const elapsed = now - start
      setSeconds(Math.max(0, Math.floor(elapsed / 1000)))
      setPhaseSeconds(Math.max(0, Math.floor((now - phaseStartedAtRef.current) / 1000)))
      if (!imageLoaded && !actuallyFailed && elapsed >= GENERATION_WATCHDOG_MS) setTimedOut(true)
    }
    tick(); if (imageLoaded || actuallyFailed) return
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
      .catch(() => { if (!cancelled && fallbackUrl && fallbackUrl !== candidate) setResolvedResultUrl(fallbackUrl); else if (!cancelled) setAssetError("Сохранённое изображение недоступно.") })
    return () => { cancelled = true }
  }, [resultUrl, fallbackUrl])

  useEffect(() => {
    if (!resolvedResultUrl || imageLoaded || actuallyFailed) return
    let cancelled = false
    loadImage(resolvedResultUrl, 25_000)
      .then(() => { if (!cancelled) { setAssetError(""); setImageLoaded(true); void cacheGeneratedImageByUrl(resolvedResultUrl) } })
      .catch(async () => {
        if (cancelled) return
        const cached = await readCachedGeneratedImage(resolvedResultUrl)
        if (cancelled) return
        if (cached) { setResolvedResultUrl(cached); setAssetError(""); return }
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

    let disposed = false, width = 1, height = 1, dpr = 1, lastFrameAt = 0
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

    const sizeSurface = (surface: HTMLCanvasElement, c: CanvasRenderingContext2D) => {
      surface.width = Math.max(1, Math.round(width * dpr)); surface.height = Math.max(1, Math.round(height * dpr))
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"
    }
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect(); if (!rect) return
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth <= 640 ? 1.35 : 1.6)
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"
      sizeSurface(currentSurface, currentCtx); sizeSurface(nextSurface, nextCtx); sizeSurface(softSurface, softCtx); sizeSurface(maskSurface, maskCtx); sizeSurface(transitionSurface, transitionCtx)
      preparedIndex = -1
    }
    const drawCover = (c: CanvasRenderingContext2D, image: HTMLImageElement) => {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale
      c.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh)
    }
    const prepareSurface = (c: CanvasRenderingContext2D, image: HTMLImageElement, filter: string) => {
      c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height); c.fillStyle = "#060607"; c.fillRect(0, 0, width, height); c.filter = filter; drawCover(c, image); c.restore()
    }
    const preparePair = (index: number) => {
      if (!frames.length || preparedIndex === index) return
      prepareSurface(currentCtx, frames[index % frames.length], "grayscale(1) contrast(1.18) brightness(.74)")
      prepareSurface(nextCtx, frames[(index + 1) % frames.length], "grayscale(1) contrast(1.2) brightness(.78)")
      prepareSurface(softCtx, frames[(index + 1) % frames.length], "grayscale(1) blur(7px) contrast(.92) brightness(.64)")
      preparedIndex = index
    }
    const renderMask = (p: number) => {
      maskCtx.save(); maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0); maskCtx.clearRect(0, 0, width, height); maskCtx.filter = "blur(11px)"; maskCtx.fillStyle = "#fff"
      const rows = 7, rowHeight = height / rows + 12
      for (let row = 0; row < rows; row += 1) {
        const amount = smooth((p - row * .045) / .46); if (amount <= 0) continue
        const y = row * (height / rows) - 6, span = width * (.28 + amount * .92)
        const x = row % 2 === 0 ? -width * .18 : width - span + width * .18
        maskCtx.beginPath(); maskCtx.roundRect(x, y, span, rowHeight, Math.min(34, rowHeight * .42)); maskCtx.fill()
      }
      maskCtx.restore()
    }
    const drawMasked = (surface: HTMLCanvasElement, alpha: number) => {
      transitionCtx.save(); transitionCtx.setTransform(dpr, 0, 0, dpr, 0, 0); transitionCtx.clearRect(0, 0, width, height); transitionCtx.globalCompositeOperation = "source-over"; transitionCtx.globalAlpha = 1; transitionCtx.drawImage(surface, 0, 0, width, height); transitionCtx.globalCompositeOperation = "destination-in"; transitionCtx.drawImage(maskSurface, 0, 0, width, height); transitionCtx.restore()
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(transitionSurface, 0, 0, width, height); ctx.restore()
    }
    const render = (now: number) => {
      if (disposed) return
      if (now - lastFrameAt < 32) { requestAnimationFrame(render); return }
      lastFrameAt = now
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#060607"; ctx.fillRect(0, 0, width, height)
      if (frames.length) {
        const cycleMs = 610, holdMs = 105, elapsed = Math.max(0, now - animationStartedAt)
        const index = Math.floor(elapsed / cycleMs) % frames.length, within = elapsed % cycleMs
        preparePair(index); ctx.drawImage(currentSurface, 0, 0, width, height)
        if (within > holdMs) {
          const p = smooth((within - holdMs) / (cycleMs - holdMs)); renderMask(p); drawMasked(softSurface, .62)
          const photoAlpha = smooth((p - .12) / .64); if (photoAlpha > 0) drawMasked(nextSurface, .96 * photoAlpha)
          const settle = smooth((p - .76) / .24); if (settle > 0) { ctx.globalAlpha = settle; ctx.drawImage(nextSurface, 0, 0, width, height); ctx.globalAlpha = 1 }
        }
      }
      requestAnimationFrame(render)
    }

    const observer = new ResizeObserver(resize); observer.observe(canvas.parentElement || canvas); resize(); requestAnimationFrame(render)
    Promise.all(PREVIEW_FRAMES.map((src) => loadImage(src))).then((loaded) => { if (!disposed) { frames = loaded; animationStartedAt = performance.now(); preparedIndex = -1 } })
    return () => { disposed = true; observer.disconnect() }
  }, [actuallyFailed, imageLoaded])

  const failureText = error || assetError || (timedOut ? "Генерация заняла больше трёх минут и была остановлена. Повторите запрос." : readyWithoutResult ? "Провайдер завершил задачу, но не вернул файл изображения." : "Генерация изображения не завершилась.")

  return (
    <section className="malik-photo-final" data-malik-image-motion="1" data-malik-image-ready={imageLoaded ? "1" : "0"} data-malik-image-state={actuallyFailed ? "failed" : imageLoaded ? "ready" : "generating"}>
      <div className={`malik-photo-final__heading${imageLoaded ? " is-ready" : ""}`}>
        <div className="malik-photo-final__title-row"><span className="malik-photo-final__spark" aria-hidden="true"><i /><b /></span><span className="malik-photo-final__title">{imageLoaded ? "Готово" : actuallyFailed ? "Генерация остановлена" : "Создаю изображение"}</span></div>
        {!imageLoaded && !actuallyFailed ? <div className="malik-photo-final__steps" aria-live="polite">
          {steps.map((step, index) => <div className={`malik-photo-final__step${index === activeStep ? " is-active" : ""}${index < activeStep ? " is-done" : ""}`} key={step}><span className="malik-photo-final__step-mark" aria-hidden="true">{index === 0 ? "⌕" : index === 1 ? "✦" : "◷"}</span><span>{step}</span></div>)}
          <div className="malik-photo-final__timer"><span className="malik-photo-final__pulse" aria-hidden="true" /><span>Генерация {seconds.toFixed(1)}s · {shownProgress}%</span></div>
        </div> : null}
      </div>

      {actuallyFailed ? <div className="malik-photo-final__failure" role="status"><strong>Генерация остановлена</strong><span>{failureText}</span></div> : <div className={`malik-photo-final__frame${imageLoaded ? " is-ready" : ""}`}>
        {!imageLoaded ? <canvas ref={canvasRef} className="malik-photo-final__canvas" /> : null}
        {imageLoaded && resolvedResultUrl ? <img className="malik-photo-final__result" src={resolvedResultUrl} alt="Сгенерированное изображение Malik AI" draggable={false} decoding="async" /> : null}
      </div>}

      {!actuallyFailed ? <div className="malik-photo-final__progress" aria-live="polite"><div className="malik-photo-final__track" aria-hidden="true"><span style={{ width: `${shownProgress}%` }} /></div><div className="malik-photo-final__status">{imageLoaded ? `Готово за ${seconds} с` : shownStage}</div>{understood ? <div className="malik-photo-understood"><strong>Malik понял</strong><span>{understood}</span></div> : null}</div> : null}

      <style jsx global>{`
        .malik-photo-final{width:min(100%,430px)!important;max-width:430px!important;margin:4px auto 0!important;padding:0!important;display:grid!important;gap:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#fff!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
        .malik-photo-final__heading{display:grid!important;justify-items:center!important;gap:9px!important;width:100%!important;text-align:center!important}.malik-photo-final__title-row{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:30px!important}
        .malik-photo-final__spark{position:relative!important;width:16px!important;height:16px!important;flex:0 0 16px!important;color:#f5f5f6!important;opacity:.64!important;animation:malik-photo-final-spark .92s ease-in-out infinite!important}.malik-photo-final__spark:before,.malik-photo-final__spark:after,.malik-photo-final__spark i,.malik-photo-final__spark b{content:""!important;position:absolute!important;left:50%!important;top:50%!important;border-radius:999px!important;background:currentColor!important;transform:translate(-50%,-50%)!important}.malik-photo-final__spark:before{width:2px!important;height:16px!important}.malik-photo-final__spark:after{width:16px!important;height:2px!important}.malik-photo-final__spark i{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(45deg)!important}.malik-photo-final__spark b{width:2px!important;height:11px!important;transform:translate(-50%,-50%) rotate(-45deg)!important}
        .malik-photo-final__title{font-size:24px!important;font-weight:590!important;line-height:1.15!important;letter-spacing:-.025em!important;color:transparent!important;background:linear-gradient(90deg,#5d5e64 0%,#77787f 24%,#a8a9af 39%,#fff 50%,#a8a9af 61%,#77787f 76%,#5d5e64 100%)!important;background-size:220% 100%!important;background-position:-220% 50%!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;animation:malik-photo-final-title .58s linear infinite!important;will-change:background-position!important}.malik-photo-final__heading.is-ready .malik-photo-final__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important;animation:none!important}.malik-photo-final__heading.is-ready .malik-photo-final__spark{animation:none!important;opacity:.82!important}
        .malik-photo-final__steps{display:grid!important;gap:6px!important;width:max-content!important;max-width:100%!important;text-align:left!important}.malik-photo-final__step{display:flex!important;align-items:center!important;gap:8px!important;min-height:18px!important;color:#505158!important;font-size:12px!important;line-height:1.4!important;transition:color .18s ease,transform .18s ease!important}.malik-photo-final__step.is-active{color:#d0d0d4!important;transform:translateX(1px)!important}.malik-photo-final__step.is-done{color:#707078!important}.malik-photo-final__step-mark{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;flex:0 0 13px!important;color:#66676e!important;font-size:11px!important}.malik-photo-final__step.is-active .malik-photo-final__step-mark{color:#f4f4f5!important}.malik-photo-final__step.is-done .malik-photo-final__step-mark{font-size:0!important}.malik-photo-final__step.is-done .malik-photo-final__step-mark:after{content:""!important;width:4px!important;height:4px!important;border-radius:50%!important;background:#66676e!important}
        .malik-photo-final__timer{display:flex!important;align-items:center!important;gap:8px!important;margin-top:2px!important;color:#505158!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}.malik-photo-final__pulse{width:5px!important;height:5px!important;border-radius:50%!important;background:#ededee!important;animation:malik-photo-final-pulse 1.1s ease-out infinite!important}
        .malik-photo-final__frame{position:relative!important;width:100%!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(255,255,255,.09)!important;background:#060607!important;box-shadow:18px 18px 0 -12px #080809,20px 20px 0 -11px rgba(255,255,255,.025)!important;isolation:isolate!important}.malik-photo-final__canvas,.malik-photo-final__result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;background:#060607!important;object-position:50% 50%!important}.malik-photo-final__canvas{will-change:transform;transform:translateZ(0);filter:grayscale(1)!important}.malik-photo-final__result{object-fit:contain!important;opacity:1!important;filter:none!important;animation:malik-photo-final-result 180ms ease-out both!important}
        .malik-photo-final__progress{display:grid!important;gap:7px!important;width:100%!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.malik-photo-final__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.075)!important}.malik-photo-final__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#ededee!important;transition:width 240ms linear!important}.malik-photo-final__status{min-height:15px!important;color:rgba(255,255,255,.5)!important;font-size:11px!important;line-height:1.35!important;text-align:center!important}
        .malik-photo-final__failure{display:grid!important;gap:7px!important;width:100%!important;padding:14px 0 2px!important;text-align:center!important;background:transparent!important;color:#fff!important}.malik-photo-final__failure strong{font-size:13px!important}.malik-photo-final__failure span{font-size:11px!important;color:rgba(255,255,255,.55)!important}.malik-photo-understood{display:grid!important;gap:3px!important;color:rgba(255,255,255,.72)!important;font-size:12px!important;line-height:1.5!important;text-align:left!important}.malik-photo-understood strong{font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;text-transform:uppercase!important;color:rgba(255,255,255,.4)!important}
        @keyframes malik-photo-final-title{0%{background-position:-220% 50%}100%{background-position:220% 50%}}@keyframes malik-photo-final-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}@keyframes malik-photo-final-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.15)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-photo-final-result{from{opacity:.78}to{opacity:1}}
        @media(max-width:640px){.malik-photo-final{width:min(100%,390px)!important;max-width:390px!important;gap:10px!important;margin-left:auto!important;margin-right:auto!important}.malik-photo-final__title-row{transform:translateX(-10px)!important}.malik-photo-final__title{font-size:21px!important}.malik-photo-final__frame{border-radius:24px!important;box-shadow:12px 12px 0 -8px #080809,14px 14px 0 -7px rgba(255,255,255,.02)!important}.malik-photo-final__canvas,.malik-photo-final__result{border-radius:23px!important}}
        @media(prefers-reduced-motion:reduce){.malik-photo-final__title,.malik-photo-final__spark,.malik-photo-final__pulse,.malik-photo-final__result{animation:none!important}.malik-photo-final__track>span{transition:none!important}.malik-photo-final__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important}}
      `}</style>
    </section>
  )
}

export default ImageGenerationMotion
