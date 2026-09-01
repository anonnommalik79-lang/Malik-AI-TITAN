"use client"

import { useEffect, useMemo, useState } from "react"
import { playImageGenerationCompleteSound, playImageGenerationStartSound } from "@/lib/media/image-generation-sound"
import { resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

type ImageGenerationMotionProps = {
  prompt?: string
  resultUrl?: string
  fallbackUrl?: string
  status?: "queued" | "thinking" | "generating" | "rendering" | "ready" | "failed"
  startedAt?: string
  provider?: string
  understood?: string
  failed?: boolean
  error?: string
}

const GENERATION_WATCHDOG_MS = 3 * 60 * 1000
const IMAGE_LOAD_TIMEOUT_MS = 25_000
const WATCHDOG_MESSAGE = "Генерация не завершилась за 3 минуты и была остановлена. Повторите запрос — лимит за неудачную попытку не списывается."
const EMPTY_RESULT_MESSAGE = "Генератор закончил работу, но не вернул файл изображения. Повторите генерацию."

function friendlyGenerationError(error?: string) {
  const raw = String(error || "").trim()
  if (!raw) return "Не удалось получить готовое изображение. Повторите генерацию."
  if (/load failed|failed to fetch|network\s*error|network request failed/i.test(raw)) {
    return "Соединение с генератором прервалось. Повторите запрос — Malik AI автоматически выберет резервный маршрут."
  }
  return raw
}

function statusProgress(status?: ImageGenerationMotionProps["status"]) {
  if (status === "thinking") return 22
  if (status === "generating") return 58
  if (status === "rendering") return 82
  if (status === "ready") return 96
  if (status === "failed") return 100
  return 8
}

export function ImageGenerationMotion({
  prompt,
  resultUrl,
  fallbackUrl,
  status,
  startedAt,
  provider,
  understood,
  failed = false,
  error,
}: ImageGenerationMotionProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [resolvedResultUrl, setResolvedResultUrl] = useState("")
  const [usingFallback, setUsingFallback] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [visualProgress, setVisualProgress] = useState(() => statusProgress(status))

  const startedAtMs = useMemo(() => {
    const parsed = startedAt ? Date.parse(startedAt) : Number.NaN
    return Number.isFinite(parsed) ? parsed : Date.now()
  }, [startedAt])

  useEffect(() => {
    let cancelled = false
    setImageLoaded(false)
    setLoadError("")
    setUsingFallback(false)
    setResolvedResultUrl("")
    setVisualProgress((value) => Math.max(value, resultUrl ? 94 : 8))
    if (!resultUrl) return () => { cancelled = true }

    resolveGeneratedImageUrl(resultUrl)
      .then((url) => { if (!cancelled) setResolvedResultUrl(url) })
      .catch((reason) => {
        if (cancelled) return
        if (fallbackUrl) {
          setUsingFallback(true)
          setResolvedResultUrl(fallbackUrl)
          return
        }
        setLoadError(reason instanceof Error ? reason.message : "Не удалось восстановить изображение.")
      })

    return () => { cancelled = true }
  }, [fallbackUrl, resultUrl])

  const actuallyFailed = failed || status === "failed" || Boolean(loadError)

  useEffect(() => {
    if (!actuallyFailed && !imageLoaded && status === "ready" && !resultUrl) setLoadError(EMPTY_RESULT_MESSAGE)
  }, [actuallyFailed, imageLoaded, resultUrl, status])

  useEffect(() => {
    if (actuallyFailed || imageLoaded) return
    const remaining = GENERATION_WATCHDOG_MS - (Date.now() - startedAtMs)
    if (remaining <= 0) {
      setLoadError(WATCHDOG_MESSAGE)
      return
    }
    const timer = window.setTimeout(() => setLoadError(WATCHDOG_MESSAGE), remaining)
    return () => window.clearTimeout(timer)
  }, [actuallyFailed, imageLoaded, startedAtMs])

  // One cheap one-second tick owns both elapsed time and progress. No scene is
  // ever remounted, no canvas is redrawn and no animation state grows over time.
  useEffect(() => {
    if (actuallyFailed || imageLoaded) return
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)))
      setVisualProgress((value) => {
        const floor = Math.max(statusProgress(status), resultUrl ? 94 : 8)
        return Math.min(resultUrl ? 96 : 94, Math.max(value, floor) + 1)
      })
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [actuallyFailed, imageLoaded, resultUrl, startedAtMs, status])

  useEffect(() => {
    if (!resolvedResultUrl || imageLoaded || actuallyFailed) return
    const timer = window.setTimeout(() => {
      if (!usingFallback && fallbackUrl && fallbackUrl !== resolvedResultUrl) {
        setUsingFallback(true)
        setResolvedResultUrl(fallbackUrl)
        return
      }
      setLoadError("Готовый файл изображения не загрузился. Повторите генерацию.")
    }, IMAGE_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [actuallyFailed, fallbackUrl, imageLoaded, resolvedResultUrl, usingFallback])

  useEffect(() => {
    if (!actuallyFailed && !imageLoaded) playImageGenerationStartSound()
  }, [actuallyFailed, imageLoaded])

  const isGenerating = !actuallyFailed && !imageLoaded
  const shownProgress = imageLoaded ? 100 : Math.min(96, Math.max(statusProgress(status), visualProgress))

  return (
    <section
      className="malik-photo-motion"
      data-malik-image-ready={imageLoaded ? "1" : "0"}
      aria-live="polite"
      aria-busy={isGenerating}
    >
      <div className={`malik-photo-stage ${imageLoaded ? "is-ready" : ""} ${actuallyFailed ? "is-failed" : ""}`}>
        {resolvedResultUrl ? (
          <img
            src={resolvedResultUrl}
            alt={prompt || "Изображение, созданное Malik AI"}
            className={`malik-art-result malik-photo-result ${imageLoaded ? "is-visible" : ""}`}
            onLoad={() => {
              setImageLoaded(true)
              setVisualProgress(100)
              playImageGenerationCompleteSound()
            }}
            onError={() => {
              if (!usingFallback && fallbackUrl && fallbackUrl !== resolvedResultUrl) {
                setUsingFallback(true)
                setResolvedResultUrl(fallbackUrl)
                return
              }
              setLoadError("Готовый файл изображения повреждён или недоступен. Повторите генерацию.")
            }}
          />
        ) : null}

        {isGenerating ? (
          <div className="malik-photo-develop" aria-hidden="true">
            <span className="malik-photo-develop__halo" />
            <span className="malik-photo-develop__grain" />
            <span className="malik-photo-develop__frame" />
            <span className="malik-photo-develop__scan" />
            <span className="malik-photo-develop__spark spark-one" />
            <span className="malik-photo-develop__spark spark-two" />
            <span className="malik-photo-develop__spark spark-three" />
            <span className="malik-photo-develop__logo"><i /><b /></span>
          </div>
        ) : null}

        {actuallyFailed ? (
          <div className="malik-photo-failure">
            <span>!</span>
            <strong>Фото не создано</strong>
            <p>{friendlyGenerationError(loadError || error)}</p>
          </div>
        ) : null}

        {isGenerating ? (
          <div className="malik-photo-stage__caption">
            <span>{status === "rendering" ? "Проявляю финальный кадр" : understood ? "Создаю по вашему описанию" : "Понимаю сцену"}</span>
            <strong>{shownProgress}%</strong>
          </div>
        ) : null}
      </div>

      {understood && !actuallyFailed ? (
        <div className="malik-photo-understood"><span>Malik понял</span><p>{understood}</p></div>
      ) : null}

      <div className="malik-photo-status">
        {actuallyFailed ? <span>Генерация остановлена</span> : imageLoaded ? (
          <span>Изображение готово · 100% · <strong>{elapsedSeconds} с</strong></span>
        ) : (
          <span>{understood ? "Рисую по этому описанию" : "Разбираю запрос"} · <strong>{elapsedSeconds} с</strong></span>
        )}
      </div>

      {!actuallyFailed ? <div className="malik-photo-progress" aria-hidden="true"><span style={{ width: `${shownProgress}%` }} /></div> : null}

      {imageLoaded && !actuallyFailed ? (
        <div className="malik-photo-report">
          <p><span>Готово</span>{provider ? <em>{provider}</em> : null}</p>
          {prompt ? <small>{prompt}</small> : null}
          <a href={resolvedResultUrl} target="_blank" rel="noreferrer">Открыть оригинал</a>
        </div>
      ) : null}

      <style jsx global>{`
        .malik-photo-motion { width: min(100%, 520px); max-width: calc(100vw - 32px); margin-inline: auto; }
        .malik-photo-stage { position: relative; width: 100%; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid #252525; border-radius: 24px; background: #050505; box-shadow: 0 20px 60px rgba(0,0,0,.34); isolation: isolate; }
        .malik-photo-develop { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(circle at 50% 44%, #191919 0, #090909 36%, #030303 72%); }
        .malik-photo-develop__halo { position: absolute; width: 64%; aspect-ratio: 1; left: 18%; top: 16%; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,.035) 43%, transparent 70%); animation: malik-photo-breathe 3.2s ease-in-out infinite; will-change: transform, opacity; }
        .malik-photo-develop__grain { position: absolute; inset: -20%; opacity: .16; background: radial-gradient(circle at 20% 30%, rgba(255,255,255,.34) 0 1px, transparent 1.6px), radial-gradient(circle at 72% 64%, rgba(255,255,255,.22) 0 1px, transparent 1.5px); background-size: 31px 29px, 43px 37px; animation: malik-photo-grain 1.8s steps(3,end) infinite; will-change: transform; }
        .malik-photo-develop__frame { position: absolute; inset: 12%; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; box-shadow: inset 0 0 45px rgba(255,255,255,.025); }
        .malik-photo-develop__frame::before, .malik-photo-develop__frame::after { content: ""; position: absolute; inset: 8%; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; }
        .malik-photo-develop__frame::after { inset: 18%; border-radius: 50%; border-color: rgba(255,255,255,.075); }
        .malik-photo-develop__scan { position: absolute; left: 10%; right: 10%; height: 1px; top: 14%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent); box-shadow: 0 0 18px rgba(255,255,255,.28); animation: malik-photo-scan 2.8s cubic-bezier(.45,0,.55,1) infinite; will-change: transform, opacity; }
        .malik-photo-develop__spark { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgba(255,255,255,.75); animation: malik-photo-spark 2.6s ease-in-out infinite; will-change: transform, opacity; }
        .malik-photo-develop__spark.spark-one { left: 27%; top: 32%; }
        .malik-photo-develop__spark.spark-two { right: 25%; top: 39%; animation-delay: -.9s; }
        .malik-photo-develop__spark.spark-three { left: 36%; bottom: 27%; animation-delay: -1.7s; }
        .malik-photo-develop__logo { position: absolute; left: 50%; top: 48%; width: 54px; height: 54px; transform: translate(-50%,-50%); border: 1px solid rgba(255,255,255,.24); border-radius: 17px; background: rgba(255,255,255,.96); box-shadow: 0 16px 40px rgba(0,0,0,.45); animation: malik-photo-logo 3.2s ease-in-out infinite; will-change: transform; }
        .malik-photo-develop__logo i, .malik-photo-develop__logo b { position: absolute; top: 20px; width: 19px; height: 12px; background: #070707; transform: skewX(-38deg); }
        .malik-photo-develop__logo i { left: 9px; clip-path: polygon(0 100%,100% 0,100% 100%); }
        .malik-photo-develop__logo b { right: 9px; clip-path: polygon(0 0,100% 0,0 100%); }
        .malik-photo-stage__caption { position: absolute; z-index: 4; left: 16px; right: 16px; bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 13px; color: #d7d7d7; font-size: 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; background: rgba(8,8,8,.92); }
        .malik-photo-stage__caption strong { color: #fff; font-variant-numeric: tabular-nums; }
        .malik-photo-result { position: absolute; z-index: 3; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; background: #050505; filter: none !important; transform: scale(1.012); transition: opacity .3s linear, transform .42s ease; }
        .malik-photo-result.is-visible { opacity: 1; transform: scale(1); }
        .malik-photo-failure { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 30px; color: #fff; text-align: center; background: #070707; }
        .malik-photo-failure > span { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #3a3a3a; border-radius: 50%; color: #d5d5d5; }
        .malik-photo-failure strong { font-size: 16px; }
        .malik-photo-failure p { max-width: 330px; margin: 0; color: #9b9b9b; font-size: 12px; line-height: 1.55; }
        .malik-photo-understood, .malik-photo-report { margin-top: 10px; border: 1px solid #252525; border-radius: 15px; background: #0b0b0b; }
        .malik-photo-understood { padding: 12px 14px; }
        .malik-photo-understood span { display: block; margin-bottom: 4px; color: #777; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
        .malik-photo-understood p { margin: 0; color: #d7d7d7; font-size: 13px; line-height: 1.45; }
        .malik-photo-status { display: flex; justify-content: center; padding: 11px 4px 7px; color: #888; font-size: 12px; }
        .malik-photo-status strong { color: #ddd; font-weight: 650; font-variant-numeric: tabular-nums; }
        .malik-photo-progress { height: 2px; overflow: hidden; border-radius: 999px; background: #1d1d1d; }
        .malik-photo-progress span { display: block; height: 100%; border-radius: inherit; background: #f2f2f2; transition: width .65s ease; }
        .malik-photo-report { padding: 13px 14px; }
        .malik-photo-report p { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 8px; color: #fff; font-size: 13px; }
        .malik-photo-report em { color: #888; font-size: 11px; font-style: normal; }
        .malik-photo-report small { display: block; color: #979797; font-size: 11px; line-height: 1.45; }
        .malik-photo-report a { display: inline-flex; margin-top: 10px; color: #f4f4f4; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
        @keyframes malik-photo-breathe { 0%,100% { opacity: .55; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes malik-photo-grain { 0% { transform: translate3d(-2%,1%,0); } 50% { transform: translate3d(2%,-1%,0); } 100% { transform: translate3d(-1%,2%,0); } }
        @keyframes malik-photo-scan { 0% { opacity: 0; transform: translate3d(0,0,0); } 12% { opacity: 1; } 88% { opacity: .8; } 100% { opacity: 0; transform: translate3d(0,330px,0); } }
        @keyframes malik-photo-spark { 0%,100% { opacity: .12; transform: scale(.6); } 50% { opacity: 1; transform: scale(1.5); } }
        @keyframes malik-photo-logo { 0%,100% { transform: translate(-50%,-50%) scale(.96); } 50% { transform: translate(-50%,-50%) scale(1.04); } }
        @media (max-width: 640px) { .malik-photo-motion { max-width: calc(100vw - 24px); } .malik-photo-stage { border-radius: 20px; } }
        @media (prefers-reduced-motion: reduce) { .malik-photo-develop__halo, .malik-photo-develop__grain, .malik-photo-develop__scan, .malik-photo-develop__spark, .malik-photo-develop__logo { animation: none !important; } .malik-photo-result { transition: opacity .2s linear; } }
      `}</style>
    </section>
  )
}
