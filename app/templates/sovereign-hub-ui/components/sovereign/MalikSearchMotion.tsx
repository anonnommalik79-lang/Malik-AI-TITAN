"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { MalikLiveActivity } from "./MalikLiveActivity"

type MotionState = { target: HTMLElement | null; active: boolean; web: boolean; status: string; actions: string[] }
const EMPTY: MotionState = { target: null, active: false, web: false, status: "", actions: [] }
const clean = (value?: string | null) => String(value || "").replace(/\s+/g, " ").trim()

function findActiveThinking(): MotionState {
  const original = Array.from(document.querySelectorAll<HTMLElement>("[data-malik-message='assistant'] .malik-thinking-line, [data-malik-message='assistant'] .malik-activity")).at(-1)
  const message = original?.closest<HTMLElement>("[data-malik-message='assistant']")
  const messages = document.querySelectorAll("[data-malik-message]")
  if (!original?.isConnected || !original.parentElement || messages[messages.length - 1] !== message
    || message?.querySelector(".malik-md, [data-malik-image-motion='1'], .malik-execution")) return EMPTY
  const web = original.classList.contains("malik-activity")
  const actions = web ? [...new Set(Array.from(original.querySelectorAll(".malik-activity-row:not(.is-meta) .malik-activity-text")).map((node) => clean(node.textContent)).filter(Boolean))].slice(-4) : []
  return { target: original.parentElement, active: Boolean(original.querySelector(".malik-thinking-dots")), web, status: clean(original.getAttribute("data-malik-status")), actions }
}

/** Compatibility with older turns; current execution traces render their own activity. */
export function MalikSearchMotion() {
  const [motion, setMotion] = useState<MotionState>(EMPTY)
  useEffect(() => {
    const scan = () => {
      const next = findActiveThinking()
      setMotion((previous) => previous.target === next.target && previous.active === next.active && previous.web === next.web
        && previous.status === next.status && previous.actions.join("|") === next.actions.join("|") ? previous : next)
    }
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "data-malik-status"] })
    return () => observer.disconnect()
  }, [])
  const style = <style>{`
    [data-malik-message='assistant'] .malik-thinking-line,
    [data-malik-message='assistant'] .malik-activity { display:none!important; }
    [data-malik-message='assistant'] section[aria-label='План Malik Action OS'] { display:none!important; }
    .malik-message-card:has(.malik-md) > .malik-think-v8 { display:none!important; }
    .malik-think-v8 { min-width:0; }
  `}</style>
  if (!motion.target || !motion.active) return style
  return <>{style}{createPortal(<div className="malik-think-v8">
    <MalikLiveActivity />
  </div>, motion.target)}</>
}

export default MalikSearchMotion
