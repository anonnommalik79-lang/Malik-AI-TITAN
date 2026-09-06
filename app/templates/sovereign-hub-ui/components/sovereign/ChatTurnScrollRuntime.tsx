"use client"

import { useEffect } from "react"

const CHAT_SCROLL = ".malik-chat-scroll"
const MESSAGE_LIST = ".malik-message-list"
const USER_MESSAGE = "[data-malik-message='user']"
const SEND_BUTTON = ".malik-inline-send, .thome-submit"
const COMPOSER = ".malik-composer-textarea, .thome-composer textarea"
const GUARD_ATTR = "data-malik-turn-scroll-guard"
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
  list.setAttribute(RUNWAY_ATTR, String(next))
  list.style.paddingBottom = next ? `${next}px` : ""
}

function clearTurnGeometry(thread: HTMLElement | null, list: HTMLElement | null) {
  thread?.removeAttribute(GUARD_ATTR)
  thread?.removeAttribute(ANCHOR_ATTR)
  if (list) {
    list.removeAttribute(RUNWAY_ATTR)
    list.style.paddingBottom = ""
  }
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
 * ChatGPT-style turn scrolling.
 *
 * The old ChatView effect calls the invisible end sentinel on every `messages`
 * update. During streaming that means every token can pull the viewport back to
 * the bottom, so a person trying to read upward gets dragged down again.
 *
 * A turn now behaves differently:
 *   1. Sending a prompt positions that new user row near the top of the thread.
 *   2. A small dynamic runway below the turn makes that position possible even
 *      before the assistant has produced enough content to fill the viewport.
 *   3. Further text/image progress is NOT allowed to auto-scroll the thread.
 *      Wheel, touch, trackpad and scrollbar movement are immediately free.
 *   4. Opening an existing conversation keeps the old useful "show latest"
 *      behaviour because the guard is armed only for a newly submitted turn.
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
    let settleTimer = 0

    const guarded = (thread: HTMLElement | null) => thread?.getAttribute(GUARD_ATTR) === "1"

    const isEndSentinel = (node: Element) => {
      const thread = node.closest<HTMLElement>(CHAT_SCROLL)
      if (!thread || !guarded(thread)) return false
      const list = node.closest<HTMLElement>(MESSAGE_LIST)
      if (!list || node.parentElement !== list) return false
      if (node.matches(USER_MESSAGE) || node.querySelector("[data-malik-message]")) return false
      if ((node.textContent || "").trim()) return false
      return node === list.lastElementChild
    }

    // Desktop ChatView scrolls its empty end ref into view after every message
    // mutation. Once a fresh turn is anchored, ignore only that one internal
    // scroll. Every normal scrollIntoView call elsewhere in the product remains
    // untouched.
    const patchedScrollIntoView = function(this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (isEndSentinel(this)) return
      return nativeScrollIntoView.call(this, arg as ScrollIntoViewOptions)
    }
    Element.prototype.scrollIntoView = patchedScrollIntoView

    // Mobile ChatView uses thread.scrollTo({ top: thread.scrollHeight }). Block
    // only that exact "force bottom" shape while the current turn is guarded.
    // Manual scrolling never calls this method and stays completely free.
    const patchedScrollTo = function(this: Element, ...args: unknown[]) {
      if (isHtmlElement(this) && this.matches(CHAT_SCROLL) && guarded(this)) {
        const top = requestedTop(args)
        if (top !== null && top >= this.scrollHeight - 2) return
      }
      return (nativeScrollTo as (...values: unknown[]) => void).apply(this, args)
    }
    Element.prototype.scrollTo = patchedScrollTo as typeof Element.prototype.scrollTo

    const maintainRunway = (thread: HTMLElement, list: HTMLElement) => {
      if (!guarded(thread)) return
      const anchorTop = Number(thread.getAttribute(ANCHOR_ATTR) || 0)
      if (!Number.isFinite(anchorTop)) return

      const oldRunway = runtimeRunway(list)
      const naturalHeight = Math.max(0, thread.scrollHeight - oldRunway)
      // Preserve enough scroll range for both the anchored prompt and wherever
      // the person has manually scrolled since then. As the answer grows this
      // runway naturally shrinks instead of leaving a giant dead area forever.
      const requiredTop = Math.max(anchorTop, thread.scrollTop)
      const breathingRoom = Math.max(20, Math.min(48, thread.clientHeight * 0.05))
      const needed = Math.max(0, requiredTop + thread.clientHeight + breathingRoom - naturalHeight)
      if (Math.abs(needed - oldRunway) > 2) setRunway(list, needed)
    }

    const anchorFreshTurn = (thread: HTMLElement, list: HTMLElement, user: HTMLElement) => {
      thread.setAttribute(GUARD_ATTR, "1")

      const place = (behavior: ScrollBehavior) => {
        if (!user.isConnected || !thread.isConnected) return
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
        ;(nativeScrollTo as (options: ScrollToOptions) => void).call(thread, { top: finalTop, behavior })
      }

      // First placement is exact; the second catches font/image/layout settling
      // after React effects without creating an ongoing scroll lock.
      place("auto")
      window.requestAnimationFrame(() => place("smooth"))
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        place("auto")
        maintainRunway(thread, list)
      }, 140)
    }

    const scan = () => {
      frame = 0
      const { thread, list } = chatParts()

      if (!thread || !list) {
        currentThread = null
        currentList = null
        previousUserCount = 0
        previousLastUser = null
        return
      }

      const rows = userRows(list)
      const lastUser = rows.at(-1) || null
      const sameThread = thread === currentThread && list === currentList

      if (!sameThread) {
        clearTurnGeometry(currentThread, currentList)
        currentThread = thread
        currentList = list

        if (performance.now() < pendingSendUntil && lastUser) {
          anchorFreshTurn(thread, list, lastUser)
          pendingSendUntil = 0
        } else {
          // Existing/newly opened conversation: keep ChatView's initial jump to
          // the latest message. The guard is not armed until the next send.
          clearTurnGeometry(thread, list)
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
          // History/session replacement, not a new prompt from this viewport.
          clearTurnGeometry(thread, list)
        }
        pendingSendUntil = 0
        previousUserCount = rows.length
        previousLastUser = lastUser
      } else {
        maintainRunway(thread, list)
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    const armSend = () => {
      pendingSendUntil = performance.now() + 2500
      const { thread } = chatParts()
      // Arm immediately, before React appends the assistant placeholder, so its
      // own message effect cannot yank this freshly submitted turn to the end.
      thread?.setAttribute(GUARD_ATTR, "1")
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
      attributeFilter: ["class", "data-malik-message"],
    })

    scan()

    return () => {
      observer.disconnect()
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKeyDown, true)
      if (frame) window.cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      clearTurnGeometry(currentThread, currentList)
      if (Element.prototype.scrollIntoView === patchedScrollIntoView) Element.prototype.scrollIntoView = nativeScrollIntoView
      if (Element.prototype.scrollTo === patchedScrollTo) Element.prototype.scrollTo = nativeScrollTo
    }
  }, [])

  return null
}

export default ChatTurnScrollRuntime
