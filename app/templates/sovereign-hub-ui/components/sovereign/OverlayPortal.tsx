"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Hosts a full-screen overlay outside the dashboard's stacking contexts.
 *
 * The dashboard's <main> carries `isolation: isolate`, so it is a stacking
 * context of its own. An overlay rendered inside a view therefore cannot rise
 * above the sidebar no matter what z-index it asks for: the Сайты template
 * viewer opened correctly sized but with its left quarter - the site title and
 * the first words of every headline - painted over by the sidebar.
 *
 * Moving the overlay to a host appended to <body> takes it out of both that
 * stacking context and #malik-root's (position:relative, z-index:2). The host
 * itself has no transform, filter or containment, so `position: fixed` inside
 * it means the viewport, which is what every one of these overlays asks for.
 *
 * The host is created on mount, so the first server render produces nothing -
 * these overlays are all opened by a click and never present on first paint.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const node = document.createElement("div")
    node.className = "malik-overlay-portal"
    node.style.position = "relative"
    // Above #malik-root (z-index 2) and anything the shell paints inside it.
    node.style.zIndex = "300"
    document.body.append(node)
    setHost(node)
    return () => node.remove()
  }, [])

  if (!host) return null
  return createPortal(children, host)
}
