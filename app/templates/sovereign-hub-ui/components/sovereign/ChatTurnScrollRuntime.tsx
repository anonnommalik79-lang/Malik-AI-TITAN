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
 * Keeps the viewport exactly where the person left it after Send.
 *
 * ChatView still has legacy effects that call scrollTo(scrollHeight) whenever
 * messages change. The previous runtime tried to improve that by moving the new
 * user row near the top of the thread. On a tall desktop chat that looked like
 * the whole conversation had flown out through the top edge of the app.
 *
 * The correct behaviour is simpler:
 *   - pressing Send preserves the current chat scrollTop;
 *   - the new turn and every streamed token are allowed to render below it;
 *   - legacy forced-bottom calls are ignored for that active turn;
 *   - wheel, touch, scrollbar and keyboard movement remain completely native;
 *   - the surrounding page/sidebar are never scrolled by this runtime;
 *   - opening another saved chat clears the guard so that chat may choose its
 *     own initial position once.
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
      // Browser scroll anchoring can otherwise move a bottom-aligned thread when
      // a new message is inserted even if no JS scroll command runs.
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
        // Block only the app's "always jump to the newest token" command.
        // All normal/manual scrolling remains native.
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

      // Desktop browsers should never pan the document itself when a chat turn
      // is submitted; that is what makes the fixed sidebar/header appear to jump.
      // On phones the visual viewport legitimately moves for the software keyboard,
      // so document restoration is intentionally desktop-only.
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
      if (userChanged) {
        if (pending) {
          restoreSubmittedViewport(thread)
          pendingSendUntil = 0
        } else {
          // A reused DOM shell can represent another saved chat. Do not carry the
          // previous chat's scroll guard across sessions.
          const appendedOneTurn = rows.length === previousUserCount + 1
          if (!appendedOneTurn) clearTurnState(thread)
        }
        previousUserCount = rows.length
        previousLastUser = lastUser
      }
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
      // If the person starts moving immediately after Send, their hand wins.
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
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-malik-message", "src"],
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

  return null
}

export default ChatTurnScrollRuntime
