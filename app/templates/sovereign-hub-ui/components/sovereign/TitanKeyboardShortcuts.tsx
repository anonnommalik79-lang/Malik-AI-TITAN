"use client"

import { useEffect } from "react"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
}

export default function TitanKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target

      if (event.key === "Escape" && isTypingTarget(target)) {
        ;(target as HTMLElement).blur()
        return
      }

      if (isTypingTarget(target)) return

      if (event.key === "/") {
        const composer = document.querySelector<HTMLTextAreaElement>(
          ".malik-welcome-earth-content textarea, .malik-premium-chat-host textarea",
        )
        if (composer) {
          event.preventDefault()
          composer.focus()
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return null
}
