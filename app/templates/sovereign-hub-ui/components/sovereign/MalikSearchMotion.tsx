"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

type MotionState = {
  target: HTMLElement | null
  web: boolean
  active: boolean
  sourceCount: number
  observedElapsed: number
  actions: string[]
  thinkingLabel: string
}

const EMPTY_STATE: MotionState = {
  target: null,
  web: false,
  active: false,
  sourceCount: 0,
  observedElapsed: 0,
  actions: [],
  thinkingLabel: "",
}

function cleanText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function unique(items: string[]) {
  return items.filter((item, index) => item && items.indexOf(item) === index)
}

function sameMotion(a: MotionState, b: MotionState) {
  return (
    a.target === b.target &&
    a.web === b.web &&
    a.active === b.active &&
    a.sourceCount === b.sourceCount &&
    a.observedElapsed === b.observedElapsed &&
    a.thinkingLabel === b.thinkingLabel &&
    a.actions.length === b.actions.length &&
    a.actions.every((value, index) => value === b.actions[index])
  )
}

function findActiveThinking(): MotionState {
  if (typeof document === "undefined") return EMPTY_STATE

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-malik-message='assistant'] .malik-thinking-line, [data-malik-message='assistant'] .malik-activity",
    ),
  )
  const original = candidates.at(-1) || null
  if (!original || !original.isConnected) return EMPTY_STATE

  const target = original.parentElement
  if (!target) return EMPTY_STATE

  const web = original.classList.contains("malik-activity")
  const active = Boolean(original.querySelector(".malik-thinking-dots"))

  if (!web) {
    const clone = original.cloneNode(true) as HTMLElement
    clone.querySelectorAll(".malik-thinking-dots").forEach((node) => node.remove())
    return {
      target,
      web: false,
      active,
      sourceCount: 0,
      observedElapsed: 0,
      actions: [],
      thinkingLabel: cleanText(clone.textContent) || "Думаю",
    }
  }

  const actions = unique(
    Array.from(original.querySelectorAll<HTMLElement>(".malik-activity-row:not(.is-meta) .malik-activity-text"))
      .map((node) => cleanText(node.textContent))
      .filter(Boolean),
  )

  const sourceCount = original.querySelectorAll(".malik-live-source-icons .malik-source-icon").length
  const metaText = cleanText(
    original.querySelector<HTMLElement>(".malik-activity-row.is-meta .malik-activity-text")?.textContent,
  )
  const observedElapsed = Number(metaText.match(/(\d+)\s*s\b/i)?.[1] || 0)
  const thinkingLabel = actions.at(-1) || (sourceCount ? "Проверяю найденные источники" : "Ищу в Интернете")

  return {
    target,
    web: true,
    active,
    sourceCount,
    observedElapsed,
    actions,
    thinkingLabel,
  }
}

function isSearchAction(text: string) {
  return /(?:\bпоиск\b|\bищ(?:у|ет|ем|ем\s)|\bsearch(?:ing|ed)?\b|\bweb\s*search\b)/iu.test(text)
}

function makeSearchLine(text: string) {
  const value = cleanText(text)
  if (!value) return "Поиск в Интернете"
  if (/поиск\s+в\s+интернет/iu.test(value)) return value
  if (/^search(?:ing|ed)?\b/iu.test(value)) return `Поиск в Интернете · ${value}`
  if (/^ищ/iu.test(value)) return `Поиск в Интернете · ${value}`
  return value
}

export function MalikSearchMotion() {
  const [motion, setMotion] = useState<MotionState>(EMPTY_STATE)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [manualExpansion, setManualExpansion] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return

    let frame = 0
    const scan = () => {
      frame = 0
      const next = findActiveThinking()
      setMotion((previous) => (sameMotion(previous, next) ? previous : next))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-label"],
    })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    setElapsed(motion.observedElapsed)
    setExpanded(false)
    setManualExpansion(false)
  }, [motion.target])

  useEffect(() => {
    if (motion.observedElapsed > 0) {
      setElapsed((current) => Math.max(current, motion.observedElapsed))
    }
  }, [motion.observedElapsed])

  useEffect(() => {
    if (!motion.target || !motion.active) return
    const startedAt = Date.now() - Math.max(elapsed, motion.observedElapsed) * 1000
    const timer = window.setInterval(() => {
      setElapsed(Math.max(motion.observedElapsed, Math.round((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [motion.target, motion.active])

  const searchActions = useMemo(
    () => motion.actions.filter(isSearchAction).map(makeSearchLine),
    [motion.actions],
  )
  const searchCount = motion.web ? Math.max(motion.sourceCount, searchActions.length) : 0

  useEffect(() => {
    if (!motion.web || !searchCount || manualExpansion) return
    if (!motion.active) {
      setExpanded(false)
      return
    }

    setExpanded(true)
    const timer = window.setTimeout(() => setExpanded(false), 2300)
    return () => window.clearTimeout(timer)
  }, [motion.web, motion.active, searchCount, manualExpansion])

  const currentAction = useMemo(() => {
    const nonSearch = motion.actions.filter((item) => !isSearchAction(item))
    return nonSearch.at(-1) || motion.thinkingLabel || (motion.web ? "Проверяю найденные данные" : "Думаю")
  }, [motion.actions, motion.thinkingLabel, motion.web])

  const visibleSearches = searchActions.slice(-7)

  const style = (
    <style>{`
      [data-malik-message='assistant'] .malik-thinking-line,
      [data-malik-message='assistant'] .malik-activity {
        display: none !important;
      }

      .malik-search-motion {
        width: min(100%, 700px);
        padding: 3px 0 7px;
        color: #efeff1;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .malik-search-motion__stack {
        display: grid;
        gap: 7px;
      }

      .malik-search-motion__row,
      .malik-search-motion__summary {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        min-width: 0;
        min-height: 22px;
        color: #8f8f95;
        font-size: 13px;
        font-weight: 520;
        line-height: 1.5;
      }

      .malik-search-motion__summary {
        appearance: none;
        width: max-content;
        max-width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: #a9a9ae;
        cursor: pointer;
        text-align: left;
      }

      .malik-search-motion__summary:hover {
        color: #f1f1f2;
      }

      .malik-search-motion__icon {
        position: relative;
        display: grid;
        place-items: center;
        width: 17px;
        height: 20px;
        flex: 0 0 17px;
        color: #87878d;
        font-size: 14px;
        line-height: 1;
      }

      .malik-search-motion__icon.is-live::after {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: #ececee;
        box-shadow: 0 0 0 0 rgba(255,255,255,.2);
        animation: malik-research-pulse 1.25s ease-out infinite;
      }

      .malik-search-motion__label {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .malik-search-motion__chevron {
        display: inline-block;
        margin-left: 2px;
        color: #66666c;
        transform: rotate(0deg);
        transition: transform .2s ease, color .2s ease;
      }

      .malik-search-motion__summary.is-open .malik-search-motion__chevron {
        transform: rotate(90deg);
        color: #a9a9ae;
      }

      .malik-search-motion__searches {
        display: grid;
        gap: 6px;
        margin: 1px 0 3px 7px;
        padding: 2px 0 2px 19px;
        border-left: 1px solid rgba(255,255,255,.095);
        overflow: hidden;
        animation: malik-research-expand .2s ease both;
      }

      .malik-search-motion__search {
        display: grid;
        grid-template-columns: 16px minmax(0,1fr);
        gap: 8px;
        align-items: start;
        color: #737379;
        font-size: 12.5px;
        line-height: 1.48;
        animation: malik-research-line-in .22s ease both;
      }

      .malik-search-motion__search:last-child {
        color: #d7d7da;
      }

      .malik-search-motion__globe {
        display: grid;
        place-items: center;
        width: 16px;
        height: 18px;
        color: #6f6f75;
        font-size: 12px;
      }

      .malik-search-motion__stage {
        color: #c8c8cc;
      }

      .malik-search-motion__stage .malik-search-motion__icon {
        color: #d0d0d3;
      }

      .malik-search-motion__stage.is-active {
        color: #f0f0f1;
      }

      .malik-search-motion__timer {
        color: #66666c;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      .malik-search-motion__timer .malik-search-motion__icon {
        color: #5f5f65;
        font-size: 11px;
      }

      @keyframes malik-research-pulse {
        0% { box-shadow: 0 0 0 0 rgba(255,255,255,.20); opacity: 1; }
        70% { box-shadow: 0 0 0 5px rgba(255,255,255,0); opacity: .72; }
        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); opacity: 1; }
      }

      @keyframes malik-research-expand {
        from { opacity: 0; max-height: 0; transform: translateY(-3px); }
        to { opacity: 1; max-height: 260px; transform: none; }
      }

      @keyframes malik-research-line-in {
        from { opacity: 0; transform: translateY(3px); }
        to { opacity: 1; transform: none; }
      }

      @media (max-width: 640px) {
        .malik-search-motion { width: 100%; }
        .malik-search-motion__row,
        .malik-search-motion__summary { font-size: 12.5px; }
        .malik-search-motion__search { font-size: 12px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .malik-search-motion__icon.is-live::after,
        .malik-search-motion__searches,
        .malik-search-motion__search {
          animation: none !important;
        }
        .malik-search-motion__chevron { transition: none; }
      }
    `}</style>
  )

  if (!motion.target) return style

  const content = motion.web ? (
    <div className="malik-search-motion" aria-live="polite" aria-label="Ход веб-поиска Malik AI">
      <div className="malik-search-motion__stack">
        <button
          type="button"
          className={`malik-search-motion__summary${expanded ? " is-open" : ""}`}
          onClick={() => {
            setManualExpansion(true)
            setExpanded((value) => !value)
          }}
          aria-expanded={expanded}
        >
          <span className="malik-search-motion__icon" aria-hidden="true">⌕</span>
          <span className="malik-search-motion__label">
            {searchCount > 0 ? `Выполнено ${searchCount} ${searchCount === 1 ? "поиск" : searchCount < 5 ? "поиска" : "поисков"}` : "Ищу в Интернете"}
            {searchCount > 0 ? <span className="malik-search-motion__chevron">›</span> : null}
          </span>
        </button>

        {expanded && visibleSearches.length ? (
          <div className="malik-search-motion__searches" aria-label="Выполненные поиски">
            {visibleSearches.map((item, index) => (
              <div className="malik-search-motion__search" key={`${item}-${index}`}>
                <span className="malik-search-motion__globe" aria-hidden="true">◎</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`malik-search-motion__row malik-search-motion__stage${motion.active ? " is-active" : ""}`}>
          <span className="malik-search-motion__icon" aria-hidden="true">✦</span>
          <span className="malik-search-motion__label">{currentAction}</span>
        </div>

        <div className="malik-search-motion__row malik-search-motion__timer">
          <span className={`malik-search-motion__icon${motion.active ? " is-live" : ""}`} aria-hidden="true">
            {motion.active ? "" : "◷"}
          </span>
          <span className="malik-search-motion__label">
            {motion.active ? `Работаю · ${elapsed}s` : `Работало на протяжении ${elapsed}s`}
          </span>
        </div>
      </div>
    </div>
  ) : (
    <div className="malik-search-motion" aria-live="polite" aria-label="Malik AI думает">
      <div className="malik-search-motion__stack">
        <div className={`malik-search-motion__row malik-search-motion__stage${motion.active ? " is-active" : ""}`}>
          <span className="malik-search-motion__icon" aria-hidden="true">✦</span>
          <span className="malik-search-motion__label">{motion.thinkingLabel || "Думаю"}</span>
        </div>
        <div className="malik-search-motion__row malik-search-motion__timer">
          <span className={`malik-search-motion__icon${motion.active ? " is-live" : ""}`} aria-hidden="true">
            {motion.active ? "" : "◷"}
          </span>
          <span className="malik-search-motion__label">
            {motion.active ? `Работаю · ${elapsed}s` : `Работало на протяжении ${elapsed}s`}
          </span>
        </div>
      </div>
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
