/** A small opacity wave, not generated thought text or a progress estimate.
 * Web Animations avoids the legacy CSS rules that stop every phone animation.
 * Only the currently mounted waiting label owns these animations/listeners. */
export function startThinkingTextMotion(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView
  if (!view) return () => {}
  const mobile = view.matchMedia("(max-width: 1180px)")
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)")
  let animations: Animation[] = []

  const stop = () => {
    animations.forEach(animation => animation.cancel())
    animations = []
    delete root.dataset.malikThinkingMotion
  }
  const syncVisibility = () => {
    animations.forEach(animation => root.ownerDocument.hidden ? animation.pause() : animation.play())
  }
  const start = () => {
    stop()
    if (!mobile.matches) return
    const letters = Array.from(root.querySelectorAll<HTMLElement>(".malik-live-activity__letter"))
    if (!letters.length || letters.some(letter => typeof letter.animate !== "function")) return
    root.dataset.malikThinkingMotion = "wave"
    const duration = reduced.matches ? 2800 : 1600
    const low = reduced.matches ? .65 : .5
    animations = letters.map((letter, index) => {
      const animation = letter.animate([
        { opacity: low, offset: 0 },
        { opacity: 1, offset: .28 },
        { opacity: low, offset: .56 },
        { opacity: low, offset: 1 },
      ], { duration, iterations: Infinity, delay: -duration + index * duration / Math.max(letters.length, 1), easing: "ease-in-out" })
      animation.id = `malik-thinking-letter-${index}`
      return animation
    })
    syncVisibility()
  }
  start()
  mobile.addEventListener("change", start)
  reduced.addEventListener("change", start)
  root.ownerDocument.addEventListener("visibilitychange", syncVisibility)
  return () => {
    stop()
    mobile.removeEventListener("change", start)
    reduced.removeEventListener("change", start)
    root.ownerDocument.removeEventListener("visibilitychange", syncVisibility)
  }
}
