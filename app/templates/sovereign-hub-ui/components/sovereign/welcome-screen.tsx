"use client"

import { memo } from "react"
import { WelcomeEarthBackground } from "./WelcomeEarthBackground"
import { MalikHybridHome, type MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

function WelcomeScreenInner(props: MalikHybridHomeProps) {
  return (
    <div className="creator-home-shell malik-welcome-earth-shell malik-mobile-home relative isolate min-h-full w-full flex-1 overflow-visible">
      <WelcomeEarthBackground />
      <div className="malik-welcome-earth-content">
        <MalikHybridHome {...props} />
      </div>
    </div>
  )
}

export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
