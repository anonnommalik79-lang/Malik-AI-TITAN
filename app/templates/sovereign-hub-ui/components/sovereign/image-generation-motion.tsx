"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"

type ImageGenerationMotionProps = {
  prompt?: string
  resultUrl?: string
  failed?: boolean
  error?: string
}

type TileStyle = CSSProperties & Record<`--${string}`, string>

const PALETTES = [
  ["#ff5f6d", "#ffc371", "#7c4dff"],
  ["#00dbde", "#fc00ff", "#6a11cb"],
  ["#43e97b", "#38f9d7", "#11998e"],
  ["#fa709a", "#fee140", "#f5576c"],
  ["#30cfd0", "#330867", "#4facfe"],
  ["#f093fb", "#f5576c", "#4facfe"],
  ["#12c2e9", "#c471ed", "#f64f59"],
  ["#ff9966", "#ff5e62", "#f9d423"],
  ["#a18cd1", "#fbc2eb", "#84fab0"],
  ["#5ee7df", "#b490ca", "#fddb92"],
  ["#00f5a0", "#00d9f5", "#6a5cff"],
  ["#ff6a00", "#ee0979", "#7b2cff"],
] as const

function seeded(index: number, salt: number) {
  const raw = Math.sin((index + 1) * (12.9898 + salt * 3.17)) * 43758.5453
  return raw - Math.floor(raw)
}

function signed(index: number, salt: number, span: number) {
  return ((seeded(index, salt) * 2) - 1) * span
}

function buildTileStyle(index: number): TileStyle {
  const palette = PALETTES[index % PALETTES.length]
  const column = index % 6
  const row = Math.floor(index / 6)
  const left = 2.5 + column * 16.2 + signed(index, 1, 2.4)
  const top = 2.5 + row * 16.2 + signed(index, 2, 2.4)
  const angle = Math.round(seeded(index, 3) * 360)
  const duration = 3.25 + seeded(index, 4) * 2.4
  const delay = -(seeded(index, 5) * duration)

  return {
    left: `${left}%`,
    top: `${top}%`,
    background: `radial-gradient(circle at 20% 18%, rgba(255,255,255,.38), transparent 20%), radial-gradient(circle at 78% 72%, rgba(255,255,255,.15), transparent 20%), linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]} 54%, ${palette[2]})`,
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`,
    "--x1": `${signed(index, 6, 50)}px`,
    "--y1": `${signed(index, 7, 50)}px`,
    "--x2": `${signed(index, 8, 62)}px`,
    "--y2": `${signed(index, 9, 62)}px`,
    "--x3": `${signed(index, 10, 46)}px`,
    "--y3": `${signed(index, 11, 46)}px`,
    "--r1": `${signed(index, 12, 17)}deg`,
    "--r2": `${signed(index, 13, 22)}deg`,
    "--r3": `${signed(index, 14, 13)}deg`,
  }
}

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
  failed = false,
  error,
}: ImageGenerationMotionProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [visualProgress, setVisualProgress] = useState(8)
  const tiles = useMemo(() => Array.from({ length: 36 }, (_, index) => buildTileStyle(index)), [])

  useEffect(() => {
    setImageLoaded(false)
    setVisualProgress(resultUrl ? 94 : 8)
  }, [resultUrl])

  useEffect(() => {
    if (failed) return
    if (imageLoaded) {
      setVisualProgress(100)
      return
    }

    if (resultUrl) setVisualProgress((value) => Math.max(value, 94))

    const timer = window.setInterval(() => {
      setVisualProgress((value) => {
        if (value >= 94) return 94
        const step = value < 40 ? 3 : value < 72 ? 2 : 1
        return Math.min(94, value + step)
      })
    }, 620)

    return () => window.clearInterval(timer)
  }, [failed, imageLoaded, resultUrl])

  const isGenerating = !failed && (!resultUrl || !imageLoaded)
  const shownProgress = imageLoaded ? 100 : Math.min(94, Math.max(8, visualProgress))

  return (
    <div className="malik-photo-motion w-full max-w-[560px]" aria-live="polite" aria-busy={isGenerating}>
      <div className="malik-photo-motion__square relative aspect-square w-full overflow-hidden bg-black">
        {resultUrl ? (
          <img
            src={resultUrl}
            alt={prompt || "Generated image"}
            onLoad={() => {
              setImageLoaded(true)
              setVisualProgress(100)
            }}
            className={`absolute inset-0 z-20 h-full w-full object-contain transition-[opacity,transform,filter] duration-700 ease-out ${imageLoaded ? "scale-100 opacity-100 blur-0" : "scale-[1.025] opacity-0 blur-md"}`}
          />
        ) : null}

        {!failed ? (
          <div className={`absolute inset-0 z-10 bg-black transition-opacity duration-500 ${imageLoaded ? "pointer-events-none opacity-0" : "opacity-100"}`}>
            {tiles.map((style, index) => (
              <span
                key={index}
                className={`malik-photo-motion__tile malik-photo-motion__tile--${index % 4}`}
                style={style}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 min-h-6 text-center text-[16px] font-medium tracking-[-0.02em] text-zinc-200 sm:text-[17px]">
        {failed ? (
          <span>{friendlyGenerationError(error)}</span>
        ) : imageLoaded ? (
          <span>Изображение готово · 100%</span>
        ) : (
          <span>Генерирую по вашему запросу<span className="malik-photo-motion__dots" aria-hidden="true" /> · <strong className="font-semibold text-white">{shownProgress}%</strong></span>
        )}
      </div>

      {!failed ? (
        <div className="mx-auto mt-3 h-[3px] w-[72%] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="malik-photo-motion__progress-fill h-full rounded-full bg-white transition-[width] duration-500 ease-out"
            style={{ width: `${shownProgress}%` }}
          />
        </div>
      ) : null}

      <style jsx global>{`
        .malik-photo-motion__tile {
          position: absolute;
          width: 14.4%;
          aspect-ratio: 1 / 1;
          border-radius: 9px;
          opacity: .92;
          will-change: transform, opacity, filter;
          transform-origin: center;
          animation-name: malik-photo-drift-a;
          animation-timing-function: cubic-bezier(.42, 0, .58, 1);
          animation-iteration-count: infinite !important;
          animation-direction: alternate !important;
          box-shadow: 0 7px 20px rgba(0,0,0,.34);
        }

        .malik-photo-motion__tile--1 { animation-name: malik-photo-drift-b; }
        .malik-photo-motion__tile--2 { animation-name: malik-photo-drift-c; }
        .malik-photo-motion__tile--3 { animation-name: malik-photo-drift-d; }

        .malik-photo-motion__dots::after {
          content: "";
          display: inline-block;
          width: 20px;
          text-align: left;
          animation: malik-photo-dots 1.15s steps(4, end) infinite !important;
        }

        @keyframes malik-photo-drift-a {
          0% { transform: translate3d(0,0,0) rotate(0deg) scale(.92); opacity: .54; filter: saturate(.88) brightness(.88); }
          28% { transform: translate3d(var(--x1),var(--y1),0) rotate(var(--r1)) scale(1.05); opacity: 1; filter: saturate(1.22) brightness(1.08); }
          58% { transform: translate3d(var(--x2),var(--y2),0) rotate(var(--r2)) scale(.96); opacity: .72; filter: saturate(1.08) brightness(.95); }
          100% { transform: translate3d(var(--x3),var(--y3),0) rotate(var(--r3)) scale(1.02); opacity: .96; filter: saturate(1.18) brightness(1.04); }
        }

        @keyframes malik-photo-drift-b {
          0% { transform: translate3d(var(--x2),0,0) rotate(var(--r2)) scale(.98); opacity: .72; }
          34% { transform: translate3d(0,var(--y1),0) rotate(0deg) scale(1.08); opacity: 1; }
          69% { transform: translate3d(var(--x3),var(--y3),0) rotate(var(--r1)) scale(.91); opacity: .58; }
          100% { transform: translate3d(var(--x1),var(--y2),0) rotate(var(--r3)) scale(1.03); opacity: .94; }
        }

        @keyframes malik-photo-drift-c {
          0% { transform: translate3d(0,var(--y3),0) rotate(var(--r1)) scale(.9); opacity: .52; }
          31% { transform: translate3d(var(--x3),var(--y1),0) rotate(var(--r3)) scale(1.04); opacity: .96; }
          63% { transform: translate3d(var(--x1),0,0) rotate(var(--r2)) scale(1.09); opacity: 1; }
          100% { transform: translate3d(var(--x2),var(--y2),0) rotate(0deg) scale(.95); opacity: .76; }
        }

        @keyframes malik-photo-drift-d {
          0% { transform: translate3d(var(--x1),var(--y1),0) rotate(var(--r3)) scale(1.03); opacity: .92; }
          37% { transform: translate3d(var(--x2),0,0) rotate(var(--r1)) scale(.91); opacity: .56; }
          72% { transform: translate3d(0,var(--y3),0) rotate(var(--r2)) scale(1.08); opacity: 1; }
          100% { transform: translate3d(var(--x3),var(--y2),0) rotate(0deg) scale(.97); opacity: .8; }
        }

        @keyframes malik-photo-dots {
          0% { content: ""; }
          25% { content: "."; }
          50% { content: ".."; }
          75%, 100% { content: "..."; }
        }

        /* iOS Reduce Motion previously inherited the global rule that forced
           every animation to one 0.001ms iteration. This loader is functional
           progress feedback, so it must remain alive (just slower) there too. */
        @media (prefers-reduced-motion: reduce) {
          .malik-photo-motion__tile {
            animation-duration: 7s !important;
            animation-iteration-count: infinite !important;
            animation-direction: alternate !important;
          }
          .malik-photo-motion__dots::after {
            animation-duration: 1.4s !important;
            animation-iteration-count: infinite !important;
          }
        }
      `}</style>
    </div>
  )
}

export default ImageGenerationMotion
