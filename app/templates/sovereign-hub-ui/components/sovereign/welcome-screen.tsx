"use client"

import { memo } from "react"
import { MalikHybridHome, type MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

/**
 * The home screen carries its own hero image, so the shared Earth backdrop that
 * used to sit behind it was removed: two full-bleed layers competed for the
 * same space, and the outer one was the more expensive of the two.
 */
function WelcomeScreenInner(props: MalikHybridHomeProps) {
  return (
    <div className="malik-mobile-home relative isolate flex h-full min-h-0 w-full flex-1">
      <MalikHybridHome {...props} />
    </div>
  )
}

export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
