"use client"

import "./live-activity.css"

/** Only displays observed request state. Animation never invents completed work. */
export function MalikLiveActivity({ label = "Думаю", detail = "Обрабатываю запрос…", writing = false }: { label?: string; detail?: string; writing?: boolean }) {
  return <div className={`malik-live-activity${writing ? " is-writing" : ""}`} role="status" aria-live="polite" data-malik-live-activity={writing ? "writing" : "thinking"}>
    <span className="malik-live-activity__orb" aria-hidden="true"><i /><b /><span /></span>
    <span className="malik-live-activity__body">
      <span className="malik-live-activity__label">{label}</span>
      <span className="malik-live-activity__detail" key={detail}>{detail}</span>
    </span>
  </div>
}
