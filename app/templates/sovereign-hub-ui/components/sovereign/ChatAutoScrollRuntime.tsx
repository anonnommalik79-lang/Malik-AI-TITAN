"use client"

import { useEffect } from "react"

const BOTTOM_THRESHOLD = 280

function isScrollable(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return /(auto|scroll)/.test(style.overflowY)
}

function findScroller(marker: HTMLElement | null) {
  let node: HTMLElement | null = marker
  while (node) {
    if (isScrollable(node)) return node
    node = node.parentElement
  }
  return marker
}

export function ChatAutoScrollRuntime() {
  useEffect(() => {
    let marker: HTMLElement | null = null
    let scroller: HTMLElement | null = null
    let content: HTMLElement | null = null
    let stickyToBottom = true
    let raf = 0
    let settleTimer = 0
    let lateTimer = 0
    let mutationObserver: MutationObserver | null = null
    let resizeObserver: ResizeObserver | null = null

    const distanceFromBottom = () => {
      if (!scroller) return 0
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    }

    const nearBottom = () => distanceFromBottom() <= BOTTOM_THRESHOLD

    const scrollToBottom = () => {
      if (!scroller) return
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        if (!scroller) return
        scroller.scrollTop = scroller.scrollHeight
      })
    }

    const settleToBottom = (force = false) => {
      if (!scroller) return
      if (!force && !stickyToBottom && !nearBottom()) return

      stickyToBottom = true
      scrollToBottom()
      window.clearTimeout(settleTimer)
      window.clearTimeout(lateTimer)
      settleTimer = window.setTimeout(scrollToBottom, 90)
      lateTimer = window.setTimeout(scrollToBottom, 280)
    }

    const onScroll = () => {
      if (!scroller) return
      stickyToBottom = nearBottom()
    }

    const disconnectCurrent = () => {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      mutationObserver = null
      resizeObserver = null
      scroller?.removeEventListener("scroll", onScroll)
    }

    const connect = () => {
      const nextMarker = document.querySelector<HTMLElement>("#malik-root [data-message-list]")
        ?? document.querySelector<HTMLElement>("[data-message-list]")
      if (!nextMarker) return

      const nextScroller = findScroller(nextMarker)
      if (!nextScroller) return
      if (nextMarker === marker && nextScroller === scroller) return

      disconnectCurrent()
      marker = nextMarker
      scroller = nextScroller
      content = scroller.querySelector<HTMLElement>(".malik-message-list")
        ?? marker.querySelector<HTMLElement>(".malik-message-list")
        ?? marker
      stickyToBottom = true

      scroller.addEventListener("scroll", onScroll, { passive: true })

      mutationObserver = new MutationObserver(() => {
        settleToBottom(false)
      })
      mutationObserver.observe(content, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["src", "class", "data-malik-image-ready", "data-status"],
      })

      resizeObserver = new ResizeObserver(() => {
        settleToBottom(false)
      })
      resizeObserver.observe(content)

      settleToBottom(true)
    }

    const onMediaReady = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement || target instanceof HTMLVideoElement)) return
      if (!scroller?.contains(target)) return
      settleToBottom(false)
    }

    const onGenerationProgress = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!target.closest("[data-malik-image-motion]")) return
      settleToBottom(false)
    }

    const rootObserver = new MutationObserver(connect)
    rootObserver.observe(document.body, { childList: true, subtree: true })
    document.addEventListener("load", onMediaReady, true)
    document.addEventListener("loadedmetadata", onMediaReady, true)
    document.addEventListener("malik:image-layout", onGenerationProgress, true)
    connect()

    return () => {
      rootObserver.disconnect()
      disconnectCurrent()
      document.removeEventListener("load", onMediaReady, true)
      document.removeEventListener("loadedmetadata", onMediaReady, true)
      document.removeEventListener("malik:image-layout", onGenerationProgress, true)
      window.cancelAnimationFrame(raf)
      window.clearTimeout(settleTimer)
      window.clearTimeout(lateTimer)
    }
  }, [])

  return null
}

export default ChatAutoScrollRuntime
