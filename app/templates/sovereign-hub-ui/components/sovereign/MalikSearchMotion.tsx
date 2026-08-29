"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

const WEB_STEPS = [
  { title: "Понимаю запрос", detail: "Определяю, что именно нужно проверить", icon: "⌕" },
  { title: "Ищу в интернете", detail: "Нахожу свежие страницы и открытые источники", icon: "◎" },
  { title: "Читаю источники", detail: "Сверяю детали и отсеиваю слабые результаты", icon: "▤" },
  { title: "Сравниваю данные", detail: "Проверяю факты, даты и расхождения", icon: "◇" },
  { title: "Собираю ответ", detail: "Структурирую всё по полкам", icon: "✓" },
] as const

const CHAT_STEPS = [
  { title: "Понимаю запрос", detail: "Определяю задачу и контекст", icon: "⌕" },
  { title: "Анализирую", detail: "Сопоставляю факты и выбираю лучший ход", icon: "◇" },
  { title: "Собираю ответ", detail: "Формирую чистый и структурированный результат", icon: "✓" },
] as const

type MotionState = {
  target: HTMLElement | null
  web: boolean
  sourceCount: number
}

function findActiveThinking(): MotionState {
  if (typeof document === "undefined") return { target: null, web: false, sourceCount: 0 }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("[data-malik-message='assistant'] .malik-thinking-line, [data-malik-message='assistant'] .malik-activity"),
  )
  const original = candidates.at(-1) || null
  if (!original || !original.isConnected) return { target: null, web: false, sourceCount: 0 }

  const target = original.parentElement
  const web = original.classList.contains("malik-activity")
  const sourceCount = web
    ? original.querySelectorAll(".malik-live-source-icons .malik-source-icon").length
    : 0

  return { target, web, sourceCount }
}

export function MalikSearchMotion() {
  const [motion, setMotion] = useState<MotionState>({ target: null, web: false, sourceCount: 0 })
  const [step, setStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (typeof document === "undefined") return

    let frame = 0
    const scan = () => {
      frame = 0
      const next = findActiveThinking()
      setMotion((previous) => {
        if (
          previous.target === next.target &&
          previous.web === next.web &&
          previous.sourceCount === next.sourceCount
        ) return previous
        return next
      })
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    setStep(0)
    setElapsed(0)
    if (!motion.target) return

    const length = motion.web ? WEB_STEPS.length : CHAT_STEPS.length
    const startedAt = Date.now()
    const stepTimer = window.setInterval(() => {
      setStep((current) => Math.min(length - 1, current + 1))
    }, motion.web ? 900 : 1050)
    const elapsedTimer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    }, 1000)

    return () => {
      window.clearInterval(stepTimer)
      window.clearInterval(elapsedTimer)
    }
  }, [motion.target, motion.web])

  const steps = motion.web ? WEB_STEPS : CHAT_STEPS
  const current = steps[Math.min(step, steps.length - 1)]

  const style = (
    <style>{`
      [data-malik-message='assistant'] .malik-thinking-line,
      [data-malik-message='assistant'] .malik-activity {
        display: none !important;
      }

      .malik-search-motion {
        display: grid;
        gap: 10px;
        width: min(100%, 620px);
        padding: 2px 0 4px;
        color: #f2f2f3;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .malik-search-motion__head {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 24px;
        color: #f1f1f2;
        font-size: 15px;
        font-weight: 720;
        line-height: 1.4;
      }

      .malik-search-motion__spinner {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        border: 2px solid rgba(255,255,255,.16);
        border-top-color: #f2f2f3;
        border-radius: 999px;
        animation: malik-search-spin .82s linear infinite;
      }

      .malik-search-motion__timeline {
        position: relative;
        display: grid;
        gap: 0;
        margin-left: 8px;
        padding-left: 19px;
        border-left: 1px solid rgba(255,255,255,.11);
      }

      .malik-search-motion__step {
        position: relative;
        display: grid;
        grid-template-columns: 22px minmax(0,1fr);
        gap: 9px;
        align-items: start;
        min-width: 0;
        padding: 5px 0 10px;
        color: #707076;
        font-size: 13px;
        line-height: 1.48;
        opacity: .52;
        transform: translateY(3px);
        transition: opacity .28s ease, color .28s ease, transform .28s ease;
      }

      .malik-search-motion__step::before {
        content: "";
        position: absolute;
        left: -23px;
        top: 12px;
        width: 7px;
        height: 7px;
        border: 1px solid #4e4e53;
        border-radius: 999px;
        background: #303034;
        transition: background .28s ease, border-color .28s ease, box-shadow .28s ease;
      }

      .malik-search-motion__step.is-done {
        color: #b8b8bd;
        opacity: .84;
        transform: none;
      }

      .malik-search-motion__step.is-done::before {
        border-color: #75757b;
        background: #75757b;
      }

      .malik-search-motion__step.is-active {
        color: #f1f1f2;
        opacity: 1;
        transform: none;
      }

      .malik-search-motion__step.is-active::before {
        border-color: #eeeeef;
        background: #eeeeef;
        box-shadow: 0 0 0 4px rgba(255,255,255,.05);
      }

      .malik-search-motion__icon {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        color: inherit;
        font-size: 13px;
        font-weight: 760;
      }

      .malik-search-motion__copy {
        min-width: 0;
      }

      .malik-search-motion__copy strong {
        display: block;
        color: inherit !important;
        font-size: 13px !important;
        font-weight: 730 !important;
        line-height: 1.45 !important;
      }

      .malik-search-motion__copy small {
        display: block;
        margin-top: 2px;
        color: #737378;
        font-size: 12px;
        font-weight: 450;
        line-height: 1.45;
      }

      .malik-search-motion__sources {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin: 1px 0 0 27px;
      }

      .malik-search-motion__source {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 30px;
        padding: 0 10px;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 999px;
        background: #111112;
        color: #a7a7ac;
        font-size: 11px;
        font-weight: 650;
        animation: malik-search-chip-in .28s ease both;
      }

      .malik-search-motion__source-mark {
        display: grid;
        place-items: center;
        width: 15px;
        height: 15px;
        border-radius: 5px;
        background: #ececee;
        color: #101011;
        font-size: 8px;
        font-weight: 900;
      }

      .malik-search-motion__meta {
        margin-left: 27px;
        color: #636368;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }

      @keyframes malik-search-spin { to { transform: rotate(360deg); } }
      @keyframes malik-search-chip-in {
        from { opacity: 0; transform: translateY(4px) scale(.97); }
        to { opacity: 1; transform: none; }
      }

      @media (max-width: 640px) {
        .malik-search-motion { width: 100%; }
        .malik-search-motion__head { font-size: 14.5px; }
        .malik-search-motion__copy strong { font-size: 12.5px !important; }
        .malik-search-motion__copy small { font-size: 11.5px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .malik-search-motion__spinner { animation: none; }
        .malik-search-motion__step { transition: none; }
        .malik-search-motion__source { animation: none; }
      }
    `}</style>
  )

  if (!motion.target) return style

  const content = (
    <div className="malik-search-motion" aria-live="polite" aria-label={motion.web ? "Malik AI ищет и анализирует источники" : "Malik AI анализирует запрос"}>
      <div className="malik-search-motion__head">
        <span className="malik-search-motion__spinner" aria-hidden="true" />
        <span>{current.title}</span>
      </div>

      <div className="malik-search-motion__timeline">
        {steps.map((item, index) => (
          <div
            key={item.title}
            className={`malik-search-motion__step${index < step ? " is-done" : index === step ? " is-active" : ""}`}
          >
            <span className="malik-search-motion__icon" aria-hidden="true">{item.icon}</span>
            <span className="malik-search-motion__copy">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        ))}
      </div>

      {motion.web && motion.sourceCount > 0 ? (
        <div className="malik-search-motion__sources" aria-label={`Найдено источников: ${motion.sourceCount}`}>
          {Array.from({ length: Math.min(motion.sourceCount, 5) }, (_, index) => (
            <span className="malik-search-motion__source" key={index}>
              <span className="malik-search-motion__source-mark">{index + 1}</span>
              Источник {index + 1}
            </span>
          ))}
        </div>
      ) : null}

      <div className="malik-search-motion__meta">Работа {elapsed}s</div>
    </div>
  )

  return (
    <>
      {style}
      {createPortal(content, motion.target)}
    </>
  )
}

export default MalikSearchMotion
