"use client"

import type { HTMLAttributes } from "react"

type TitanBackgroundProps = HTMLAttributes<HTMLDivElement> & {
  density?: "calm" | "standard" | "deep"
  horizon?: boolean
  orbit?: boolean
  noise?: boolean
}

export function TitanBackground({
  className = "",
  density = "standard",
  horizon = true,
  orbit = true,
  noise = true,
  ...props
}: TitanBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={["malik-titan-bg", `malik-titan-bg-${density}`, className].filter(Boolean).join(" ")}
      {...props}
    >
      <span className="malik-titan-bg-gradient" />
      {noise ? <span className="malik-titan-bg-noise" /> : null}
      <span className="malik-titan-bg-grid" />
      <span className="malik-titan-bg-stars" />
      <span className="malik-titan-bg-orb malik-titan-bg-orb-a" />
      <span className="malik-titan-bg-orb malik-titan-bg-orb-b" />
      {orbit ? (
        <span className="malik-titan-bg-orbits">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <span className="malik-titan-bg-meteor malik-titan-bg-meteor-a" />
      <span className="malik-titan-bg-meteor malik-titan-bg-meteor-b" />
      {horizon ? <span className="malik-titan-bg-horizon" /> : null}
    </div>
  )
}

export function TitanDashboardAura() {
  return <TitanBackground className="malik-titan-dashboard-aura" density="calm" horizon={false} />
}

export default TitanBackground
