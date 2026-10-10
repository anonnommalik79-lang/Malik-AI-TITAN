"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ExecutionTrace } from "@/lib/ai/chat-execution"
import {
  RESPONSE_STAGE_COLLAPSE_MS,
  RESPONSE_STAGE_DONE_HOLD_MS,
  RESPONSE_STAGE_DONE_INDEX,
  responseStageIndex,
  responseStageHappened,
  responseStageRows,
  responseStageSignalsFromTrace,
} from "@/lib/ai/response-stages"
import "./response-stages.css"

/**
 * The progress line under «Думаю…»: «Анализирую запрос…» → «Определяю
 * задачу…» → «Проверяю контекст…» → «Формирую ответ…» → «Готово», then the
 * line folds away and the answer stands alone.
 *
 * Interface statuses only — written by the app, driven by what the browser
 * observes (time, server steps, the model call, the first characters). It
 * never shows or reconstructs the model's hidden reasoning.
 *
 * Motion uses the Web Animations API: the app's low-FPS guard switches off
 * CSS keyframes on phones, and this short-lived indicator must still move.
 */

type Phase = "working" | "done" | "collapsing" | "gone"

/** Writing that starts this fast needs no progress line at all. */
const SKIP_IF_ANSWERED_WITHIN_MS = 260
const TYPE_MS_PER_CHAR = 24

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function canAnimate(element: Element | null): element is HTMLElement {
  return Boolean(element && typeof (element as HTMLElement).animate === "function")
}

/** Letters of the current status appear one by one; finished rows are whole. */
function useTypedText(text: string, typing: boolean) {
  const [count, setCount] = useState(() => (typing && !prefersReducedMotion() ? 0 : text.length))
  useEffect(() => {
    if (!typing || prefersReducedMotion()) {
      setCount(text.length)
      return
    }
    setCount(0)
    let shown = 0
    const timer = window.setInterval(() => {
      shown += 1
      setCount(shown)
      if (shown >= text.length) window.clearInterval(timer)
    }, TYPE_MS_PER_CHAR)
    return () => window.clearInterval(timer)
  }, [text, typing])
  return text.slice(0, count)
}

function StageRow({ label, state, current }: { label: string; state: "done" | "current"; current: boolean }) {
  const row = useRef<HTMLLIElement>(null)
  const typed = useTypedText(label, current)
  const typingNow = current && typed.length < label.length

  // A new row slides up and fades in.
  useIsoLayoutEffect(() => {
    if (!canAnimate(row.current) || prefersReducedMotion()) return
    const enter = row.current.animate(
      [{ opacity: 0, transform: "translateY(5px)", filter: "blur(2px)" }, { opacity: 1, transform: "translateY(0)", filter: "blur(0)" }],
      { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" },
    )
    return () => enter.cancel()
  }, [])

  // The current row breathes: a soft halo around its dot and a slow light
  // on its words. Finished rows are still.
  useEffect(() => {
    const element = row.current
    if (!current || !element || prefersReducedMotion()) return
    const halo = element.querySelector(".malik-stages__halo")
    const text = element.querySelector(".malik-stages__text")
    const caret = element.querySelector(".malik-stages__caret")
    const animations: Animation[] = []
    if (canAnimate(caret)) {
      animations.push(caret.animate(
        [{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: .51 }, { opacity: 0 }],
        { duration: 1000, iterations: Infinity },
      ))
    }
    if (canAnimate(halo)) {
      animations.push(halo.animate(
        [{ transform: "scale(.6)", opacity: .55 }, { transform: "scale(2.3)", opacity: 0 }],
        { duration: 1400, iterations: Infinity, easing: "cubic-bezier(.2,.6,.3,1)" },
      ))
    }
    if (canAnimate(text)) {
      animations.push(text.animate(
        [{ opacity: .78 }, { opacity: 1 }, { opacity: .78 }],
        { duration: 1800, iterations: Infinity, easing: "ease-in-out" },
      ))
    }
    const pause = () => animations.forEach((animation) => (document.hidden ? animation.pause() : animation.play()))
    document.addEventListener("visibilitychange", pause)
    return () => {
      document.removeEventListener("visibilitychange", pause)
      animations.forEach((animation) => animation.cancel())
    }
  }, [current])

  return (
    <li ref={row} className={`malik-stages__row is-${state}${current ? " is-current" : ""}`}>
      <span className="malik-stages__mark" aria-hidden="true">
        {state === "done" ? (
          <svg viewBox="0 0 12 12" className="malik-stages__check"><path d="M2.6 6.3 4.9 8.5 9.4 3.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <>
            <span className="malik-stages__halo" />
            <span className="malik-stages__dot" />
          </>
        )}
      </span>
      <span className="malik-stages__text" data-typing={typingNow || undefined}>
        {typed}
        {current ? <span className="malik-stages__caret" /> : null}
      </span>
    </li>
  )
}

export function MalikResponseStages({ trace, writing }: { trace?: ExecutionTrace; writing: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLSpanElement>(null)
  const mountedAt = useRef(Date.now())
  const startedAt = useRef(trace?.startedAt && trace.startedAt <= Date.now() ? trace.startedAt : Date.now())
  const shownIndex = useRef(0)
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<Phase>("working")

  const signals = responseStageSignalsFromTrace(trace)
  const ended = Boolean(trace && trace.state !== "running")
  const failed = Boolean(trace && ["failed", "cancelled", "interrupted"].includes(trace.state))
  const computed = responseStageIndex({ elapsedMs: now - startedAt.current, ...signals, writing: writing && !failed })
  shownIndex.current = Math.max(shownIndex.current, computed)
  const index = phase === "working" ? Math.min(shownIndex.current, RESPONSE_STAGE_DONE_INDEX) : RESPONSE_STAGE_DONE_INDEX

  // A clock only while working: stages that wait for time need it.
  useEffect(() => {
    if (phase !== "working") return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [phase])

  // Working → done → collapsing → gone.
  useEffect(() => {
    if (phase !== "working") return
    const answered = writing && !failed
    if (!answered && !ended) return
    // An instant answer (a greeting, a cached reply) never flashes the line.
    if (Date.now() - mountedAt.current < SKIP_IF_ANSWERED_WITHIN_MS) {
      setPhase("gone")
      return
    }
    // Stopped or failed without an answer: fold away without «Готово».
    setPhase(answered ? "done" : "collapsing")
  }, [ended, failed, phase, writing])

  useEffect(() => {
    if (phase !== "done") return
    const timer = window.setTimeout(() => setPhase("collapsing"), RESPONSE_STAGE_DONE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // The block folds its own height away, so the answer below rises smoothly.
  useEffect(() => {
    if (phase !== "collapsing") return
    const element = root.current
    const reduced = prefersReducedMotion()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      setPhase("gone")
    }
    const fallback = window.setTimeout(finish, (reduced ? 140 : RESPONSE_STAGE_COLLAPSE_MS) + 160)
    let fold: Animation | null = null
    if (canAnimate(element)) {
      const height = element.getBoundingClientRect().height
      fold = element.animate(
        reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { height: `${height}px`, opacity: 1, marginTop: getComputedStyle(element).marginTop, marginBottom: getComputedStyle(element).marginBottom, filter: "blur(0)" },
              { height: "0px", opacity: 0, marginTop: "0px", marginBottom: "0px", filter: "blur(3px)" },
            ],
        { duration: reduced ? 140 : RESPONSE_STAGE_COLLAPSE_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
      )
      fold.onfinish = finish
    } else {
      finish()
    }
    return () => {
      window.clearTimeout(fallback)
      if (fold) fold.onfinish = null
    }
  }, [phase])

  // A soft light travels down the rail while the request is being worked on.
  useEffect(() => {
    const element = rail.current
    if (phase !== "working" || !canAnimate(element) || prefersReducedMotion()) return
    const light = element.animate(
      [{ transform: "translateY(-100%)", opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .7 }, { transform: "translateY(100%)", opacity: 0 }],
      { duration: 1700, iterations: Infinity, easing: "ease-in-out" },
    )
    return () => light.cancel()
  }, [phase])

  // The whole line appears gently a moment after sending, so it reads as one
  // piece with «Думаю…» instead of popping in.
  useIsoLayoutEffect(() => {
    const element = root.current
    if (!canAnimate(element) || prefersReducedMotion()) return
    const enter = element.animate(
      [{ opacity: 0, transform: "translateY(-3px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 360, delay: 120, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" },
    )
    return () => enter.cancel()
  }, [])

  if (phase === "gone") return null

  // Only stages whose work really happened are listed, even as done.
  const rows = responseStageRows(index, 3, (stage) => responseStageHappened(stage, signals))
  const currentLabel = rows[rows.length - 1]?.label || ""
  return (
    <div
      ref={root}
      className="malik-stages"
      data-malik-response-stages={phase}
      data-stage={index}
      data-rows={rows.length}
      role="status"
      aria-live="polite"
      aria-label="Обработка ответа"
    >
      <span className="malik-stages__sr">{currentLabel}</span>
      <div className="malik-stages__body" aria-hidden="true">
        <span className="malik-stages__rail"><span ref={rail} className="malik-stages__rail-light" /></span>
        <ol className="malik-stages__list">
          {rows.map((row, position) => (
            <StageRow
              key={row.stage}
              label={row.label}
              state={row.state}
              current={position === rows.length - 1 && row.state === "current"}
            />
          ))}
        </ol>
      </div>
    </div>
  )
}
