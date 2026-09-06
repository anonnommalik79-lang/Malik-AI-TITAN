"use client"

import { useEffect } from "react"

const CHAT_SCROLL = ".malik-chat-scroll"
const MESSAGE_LIST = ".malik-message-list"
const USER_MESSAGE = "[data-malik-message='user']"
const SEND_BUTTON = ".malik-inline-send, .thome-submit"
const COMPOSER = ".malik-composer-textarea, .thome-composer textarea"
const FREE_SCROLL_ATTR = "data-malik-free-scroll"
const RUNWAY_ATTR = "data-malik-turn-scroll-runway"
const ANCHOR_ATTR = "data-malik-turn-anchor-top"

function isHtmlElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement
}

function chatParts() {
  const thread = document.querySelector<HTMLElement>(CHAT_SCROLL)
  const list = thread?.querySelector<HTMLElement>(MESSAGE_LIST) || null
  return { thread, list }
}

function userRows(list: HTMLElement | null) {
  return list ? Array.from(list.querySelectorAll<HTMLElement>(USER_MESSAGE)) : []
}

function runtimeRunway(list: HTMLElement) {
  const value = Number(list.getAttribute(RUNWAY_ATTR) || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function setRunway(list: HTMLElement, pixels: number) {
  const next = Math.max(0, Math.ceil(pixels))
  if (next) {
    list.setAttribute(RUNWAY_ATTR, String(next))
    list.style.paddingBottom = `${next}px`
  } else {
    list.removeAttribute(RUNWAY_ATTR)
    list.style.paddingBottom = ""
  }
}

function clearTurnGeometry(thread: HTMLElement | null, list: HTMLElement | null) {
  thread?.removeAttribute(FREE_SCROLL_ATTR)
  thread?.removeAttribute(ANCHOR_ATTR)
  if (list) setRunway(list, 0)
}

function requestedTop(args: unknown[]) {
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    const top = Number((args[0] as ScrollToOptions).top)
    return Number.isFinite(top) ? top : null
  }
  if (args.length >= 2) {
    const top = Number(args[1])
    return Number.isFinite(top) ? top : null
  }
  return null
}

/**
 * ChatGPT-style chat scrolling with no user scroll lock.
 *
 * ChatView still contains legacy effects that try to jump to the invisible end
 * marker every time `messages` changes. That is useful when a saved session is
 * first opened, but it is wrong after a person submits a new turn: streaming
 * text, image progress and the final image can otherwise keep yanking the
 * viewport to the bottom.
 *
 * Rules here are deliberately simple:
 *   - a newly submitted user row is positioned near the top once;
 *   - after that, only the app's forced "go to bottom" calls are ignored;
 *   - wheel, trackpad, touch, scrollbar drag and keyboard scrolling are never
 *     cancelled, prevented or snapped back;
 *   - text completion and image completion do not change that freedom;
 *   - switching/opening another saved chat clears this turn state, so its own
 *     initial "show latest" behaviour still works.
 *
 * This runtime is mounted globally, so the behaviour is identical for every
 * signed-in user/session, not just the account that generated the media.
 */
export function ChatTurnScrollRuntime() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const nativeScrollIntoView = Element.prototype.scrollIntoView
    const nativeScrollTo = Element.prototype.scrollTo

    let pendingSendUntil = 0
    let currentThread: HTMLElement | null = null
    let currentList: HTMLElement | null = null
    let previousUserCount = 0
    let previousLastUser: HTMLElement | null = null
    let frame = 0

    const freeScrolling = (thread: HTMLElement | null) => thread?.getAttribute(FREE_SCROLL_ATTR) === "1"

    const makeThreadScrollable = (thread: HTMLElement | null) => {
      if (!thread) return
      // Final authority for phone/desktop input. Some older mobile sheets carry
      // stronger overflow/touch declarations; these must never disable the chat
      // after a media card finishes rendering.
      thread.style.setProperty("overflow-y", "auto", "important")
      thread.style.setProperty("overflow-x", "hidden", "important")
      thread.style.setProperty("touch-action", "pan-y", "important")
      thread.style.setProperty("overscroll-behavior-y", "contain", "important")
      thread.style.setProperty("-webkit-overflow-scrolling", "touch", "important")
    }

    const endSentinelThread = (node: Element) => {
      const thread = node.closest<HTMLElement>(CHAT_SCROLL)
      if (!thread) return null
      const list = node.closest<HTMLElement>(MESSAGE_LIST)
      if (!list || node.parentElement !== list) return null
      if (node.matches(USER_MESSAGE) || node.querySelector("[data-malik-message]")) return null
      if ((node.textContent || "").trim()) return null
      return node === list.lastElementChild ? thread : null
    }

    // Ignore only ChatView's own end-sentinel jump for a turn that the user has
    // already submitted. This does not intercept wheel/touch/scrollbar movement.
    const patchedScrollIntoView = function(this: Element, arg?: boolean | ScrollIntoViewOptions) {
      const thread = endSentinelThread(this)
      if (thread && freeScrolling(thread)) return
      return nativeScrollIntoView.call(this, arg as ScrollIntoViewOptions)
    }
    Element.prototype.scrollIntoView = patchedScrollIntoView

    // Mobile ChatView does the same thing with scrollTo(scrollHeight). Suppress
    // that exact forced-bottom shape only. Native/manual scrolling never calls
    // this branch and therefore cannot be locked by this runtime.
    const patchedScrollTo = function(this: Element, ...args: unknown[]) {
      if (isHtmlElement(this) && this.matches(CHAT_SCROLL) && freeScrolling(this)) {
        const top = requestedTop(args)
        if (top !== null && top >= this.scrollHeight - 2) return
      }
      return (nativeScrollTo as (...values: unknown[]) => void).apply(this, args)
    }
    Element.prototype.scrollTo = patchedScrollTo as typeof Element.prototype.scrollTo

    const maintainRunway = (thread: HTMLElement, list: HTMLElement) => {
      if (!freeScrolling(thread)) return
      const anchorTop = Number(thread.getAttribute(ANCHOR_ATTR) || "")
      if (!Number.isFinite(anchorTop)) return

      const oldRunway = runtimeRunway(list)
      if (!oldRunway) return

      // Shrink synthetic space only while the viewport is still around the
      // anchored request. If the person has moved down manually, do not alter
      // scrollHeight underneath their hand/trackpad.
      if (thread.scrollTop > anchorTop + 12) return

      const naturalHeight = Math.max(0, thread.scrollHeight - oldRunway)
      const breathingRoom = Math.max(20, Math.min(48, thread.clientHeight * 0.05))
      const needed = Math.max(0, anchorTop + thread.clientHeight + breathingRoom - naturalHeight)
      if (Math.abs(needed - oldRunway) > 2) setRunway(list, needed)
    }

    const anchorFreshTurn = (thread: HTMLElement, list: HTMLElement, user: HTMLElement) => {
      if (!user.isConnected || !thread.isConnected) return

      makeThreadScrollable(thread)
      thread.setAttribute(FREE_SCROLL_ATTR, "1")

      const threadBox = thread.getBoundingClientRect()
      const userBox = user.getBoundingClientRect()
      const topInset = window.matchMedia("(max-width: 767px)").matches ? 14 : 22
      const target = Math.max(0, thread.scrollTop + userBox.top - threadBox.top - topInset)

      const oldRunway = runtimeRunway(list)
      const naturalHeight = Math.max(0, thread.scrollHeight - oldRunway)
      const breathingRoom = Math.max(20, Math.min(48, thread.clientHeight * 0.05))
      const needed = Math.max(0, target + thread.clientHeight + breathingRoom - naturalHeight)
      setRunway(list, needed)

      const maxTop = Math.max(0, thread.scrollHeight - thread.clientHeight)
      const finalTop = Math.min(target, maxTop)
      thread.setAttribute(ANCHOR_ATTR, String(finalTop))

      // Exactly one placement. No delayed smooth scroll and no follow-up timer:
      // a person may start scrolling immediately after pressing Send and Malik
      // AI must never pull the viewport back 100-200ms later.
      ;(nativeScrollTo as (options: ScrollToOptions) => void).call(thread, {
        top: finalTop,
        behavior: "auto",
      })
    }

    const scan = () => {
      frame = 0
      const { thread, list } = chatParts()

      if (!thread || !list) {
        clearTurnGeometry(currentThread, currentList)
        currentThread = null
        currentList = null
        previousUserCount = 0
        previousLastUser = null
        return
      }

      makeThreadScrollable(thread)

      const rows = userRows(list)
      const lastUser = rows.at(-1) || null
      const sameThread = thread === currentThread && list === currentList

      if (!sameThread) {
        clearTurnGeometry(currentThread, currentList)
        currentThread = thread
        currentList = list
        makeThreadScrollable(thread)

        if (performance.now() < pendingSendUntil && lastUser) {
          anchorFreshTurn(thread, list, lastUser)
          pendingSendUntil = 0
        } else {
          // A newly opened saved session gets no turn guard. ChatView may show
          // its latest message once, after which ordinary scrolling is native.
          clearTurnGeometry(thread, list)
          makeThreadScrollable(thread)
        }

        previousUserCount = rows.length
        previousLastUser = lastUser
        return
      }

      const userChanged = lastUser !== previousLastUser || rows.length !== previousUserCount
      if (userChanged) {
        const explicitlySubmitted = performance.now() < pendingSendUntil
        const appendedOneTurn = rows.length === previousUserCount + 1

        if (lastUser && (explicitlySubmitted || appendedOneTurn)) {
          anchorFreshTurn(thread, list, lastUser)
        } else {
          // Same DOM shell can be reused while history switches sessions. Do
          // not carry scroll state or synthetic bottom space between chats.
          clearTurnGeometry(thread, list)
          makeThreadScrollable(thread)
        }

        pendingSendUntil = 0
        previousUserCount = rows.length
        previousLastUser = lastUser
      } else {
        // Text tokens and image-generation DOM updates only adjust disposable
        // runway; they never set scrollTop.
        maintainRunway(thread, list)
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    const armSend = () => {
      pendingSendUntil = performance.now() + 3000
      const { thread, list } = chatParts()
      if (thread) {
        makeThreadScrollable(thread)
        thread.setAttribute(FREE_SCROLL_ATTR, "1")
        thread.removeAttribute(ANCHOR_ATTR)
      }
      // A previous short turn may still have synthetic runway. Remove it before
      // computing the geometry of the newly submitted message.
      if (list) setRunway(list, 0)
      schedule()
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>(SEND_BUTTON)
      if (!button || button.disabled) return
      armSend()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      const field = event.target instanceof HTMLTextAreaElement ? event.target : null
      if (!field?.matches(COMPOSER) || !field.value.trim()) return
      const send = document.querySelector<HTMLButtonElement>(".malik-inline-send")
      if (send?.disabled) return
      armSend()
    }

    window.addEventListener("click", onClick, true)
    window.addEventListener("keydown", onKeyDown, true)

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-malik-message", "src"],
    })

    scan()

    return () => {
      observer.disconnect()
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKeyDown, true)
      if (frame) window.cancelAnimationFrame(frame)
      clearTurnGeometry(currentThread, currentList)
      if (Element.prototype.scrollIntoView === patchedScrollIntoView) Element.prototype.scrollIntoView = nativeScrollIntoView
      if (Element.prototype.scrollTo === patchedScrollTo) Element.prototype.scrollTo = nativeScrollTo
    }
  }, [])

  return null
}

export default ChatTurnScrollRuntime
