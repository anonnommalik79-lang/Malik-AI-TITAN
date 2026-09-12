"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

type ActionKind = "search" | "source" | "reading" | "error" | "done" | "plan" | "other"
type MotionAction = { text: string; kind: ActionKind }
type MotionState = {
  target: HTMLElement | null
  active: boolean
  web: boolean
  sourceCount: number
  observedElapsed: number
  actions: MotionAction[]
}

const EMPTY_STATE: MotionState = {
  target: null,
  active: false,
  web: false,
  sourceCount: 0,
  observedElapsed: 0,
  actions: [],
}

function cleanText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function detectKind(text: string): ActionKind {
  const value = text.toLowerCase()
  if (/(?:ошиб|не удалось|недоступ|failed|error|timeout|таймаут)/iu.test(value)) return "error"
  if (/(?:найден\s+источник|source\s+found)/iu.test(value)) return "source"
  if (/(?:читаю|открываю|reading|read\s+source)/iu.test(value)) return "reading"
  if (/(?:поиск|ищ(?:у|ет|ем|ут)|search(?:ing|ed)?|web\s*search)/iu.test(value)) return "search"
  if (/(?:готов|заверш|done|complete)/iu.test(value)) return "done"
  if (/(?:проверя|сверя|сравни|анализир|планир|понима|verify|check|compare|analyse|analyze)/iu.test(value)) return "plan"
  return "other"
}

function sameMotion(a: MotionState, b: MotionState) {
  return a.target === b.target
    && a.active === b.active
    && a.web === b.web
    && a.sourceCount === b.sourceCount
    && a.observedElapsed === b.observedElapsed
    && a.actions.map((item) => `${item.kind}:${item.text}`).join("|") === b.actions.map((item) => `${item.kind}:${item.text}`).join("|")
}

function findActiveThinking(): MotionState {
  if (typeof document === "undefined") return EMPTY_STATE

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "[data-malik-message='assistant'] .malik-thinking-line, [data-malik-message='assistant'] .malik-activity",
  ))
  const original = candidates.at(-1) || null
  if (!original?.isConnected || !original.parentElement) return EMPTY_STATE

  const assistantMessage = original.closest<HTMLElement>("[data-malik-message='assistant']")
  if (assistantMessage?.querySelector("[data-malik-image-motion='1']")) return EMPTY_STATE

  const target = original.parentElement
  const active = Boolean(original.querySelector(".malik-thinking-dots"))
  const web = original.classList.contains("malik-activity")

  if (!web) return { ...EMPTY_STATE, target, active }

  const rows = Array.from(original.querySelectorAll<HTMLElement>(".malik-activity-row:not(.is-meta)"))
  const actions = rows
    .map((row) => cleanText(row.querySelector<HTMLElement>(".malik-activity-text")?.textContent))
    .filter(Boolean)
    .map((text) => ({ text, kind: detectKind(text) }))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.text === item.text) === index)

  const sourceCount = Math.max(
    original.querySelectorAll(".malik-live-source-icons .malik-source-icon").length,
    actions.filter((item) => item.kind === "source" || item.kind === "reading").length,
  )
  const metaText = cleanText(original.querySelector<HTMLElement>(".malik-activity-row.is-meta .malik-activity-text")?.textContent)

  return {
    target,
    active,
    web,
    sourceCount,
    observedElapsed: Number(metaText.match(/(\d+)\s*s\b/i)?.[1] || 0),
    actions,
  }
}

export function MalikSearchMotion() {
  const [motion, setMotion] = useState<MotionState>(EMPTY_STATE)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (typeof document === "undefined") return
    let frame = 0
    const scan = () => {
      frame = 0
      const next = findActiveThinking()
      setMotion((previous) => sameMotion(previous, next) ? previous : next)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(scan) }
    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "src"],
    })
    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    setElapsedMs(Math.max(0, motion.observedElapsed * 1000))
    if (!motion.target || !motion.active) return

    const startedAt = Date.now() - Math.max(0, motion.observedElapsed * 1000)
    const timer = window.setInterval(() => setElapsedMs(Math.max(0, Date.now() - startedAt)), 100)
    return () => window.clearInterval(timer)
  }, [motion.target, motion.active, motion.observedElapsed])

  const steps = useMemo(() => {
    const middle = motion.web && motion.sourceCount > 0
      ? `Сверяю ${motion.sourceCount} ${motion.sourceCount === 1 ? "источник" : "источника"}`
      : "Сверяю детали"
    return ["Понимаю запрос", middle, "Формирую ответ"]
  }, [motion.web, motion.sourceCount])

  const stepIndex = elapsedMs < 850 ? 0 : elapsedMs < 1800 ? 1 : 2
  const elapsedLabel = (elapsedMs / 1000).toFixed(1)

  const style = <style>{`
    [data-malik-message='assistant'] .malik-thinking-line,
    [data-malik-message='assistant'] .malik-activity { display:none!important; }
    [data-malik-message='assistant'] section[aria-label='План Malik Action OS'] { display:none!important; }

    .malik-think-v8{width:min(100%,720px);padding:4px 0 7px;color:#f0f0f1;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent;border:0;box-shadow:none}
    .malik-think-v8__title{display:flex;align-items:center;gap:9px;min-height:24px}
    .malik-think-v8__spark{position:relative;width:16px;height:16px;flex:0 0 16px;color:#f5f5f6;opacity:.62;animation:malik-v8-spark 1.05s ease-in-out infinite}
    .malik-think-v8__spark:before,.malik-think-v8__spark:after,.malik-think-v8__spark i,.malik-think-v8__spark b{content:"";position:absolute;left:50%;top:50%;border-radius:999px;background:currentColor;transform:translate(-50%,-50%)}
    .malik-think-v8__spark:before{width:2px;height:16px}.malik-think-v8__spark:after{width:16px;height:2px}.malik-think-v8__spark i{width:2px;height:11px;transform:translate(-50%,-50%) rotate(45deg)}.malik-think-v8__spark b{width:2px;height:11px;transform:translate(-50%,-50%) rotate(-45deg)}
    .malik-think-v8__word{font-size:15px;font-weight:620;line-height:1.2;letter-spacing:-.012em;color:transparent;background:linear-gradient(90deg,#65656b 0%,#85858b 27%,#a5a5ab 40%,#fff 50%,#a5a5ab 60%,#85858b 73%,#65656b 100%);background-size:190% 100%;background-position:-190% 50%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:malik-v8-word .66s linear infinite}
    .malik-think-v8__steps{display:grid;gap:5px;margin-top:10px;padding-left:25px}
    .malik-think-v8__step{display:flex;align-items:center;gap:8px;min-height:18px;color:#4f5057;font-size:12.5px;font-weight:500;line-height:1.4;transition:color .18s ease,transform .18s ease}
    .malik-think-v8__step.is-active{color:#c9c9ce;transform:translateX(1px)}
    .malik-think-v8__step.is-done{color:#6b6c73}
    .malik-think-v8__mark{display:grid;place-items:center;width:13px;height:13px;flex:0 0 13px;color:#66676e;font-size:11px}.malik-think-v8__step.is-active .malik-think-v8__mark{color:#f0f0f2}.malik-think-v8__step.is-done .malik-think-v8__mark{font-size:0}.malik-think-v8__step.is-done .malik-think-v8__mark:after{content:"";width:4px;height:4px;border-radius:50%;background:#65666d}
    .malik-think-v8__meta{display:flex;align-items:center;gap:8px;margin-top:7px;padding-left:25px;color:#505158;font-size:11.5px;line-height:1.3;font-variant-numeric:tabular-nums}
    .malik-think-v8__pulse{width:5px;height:5px;border-radius:50%;background:#ededee;animation:malik-v8-pulse 1.1s ease-out infinite}
    @keyframes malik-v8-word{0%{background-position:-190% 50%}100%{background-position:190% 50%}}
    @keyframes malik-v8-spark{0%,100%{opacity:.42;transform:scale(.96)}50%{opacity:1;transform:scale(1.06)}}
    @keyframes malik-v8-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.15)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
    @media(max-width:640px){.malik-think-v8{width:100%;padding-top:2px}.malik-think-v8__word{font-size:14.5px}.malik-think-v8__steps{padding-left:24px}.malik-think-v8__meta{padding-left:24px}}
    @media(prefers-reduced-motion:reduce){.malik-think-v8__word,.malik-think-v8__spark,.malik-think-v8__pulse{animation:none!important}.malik-think-v8__word{color:#f0f0f1!important;background:none!important;-webkit-text-fill-color:currentColor!important}}
  `}</style>

  if (!motion.target || !motion.active) return style

  const content = (
    <div className="malik-think-v8" aria-live="polite" aria-label="Malik AI думает">
      <div className="malik-think-v8__title">
        <span className="malik-think-v8__spark" aria-hidden="true"><i /><b /></span>
        <span className="malik-think-v8__word">Думаю</span>
      </div>
      <div className="malik-think-v8__steps">
        {steps.map((step, index) => (
          <div className={`malik-think-v8__step${index === stepIndex ? " is-active" : ""}${index < stepIndex ? " is-done" : ""}`} key={step}>
            <span className="malik-think-v8__mark" aria-hidden="true">{index === 0 ? "⌕" : index === 1 ? "✦" : "◷"}</span>
            <span>{step}</span>
          </div>
        ))}
      </div>
      <div className="malik-think-v8__meta"><span className="malik-think-v8__pulse" aria-hidden="true" /><span>Работа {elapsedLabel}s</span></div>
    </div>
  )

  return <>{style}{createPortal(content, motion.target)}</>
}

export default MalikSearchMotion
