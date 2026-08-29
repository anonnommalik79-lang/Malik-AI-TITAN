"use client"

import { useEffect, useMemo, useState } from "react"
import { playImageGenerationCompleteSound, playImageGenerationStartSound } from "@/lib/media/image-generation-sound"
import { resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

type ImageGenerationMotionProps = {
  prompt?: string
  resultUrl?: string
  /** Inline copy of the same image, used only if the durable URL fails to load. */
  fallbackUrl?: string
  /** Lifecycle of the underlying job, so the card can stop when the job stops. */
  status?: "queued" | "thinking" | "generating" | "rendering" | "ready" | "failed"
  /** ISO timestamp of when the job started, so the watchdog survives a reload. */
  startedAt?: string
  provider?: string
  failed?: boolean
  error?: string
}

// A photo job that has produced nothing after this long is dead. Without a hard
// stop the sketch loop below repeated forever and the card could never settle,
// which is exactly what a reloaded chat used to show.
const GENERATION_WATCHDOG_MS = 3 * 60 * 1000
const IMAGE_LOAD_TIMEOUT_MS = 25_000
const CYCLE_MS = 7200
const MAX_CYCLES = Math.ceil(GENERATION_WATCHDOG_MS / CYCLE_MS)

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

export function ImageGenerationMotion({
  prompt,
  resultUrl,
  fallbackUrl,
  status,
  startedAt,
  provider,
  failed = false,
  error,
}: ImageGenerationMotionProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [resolvedResultUrl, setResolvedResultUrl] = useState("")
  const [usingFallback, setUsingFallback] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [visualProgress, setVisualProgress] = useState(8)
  const [cycle, setCycle] = useState(0)

  // Anchored to the job, not to this mount, so reopening the chat cannot restart
  // a three-minute countdown on a job that started ten minutes ago.
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
    setVisualProgress(resultUrl ? 94 : 8)
    if (!resultUrl) {
      return
    }

    let cancelled = false
    resolveGeneratedImageUrl(resultUrl)
      .then((url) => { if (!cancelled) setResolvedResultUrl(url) })
      .catch((reason) => {
        if (cancelled) return
        // A missing IndexedDB copy is not fatal while an inline copy exists.
        if (fallbackUrl) {
          setUsingFallback(true)
          setResolvedResultUrl(fallbackUrl)
          return
        }
        setLoadError(reason instanceof Error ? reason.message : "Не удалось восстановить изображение.")
      })
    return () => { cancelled = true }
  }, [fallbackUrl, resultUrl, startedAtMs])

  const actuallyFailed = failed || status === "failed" || Boolean(loadError)

  // The job reported success but handed over nothing renderable. Say so instead
  // of animating a result that will never arrive.
  useEffect(() => {
    if (actuallyFailed || imageLoaded) return
    if (status === "ready" && !resultUrl) setLoadError(EMPTY_RESULT_MESSAGE)
  }, [actuallyFailed, imageLoaded, resultUrl, status])

  // Hard stop. Whatever else goes wrong upstream, the card always reaches a
  // terminal state the user can act on.
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
    const timer = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [actuallyFailed, imageLoaded, startedAtMs])

  useEffect(() => {
    if (!resolvedResultUrl || imageLoaded || actuallyFailed) return
    const timer = window.setTimeout(() => {
      // One retry through the inline copy before giving up on a slow/blocked file.
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
    if (actuallyFailed || imageLoaded) return
    playImageGenerationStartSound()
  }, [actuallyFailed, imageLoaded])

  useEffect(() => {
    if (actuallyFailed || imageLoaded || cycle >= MAX_CYCLES) return
    const timer = window.setInterval(() => setCycle((value) => Math.min(MAX_CYCLES, value + 1)), CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [actuallyFailed, cycle, imageLoaded])

  useEffect(() => {
    if (actuallyFailed) return
    if (imageLoaded) {
      setVisualProgress(100)
      return
    }

    if (resultUrl) setVisualProgress((value) => Math.max(value, 94))

    const timer = window.setInterval(() => {
      setVisualProgress((value) => {
        if (value >= 94) return 94
        const step = value < 36 ? 3 : value < 68 ? 2 : 1
        return Math.min(94, value + step)
      })
    }, 560)

    return () => window.clearInterval(timer)
  }, [actuallyFailed, imageLoaded, resultUrl])

  const isGenerating = !actuallyFailed && (!resolvedResultUrl || !imageLoaded)
  const shownProgress = imageLoaded ? 100 : Math.min(94, Math.max(8, visualProgress))

  return (
    <div className="malik-photo-motion mx-auto" aria-live="polite" aria-busy={isGenerating}>
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
          <div key={cycle} className="malik-art-cycle" aria-hidden="true">
            <div className="malik-art-paper" />

            <svg className="malik-art-sketch" viewBox="0 0 420 420">
              <path className="malik-art-line l1" pathLength="1" d="M43 173 L112 105 L181 173" />
              <path className="malik-art-line l2" pathLength="1" d="M59 158 L59 246 L165 246 L165 158" />
              <path className="malik-art-line thin l3" pathLength="1" d="M91 246 L91 202 L126 202 L126 246" />
              <path className="malik-art-line thin l4" pathLength="1" d="M70 177 L95 177 L95 199 L70 199 Z" />
              <path className="malik-art-line thin l5" pathLength="1" d="M130 177 L154 177 L154 199 L130 199 Z" />
              <path className="malik-art-line thin l6" pathLength="1" d="M143 119 L143 88 L160 88 L160 136" />
              <path className="malik-art-line thin l7" pathLength="1" d="M42 252 C84 244 136 244 181 252" />

              <path className="malik-art-line bold l8" pathLength="1" d="M205 254 C220 221 246 207 286 204 C317 203 343 217 359 247 L382 252 C392 254 399 263 399 276 L399 294 L201 294 L201 270 C201 261 202 257 205 254 Z" />
              <path className="malik-art-line l9" pathLength="1" d="M239 221 L265 184 L323 184 L352 224" />
              <path className="malik-art-line thin l10" pathLength="1" d="M269 190 L269 226 M320 190 L333 225" />
              <path className="malik-art-line thin l11" pathLength="1" d="M209 258 L243 258 M356 258 L388 258" />
              <path className="malik-art-line thin l12" pathLength="1" d="M264 242 L307 242" />

              <circle className="malik-art-wheel w1" cx="246" cy="295" r="21" />
              <circle className="malik-art-wheel w2" cx="354" cy="295" r="21" />
              <circle className="malik-art-wheel w3" cx="246" cy="295" r="8" />
              <circle className="malik-art-wheel w4" cx="354" cy="295" r="8" />

              <circle className="malik-art-line thin l13" pathLength="1" cx="334" cy="91" r="24" />
              <path className="malik-art-line thin l14" pathLength="1" d="M334 49 L334 35 M334 147 L334 133 M292 91 L278 91 M390 91 L376 91 M304 61 L294 51 M364 121 L374 131 M364 61 L374 51 M304 121 L294 131" />
            </svg>

            <span className="malik-paint p1" />
            <span className="malik-paint p2" />
            <span className="malik-paint p3" />
            <span className="malik-paint p4" />

            <div className="malik-coded-hand">
              <svg viewBox="0 0 255 190">
                <defs>
                  <linearGradient id={`skinMain-${cycle}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f7d8c2" />
                    <stop offset="42%" stopColor="#efc2a0" />
                    <stop offset="100%" stopColor="#dfa77f" />
                  </linearGradient>
                  <linearGradient id={`skinLight-${cycle}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffe0cc" />
                    <stop offset="100%" stopColor="#efbd9a" />
                  </linearGradient>
                  <linearGradient id={`sleeve-${cycle}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f5f7fb" />
                    <stop offset="100%" stopColor="#dfe4ed" />
                  </linearGradient>
                  <linearGradient id={`pen-${cycle}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#171717" />
                    <stop offset="45%" stopColor="#555" />
                    <stop offset="70%" stopColor="#242424" />
                    <stop offset="100%" stopColor="#080808" />
                  </linearGradient>
                  <linearGradient id={`metal-${cycle}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a9adb1" />
                    <stop offset="45%" stopColor="#f1f2f3" />
                    <stop offset="100%" stopColor="#8f9499" />
                  </linearGradient>
                </defs>

                <path fill={`url(#sleeve-${cycle})`} d="M0 95 C18 74 39 65 63 67 C76 68 87 74 94 83 L88 137 C65 143 35 139 0 122 Z" />
                <path fill="none" stroke="#cfd5df" strokeWidth="2.2" d="M1 94 C24 73 47 67 67 69 C78 70 87 74 94 82" />

                <path fill={`url(#skinMain-${cycle})`} d="M51 66 C62 54 76 49 90 51 C103 53 116 60 126 70 C136 80 142 92 141 104 C140 117 133 127 122 133 C109 140 94 139 81 133 C71 128 64 121 57 117 C50 113 44 114 36 111 C28 108 25 99 28 91 C31 81 41 76 51 66 Z" />
                <path fill={`url(#skinLight-${cycle})`} d="M86 52 C101 43 122 44 135 54 C143 60 146 69 141 76 C137 82 128 83 119 81 C107 78 97 73 88 69 C78 65 78 57 86 52 Z" />
                <path fill={`url(#skinMain-${cycle})`} d="M95 68 C110 62 130 65 141 76 C148 83 148 91 142 97 C137 103 127 102 117 99 C105 96 94 91 87 85 C79 78 84 71 95 68 Z" />
                <path fill={`url(#skinMain-${cycle})`} d="M96 84 C110 81 127 85 136 95 C142 102 140 110 134 115 C128 120 120 119 111 116 C101 113 91 108 86 102 C81 96 86 87 96 84 Z" />
                <path fill="#d89f79" d="M60 91 C69 83 82 82 91 88 C98 93 98 101 93 107 C87 114 75 118 66 115 C57 112 53 99 60 91 Z" />

                <path fill="#f8d7c4" stroke="#dba789" strokeWidth="1" d="M120 54 C129 53 136 58 137 64 C137 68 133 70 127 69 C121 68 116 64 116 60 C116 57 117 55 120 54 Z" />
                <path fill="#f8d7c4" stroke="#dba789" strokeWidth="1" d="M127 80 C134 80 140 84 140 89 C140 92 137 94 133 93 C127 92 122 89 122 86 C122 83 124 81 127 80 Z" />

                <path fill="none" stroke="#c88f6e" strokeWidth="1.15" strokeLinecap="round" opacity=".72" d="M101 55 C112 57 123 60 132 66 M108 76 C118 78 127 81 136 86 M106 94 C115 96 124 99 131 103 M64 99 C71 96 79 96 86 101 M68 119 C78 112 89 109 100 111 M91 126 C101 123 111 123 120 126" />
                <path fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="5" strokeLinecap="round" d="M52 71 C65 58 82 57 98 63 M38 96 C48 91 58 93 67 99" />

                <g transform="translate(100 58) rotate(-16)">
                  <rect fill={`url(#pen-${cycle})`} x="0" y="0" width="116" height="14" rx="7" />
                  <rect fill={`url(#metal-${cycle})`} x="82" y="0" width="9" height="14" />
                  <polygon fill="#b79a73" points="116,0 137,7 116,14" />
                  <polygon fill="#101010" points="137,4 146,7 137,10" />
                  <rect x="-13" y="1" width="15" height="12" rx="5" fill="#b7b7b7" />
                </g>
              </svg>
            </div>

            <div className="malik-spray-rig">
              <span className="malik-spray-can" />
              <span className="malik-spray-cap" />
              <span className="malik-spray-nozzle" />
              <span className="malik-spray-jet" />
            </div>
          </div>
        ) : null}

        {actuallyFailed ? <div className="absolute inset-0 bg-white" /> : null}
        <div className="malik-art-flash" />
      </div>

      <div className="malik-art-status">
        {actuallyFailed ? (
          <span>{friendlyGenerationError(loadError || error)}</span>
        ) : imageLoaded ? (
          <span>Изображение готово · 100% · <strong>{elapsedSeconds} с</strong></span>
        ) : (
          <span>Генератор обрабатывает точный запрос · <strong>{elapsedSeconds} с</strong></span>
        )}
      </div>

      {!actuallyFailed ? (
        <div className="malik-art-progress" aria-hidden="true">
          <span style={{ width: `${shownProgress}%` }} />
        </div>
      ) : null}

      {/* The finished card states plainly what was produced. Before this, a
          completed generation left nothing behind but the picture, so there was
          no way to tell a real result from an animation frozen at the end. */}
      {imageLoaded && !actuallyFailed ? (
        <div className="malik-art-report">
          <p className="malik-art-report__row">
            <span>Готово</span>
            {provider ? <em>{provider}</em> : null}
          </p>
          {prompt ? <p className="malik-art-report__prompt">{prompt}</p> : null}
          <a href={resolvedResultUrl} target="_blank" rel="noreferrer" className="malik-art-report__open">
            Открыть оригинал
          </a>
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
          background: #fff;
          box-shadow: 0 20px 55px rgba(0,0,0,.22);
          isolation: isolate;
        }

        .malik-art-cycle,
        .malik-art-paper {
          position: absolute;
          inset: 0;
        }

        .malik-art-cycle { z-index: 5; }

        .malik-art-paper {
          background:
            radial-gradient(circle at 14% 10%, rgba(0,0,0,.026), transparent 18%),
            radial-gradient(circle at 88% 15%, rgba(0,0,0,.018), transparent 20%),
            linear-gradient(180deg,#fff,#fcfcfc);
        }

        .malik-art-paper::after {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .24;
          background:
            linear-gradient(rgba(0,0,0,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,.018) 1px, transparent 1px);
          background-size: 24px 24px;
        }

        .malik-art-sketch {
          position: absolute;
          inset: 7%;
          width: 86%;
          height: 86%;
          overflow: visible;
          z-index: 3;
        }

        .malik-art-line {
          fill: none;
          stroke: #151515;
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 1;
          animation: malik-art-draw .28s cubic-bezier(.24,.75,.28,1) forwards;
        }
        .malik-art-line.thin { stroke-width: 2.6; }
        .malik-art-line.bold { stroke-width: 5.2; }
        .malik-art-line.l1 { animation-delay: .18s; animation-duration: .34s; }
        .malik-art-line.l2 { animation-delay: .48s; }
        .malik-art-line.l3 { animation-delay: .70s; }
        .malik-art-line.l4 { animation-delay: .88s; }
        .malik-art-line.l5 { animation-delay: 1.05s; }
        .malik-art-line.l6 { animation-delay: 1.22s; }
        .malik-art-line.l7 { animation-delay: 1.40s; }
        .malik-art-line.l8 { animation-delay: 1.58s; animation-duration: .58s; }
        .malik-art-line.l9 { animation-delay: 2.08s; animation-duration: .34s; }
        .malik-art-line.l10 { animation-delay: 2.35s; }
        .malik-art-line.l11 { animation-delay: 2.56s; }
        .malik-art-line.l12 { animation-delay: 2.76s; }
        .malik-art-line.l13 { animation-delay: 3.00s; animation-duration: .32s; }
        .malik-art-line.l14 { animation-delay: 3.24s; animation-duration: .38s; }

        .malik-art-wheel {
          fill: #fff;
          stroke: #171717;
          stroke-width: 3.2;
          opacity: 0;
          animation: malik-wheel-pop .28s cubic-bezier(.2,.9,.2,1) forwards;
        }
        .malik-art-wheel.w1 { animation-delay: 2.72s; }
        .malik-art-wheel.w2 { animation-delay: 2.80s; }
        .malik-art-wheel.w3 { animation-delay: 2.88s; }
        .malik-art-wheel.w4 { animation-delay: 2.96s; }

        .malik-coded-hand {
          position: absolute;
          left: 0;
          top: 0;
          width: 52%;
          aspect-ratio: 255 / 190;
          z-index: 8;
          opacity: 0;
          transform-origin: 20% 53%;
          filter: drop-shadow(0 12px 12px rgba(0,0,0,.15)) drop-shadow(0 2px 2px rgba(0,0,0,.08));
          animation: malik-hand-write 4.05s cubic-bezier(.25,.68,.28,1) forwards;
          will-change: transform, opacity;
        }
        .malik-coded-hand svg { display: block; width: 100%; height: 100%; overflow: visible; }

        .malik-spray-rig {
          position: absolute;
          left: 0;
          top: 0;
          width: 19%;
          aspect-ratio: 94 / 132;
          z-index: 9;
          opacity: 0;
          animation: malik-spray-pass 2.18s cubic-bezier(.3,.64,.34,1) 4.05s forwards;
          filter: drop-shadow(0 10px 10px rgba(0,0,0,.16));
          will-change: transform, opacity;
        }
        .malik-spray-can {
          position: absolute;
          left: 15%; top: 22%;
          width: 64%; height: 67%;
          border-radius: 18% 18% 12% 12%;
          background: linear-gradient(180deg,#222 0 10%,#f0f0f0 10% 20%,#7658ff 20% 47%,#ff6b81 72%,#ffc45d);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), inset 10px 0 16px rgba(255,255,255,.16), inset -12px 0 15px rgba(0,0,0,.08);
        }
        .malik-spray-cap {
          position: absolute;
          left: 25%; top: 6%;
          width: 45%; height: 21%;
          border-radius: 10px 10px 5px 5px;
          background: #e9e9e9;
        }
        .malik-spray-nozzle {
          position: absolute;
          left: 37%; top: 11%;
          width: 15%; height: 6%;
          border-radius: 5px;
          background: #505050;
        }
        .malik-spray-jet {
          position: absolute;
          left: 51%; top: 10%;
          width: 108%; height: 18%;
          opacity: .72;
          background: linear-gradient(90deg, rgba(100,100,100,.3), rgba(160,160,160,.15), transparent);
          clip-path: polygon(0 38%,100% 0,100% 100%,0 62%);
          filter: blur(1.5px);
        }

        .malik-paint {
          position: absolute;
          z-index: 2;
          border-radius: 999px;
          opacity: 0;
          transform: scale(.12);
          filter: blur(6px);
          mix-blend-mode: multiply;
          animation: malik-paint-bloom .62s cubic-bezier(.2,.8,.2,1) forwards;
        }
        .malik-paint.p1 { width: 42%; height: 31%; left: 3%; top: 16%; background: #66cfff; animation-delay: 4.18s; }
        .malik-paint.p2 { width: 28%; height: 24%; right: 4%; top: 8%; background: #ffd85e; animation-delay: 4.55s; }
        .malik-paint.p3 { width: 46%; height: 26%; right: 3%; bottom: 16%; background: #ff6a6a; animation-delay: 4.95s; }
        .malik-paint.p4 { width: 46%; height: 21%; left: 4%; bottom: 7%; background: #69e3ac; animation-delay: 5.35s; }

        .malik-art-result {
          position: absolute;
          inset: 0;
          z-index: 20;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #080808;
          opacity: 0;
          transform: scale(1.04);
          filter: blur(16px) saturate(1.08);
          transition: opacity .78s ease, transform .95s cubic-bezier(.2,.8,.2,1), filter .95s ease;
        }
        .malik-art-result.is-visible {
          opacity: 1;
          transform: scale(1);
          filter: blur(0) saturate(1.03);
        }

        .malik-art-flash {
          position: absolute;
          inset: 0;
          z-index: 25;
          pointer-events: none;
          opacity: 0;
          background: #fff;
        }
        .malik-art-stage.is-finished .malik-art-flash { animation: malik-art-flash .5s ease; }

        .malik-art-status {
          margin-top: 13px;
          min-height: 24px;
          text-align: center;
          color: #e4e4e7;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -.02em;
        }
        .malik-art-status strong { color: #fff; font-weight: 650; }

        .malik-art-progress {
          width: 72%;
          height: 3px;
          margin: 10px auto 0;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.10);
        }
        .malik-art-progress > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #fff;
          transition: width .45s ease-out;
        }

        .malik-art-report {
          margin: 12px auto 0;
          width: 100%;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.035);
        }
        .malik-art-report__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgba(255,255,255,.62);
        }
        .malik-art-report__row em {
          font-style: normal;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: none;
          color: rgba(255,255,255,.45);
        }
        .malik-art-report__prompt {
          margin-top: 7px;
          font-size: 13.5px;
          line-height: 1.5;
          color: #d8d8dc;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .malik-art-report__open {
          display: inline-block;
          margin-top: 10px;
          font-size: 12.5px;
          font-weight: 700;
          color: #fff;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        @keyframes malik-art-draw { to { stroke-dashoffset: 0; } }
        @keyframes malik-wheel-pop {
          0% { opacity: 0; transform: scale(.25); transform-origin: center; }
          100% { opacity: 1; transform: scale(1); transform-origin: center; }
        }
        @keyframes malik-hand-write {
          0% { opacity: 0; transform: translate3d(-42%,42%,0) rotate(-8deg) scale(.92); }
          4% { opacity: 1; }
          12% { transform: translate3d(3%,26%,0) rotate(-17deg) scale(.94); }
          22% { transform: translate3d(16%,4%,0) rotate(-4deg) scale(.95); }
          32% { transform: translate3d(24%,35%,0) rotate(12deg) scale(.94); }
          43% { transform: translate3d(48%,30%,0) rotate(-3deg) scale(.94); }
          55% { transform: translate3d(58%,44%,0) rotate(9deg) scale(.94); }
          69% { transform: translate3d(67%,48%,0) rotate(-4deg) scale(.93); }
          82% { transform: translate3d(77%,22%,0) rotate(12deg) scale(.92); opacity: 1; }
          100% { opacity: 0; transform: translate3d(92%,10%,0) rotate(15deg) scale(.9); }
        }
        @keyframes malik-spray-pass {
          0% { opacity: 0; transform: translate3d(-15%,25%,0) rotate(7deg); }
          5% { opacity: 1; }
          22% { transform: translate3d(180%,15%,0) rotate(10deg); }
          43% { transform: translate3d(35%,105%,0) rotate(5deg); }
          66% { transform: translate3d(260%,92%,0) rotate(12deg); }
          86% { transform: translate3d(80%,205%,0) rotate(7deg); opacity: 1; }
          100% { opacity: 0; transform: translate3d(285%,210%,0) rotate(12deg); }
        }
        @keyframes malik-paint-bloom {
          0% { opacity: 0; transform: scale(.12); }
          100% { opacity: .66; transform: scale(1); }
        }
        @keyframes malik-art-flash {
          0% { opacity: 0; }
          16% { opacity: .55; }
          100% { opacity: 0; }
        }

        @media (max-width: 640px) {
          .malik-photo-motion {
            width: min(88vw, 390px);
            max-width: calc(100vw - 36px);
          }
          .malik-art-stage { border-radius: 20px; }
          .malik-art-status { font-size: 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .malik-coded-hand,
          .malik-spray-rig,
          .malik-art-line,
          .malik-art-wheel,
          .malik-paint {
            animation-duration: inherit !important;
          }
        }
      `}</style>
    </div>
  )
}

export default ImageGenerationMotion
