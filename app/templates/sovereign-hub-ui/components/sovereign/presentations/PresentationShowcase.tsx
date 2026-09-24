"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { SHOWCASE } from "@/lib/presentations/showcase"
import { SlideFrame, slideBuildTiming } from "./SlideRenderer"

/**
 * The preview beside the prompt on a wide screen: slides from professional
 * decks assembling themselves one after another, the way the studio assembles
 * the user's own. It is an example and says so; nothing is being generated or
 * charged.
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
    const timer = window.setTimeout(() => {
      setAt((value) => (value + 1) % SHOWCASE.length)
      if (at === SHOWCASE.length - 1) setCycle((value) => value + 1)
    }, slideBuildTiming(SHOWCASE[at].slide).total + 2200)
    return () => window.clearTimeout(timer)
  }, [at])

  const count = COUNTS[at]
  const near = SHOWCASE[(at + 1) % SHOWCASE.length]
  const far = SHOWCASE[(at + 2) % SHOWCASE.length]
  const current = SHOWCASE[at]

  return (
    <div className="ps-showcase" aria-hidden="true">
      <div className="ps-showcase-stack">
        <div className="ps-showcase-back ps-showcase-back--far">
          <SlideFrame slide={far.slide} theme={far.theme} index={(at + 2) % 4} total={10} />
        </div>
        <div className="ps-showcase-back ps-showcase-back--near">
          <SlideFrame slide={near.slide} theme={near.theme} index={(at + 1) % 4} total={10} />
        </div>
        <div className="ps-showcase-main" key={`${cycle}-${at}`}>
          <SlideFrame slide={current.slide} theme={current.theme} index={at} total={10} build={!reducedMotion()} />
          <span className="ps-showcase-page">{String(at + 1).padStart(2, "0")} / 10</span>
        </div>
      </div>

      <div className="ps-showcase-status">
        <span>Пример · Malik AI собирает презентацию…</span>
        <b>{count} / 10 слайдов</b>
      </div>
      <div className="ps-showcase-progress"><span style={{ width: `${count * 10}%` }} /></div>

      <div className="ps-showcase-thumbs">
        {SHOWCASE.map((item, index) => (
          <div key={item.slide.id} className="ps-showcase-thumb" data-state={index < at ? "done" : index === at ? "now" : "next"}>
            <SlideFrame slide={item.slide} theme={item.theme} index={index} total={10} />
            <span className="ps-showcase-thumb-num">{String(index + 1).padStart(2, "0")}</span>
            <span className="ps-showcase-thumb-label">{item.label}</span>
            {index <= at ? <span className="ps-showcase-check"><Check size={11} strokeWidth={3} /></span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PresentationShowcase
