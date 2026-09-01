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
const WATCHDOG_MESSAGE = "Генерация не завершилась за 3 минуты и была остановлена. Нажмите «Перегенерировать» — Compute за неудачную попытку не списывается."
const EMPTY_RESULT_MESSAGE = "Генератор закончил работу, но не вернул файл изображения. Повторите генерацию."

function friendlyGenerationError(error?: string) {
  const raw = String(error || "").trim()
  if (!raw) return "Не удалось получить готовое изображение. Повторите генерацию."
  if (/load failed|failed to fetch|network\s*error|network request failed/i.test(raw)) {
    return "Соединение с генератором прервалось. Повторите генерацию — Malik AI автоматически использует резервный маршрут."
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
    setImageLoaded(false)
    setLoadError("")
    setUsingFallback(false)
    setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)))
    setResolvedResultUrl("")
    setVisualProgress(Math.max(statusProgress(status), resultUrl ? 94 : 8))
    if (!resultUrl) return

    let cancelled = false
    resolveGeneratedImageUrl(resultUrl)
      .then((url) => {
        if (!cancelled) setResolvedResultUrl(url)
      })
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
  }, [fallbackUrl, resultUrl, startedAtMs, status])

  const actuallyFailed = failed || status === "failed" || Boolean(loadError)

  useEffect(() => {
    if (actuallyFailed || imageLoaded) return
    if (status === "ready" && !resultUrl) setLoadError(EMPTY_RESULT_MESSAGE)
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

  useEffect(() => {
    if (actuallyFailed || imageLoaded) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)))
      setVisualProgress((current) => {
        const floor = statusProgress(status)
        const next = Math.max(current, floor)
        return Math.min(resultUrl ? 96 : 92, next + 1)
      })
    }, 1000)
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

  const shownProgress = imageLoaded ? 100 : Math.min(96, Math.max(statusProgress(status), visualProgress))
  const statusText = actuallyFailed
    ? friendlyGenerationError(loadError || error)
    : imageLoaded
      ? `Изображение готово · 100% · ${elapsedSeconds} с`
      : understood
        ? `Рисую по этому описанию · ${elapsedSeconds} с`
        : `Генерирую изображение · ${elapsedSeconds} с`

  return (
    <div
      className="malik-photo-motion mx-auto"
      data-malik-image-ready={imageLoaded ? "1" : "0"}
      aria-live="polite"
      aria-busy={!actuallyFailed && !imageLoaded}
    >
      <div className={`malik-art-stage ${imageLoaded ? "is-finished" : ""}`}>
        {resolvedResultUrl ? (
          <img
            src={resolvedResultUrl}
            alt={prompt || "Generated image"}
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
            className={`malik-art-result ${imageLoaded ? "is-visible" : ""}`}
          />
        ) : null}

        {!actuallyFailed && !imageLoaded ? (
          <div className="malik-image-lite-loader" aria-hidden="true">
            <div className="malik-image-lite-loader__frame">
              <span className="malik-image-lite-loader__mark" />
            </div>
          </div>
        ) : null}

        {actuallyFailed ? (
          <div className="malik-image-lite-error">
            <strong>Генерация остановлена</strong>
            <span>{friendlyGenerationError(loadError || error)}</span>
          </div>
        ) : null}
      </div>

      <div className="malik-art-status"><span>{statusText}</span></div>

      {!actuallyFailed && !imageLoaded ? (
        <div className="malik-art-progress" aria-hidden="true">
          <span style={{ width: `${shownProgress}%` }} />
        </div>
      ) : null}

      {imageLoaded && !actuallyFailed ? (
        <div className="malik-art-report">
          <p className="malik-art-report__row">
            <span>Готово</span>
            {provider ? <em>{provider}</em> : null}
          </p>
          {prompt ? <p className="malik-art-report__prompt">{prompt}</p> : null}
          <a href={resolvedResultUrl} target="_blank" rel="noreferrer" className="malik-art-report__open">Открыть оригинал</a>
        </div>
      ) : null}

      <style jsx global>{`
        .malik-photo-motion {
          width: min(100%, 430px);
          max-width: calc(100vw - 44px);
        }
        .malik-art-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          border-radius: 22px;
          background: #f5f5f3;
          box-shadow: 0 14px 42px rgba(0,0,0,.18);
          isolation: isolate;
        }
        .malik-art-result {
          position: absolute;
          inset: 0;
          z-index: 3;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          opacity: 0;
          background: #050505;
          filter: none !important;
          transform: none !important;
          transition: opacity .14s linear;
        }
        .malik-art-result.is-visible { opacity: 1; }
        .malik-image-lite-loader {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: #f5f5f3;
        }
        .malik-image-lite-loader__frame {
          position: relative;
          width: 44%;
          aspect-ratio: 1 / 1;
          border: 2px solid rgba(0,0,0,.16);
          border-radius: 28px;
          background: #fff;
        }
        .malik-image-lite-loader__mark {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 38%;
          height: 2px;
          border-radius: 999px;
          background: #171717;
          transform: translate(-50%,-50%);
        }
        .malik-image-lite-loader__mark::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 2px;
          height: 100%;
          background: #171717;
          transform: translate(-50%,-50%) rotate(90deg);
        }
        .malik-image-lite-error {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 30px;
          background: #111112;
          color: #fff;
          text-align: center;
        }
        .malik-image-lite-error strong { font-size: 14px; }
        .malik-image-lite-error span { color: rgba(255,255,255,.58); font-size: 12px; line-height: 1.55; }
        .malik-art-status {
          min-height: 18px;
          margin-top: 10px;
          color: rgba(255,255,255,.56);
          font-size: 11.5px;
          font-weight: 500;
          text-align: center;
        }
        .malik-art-progress {
          width: 78%;
          height: 2px;
          margin: 10px auto 0;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.10);
        }
        .malik-art-progress > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: rgba(255,255,255,.82);
          transition: width .18s linear;
        }
        @media (max-width: 640px) {
          .malik-photo-motion { max-width: calc(100vw - 32px); }
          .malik-art-stage { border-radius: 18px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .malik-art-result,
          .malik-art-progress > span { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
