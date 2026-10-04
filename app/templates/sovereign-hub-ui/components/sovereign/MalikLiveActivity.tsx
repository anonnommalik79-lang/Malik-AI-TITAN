"use client"

import { useEffect, useRef } from "react"
import { startThinkingTextMotion } from "@/lib/ui/thinking-text-motion"
import "./live-activity.css"

/** Only displays observed request state. Animation never invents completed work. */
export function MalikLiveActivity({ label = "Думаю…" }: { label?: string }) {
  const activity = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (activity.current) return startThinkingTextMotion(activity.current)
  }, [label])

  return <p ref={activity} className="malik-live-activity" role="status" aria-live="polite" data-malik-live-activity="thinking">
    <span className="malik-live-activity__label">{Array.from(label).map((letter, index) =>
      <span className="malik-live-activity__letter" key={index}>{letter}</span>
    )}</span>
  </p>
}
