const PERF_BOOST_CLASS = "malik-perf-boost"
const SAMPLE_WINDOW_MS = 2000
const LOW_FPS_THRESHOLD = 30
const LOW_SAMPLES_BEFORE_BOOST = 3
const RECOVER_SAMPLES_BEFORE_CLEAR = 4

export function startAntiLagGuard(): () => void {
  if (typeof window === "undefined") return () => undefined

  const root = document.getElementById("malik-root")
  if (!root) return () => undefined

  let raf = 0
  let frames = 0
  let windowStart = performance.now()
  let lowSamples = 0
  let recoverSamples = 0
  let boosted = false

  const tick = (time: number) => {
    frames += 1
    const elapsed = time - windowStart

    if (elapsed >= SAMPLE_WINDOW_MS) {
      const fps = (frames * 1000) / elapsed

      if (fps < LOW_FPS_THRESHOLD) {
        lowSamples += 1
        recoverSamples = 0
        if (!boosted && lowSamples >= LOW_SAMPLES_BEFORE_BOOST) {
          root.classList.add(PERF_BOOST_CLASS)
          boosted = true
        }
      } else {
        lowSamples = 0
        if (boosted) {
          recoverSamples += 1
          if (recoverSamples >= RECOVER_SAMPLES_BEFORE_CLEAR) {
            root.classList.remove(PERF_BOOST_CLASS)
            boosted = false
            recoverSamples = 0
          }
        }
      }

      frames = 0
      windowStart = time
    }

    if (!document.hidden) {
      raf = window.requestAnimationFrame(tick)
    }
  }

  const onVisibility = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(raf)
      return
    }
    frames = 0
    windowStart = performance.now()
    raf = window.requestAnimationFrame(tick)
  }

  raf = window.requestAnimationFrame(tick)
  document.addEventListener("visibilitychange", onVisibility)

  return () => {
    window.cancelAnimationFrame(raf)
    document.removeEventListener("visibilitychange", onVisibility)
    root.classList.remove(PERF_BOOST_CLASS)
  }
}
