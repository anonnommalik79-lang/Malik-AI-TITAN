"use client"

import { useEffect } from "react"
import {
  MALIK_IMAGE_QUALITY_EVENT,
  ensureMalikImageQualityPreference,
  readMalikImageQuality,
  writeMalikImageQuality,
} from "@/lib/media/image-client-settings"
import type { MalikImageQuality } from "@/lib/media/image-quality-presets"

// Above Ultra 2K the picture is the same render, enlarged: more pixels and a
// bigger print, not more of what the model drew. The label carries the size and
// the tooltip carries the cost, so the choice is made with both in view.
const OPTIONS: Array<[MalikImageQuality, string, string]> = [
  ["draft", "Draft", "Быстрее всего, без постобработки"],
  ["balanced", "Balanced", "Баланс скорости и качества"],
  ["quality", "Quality 2K", "2048px по длинной стороне"],
  ["ultra", "Ultra 2K", "2048px, максимум шагов модели"],
  ["ultra4k", "Ultra 4K", "3840px · ступенчатое увеличение"],
  ["ultra8k", "Ultra 8K", "7680px · для печати и кропа"],
  ["ultra16k", "Ultra 16K", "15360px · большой формат, файл десятки МБ"],
]

function buildControl(compact = false) {
  const wrap = document.createElement("label")
  wrap.className = compact ? "malik-image-quality malik-image-quality--compact" : "malik-image-quality"
  wrap.dataset.malikQualityControl = "1"

  const title = document.createElement("span")
  title.textContent = compact ? "Quality" : "Качество"
  const select = document.createElement("select")
  select.setAttribute("aria-label", "Качество генерации изображения")
  for (const [value, label, hint] of OPTIONS) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    option.title = hint
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
