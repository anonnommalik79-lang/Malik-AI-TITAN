"use client"

import { useEffect } from "react"

const ACTION_ORDER: Record<string, number> = {
  new: 10,
  voice: 20,
  library: 30,
  projects: 40,

  "business-autonomous": 110,
  newsroom: 115,
  shorts: 120,
  websites: 130,
  "video-generation": 140,
  "photo-generation": 145,

  plugins: 210,
  compute: 220,
  translate: 230,
}

const GROUPS = [
  { id: "main", label: "Основное", order: 5, actionIds: ["new", "voice", "library", "projects"] },
  { id: "create", label: "Создание", order: 100, actionIds: ["business-autonomous", "newsroom", "shorts", "websites", "video-generation", "photo-generation"] },
  { id: "tools", label: "Инструменты", order: 200, actionIds: ["plugins", "compute", "translate"] },
] as const

function ensureGroupLabel(nav: HTMLElement, group: (typeof GROUPS)[number]) {
  const hasAction = group.actionIds.some((id) => nav.querySelector(`[data-action-id="${id}"]`))
  const founderInTools = group.id === "tools" && Boolean(nav.querySelector(".malik-founder-nav"))
  const shouldExist = hasAction || founderInTools
  const selector = `[data-malik-sidebar-section="${group.id}"]`
  let label = nav.querySelector<HTMLElement>(selector)

  if (!shouldExist) {
    label?.remove()
    return
  }

  if (!label) {
    label = document.createElement("p")
    label.dataset.malikSidebarSection = group.id
    label.className = "malik-sidebar-runtime-section-label"
    label.setAttribute("aria-hidden", "true")
    nav.appendChild(label)
  }

  if (label.textContent !== group.label) label.textContent = group.label
  if (label.style.order !== String(group.order)) label.style.order = String(group.order)
}

function ensureHistoryHeader(history: HTMLElement) {
  let title = history.querySelector<HTMLElement>("[data-malik-sidebar-history-title]")
  if (!title) {
    title = document.createElement("p")
    title.dataset.malikSidebarHistoryTitle = "true"
    title.className = "malik-sidebar-runtime-history-title"
    title.setAttribute("aria-hidden", "true")
    history.prepend(title)
  }
  if (title.textContent !== "История чатов") title.textContent = "История чатов"
}

function applySidebarSections() {
  const sidebar = document.querySelector<HTMLElement>('.malik-sidebar[data-collapsed="false"]')
  if (!sidebar) return

  const nav = sidebar.querySelector<HTMLElement>('nav[aria-label="Основная навигация"]')
  const history = sidebar.querySelector<HTMLElement>(".malik-sidebar-history")
  const dataTools = sidebar.querySelector<HTMLElement>(".malik-sidebar-tools")
  if (!nav || !history || !dataTools) return

  nav.dataset.sidebarZone = "navigation"
  history.dataset.sidebarZone = "history"
  dataTools.dataset.sidebarZone = "data-tools"

  const directChildren = Array.from(sidebar.children) as HTMLElement[]
  const brand = directChildren[0]
  const search = directChildren.find((node) => node.querySelector?.(".malik-sidebar-search"))
  const profile = directChildren.find((node) => node.querySelector?.(".malik-sidebar-user"))
  if (brand) brand.dataset.sidebarZone = "brand"
  if (search) search.dataset.sidebarZone = "search"
  if (profile) profile.dataset.sidebarZone = "profile"

  for (const action of nav.querySelectorAll<HTMLElement>("[data-action-id]")) {
    const id = action.dataset.actionId || ""
    const order = ACTION_ORDER[id] ?? 160
    if (action.style.order !== String(order)) action.style.order = String(order)
  }

  const founder = nav.querySelector<HTMLElement>(".malik-founder-nav")
  if (founder && founder.style.order !== "240") founder.style.order = "240"

  for (const group of GROUPS) ensureGroupLabel(nav, group)

  const legacyToolsTitle = dataTools.querySelector<HTMLElement>(".malik-sidebar-group-title")
  if (legacyToolsTitle) legacyToolsTitle.dataset.malikRuntimeHiddenTitle = "true"

  ensureHistoryHeader(history)
}

export function SidebarSectionRuntime() {
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        applySidebarSections()
      })
    }

    schedule()

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-collapsed"],
    })
    window.addEventListener("resize", schedule)
    window.addEventListener("popstate", schedule)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("popstate", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <style jsx global>{`
      .malik-sidebar[data-collapsed="false"] {
        --malik-sidebar-section-line: rgba(255, 255, 255, 0.075);
        --malik-sidebar-section-label: #66666f;
      }

      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="brand"] { order: 10; }
      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="search"] { order: 20; }
      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="navigation"] { order: 30; }
      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="data-tools"] { order: 40; }
      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="history"] { order: 50; }
      .malik-sidebar[data-collapsed="false"] > [data-sidebar-zone="profile"] { order: 60; }

      .malik-sidebar[data-collapsed="false"] nav[aria-label="Основная навигация"] {
        display: flex !important;
        flex-direction: column !important;
        gap: 0 !important;
        padding-bottom: 0 !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-section-label {
        display: block;
        margin: 6px 8px 4px;
        padding-top: 10px;
        border-top: 1px solid var(--malik-sidebar-section-line);
        color: var(--malik-sidebar-section-label);
        font-size: 10px;
        font-weight: 500;
        line-height: 1.15;
        letter-spacing: 0;
        text-transform: none;
        user-select: none;
        pointer-events: none;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-section-label[data-malik-sidebar-section="main"] {
        margin-top: 1px;
        padding-top: 0;
        border-top: 0;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-tools {
        padding-top: 0 !important;
        padding-bottom: 2px !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-tools [data-malik-runtime-hidden-title="true"] {
        display: none !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-history-title {
        display: block;
        margin: 2px 0 7px;
        padding: 10px 8px 0;
        border-top: 1px solid var(--malik-sidebar-section-line);
        color: var(--malik-sidebar-section-label);
        font-size: 10px;
        font-weight: 500;
        line-height: 1.15;
        user-select: none;
        pointer-events: none;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-history {
        padding-top: 0 !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-history > .malik-sidebar-chat-group:first-of-type .malik-sidebar-group-title {
        margin-top: 0 !important;
      }

      @media (max-width: 767px) {
        .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-section-label,
        .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-history-title {
          font-size: 10px;
        }
      }
    `}</style>
  )
}
