/**
 * The request indicators keep turning on every phone.
 *
 * While a request runs, the chat shows small activity indicators: the spinner
 * beside «Ход работы», the ring around the Malik mark, loaders inside an
 * answer and on the photo card. On a computer their CSS animation turns them.
 * On phones it often does not: performance layers freeze motion below 1180px
 * or after slow frames, and «Remove animations» / battery saver turn on
 * prefers-reduced-motion, which every freeze honours.
 *
 * This keeper looks at each indicator that is on screen and, only when no
 * animation is actually running on it, starts the same turn with the Web
 * Animations API - which no `animation: none` rule can stop. They are tiny
 * rotations of status icons (no zoom, no parallax), so they stay on with
 * reduced motion: a request that looks frozen reads as a broken app.
 *
 * Cost: a MutationObserver batched to one check per 150 ms (a streaming answer
 * changes the page every frame); nothing is started while no indicator shows.
 */

type Indicator = { selector: string; pseudo?: "::after" | "::before"; duration: number }

export const REQUEST_INDICATORS: readonly Indicator[] = [
  { selector: "#malik-root .malik-execution .is-spinning", duration: 1200 },
  { selector: "#malik-root .malik-ai-avatar.is-working", pseudo: "::after", duration: 900 },
  { selector: "#malik-root .malik-message-card-assistant .animate-spin, #malik-root .malik-chat-fullwidth .animate-spin", duration: 1000 },
  { selector: "#malik-root .malik-digital-browser .is-spinning", duration: 1000 },
]

const SPIN: Keyframe[] = [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }]
const OWN = "malik-request-keeper"
const MAX_PER_KIND = 24

type Kept = { element: Element; indicator: Indicator; animation: Animation }

/**
 * Is something really turning it? Freezes often leave a «running» animation
 * cut to a fraction of a millisecond and one iteration: that does not count.
 */
function runningOn(element: Element, pseudo?: string) {
  const animations = element.getAnimations({ subtree: Boolean(pseudo) })
  return animations.some((animation) => {
    if (animation.playState !== "running") return false
    const effect = animation.effect as KeyframeEffect | null
    if (pseudo ? effect?.pseudoElement !== pseudo : effect?.target !== element || Boolean(effect?.pseudoElement)) return false
    const timing = effect?.getComputedTiming()
    return Number(timing?.duration) >= 100 && (timing?.iterations === Infinity || Number(timing?.endTime) > Number(animation.currentTime) + 300)
  })
}

/** Starts the keeper; returns a function that stops it and cancels what it started. */
export function startRequestMotionKeeper(doc: Document = document): () => void {
  const view = doc.defaultView
  if (!view || typeof (doc.documentElement as HTMLElement).animate !== "function") return () => {}
  const kept: Kept[] = []
  let timer = 0
  let recheck = 0

  const ensure = () => {
    timer = 0
    // Drop what no longer applies: the element is gone or its request finished.
    for (let index = kept.length - 1; index >= 0; index--) {
      const item = kept[index]
      if (!item.element.isConnected || !item.element.matches(item.indicator.selector)) {
        item.animation.cancel()
        kept.splice(index, 1)
      }
    }
    if (doc.hidden) return
    let present = false
    for (const indicator of REQUEST_INDICATORS) {
      const elements = Array.from(doc.querySelectorAll(indicator.selector)).slice(0, MAX_PER_KIND)
      present ||= elements.length > 0
      for (const element of elements) {
        if (kept.some((item) => item.element === element && item.indicator === indicator)) continue
        if (runningOn(element, indicator.pseudo)) continue
        try {
          const animation = (element as HTMLElement).animate(SPIN, {
            duration: indicator.duration,
            iterations: Infinity,
            easing: "linear",
            ...(indicator.pseudo ? { pseudoElement: indicator.pseudo } : {}),
          })
          animation.id = OWN
          kept.push({ element, indicator, animation })
        } catch {
          // A browser without pseudo-element animations keeps the CSS behaviour.
        }
      }
    }
    // A CSS animation can stop later (a freeze that lands after the first
    // check, a low-FPS guard, an «animationend»): look again while a request
    // indicator is on screen, and stop looking once none is.
    if (present || kept.length) recheck = view.setTimeout(schedule, 700)
  }

  const schedule = () => {
    if (recheck) { view.clearTimeout(recheck); recheck = 0 }
    if (!timer) timer = view.setTimeout(ensure, 150)
  }
  const observer = new view.MutationObserver(schedule)
  observer.observe(doc.body || doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] })
  doc.addEventListener("visibilitychange", schedule)
  schedule()

  return () => {
    observer.disconnect()
    doc.removeEventListener("visibilitychange", schedule)
    if (timer) view.clearTimeout(timer)
    if (recheck) view.clearTimeout(recheck)
    for (const item of kept.splice(0)) item.animation.cancel()
  }
}
