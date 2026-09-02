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

export function MalikVideoModelRuntime() {
  useEffect(() => {
    let disposed = false

    const install = () => {
      if (disposed) return
      const studio = document.querySelector<HTMLElement>('.mv[data-view="video-generation"]')
      const host = studio?.querySelector<HTMLElement>(".mv__model-row")
      if (!host || host.dataset.malikVideoModels === "1") return

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

    install()
    const observer = new MutationObserver(install)
    observer.observe(document.documentElement, { childList: true, subtree: true })

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [])

  return null
}
