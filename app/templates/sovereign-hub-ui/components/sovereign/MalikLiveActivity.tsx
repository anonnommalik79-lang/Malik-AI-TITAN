"use client"

import { useEffect, useRef } from "react"
import { startThinkingTextMotion } from "@/lib/ui/thinking-text-motion"
import "./live-activity.css"

/** Only displays observed request state. Animation never invents completed work. */
export function MalikLiveActivity({ label = "Думаю…" }: { label?: string }) {
  const activity = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (activity.current) return startThinkingTextMotion(activity.current)
  }, [label])

  return <span ref={activity} className="malik-live-activity" role="status" data-malik-live-activity="thinking">
    <span className="sr-only">{label}</span>
    <span className="malik-live-activity__label" aria-hidden="true">{Array.from(label).map((letter, index) =>
      <span className="malik-live-activity__letter" key={index}>{letter}</span>
    )}</span>
  </span>
}
