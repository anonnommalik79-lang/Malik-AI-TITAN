"use client"

import { memo } from "react"
import { MalikHybridHome, type MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

/**
 * Keep the entire center workspace on one continuous surface. The home itself
 * and the shell wrapper intentionally share the same background so viewport
 * height changes never expose a darker strip beneath the launcher.
 */
function WelcomeScreenInner(props: MalikHybridHomeProps) {
  return (
    <div className="malik-mobile-home relative isolate flex h-full min-h-0 w-full flex-1 bg-[#0f0f10]">
      <MalikHybridHome {...props} />
    </div>
  )
}

export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
