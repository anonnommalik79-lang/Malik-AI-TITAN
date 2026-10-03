"use client"

import "./live-activity.css"

/** Only displays observed request state. Animation never invents completed work. */
export function MalikLiveActivity({ label = "Думаю…" }: { label?: string }) {
  return <p className="malik-live-activity" role="status" aria-live="polite" data-malik-live-activity="thinking">
    <span className="malik-live-activity__label">{label}</span>
  </p>
}
