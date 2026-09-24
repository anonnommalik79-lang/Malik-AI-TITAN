"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { SHOWCASE_LABELS, SHOWCASE_SLIDES, SHOWCASE_THEME } from "@/lib/presentations/showcase"
import { SlideFrame, slideBuildTiming } from "./SlideRenderer"

/**
 * The preview beside the prompt on a wide screen: a sample deck assembling
 * itself, slide after slide, the way the studio assembles the user's own.
 * It is an example and says so; nothing is being generated or charged.
 */

const COUNTS = [3, 5, 8, 10]

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

export function PresentationShowcase() {
  const [at, setAt] = useState(0)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (reducedMotion()) return
    const slide = SHOWCASE_SLIDES[at]
    const timer = window.setTimeout(() => {
      setAt((value) => (value + 1) % SHOWCASE_SLIDES.length)
      if (at === SHOWCASE_SLIDES.length - 1) setCycle((value) => value + 1)
    }, slideBuildTiming(slide).total + 1900)
    return () => window.clearTimeout(timer)
  }, [at])

  const count = COUNTS[at]
  const behind = [SHOWCASE_SLIDES[(at + 1) % SHOWCASE_SLIDES.length], SHOWCASE_SLIDES[(at + 2) % SHOWCASE_SLIDES.length]]

  return (
    <div className="ps-showcase" aria-hidden="true">
      <div className="ps-showcase-stack">
        <div className="ps-showcase-back ps-showcase-back--far">
          <SlideFrame slide={behind[1]} theme={SHOWCASE_THEME} index={(at + 2) % 4} total={10} />
        </div>
        <div className="ps-showcase-back ps-showcase-back--near">
          <SlideFrame slide={behind[0]} theme={SHOWCASE_THEME} index={(at + 1) % 4} total={10} />
        </div>
        <div className="ps-showcase-main" key={`${cycle}-${at}`}>
          <SlideFrame slide={SHOWCASE_SLIDES[at]} theme={SHOWCASE_THEME} index={at} total={10} build={!reducedMotion()} />
          <span className="ps-showcase-page">{String(at + 1).padStart(2, "0")} / 10</span>
        </div>
      </div>

      <div className="ps-showcase-status">
        <span>Пример · Malik AI собирает презентацию…</span>
        <b>{count} / 10 слайдов</b>
      </div>
      <div className="ps-showcase-progress"><span style={{ width: `${count * 10}%` }} /></div>

      <div className="ps-showcase-thumbs">
        {SHOWCASE_SLIDES.map((slide, index) => (
          <div key={slide.id} className="ps-showcase-thumb" data-state={index < at ? "done" : index === at ? "now" : "next"}>
            <SlideFrame slide={slide} theme={SHOWCASE_THEME} index={index} total={10} />
            <span className="ps-showcase-thumb-num">{String(index + 1).padStart(2, "0")}</span>
            <span className="ps-showcase-thumb-label">{SHOWCASE_LABELS[index]}</span>
            {index <= at ? <span className="ps-showcase-check"><Check size={11} strokeWidth={3} /></span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PresentationShowcase
