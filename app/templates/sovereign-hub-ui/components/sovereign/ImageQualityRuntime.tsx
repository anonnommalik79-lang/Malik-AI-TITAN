"use client"

import { useEffect } from "react"
import {
  MALIK_IMAGE_QUALITY_EVENT,
  ensureMalikImageQualityPreference,
  readMalikImageQuality,
  writeMalikImageQuality,
} from "@/lib/media/image-client-settings"
import type { MalikImageQuality } from "@/lib/media/image-quality-presets"

const OPTIONS: Array<[MalikImageQuality, string]> = [
  ["draft", "Draft"],
  ["balanced", "Balanced"],
  ["quality", "Quality 2K"],
  ["ultra", "Ultra 2K"],
]

function buildControl(compact = false) {
  const wrap = document.createElement("label")
  wrap.className = compact ? "malik-image-quality malik-image-quality--compact" : "malik-image-quality"
  wrap.dataset.malikQualityControl = "1"

  const title = document.createElement("span")
  title.textContent = compact ? "Quality" : "Качество"
  const select = document.createElement("select")
  select.setAttribute("aria-label", "Качество генерации изображения")
  for (const [value, label] of OPTIONS) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    select.appendChild(option)
  }
  select.value = readMalikImageQuality()
  select.addEventListener("change", () => writeMalikImageQuality(select.value as MalikImageQuality))
  wrap.append(title, select)
  return wrap
}

export function ImageQualityRuntime() {
  useEffect(() => {
    ensureMalikImageQualityPreference()

    const mount = () => {
      document.querySelectorAll<HTMLElement>(".pgs__ratio-pills").forEach((ratios) => {
        const parent = ratios.parentElement
        if (!parent || parent.querySelector("[data-malik-quality-control='1']")) return
        parent.appendChild(buildControl(false))
      })

      document.querySelectorAll<HTMLElement>(".malik-image-tools").forEach((tools) => {
        if (tools.querySelector("[data-malik-quality-control='1']")) return
        tools.appendChild(buildControl(true))
      })
    }

    const sync = () => {
      const current = readMalikImageQuality()
      document.querySelectorAll<HTMLSelectElement>("[data-malik-quality-control='1'] select").forEach((select) => {
        if (select.value !== current) select.value = current
      })
    }

    mount()
    const observer = new MutationObserver(mount)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener(MALIK_IMAGE_QUALITY_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      observer.disconnect()
      window.removeEventListener(MALIK_IMAGE_QUALITY_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  return null
}

export default ImageQualityRuntime
