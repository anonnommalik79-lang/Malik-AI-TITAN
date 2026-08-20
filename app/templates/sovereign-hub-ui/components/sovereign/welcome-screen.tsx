"use client"

import { memo } from "react"
import { MalikHybridHome, type MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

function WelcomeScreenInner(props: MalikHybridHomeProps) {
  return (
    <div className="relative min-h-full w-full flex-1 bg-[#020303]">
      <MalikHybridHome {...props} />
    </div>
  )
}

export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
