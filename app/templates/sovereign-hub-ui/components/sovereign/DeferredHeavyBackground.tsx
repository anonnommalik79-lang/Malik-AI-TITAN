"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useLowPowerMode } from "@/lib/use-low-power"

const AnimatedAIBackground = dynamic(
  () => import("../AnimatedAIBackground").then((mod) => mod.AnimatedAIBackground),
  { ssr: false },
)
const DigitalBridgeDemoPolish = dynamic(
  () => import("./digital-bridge-demo-polish").then((mod) => mod.DigitalBridgeDemoPolish),
  { ssr: false },
)

/**
 * Mount heavy WebGL/CSS backgrounds after the route paint — keeps section
 * switches instant. On phones and reduced-motion setups they are not mounted at
 * all: the animated star field repaints continuously and was the difference
 * between a smooth and a stuttering scroll on mid-range hardware.
 */
export function DeferredHeavyBackground() {
  const lowPower = useLowPowerMode()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (lowPower) {
      setReady(false)
      return
    }

    let cancelled = false
    const run = () => {
      if (!cancelled) setReady(true)
    }

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 400 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const fallback = window.setTimeout(run, 120)
    return () => {
      cancelled = true
      window.clearTimeout(fallback)
    }
  }, [lowPower])

  if (lowPower || !ready) return null

  return (
    <>
      <AnimatedAIBackground />
      <div className="digital-bridge-demo-polish" aria-hidden="true" />
      <DigitalBridgeDemoPolish />
    </>
  )
}
