"use client"

import { useEffect } from "react"

const MODELS = [
  {
    id: "malikvideo-1",
    name: "MalikVideo 1.0",
    subtitle: "Бесплатно",
    tier: "Free",
    icon: "/brands/malikvideo.svg",
    fallback: "M",
    active: true,
  },
  {
    id: "kling-21",
    name: "Kling 2.1",
    subtitle: "Лучшее качество",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://klingai.com",
    fallback: "K",
    active: false,
  },
  {
    id: "kling-16",
    name: "Kling 1.6",
    subtitle: "Стабильная",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://klingai.com",
    fallback: "K",
    active: false,
  },
  {
    id: "runway-gen3",
    name: "Runway Gen-3",
    subtitle: "Реалистичные",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://runwayml.com",
    fallback: "R",
    active: false,
  },
  {
    id: "luma-dream",
    name: "Luma Dream Machine",
    subtitle: "Креативные",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://lumalabs.ai",
    fallback: "L",
    active: false,
  },
  {
    id: "pika-20",
    name: "Pika 2.0",
    subtitle: "Быстрые",
    tier: "Pro",
    icon: "https://www.google.com/s2/favicons?sz=128&domain_url=https://pika.art",
    fallback: "P",
    active: false,
  },
] as const

const MOBILE_PAGE_SIZE = 5

const MOBILE_SITES_LIBRARY_STYLE = `
@media (max-width: 820px) {
  #malik-root .malikSites,
  #malik-root .malikSites .sitesWorkspace,
  #malik-root .malikSites .galleryHero,
  #malik-root .malikSites .galleryHeading,
  #malik-root .malikSites .templateGrid,
  #malik-root .malikLibrary,
  #malik-root .malikLibrary .libWorkspace,
  #malik-root .malikLibrary .libHero,
  #malik-root .malikLibrary .libHeading,
  #malik-root .malikLibrary .libGrid {
    background: #000 !important;
    box-shadow: none !important;
  }

  #malik-root .malikSites .galleryHero,
  #malik-root .malikLibrary .libHero {
    border-color: #151515 !important;
  }

  #malik-root .malikSites .siteSearch,
  #malik-root .malikSites .searchBox,
  #malik-root .malikLibrary .libSearch,
  #malik-root .malikLibrary .libSort,
  #malik-root .malikLibrary .libFavFilter {
    background: #070707 !important;
    border-color: #232323 !important;
    box-shadow: none !important;
  }

  #malik-root .categoryRow,
  #malik-root .libCategories {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) 34px !important;
    gap: 5px !important;
    width: 100% !important;
    overflow: hidden !important;
    padding: 10px 0 4px !important;
    scrollbar-width: none !important;
    background: #000 !important;
  }

  #malik-root .categoryRow::-webkit-scrollbar,
  #malik-root .libCategories::-webkit-scrollbar {
    display: none !important;
  }

  #malik-root .categoryRow > button:not(.malik-category-next),
  #malik-root .libCategories > button:not(.malik-category-next) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    height: 32px !important;
    margin: 0 !important;
    padding: 0 4px !important;
    border-radius: 999px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 9px !important;
    background: #0a0a0a !important;
    border-color: #242424 !important;
    color: #b9b9bd !important;
  }

  #malik-root .categoryRow > button.active,
  #malik-root .libCategories > button.is-active {
    background: #fff !important;
    border-color: #fff !important;
    color: #000 !important;
  }

  #malik-root .categoryRow > button[data-malik-category-visible="0"],
  #malik-root .libCategories > button[data-malik-category-visible="0"] {
    display: none !important;
  }

  #malik-root .categoryRow > .malik-category-next,
  #malik-root .libCategories > .malik-category-next {
    display: grid !important;
    place-items: center !important;
    width: 34px !important;
    min-width: 34px !important;
    height: 32px !important;
    padding: 0 !important;
    margin: 0 !important;
    border-radius: 999px !important;
    border: 1px solid #2b2b2b !important;
    background: #0a0a0a !important;
    color: #fff !important;
    font-size: 23px !important;
    line-height: 1 !important;
  }

  #malik-root .categoryRow > .malik-category-next span,
  #malik-root .libCategories > .malik-category-next span {
    transform: translateY(-1px);
  }

  #malik-root .malikSites .templateGrid,
  #malik-root .malikSites .templateCard,
  #malik-root .malikSites .template-card,
  #malik-root .malikSites .shotViewport,
  #malik-root .malikLibrary .libCard,
  #malik-root .malikLibrary .libShot {
    background: #000 !important;
    box-shadow: none !important;
  }

  #malik-root .malikSites .template-info,
  #malik-root .malikSites .templateInfo {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  #malik-root .malikLibrary .libFav {
    display: none !important;
  }

  #malik-root .malikLibrary .libMeta,
  #malik-root .malikLibrary .libShade {
    background: transparent !important;
    box-shadow: none !important;
  }

  #malik-root .malikLibrary .libCard:not(.is-open) .libMeta {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  #malik-root .malikLibrary .libCard,
  #malik-root .malikSites .templateCard,
  #malik-root .malikSites .template-card {
    border-color: #181818 !important;
  }

  #malik-root .malikSites .galleryHeading,
  #malik-root .malikLibrary .libHeading {
    margin-top: 10px !important;
    border: 0 !important;
  }
}
`

function modelMarkup() {
  const cards = MODELS.map((model) => {
    const tierClass = model.tier === "Free" ? "mv-model-tier--free" : "mv-model-tier--pro"
    const stateClass = model.active ? " is-active" : " is-pro"
    const paidAttr = model.active ? "" : ' data-paid-model="1" aria-disabled="true" title="Pro-модель: подключение API отдельно"'

    return `
      <button type="button" class="mv-model-card${stateClass}" data-model-id="${model.id}"${paidAttr}>
        <span class="mv-model-icon" data-fallback="${model.fallback}">
          <img src="${model.icon}" alt="" draggable="false" />
        </span>
        <span class="mv-model-copy">
          <strong>${model.name}</strong>
          <small>${model.subtitle}</small>
        </span>
        <span class="mv-model-tier ${tierClass}">${model.tier}</span>
      </button>
    `
  }).join("")

  return `
    <div class="mv-model-catalog" data-preserve-brand-color="true">
      <div class="mv-model-label">Модель</div>
      <div class="mv-model-cards">${cards}</div>
      <div class="mv-model-features">
        <span class="mv-model-feature">◖ <b>Audio synced</b><small>Видео + звук</small></span>
        <span class="mv-model-feature">✣ <b>RU · KZ · EN</b><small>Авто перевод</small></span>
      </div>
    </div>
  `
}

function categoryButtons(row: HTMLElement) {
  return Array.from(row.children).filter((node): node is HTMLButtonElement => (
    node instanceof HTMLButtonElement && !node.classList.contains("malik-category-next")
  ))
}

function activeCategoryIndex(buttons: HTMLButtonElement[]) {
  return buttons.findIndex((button) => (
    button.classList.contains("active")
    || button.classList.contains("is-active")
    || button.getAttribute("aria-pressed") === "true"
  ))
}

function syncCategoryPager(row: HTMLElement) {
  const buttons = categoryButtons(row)
  if (!buttons.length) return

  let next = row.querySelector<HTMLButtonElement>(":scope > .malik-category-next")
  if (window.innerWidth > 820) {
    buttons.forEach((button) => button.removeAttribute("data-malik-category-visible"))
    next?.remove()
    row.removeAttribute("data-malik-category-paged")
    return
  }

  const pages = Math.max(1, Math.ceil(buttons.length / MOBILE_PAGE_SIZE))
  let page = Math.min(Math.max(Number(row.dataset.malikCategoryPage || "0") || 0, 0), pages - 1)
  const active = activeCategoryIndex(buttons)
  if (active >= 0 && !row.dataset.malikCategoryLocked) page = Math.floor(active / MOBILE_PAGE_SIZE)
  row.dataset.malikCategoryPage = String(page)
  row.dataset.malikCategoryPaged = "1"

  const start = page * MOBILE_PAGE_SIZE
  const end = start + MOBILE_PAGE_SIZE
  buttons.forEach((button, index) => {
    button.dataset.malikCategoryVisible = index >= start && index < end ? "1" : "0"
  })

  if (!next) {
    next = document.createElement("button")
    next.type = "button"
    next.className = "malik-category-next"
    next.setAttribute("aria-label", "Следующие категории")
    next.innerHTML = '<span aria-hidden="true">›</span>'
    next.addEventListener("click", () => {
      const currentPages = Math.max(1, Math.ceil(categoryButtons(row).length / MOBILE_PAGE_SIZE))
      const current = Number(row.dataset.malikCategoryPage || "0") || 0
      row.dataset.malikCategoryLocked = "1"
      row.dataset.malikCategoryPage = String((current + 1) % currentPages)
      syncCategoryPager(row)
    })
    row.appendChild(next)
  }
  next.dataset.page = String(page)
  next.dataset.pages = String(pages)
}

function installMobileCategoryPagers() {
  document.querySelectorAll<HTMLElement>(".categoryRow, .libCategories").forEach((row) => {
    if (row.dataset.malikCategoryEvents !== "1") {
      row.dataset.malikCategoryEvents = "1"
      row.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("button") : null
        if (!target || target.classList.contains("malik-category-next")) return
        row.removeAttribute("data-malik-category-locked")
        window.setTimeout(() => syncCategoryPager(row), 0)
      })
    }
    syncCategoryPager(row)
  })
}

export function MalikVideoModelRuntime() {
  useEffect(() => {
    let disposed = false

    const install = () => {
      if (disposed) return
      const studio = document.querySelector<HTMLElement>('.mv[data-view="video-generation"]')
      const host = studio?.querySelector<HTMLElement>(".mv__model-row")
      if (host && host.dataset.malikVideoModels !== "1") {
        host.dataset.malikVideoModels = "1"
        host.classList.add("mv__model-row--catalog")
        host.innerHTML = modelMarkup()

        host.querySelectorAll<HTMLImageElement>(".mv-model-icon img").forEach((image) => {
          image.addEventListener("error", () => image.classList.add("is-broken"), { once: true })
        })

        host.querySelectorAll<HTMLButtonElement>("[data-paid-model='1']").forEach((button) => {
          button.addEventListener("click", (event) => {
            event.preventDefault()
            event.stopPropagation()
          })
        })
      }

      installMobileCategoryPagers()
    }

    const styleId = "malik-mobile-sites-library-final"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = MOBILE_SITES_LIBRARY_STYLE
      document.head.appendChild(style)
    }

    const onResize = () => installMobileCategoryPagers()
    install()
    window.addEventListener("resize", onResize, { passive: true })
    const observer = new MutationObserver(install)
    observer.observe(document.documentElement, { childList: true, subtree: true })

    return () => {
      disposed = true
      window.removeEventListener("resize", onResize)
      observer.disconnect()
    }
  }, [])

  return null
}
