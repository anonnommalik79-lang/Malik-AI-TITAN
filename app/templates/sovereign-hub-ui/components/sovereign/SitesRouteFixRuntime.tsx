"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { WebsiteGenerationStudio } from "./website-generation/WebsiteGenerationStudio"

const HOST_ID = "malik-sites-workspace-host"

export function SitesRouteFixRuntime() {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let frame = 0
    let currentLegacy: HTMLElement | null = null

    const restoreLegacy = () => {
      if (!currentLegacy) return
      for (const child of Array.from(currentLegacy.children) as HTMLElement[]) {
        if (child.id !== HOST_ID) child.style.removeProperty("display")
      }
      currentLegacy.querySelector(`#${HOST_ID}`)?.remove()
      currentLegacy = null
      setHost(null)
    }

    const mountWorkspace = () => {
      frame = 0
      const legacy = document.querySelector<HTMLElement>(
        '.db-section-experience[data-view="website-generation"]',
      )

      if (!legacy) {
        if (currentLegacy) restoreLegacy()
        return
      }

      if (legacy === currentLegacy && document.getElementById(HOST_ID)) return
      if (currentLegacy && currentLegacy !== legacy) restoreLegacy()

      currentLegacy = legacy
      legacy.style.setProperty("background", "#000", "important")
      legacy.style.setProperty("overflow", "auto", "important")

      for (const child of Array.from(legacy.children) as HTMLElement[]) {
        if (child.id !== HOST_ID) child.style.setProperty("display", "none", "important")
      }

      let nextHost = legacy.querySelector<HTMLElement>(`#${HOST_ID}`)
      if (!nextHost) {
        nextHost = document.createElement("div")
        nextHost.id = HOST_ID
        nextHost.style.width = "100%"
        nextHost.style.minHeight = "100%"
        nextHost.style.background = "#000"
        legacy.appendChild(nextHost)
      }
      setHost(nextHost)
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(mountWorkspace)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-view"] })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      restoreLegacy()
    }
  }, [])

  if (!host) return null

  return createPortal(
    <WebsiteGenerationStudio
      onViewChange={() => {}}
      onOpenCodex={() => window.dispatchEvent(new CustomEvent("malik-open-codex"))}
      onOpenCanvas={(code) => window.dispatchEvent(new CustomEvent("malik-open-canvas", { detail: { code } }))}
    />,
    host,
  )
}
