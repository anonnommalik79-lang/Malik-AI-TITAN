"use client"

import { useEffect } from "react"

/**
 * Runtime layout guard for the legacy Dashboard shell.
 *
 * The real bug is not AI/backend. It is a desktop layout split:
 * Dashboard renders Sidebar + main + optional PreviewPanel. On wide screens
 * stale preview/canvas state can leave an empty black right zone. This guard
 * measures the real browser viewport and forces the chat surface to occupy
 * every remaining pixel after the sidebar.
 */
export function ChatLayoutRuntimeFix() {
  useEffect(() => {
    let scheduled = false

    const important = (node: HTMLElement | null | undefined, prop: string, value: string) => {
      if (!node) return
      try {
        node.style.setProperty(prop, value, "important")
      } catch {
        // ignore unsupported DOM style writes
      }
    }

    const apply = () => {
      const viewportWidth = Math.ceil(window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0)
      const viewportHeight = Math.ceil(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0)
      if (!viewportWidth || !viewportHeight) return

      const root = document.getElementById("malik-root")
      const shell = document.querySelector<HTMLElement>(".malik-dashboard-shell")
      if (!shell) return

      const main = shell.querySelector<HTMLElement>(":scope > main")
      if (!main) return

      const isNormalChat = Boolean(
        main.querySelector(".malik-chat-fullwidth") ||
        main.querySelector('textarea[placeholder="Опишите вашу идею для Malik AI..."]'),
      )

      // Use measured px values, not 100vw. This avoids zoom/device-scale and
      // parent-container bugs where CSS 100vw still visually lands at ~1280px.
      const sidebar = Array.from(shell.children).find((child) => {
        if (child === main) return false
        const el = child as HTMLElement
        const rect = el.getBoundingClientRect()
        return rect.width > 40 && rect.height > 200
      }) as HTMLElement | undefined

      const sidebarWidth = Math.max(0, Math.round(sidebar?.getBoundingClientRect().width || 0))
      const mainWidth = Math.max(320, viewportWidth - sidebarWidth)

      ;[document.documentElement, document.body, root].forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        important(node, "width", `${viewportWidth}px`)
        important(node, "max-width", "none")
        important(node, "min-width", `${viewportWidth}px`)
        important(node, "height", `${viewportHeight}px`)
        important(node, "min-height", `${viewportHeight}px`)
        important(node, "margin", "0")
        important(node, "overflow", "hidden")
        important(node, "background", "#02050d")
      })

      important(shell, "position", "fixed")
      important(shell, "left", "0")
      important(shell, "top", "0")
      important(shell, "right", "auto")
      important(shell, "bottom", "auto")
      important(shell, "display", "flex")
      important(shell, "width", `${viewportWidth}px`)
      important(shell, "max-width", "none")
      important(shell, "min-width", `${viewportWidth}px`)
      important(shell, "height", `${viewportHeight}px`)
      important(shell, "min-height", `${viewportHeight}px`)
      important(shell, "overflow", "hidden")
      important(shell, "background", "#02050d")

      if (sidebar) {
        important(sidebar, "flex", `0 0 ${sidebarWidth}px`)
        important(sidebar, "width", `${sidebarWidth}px`)
        important(sidebar, "min-width", `${sidebarWidth}px`)
        important(sidebar, "max-width", `${sidebarWidth}px`)
        important(sidebar, "height", `${viewportHeight}px`)
      }

      important(main, "display", "flex")
      important(main, "flex", `0 0 ${mainWidth}px`)
      important(main, "width", `${mainWidth}px`)
      important(main, "max-width", `${mainWidth}px`)
      important(main, "min-width", `${mainWidth}px`)
      important(main, "height", `${viewportHeight}px`)
      important(main, "min-height", `${viewportHeight}px`)
      important(main, "overflow", "hidden")
      important(main, "background", "#02050d")

      if (isNormalChat) {
        // Remove the right preview/canvas reservation in regular chat.
        main.querySelectorAll<HTMLElement>(":scope > aside").forEach((aside) => {
          important(aside, "display", "none")
          important(aside, "visibility", "hidden")
          important(aside, "width", "0px")
          important(aside, "min-width", "0px")
          important(aside, "max-width", "0px")
          important(aside, "flex", "0 0 0px")
          important(aside, "opacity", "0")
          important(aside, "pointer-events", "none")
        })

        main.querySelectorAll<HTMLElement>(":scope > section").forEach((section) => {
          important(section, "flex", `0 0 ${mainWidth}px`)
          important(section, "width", `${mainWidth}px`)
          important(section, "max-width", `${mainWidth}px`)
          important(section, "min-width", `${mainWidth}px`)
          important(section, "height", `${viewportHeight}px`)
          important(section, "border-right", "0")
          important(section, "box-shadow", "none")
          important(section, "background", "#02050d")
        })

        main.querySelectorAll<HTMLElement>(".malik-chat-fullwidth, .malik-chat-fullwidth > div").forEach((el) => {
          important(el, "width", `${mainWidth}px`)
          important(el, "max-width", `${mainWidth}px`)
          important(el, "min-width", "0px")
          important(el, "height", "100%")
          important(el, "flex", "1 1 auto")
          important(el, "background", "#02050d")
        })

        // Kill centered chat/composer max width blocks.
        main.querySelectorAll<HTMLElement>(".malik-chat-fullwidth [class*='max-w-'], .malik-chat-fullwidth [class*='mx-auto']").forEach((el) => {
          important(el, "max-width", "none")
          important(el, "width", "100%")
          important(el, "margin-left", "0")
          important(el, "margin-right", "0")
        })
      }
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(() => {
        scheduled = false
        apply()
      })
    }

    apply()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] })
    window.addEventListener("resize", schedule)
    window.addEventListener("orientationchange", schedule)
    const interval = window.setInterval(apply, 120)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("orientationchange", schedule)
      window.clearInterval(interval)
    }
  }, [])

  return null
}

export default ChatLayoutRuntimeFix

