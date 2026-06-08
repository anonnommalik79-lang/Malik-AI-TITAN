"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"

const AnimatedAIBackground = dynamic(
  () => import("../AnimatedAIBackground").then((mod) => mod.AnimatedAIBackground),
  { ssr: false },
)
const DigitalBridgeDemoPolish = dynamic(
  () => import("./digital-bridge-demo-polish").then((mod) => mod.DigitalBridgeDemoPolish),
  { ssr: false },
)

/** Mount heavy WebGL/CSS backgrounds after the route paint — keeps section switches instant. */
export function DeferredHeavyBackground() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
  }, [])

  if (!ready) return null

  return (
    <>
      <AnimatedAIBackground />
      <div className="digital-bridge-demo-polish" aria-hidden="true" />
      <DigitalBridgeDemoPolish />
    </>
  )
}
