"use client"

import { useEffect } from "react"
import { startAntiLagGuard } from "@/lib/anti-lag-guard"

const FAST_CLASS = "malik-fast-runtime"
const LOW_MOTION_CLASS = "malik-low-motion-runtime"
const TAB_HIDDEN_CLASS = "malik-tab-hidden"

export function PerformanceGuard() {
  useEffect(() => startAntiLagGuard(), [])

  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    let last = performance.now()
    let slowFrames = 0
    let samples = 0

    root.classList.add(FAST_CLASS)

    const syncTabHidden = () => {
      root.classList.toggle(TAB_HIDDEN_CLASS, document.hidden)
    }

    const tick = (time: number) => {
      const delta = time - last
      last = time
      samples += 1

      if (delta > 42) slowFrames += 1
      else slowFrames = Math.max(0, slowFrames - 1)

      if (slowFrames >= 4 || (samples > 90 && slowFrames >= 2)) {
        root.classList.add(LOW_MOTION_CLASS)
      }

      if (samples < 420 && !document.hidden) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    const onVisibility = () => {
      syncTabHidden()
      if (document.hidden) {
        window.cancelAnimationFrame(raf)
        return
      }
      last = performance.now()
      raf = window.requestAnimationFrame(tick)
    }

    syncTabHidden()
    raf = window.requestAnimationFrame(tick)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
      root.classList.remove(FAST_CLASS)
      root.classList.remove(LOW_MOTION_CLASS)
      root.classList.remove(TAB_HIDDEN_CLASS)
    }
  }, [])

  return null
}

export default PerformanceGuard
