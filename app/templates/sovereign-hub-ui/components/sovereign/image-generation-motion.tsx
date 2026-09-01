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

const REFERENCE_FRAMES = [
  { label: "Scene", src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=520&q=76" },
  { label: "Space", src: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=520&q=76" },
  { label: "Mood", src: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=520&q=76" },
  { label: "Light", src: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=520&q=76" },
  { label: "Human", src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=520&q=76" },
  { label: "Object", src: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=520&q=76" },
  { label: "Depth", src: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=520&q=76" },
  { label: "Detail", src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=520&q=76" },
  { label: "Balance", src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=520&q=76" },
] as const

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

function generationPhase(progress: number, status?: ImageGenerationMotionProps["status"], understood?: string) {
  if (status === "rendering" || progress >= 91) return "Финализирую 2K master"
  if (progress >= 76) return "Собираю финальный кадр"
  if (progress >= 58) return "Синтезирую материалы"
  if (progress >= 38) return "Рассчитываю свет"
  if (progress >= 18) return "Собираю форму сцены"
  return understood ? "Анализирую визуальные слои" : "Понимаю сцену"
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
  const mergeProgress = shownProgress < 68
    ? 0
    : Math.min(resultUrl ? 1 : 0.55, (shownProgress - 68) / 28)
  const mergeCount = Math.min(REFERENCE_FRAMES.length, Math.floor(mergeProgress * REFERENCE_FRAMES.length))
  const activeReference = Math.min(
    REFERENCE_FRAMES.length - 1,
    Math.floor((Math.min(shownProgress, 90) / 90) * REFERENCE_FRAMES.length),
  )

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
          <div className="malik-photo-forge" aria-hidden="true">
            <div className="malik-photo-forge__top">
              <span><i />Malik Image</span>
              <em>Ultra 2K</em>
            </div>

            <div className="malik-photo-forge__grid">
              {REFERENCE_FRAMES.map((frame, index) => (
                <figure
                  key={frame.label}
                  className={`malik-photo-forge__ref ref-${index + 1} ${index === activeReference ? "is-active" : ""} ${index < mergeCount ? "is-merge" : ""}`}
                >
                  <img src={frame.src} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" />
                  <span>{frame.label}</span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </figure>
              ))}
            </div>

            <div className={`malik-photo-forge__fusion ${mergeProgress > 0 ? "is-on" : ""}`}><i /></div>

            <div className="malik-photo-forge__focus">
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
              <i className="focus-ring" />
              <i className="focus-dot" />
            </div>

            <div className="malik-photo-forge__sweeps">
              <i className="beam horizontal top-down" />
              <i className="beam horizontal bottom-up" />
              <i className="beam vertical left-right" />
              <i className="beam vertical right-left" />
            </div>

            <div className="malik-photo-forge__badge">9 universal HQ references · 4-way scan</div>
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
            <span>{generationPhase(shownProgress, status, understood)}</span>
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
        .malik-photo-motion { width: min(100%, 680px); max-width: calc(100vw - 28px); margin-inline: auto; }
        .malik-photo-stage { position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid #242424; border-radius: 24px; background: #050505; box-shadow: 0 22px 66px rgba(0,0,0,.38); isolation: isolate; }

        .malik-photo-forge { position: absolute; inset: 0; overflow: hidden; background: #050505; }
        .malik-photo-forge__top { position: absolute; z-index: 20; inset: 0 0 auto 0; height: 45px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 13px; border-bottom: 1px solid rgba(255,255,255,.06); background: #070707; }
        .malik-photo-forge__top span { display: inline-flex; align-items: center; gap: 8px; color: #f3f3f3; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .malik-photo-forge__top span i { width: 7px; height: 7px; border-radius: 50%; background: #fff; box-shadow: 0 0 14px rgba(255,255,255,.25); }
        .malik-photo-forge__top em { color: #aaa; font-size: 10px; font-style: normal; }

        .malik-photo-forge__grid { position: absolute; z-index: 4; inset: 55px 12px 62px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); grid-template-rows: repeat(3, minmax(0,1fr)); gap: 7px; }
        .malik-photo-forge__ref { position: relative; min-width: 0; min-height: 0; margin: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.075); border-radius: 12px; background: #0a0a0a; opacity: .72; transform: translate3d(0,0,0) scale(.985); transition: opacity .3s ease, transform .55s cubic-bezier(.16,.84,.24,1), border-color .2s ease; will-change: transform, opacity; }
        .malik-photo-forge__ref img { width: 100%; height: 100%; display: block; object-fit: cover; opacity: .75; transform: scale(1.035); transition: opacity .28s ease, transform .7s cubic-bezier(.22,.9,.2,1); }
        .malik-photo-forge__ref::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.018), transparent 35%, rgba(0,0,0,.30)); }
        .malik-photo-forge__ref.is-active { z-index: 2; opacity: 1; transform: scale(1); border-color: rgba(255,255,255,.30); }
        .malik-photo-forge__ref.is-active img { opacity: 1; transform: scale(1.005); }
        .malik-photo-forge__ref span { position: absolute; z-index: 2; left: 8px; bottom: 7px; color: rgba(255,255,255,.78); font-size: 8px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .malik-photo-forge__ref b { position: absolute; z-index: 2; right: 7px; top: 7px; display: grid; place-items: center; min-width: 21px; height: 21px; padding: 0 6px; border: 1px solid rgba(255,255,255,.09); border-radius: 999px; background: #090909; color: #c5c5c5; font-size: 8px; font-weight: 700; }

        .malik-photo-forge__ref.ref-1.is-merge { opacity: 0; transform: translate(105%,105%) scale(.14); }
        .malik-photo-forge__ref.ref-2.is-merge { opacity: 0; transform: translate(0,105%) scale(.14); }
        .malik-photo-forge__ref.ref-3.is-merge { opacity: 0; transform: translate(-105%,105%) scale(.14); }
        .malik-photo-forge__ref.ref-4.is-merge { opacity: 0; transform: translate(105%,0) scale(.14); }
        .malik-photo-forge__ref.ref-5.is-merge { opacity: 0; transform: scale(.14); }
        .malik-photo-forge__ref.ref-6.is-merge { opacity: 0; transform: translate(-105%,0) scale(.14); }
        .malik-photo-forge__ref.ref-7.is-merge { opacity: 0; transform: translate(105%,-105%) scale(.14); }
        .malik-photo-forge__ref.ref-8.is-merge { opacity: 0; transform: translate(0,-105%) scale(.14); }
        .malik-photo-forge__ref.ref-9.is-merge { opacity: 0; transform: translate(-105%,-105%) scale(.14); }

        .malik-photo-forge__fusion { position: absolute; z-index: 12; left: 50%; top: 49%; width: 64px; height: 64px; transform: translate(-50%,-50%) scale(.68); border: 1px solid rgba(255,255,255,.14); border-radius: 50%; opacity: 0; transition: opacity .2s ease, transform .38s cubic-bezier(.22,.9,.2,1); }
        .malik-photo-forge__fusion::after { content: ""; position: absolute; inset: 14px; border: 1px solid rgba(255,255,255,.30); border-radius: 50%; }
        .malik-photo-forge__fusion i { position: absolute; z-index: 2; left: 50%; top: 50%; width: 6px; height: 6px; transform: translate(-50%,-50%); border-radius: 50%; background: #fff; box-shadow: 0 0 0 7px rgba(255,255,255,.045); }
        .malik-photo-forge__fusion.is-on { opacity: 1; transform: translate(-50%,-50%) scale(1); }

        .malik-photo-forge__focus { position: absolute; z-index: 13; left: 50%; top: 49%; width: 148px; height: 104px; transform: translate(-50%,-50%); pointer-events: none; }
        .malik-photo-forge__focus .corner { position: absolute; width: 24px; height: 24px; border-color: rgba(255,255,255,.58); }
        .malik-photo-forge__focus .tl { left: 0; top: 0; border-left: 1px solid; border-top: 1px solid; border-radius: 7px 0 0 0; }
        .malik-photo-forge__focus .tr { right: 0; top: 0; border-right: 1px solid; border-top: 1px solid; border-radius: 0 7px 0 0; }
        .malik-photo-forge__focus .bl { left: 0; bottom: 0; border-left: 1px solid; border-bottom: 1px solid; border-radius: 0 0 0 7px; }
        .malik-photo-forge__focus .br { right: 0; bottom: 0; border-right: 1px solid; border-bottom: 1px solid; border-radius: 0 0 7px 0; }
        .malik-photo-forge__focus .focus-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; transform: translate(-50%,-50%); border-radius: 50%; background: #fff; opacity: .72; }
        .malik-photo-forge__focus .focus-ring { position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; transform: translate(-50%,-50%) scale(.84); border: 1px solid rgba(255,255,255,.14); border-radius: 50%; animation: malik-photo-focus-ring 1.9s ease-in-out infinite; will-change: transform, opacity; }

        .malik-photo-forge__sweeps { position: absolute; z-index: 10; inset: 45px 0 0; overflow: hidden; pointer-events: none; }
        .malik-photo-forge__sweeps .beam { position: absolute; opacity: 0; will-change: transform, opacity; }
        .malik-photo-forge__sweeps .horizontal { left: -10%; width: 120%; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.92) 48%, rgba(255,255,255,.92) 52%, transparent); }
        .malik-photo-forge__sweeps .vertical { top: -10%; height: 120%; width: 1px; background: linear-gradient(180deg, transparent, rgba(255,255,255,.92) 48%, rgba(255,255,255,.92) 52%, transparent); }
        .malik-photo-forge__sweeps .top-down { top: -1px; animation: malik-photo-top-down 8s linear infinite; }
        .malik-photo-forge__sweeps .bottom-up { bottom: -1px; animation: malik-photo-bottom-up 8s linear infinite; }
        .malik-photo-forge__sweeps .left-right { left: -1px; animation: malik-photo-left-right 8s linear infinite; }
        .malik-photo-forge__sweeps .right-left { right: -1px; animation: malik-photo-right-left 8s linear infinite; }

        .malik-photo-forge__badge { position: absolute; z-index: 18; right: 12px; top: 54px; padding: 6px 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 999px; background: #090909; color: #919191; font-size: 8px; }

        .malik-photo-stage__caption { position: absolute; z-index: 30; left: 12px; right: 12px; bottom: 11px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 11px; color: #d7d7d7; font-size: 11px; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: #090909; }
        .malik-photo-stage__caption strong { color: #fff; font-variant-numeric: tabular-nums; }

        .malik-photo-result { position: absolute; z-index: 25; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; background: #050505; filter: none !important; transform: scale(1.008); transition: opacity .28s linear, transform .38s ease; }
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

        @keyframes malik-photo-focus-ring {
          0%,100% { opacity: .16; transform: translate(-50%,-50%) scale(.82); }
          50% { opacity: .5; transform: translate(-50%,-50%) scale(1.06); }
        }
        @keyframes malik-photo-top-down {
          0%,2% { transform: translateY(-5px); opacity: 0; }
          4% { opacity: .74; }
          23% { transform: translateY(430px); opacity: .74; }
          25%,100% { transform: translateY(430px); opacity: 0; }
        }
        @keyframes malik-photo-bottom-up {
          0%,25% { transform: translateY(5px); opacity: 0; }
          27% { opacity: .68; }
          48% { transform: translateY(-430px); opacity: .68; }
          50%,100% { transform: translateY(-430px); opacity: 0; }
        }
        @keyframes malik-photo-left-right {
          0%,50% { transform: translateX(-5px); opacity: 0; }
          52% { opacity: .7; }
          73% { transform: translateX(690px); opacity: .7; }
          75%,100% { transform: translateX(690px); opacity: 0; }
        }
        @keyframes malik-photo-right-left {
          0%,75% { transform: translateX(5px); opacity: 0; }
          77% { opacity: .64; }
          98% { transform: translateX(-690px); opacity: .64; }
          100% { transform: translateX(-690px); opacity: 0; }
        }

        @media (max-width: 640px) {
          .malik-photo-motion { max-width: calc(100vw - 18px); }
          .malik-photo-stage { aspect-ratio: 1 / 1; border-radius: 18px; }
          .malik-photo-forge__top { height: 41px; padding-inline: 10px; }
          .malik-photo-forge__grid { inset: 49px 8px 58px; gap: 5px; }
          .malik-photo-forge__ref { border-radius: 9px; }
          .malik-photo-forge__ref span { left: 6px; bottom: 5px; font-size: 7px; }
          .malik-photo-forge__ref b { right: 5px; top: 5px; min-width: 18px; height: 18px; font-size: 7px; }
          .malik-photo-forge__focus { width: 112px; height: 82px; top: 48%; }
          .malik-photo-forge__focus .corner { width: 20px; height: 20px; }
          .malik-photo-forge__badge { display: none; }
          .malik-photo-stage__caption { left: 8px; right: 8px; bottom: 8px; padding: 8px 9px; font-size: 10px; }
          .malik-photo-forge__sweeps { top: 41px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .malik-photo-forge__focus .focus-ring,
          .malik-photo-forge__sweeps .beam { animation: none !important; }
          .malik-photo-forge__ref, .malik-photo-forge__ref img, .malik-photo-result { transition: none !important; }
        }
      `}</style>
    </section>
  )
}
