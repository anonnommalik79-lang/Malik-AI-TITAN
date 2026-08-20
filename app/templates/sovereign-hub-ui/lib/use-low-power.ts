"use client"

import { useEffect, useState } from "react"

/**
 * True when the device should not be asked to paint decorative backgrounds.
 *
 * Covers three cases: a small screen (phones, where the animated space layer
 * costs more than it adds), a device that reports few cores or little memory,
 * and a user who asked for reduced motion. Starts as `true` so the first paint
 * never mounts the heavy layer and then relaxes on capable machines — the
 * opposite order would show the exact stutter this is meant to avoid.
 */
export function useLowPowerMode(): boolean {
  const [lowPower, setLowPower] = useState(true)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px), (prefers-reduced-motion: reduce)")

    const navigatorWithHints = navigator as Navigator & {
      deviceMemory?: number
      hardwareConcurrency?: number
    }
    const weakHardware =
      (typeof navigatorWithHints.deviceMemory === "number" && navigatorWithHints.deviceMemory <= 4) ||
      (typeof navigatorWithHints.hardwareConcurrency === "number" && navigatorWithHints.hardwareConcurrency <= 4)

    const evaluate = () => setLowPower(query.matches || weakHardware)
    evaluate()

    query.addEventListener("change", evaluate)
    return () => query.removeEventListener("change", evaluate)
  }, [])

  return lowPower
}

export default useLowPowerMode
