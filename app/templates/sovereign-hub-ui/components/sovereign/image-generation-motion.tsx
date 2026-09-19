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


const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

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
    const timer = window.setInterval(tick, 1000)
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
    return () => {
      if (resolvedResultUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(resolvedResultUrl) } catch {}
      }
    }
  }, [resolvedResultUrl])

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


  const failureText = error || assetError || (timedOut
    ? "Генерация заняла больше трёх минут и была остановлена. Повторите запрос."
    : readyWithoutResult
      ? "Провайдер завершил задачу, но не вернул файл изображения."
      : "Генерация изображения не завершилась.")

  return (
    <section
      className="malik-photo-final"
      data-malik-image-motion="1"
      data-malik-image-ready={imageLoaded ? "1" : "0"}
      data-malik-image-state={actuallyFailed ? "failed" : imageLoaded ? "ready" : "generating"}
    >
      <div className={`malik-photo-final__heading${imageLoaded ? " is-ready" : ""}`}>
        <div className="malik-photo-final__title-row">
          <span className="malik-photo-final__brand-mark" aria-hidden="true">
            <svg viewBox="0 0 44 44">
              <rect width="44" height="44" rx="22" fill="white" />
              <path d="M9 29 L22 15 L22 29 Z" fill="#03040a" />
              <path d="M24 15 H38 L24 29 Z" fill="#03040a" />
            </svg>
          </span>
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
            <picture className="malik-photo-final__gif-picture" aria-hidden="true">
              <source media="(max-width: 640px)" srcSet="/animations/malik-image-loading-mobile-final.gif" />
              <img
                className="malik-photo-final__gif"
                src="/animations/malik-image-loading-pc-final.gif"
                alt=""
                draggable={false}
                decoding="async"
              />
            </picture>
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
        .malik-photo-final__title-row{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:34px!important}
        .malik-photo-final__brand-mark{width:30px!important;height:30px!important;flex:0 0 30px!important;display:grid!important;place-items:center!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.92)!important;border-radius:999px!important;background:#fff!important;box-shadow:0 7px 22px rgba(0,0,0,.34),0 0 0 1px rgba(255,255,255,.04)!important}
        .malik-photo-final__brand-mark svg{width:100%!important;height:100%!important;display:block!important;filter:none!important;transform:none!important}
        .malik-photo-final__title{font-size:24px!important;font-weight:590!important;line-height:1.15!important;letter-spacing:-.025em!important;color:#f1f1f2!important;background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;-webkit-text-fill-color:currentColor!important;animation:none!important;will-change:auto!important}
        .malik-photo-final__heading.is-ready .malik-photo-final__title{color:#dddde1!important;background:none!important;-webkit-text-fill-color:currentColor!important;animation:none!important}
        .malik-photo-final__steps{display:grid!important;gap:6px!important;width:max-content!important;max-width:100%!important;text-align:left!important}
        .malik-photo-final__step{display:flex!important;align-items:center!important;gap:8px!important;min-height:18px!important;color:#505158!important;font-size:12px!important;line-height:1.4!important}.malik-photo-final__step.is-active{color:#d0d0d4!important}.malik-photo-final__step.is-done{color:#707078!important}
        .malik-photo-final__mark{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;flex:0 0 13px!important;color:#66676e!important;font-size:11px!important}.malik-photo-final__step.is-active .malik-photo-final__mark{color:#f4f4f5!important}
        .malik-photo-final__timer{display:flex!important;align-items:center!important;gap:8px!important;margin-top:2px!important;color:#505158!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}.malik-photo-final__pulse{width:5px!important;height:5px!important;border-radius:50%!important;background:#ededee!important;animation:malik-photo-final-pulse 1.1s ease-out infinite!important}
        .malik-photo-final__frame{position:relative!important;width:100%!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(255,255,255,.09)!important;background:#050506!important;box-shadow:18px 18px 0 -12px #080809,20px 20px 0 -11px rgba(255,255,255,.025)!important;isolation:isolate!important}
        .malik-photo-final__gif-picture{position:absolute!important;inset:0!important;z-index:1!important;display:block!important;overflow:hidden!important;border-radius:27px!important;background:#050506!important}
        .malik-photo-final__gif{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;display:block!important;object-fit:cover!important;object-position:center!important;user-select:none!important;pointer-events:none!important;image-rendering:auto!important}
        .malik-photo-final__backdrop,.malik-photo-final__canvas,.malik-photo-final__result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;object-position:50% 50%!important}
        .malik-photo-final__backdrop{z-index:0!important;object-fit:cover!important;filter:grayscale(1) contrast(1.22) brightness(.72)!important}.malik-photo-final__canvas{z-index:1!important;background:transparent!important;transform:translateZ(0)!important;will-change:transform!important}.malik-photo-final__result{z-index:2!important;object-fit:contain!important;background:#050506!important;animation:malik-photo-final-result 180ms ease-out both!important}
        .malik-photo-final__sweep{position:absolute!important;inset:-12% -24%!important;z-index:3!important;pointer-events:none!important;background:linear-gradient(112deg,transparent 45%,rgba(255,255,255,.008) 48%,rgba(255,255,255,.075) 50%,rgba(255,255,255,.008) 52%,transparent 55%)!important;transform:translateX(-120%)!important;mix-blend-mode:screen!important;animation:malik-photo-final-sweep .58s linear infinite!important}
        .malik-photo-final__progress{display:grid!important;gap:7px!important;width:100%!important}.malik-photo-final__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.075)!important}.malik-photo-final__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#ededee!important;transition:width 180ms linear!important}.malik-photo-final__status{min-height:15px!important;color:#66676e!important;font-size:10px!important;line-height:1.4!important;text-align:center!important}
        .malik-photo-understood{margin-top:3px!important;display:grid!important;gap:4px!important;color:#9a9ba1!important;font-size:11px!important;line-height:1.45!important;text-align:left!important}.malik-photo-understood strong{color:#676870!important;font-size:9px!important;letter-spacing:.08em!important;text-transform:uppercase!important}
        .malik-photo-final__failure{width:100%!important;min-height:120px!important;padding:22px!important;display:grid!important;place-items:center!important;align-content:center!important;gap:8px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:22px!important;background:#060607!important;color:#dddde1!important;text-align:center!important}.malik-photo-final__failure strong{font-size:13px!important;color:#f3f3f4!important}.malik-photo-final__failure span{max-width:330px!important;color:#777880!important;font-size:11px!important;line-height:1.45!important}
        .malik-message-row-assistant:has(.malik-photo-final)>.malik-ai-avatar.is-working{display:none!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="generating"]) .malik-message-actions,.malik-message-row:has(.malik-photo-final[data-malik-image-state="failed"]) .malik-message-actions{display:none!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="ready"]) .malik-message-actions{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:min(100%,430px)!important;min-height:30px!important;margin:8px auto 0!important}
        .malik-message-row:has(.malik-photo-final[data-malik-image-state="ready"]) .malik-message-actions>button{width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;padding:0!important;display:grid!important;place-items:center!important;border-radius:8px!important;line-height:1!important}
        @keyframes malik-photo-final-title{0%{background-position:-220% 50%}100%{background-position:220% 50%}}@keyframes malik-photo-final-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}@keyframes malik-photo-final-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.16)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-photo-final-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}@keyframes malik-photo-final-result{from{opacity:0;transform:scale(1.012)}to{opacity:1;transform:scale(1)}}
        @media(max-width:640px){.malik-photo-final{width:min(92vw,390px)!important;max-width:390px!important;gap:11px!important;margin-left:auto!important;margin-right:auto!important}.malik-photo-final__title-row{gap:8px!important;transform:none!important}.malik-photo-final__brand-mark{width:28px!important;height:28px!important;flex-basis:28px!important}.malik-photo-final__title{font-size:22px!important}.malik-photo-final__steps{width:min(100%,286px)!important}.malik-photo-final__frame{border-radius:24px!important;box-shadow:12px 12px 0 -8px #080809,14px 14px 0 -7px rgba(255,255,255,.025)!important}.malik-photo-final__backdrop,.malik-photo-final__canvas,.malik-photo-final__result{border-radius:23px!important}.malik-photo-final__gif-picture,.malik-photo-final__gif{border-radius:23px!important}.malik-message-row:has(.malik-photo-final[data-malik-image-state="ready"]) .malik-message-actions{width:min(92vw,390px)!important}}
      `}</style>
    </section>
  )
}
