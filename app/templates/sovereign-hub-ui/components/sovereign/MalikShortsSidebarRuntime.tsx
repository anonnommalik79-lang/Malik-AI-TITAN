"use client"

import { useEffect } from "react"

const ENTRY_ATTR = "data-malik-shorts-main-entry"

function shortsIcon(size = 17) {
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", String(size))
  svg.setAttribute("height", String(size))
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "1.8")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v4M7 16v4M17 4v4M17 16v4"/><path d="m10 9 5 3-5 3Z"/>'
  return svg
}

function goToShorts() {
  if (window.location.pathname === "/shorts") return
  window.location.assign("/shorts")
}

function makeExpandedEntry(active: boolean) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute(ENTRY_ATTR, "expanded")
  button.setAttribute("data-action-id", "malik-shorts")
  button.setAttribute("aria-label", "Malik Shorts")
  if (active) button.setAttribute("aria-current", "page")
  button.className = `malik-sidebar-primary${active ? " is-active" : ""}`
  button.appendChild(shortsIcon())
  const label = document.createElement("span")
  label.textContent = "Malik Shorts"
  button.appendChild(label)
  button.addEventListener("click", goToShorts)
  return button
}

function makeCollapsedEntry(active: boolean) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute(ENTRY_ATTR, "collapsed")
  button.setAttribute("aria-label", "Malik Shorts")
  if (active) button.setAttribute("aria-current", "page")
  button.className = `malik-sidebar-rail-btn${active ? " is-active" : ""}`
  button.appendChild(shortsIcon(18))
  button.addEventListener("click", goToShorts)
  return button
}

function syncSidebarEntry() {
  const sidebar = document.querySelector<HTMLElement>(".malik-sidebar")
  if (!sidebar) return

  const active = window.location.pathname.startsWith("/shorts")
  const collapsed = sidebar.getAttribute("data-collapsed") === "true"
  const desired = collapsed ? "collapsed" : "expanded"

  for (const node of Array.from(sidebar.querySelectorAll<HTMLElement>(`[${ENTRY_ATTR}]`))) {
    if (node.getAttribute(ENTRY_ATTR) !== desired) node.remove()
  }

  if (sidebar.querySelector(`[${ENTRY_ATTR}="${desired}"]`)) return

  if (collapsed) {
    const nav = sidebar.querySelector<HTMLElement>('nav[aria-label="Навигация"], .malik-sidebar-scroll')
    if (!nav) return
    const entry = makeCollapsedEntry(active)
    const voice = nav.querySelector<HTMLElement>('[aria-label="Голосовой режим"]')
    if (voice?.nextSibling) nav.insertBefore(entry, voice.nextSibling)
    else if (voice) nav.appendChild(entry)
    else nav.prepend(entry)
    return
  }

  const nav = sidebar.querySelector<HTMLElement>('nav[aria-label="Основная навигация"]')
  if (!nav) return
  const entry = makeExpandedEntry(active)
  const voice = nav.querySelector<HTMLElement>('[data-action-id="voice"]')
  if (voice?.nextSibling) nav.insertBefore(entry, voice.nextSibling)
  else if (voice) nav.appendChild(entry)
  else nav.prepend(entry)
}

export function MalikShortsSidebarRuntime() {
  useEffect(() => {
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(() => {
        queued = false
        syncSidebarEntry()
      })
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-collapsed"] })
    window.addEventListener("popstate", schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener("popstate", schedule)
      document.querySelectorAll(`[${ENTRY_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])

  return null
}
