"use client"

import { useEffect } from "react"

const CHAT_SCROLL = ".malik-chat-scroll"
const MESSAGE_LIST = ".malik-message-list"
const USER_MESSAGE = "[data-malik-message='user']"
const SEND_BUTTON = ".malik-inline-send, .thome-submit"
const COMPOSER = ".malik-composer-textarea, .thome-composer textarea"
const FREE_SCROLL_ATTR = "data-malik-free-scroll"
const PRESERVED_TOP_ATTR = "data-malik-preserved-scroll-top"

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
 * Free ChatGPT-style turn scrolling.
 *
 * The app has legacy effects that try to jump to scrollHeight while text/image
 * state changes. During streaming that fought the wheel/trackpad and made the
 * thread feel locked. The runtime now does only three things:
 *   1. preserve the viewport once when Send is pressed;
 *   2. block only programmatic "jump to newest token" calls for that turn;
 *   3. give the active turn a small fixed breathing room below the last row so
 *      the person can move a little above/below the generation without hacks.
 *
 * It never handles wheel/touch itself and it no longer observes every streamed
 * character, so text and photo generation do not create an animation-frame loop.
 */
export function ChatTurnScrollRuntime() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const nativeScrollIntoView = Element.prototype.scrollIntoView
    const nativeScrollTo = Element.prototype.scrollTo
    const nativeWindowScrollTo = window.scrollTo.bind(window)

    let pendingSendUntil = 0
    let pendingThreadTop = 0
    let pendingPageTop = 0
    let currentThread: HTMLElement | null = null
    let currentList: HTMLElement | null = null
    let previousUserCount = 0
    let previousLastUser: HTMLElement | null = null
    let frame = 0

    const freeScrolling = (thread: HTMLElement | null) => thread?.getAttribute(FREE_SCROLL_ATTR) === "1"

    const makeThreadScrollable = (thread: HTMLElement | null) => {
      if (!thread) return
      thread.style.setProperty("overflow-y", "auto", "important")
      thread.style.setProperty("overflow-x", "hidden", "important")
      thread.style.setProperty("touch-action", "pan-y", "important")
      thread.style.setProperty("overscroll-behavior-y", "contain", "important")
      thread.style.setProperty("scroll-behavior", "auto", "important")
      thread.style.setProperty("scroll-snap-type", "none", "important")
      thread.style.setProperty("-webkit-overflow-scrolling", "touch", "important")
    }

    const clearTurnState = (thread: HTMLElement | null) => {
      if (!thread) return
      thread.removeAttribute(FREE_SCROLL_ATTR)
      thread.removeAttribute(PRESERVED_TOP_ATTR)
      thread.style.removeProperty("overflow-anchor")
    }

    const markStableTurn = (thread: HTMLElement, top: number) => {
      makeThreadScrollable(thread)
      thread.setAttribute(FREE_SCROLL_ATTR, "1")
      thread.setAttribute(PRESERVED_TOP_ATTR, String(Math.max(0, top)))
      thread.style.setProperty("overflow-anchor", "none", "important")
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

    const patchedScrollIntoView = function(this: Element, arg?: boolean | ScrollIntoViewOptions) {
      const thread = endSentinelThread(this)
      if (thread && freeScrolling(thread)) return
      return nativeScrollIntoView.call(this, arg as ScrollIntoViewOptions)
    }
    Element.prototype.scrollIntoView = patchedScrollIntoView

    const patchedScrollTo = function(this: Element, ...args: unknown[]) {
      if (isHtmlElement(this) && this.matches(CHAT_SCROLL) && freeScrolling(this)) {
        const top = requestedTop(args)
        // Only suppress the legacy auto-follow shape. A person's wheel, touch,
        // scrollbar drag and keyboard scrolling never enter this branch.
        if (top !== null && top >= this.scrollHeight - 2) return
      }
      return (nativeScrollTo as (...values: unknown[]) => void).apply(this, args)
    }
    Element.prototype.scrollTo = patchedScrollTo as typeof Element.prototype.scrollTo

    const restoreSubmittedViewport = (thread: HTMLElement) => {
      markStableTurn(thread, pendingThreadTop)
      ;(nativeScrollTo as (options: ScrollToOptions) => void).call(thread, {
        top: Math.min(pendingThreadTop, Math.max(0, thread.scrollHeight - thread.clientHeight)),
        behavior: "auto",
      })

      // Keep the document itself fixed on desktop. Only .malik-chat-scroll may
      // move, so the sidebar/header never ride upward with a chat submission.
      if (window.innerWidth >= 768 && Math.abs(window.scrollY - pendingPageTop) > 1) {
        nativeWindowScrollTo(window.scrollX, pendingPageTop)
      }
    }

    const scan = () => {
      frame = 0
      const { thread, list } = chatParts()

      if (!thread || !list) {
        clearTurnState(currentThread)
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
      const pending = performance.now() < pendingSendUntil

      if (!sameThread) {
        clearTurnState(currentThread)
        currentThread = thread
        currentList = list
        if (pending) restoreSubmittedViewport(thread)
        else clearTurnState(thread)
        previousUserCount = rows.length
        previousLastUser = lastUser
        return
      }

      const userChanged = lastUser !== previousLastUser || rows.length !== previousUserCount
      if (!userChanged) return

      if (pending) {
        restoreSubmittedViewport(thread)
        pendingSendUntil = 0
      } else {
        // If the same shell was reused for another saved session, drop the turn
        // guard. A normal single appended user turn keeps free scrolling.
        const appendedOneTurn = rows.length === previousUserCount + 1
        if (!appendedOneTurn) clearTurnState(thread)
      }

      previousUserCount = rows.length
      previousLastUser = lastUser
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    const armSend = () => {
      const { thread } = chatParts()
      if (!thread) return
      pendingSendUntil = performance.now() + 3000
      pendingThreadTop = thread.scrollTop
      pendingPageTop = window.scrollY
      markStableTurn(thread, pendingThreadTop)
      schedule()
    }

    const cancelPendingPlacement = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest(CHAT_SCROLL)) return
      // The first manual movement immediately wins over the one-time restore.
      pendingSendUntil = 0
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
    window.addEventListener("wheel", cancelPendingPlacement, { capture: true, passive: true })
    window.addEventListener("touchmove", cancelPendingPlacement, { capture: true, passive: true })
    window.addEventListener("pointerdown", cancelPendingPlacement, true)

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-malik-message"],
    })

    scan()

    return () => {
      observer.disconnect()
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("wheel", cancelPendingPlacement, true)
      window.removeEventListener("touchmove", cancelPendingPlacement, true)
      window.removeEventListener("pointerdown", cancelPendingPlacement, true)
      if (frame) window.cancelAnimationFrame(frame)
      clearTurnState(currentThread)
      if (Element.prototype.scrollIntoView === patchedScrollIntoView) Element.prototype.scrollIntoView = nativeScrollIntoView
      if (Element.prototype.scrollTo === patchedScrollTo) Element.prototype.scrollTo = nativeScrollTo
    }
  }, [])

  return (
    <style jsx global>{`
      .malik-chat-scroll[data-malik-free-scroll="1"] {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        touch-action: pan-y !important;
        overscroll-behavior-y: contain !important;
        scroll-behavior: auto !important;
        scroll-snap-type: none !important;
      }

      /* Stable, fixed breathing room: unlike the old runway this never grows or
         shrinks while tokens arrive, so it cannot change scrollTop under a hand. */
      .malik-chat-scroll[data-malik-free-scroll="1"] .malik-message-list {
        padding-bottom: clamp(120px, 18vh, 190px) !important;
      }
    `}</style>
  )
}

export default ChatTurnScrollRuntime
