"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { prefillPrompt } from "@/lib/malik-context"
import { readMalikImageQuality } from "@/lib/media/image-client-settings"
import {
  MALIK_IMAGE_HISTORY_EVENT,
  isMalikImageFavorite,
  readMalikImageHistory,
  rememberMalikImage,
  toggleMalikImageFavorite,
  type MalikImageHistoryItem,
} from "@/lib/media/image-history"

type ViewerImage = {
  src: string
  prompt: string
  provider: string
  quality?: string
}

type ImageAction =
  | "open"
  | "download"
  | "copy"
  | "favorite"
  | "history"
  | "variation"
  | "enhance"
  | "detail"
  | "remaster"
  | "cinematic"
  | "wide"
  | "portrait"

const TOOLBAR_HTML = `
  <button type="button" data-malik-image-action="open" aria-label="Открыть изображение">Открыть</button>
  <button type="button" data-malik-image-action="download" aria-label="Скачать изображение">Скачать</button>
  <button type="button" data-malik-image-action="copy" aria-label="Копировать промпт">Промпт</button>
  <button type="button" data-malik-image-action="favorite" aria-label="Добавить в избранное">☆</button>
  <span class="malik-image-tools__divider" aria-hidden="true"></span>
  <button type="button" data-malik-image-action="variation">Вариация</button>
  <button type="button" data-malik-image-action="enhance">Ultra 2K</button>
  <button type="button" data-malik-image-action="detail">Detail+</button>
  <button type="button" data-malik-image-action="remaster">Remaster</button>
  <button type="button" data-malik-image-action="cinematic">Cinema</button>
  <button type="button" data-malik-image-action="wide">16:9</button>
  <button type="button" data-malik-image-action="portrait">9:16</button>
  <button type="button" data-malik-image-action="history">История</button>
`

function readImageFromCard(card: HTMLElement): ViewerImage | null {
  const image = card.querySelector<HTMLImageElement>(".malik-art-result.is-visible, .malik-art-result")
  const src = String(image?.currentSrc || image?.src || "").trim()
  if (!src) return null

  const prompt = String(
    card.querySelector<HTMLElement>(".malik-art-report__prompt")?.textContent
      || image?.alt
      || "",
  ).trim()

  const provider = String(card.querySelector<HTMLElement>(".malik-art-report__row em")?.textContent || "").trim()
  return { src, prompt, provider, quality: readMalikImageQuality() }
}

function stripImageCommand(prompt: string) {
  return String(prompt || "")
    .replace(/^\s*\/(?:image|img|photo|foto|фото|картинка)\s*:?[\s]*/iu, "")
    .replace(/^\s*(?:сгенерируй|создай|сделай|нарисуй)\s+(?:фото|изображение|картинку)?\s*/iu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function nextPrompt(action: ImageAction, sourcePrompt: string) {
  const prompt = stripImageCommand(sourcePrompt) || "сохрани главный объект и композицию исходного кадра"

  if (action === "variation") {
    return `/image ${prompt}. Сделай новую премиальную вариацию: сохрани главный объект и идею, но улучши композицию, свет, глубину и мелкие детали. Без текста и водяных знаков.`
  }
  if (action === "enhance") {
    return `/image ${prompt}. Ultra 2K master: максимальная реалистичность, точные микротекстуры, натуральные материалы, чистые края, корректные отражения, точная перспектива, профессиональный свет, высокий динамический диапазон, без артефактов.`
  }
  if (action === "detail") {
    return `/image ${prompt}. Detail master: сохрани сцену, усили микродетали поверхностей, фактуру материалов, естественные края, реалистичные отражения, локальный контраст и резкость главного объекта. Без перешарпа, шума, текста и артефактов.`
  }
  if (action === "remaster") {
    return `/image ${prompt}. Remaster: пересобери этот замысел как финальный premium master, сохрани главный объект и смысл, исправь геометрию, перспективу, материалы, свет, глубину, мелкие дефекты и визуальные артефакты.`
  }
  if (action === "cinematic") {
    return `/image ${prompt}. Cinematic master: дорогая кино-композиция, реалистичная оптика, естественная глубина резкости, объёмный свет, film color grading, premium commercial photography, без текста и водяных знаков.`
  }
  if (action === "wide") {
    return `/image ${prompt}. Пересобери сцену в формате 16:9, сохрани главный объект полностью в кадре, добавь естественное пространство по краям, premium composition, без текста.`
  }
  if (action === "portrait") {
    return `/image ${prompt}. Пересобери сцену в вертикальном формате 9:16, сохрани главный объект полностью в кадре, оптимизируй композицию под экран телефона, premium composition, без текста.`
  }
  return ""
}

function safeDownload(src: string) {
  if (typeof document === "undefined" || !src) return
  const anchor = document.createElement("a")
  anchor.href = src
  anchor.download = `malik-ai-${Date.now()}.webp`
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function copyText(text: string) {
  const clean = String(text || "").trim()
  if (!clean || typeof window === "undefined") return false
  try {
    await navigator.clipboard.writeText(clean)
    return true
  } catch {
    const area = document.createElement("textarea")
    area.value = clean
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    return ok
  }
}

export function ImageResultExperience() {
  const [viewer, setViewer] = useState<ViewerImage | null>(null)
  const [notice, setNotice] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<MalikImageHistoryItem[]>([])

  useEffect(() => {
    const syncHistory = () => setHistory(readMalikImageHistory())
    syncHistory()
    window.addEventListener(MALIK_IMAGE_HISTORY_EVENT, syncHistory)
    window.addEventListener("storage", syncHistory)
    return () => {
      window.removeEventListener(MALIK_IMAGE_HISTORY_EVENT, syncHistory)
      window.removeEventListener("storage", syncHistory)
    }
  }, [])

  useEffect(() => {
    const enhanceCard = (card: HTMLElement) => {
      const stage = card.querySelector<HTMLElement>(".malik-art-stage")
      const image = card.querySelector<HTMLImageElement>(".malik-art-result")
      if (!stage || !image) return

      const ready = stage.classList.contains("is-finished") || image.classList.contains("is-visible") || (image.complete && image.naturalWidth > 0)
      card.dataset.malikImageReady = ready ? "1" : "0"
      if (ready) {
        stage.dataset.malikOpenable = "1"
        stage.setAttribute("role", "button")
        stage.setAttribute("tabindex", "0")
        stage.setAttribute("aria-label", "Открыть изображение на весь экран")
        const item = readImageFromCard(card)
        if (item) rememberMalikImage(item)
      } else {
        delete stage.dataset.malikOpenable
        stage.removeAttribute("role")
        stage.removeAttribute("tabindex")
        stage.removeAttribute("aria-label")
      }

      if (!card.querySelector(".malik-image-tools")) {
        const tools = document.createElement("div")
        tools.className = "malik-image-tools"
        tools.setAttribute("role", "toolbar")
        tools.setAttribute("aria-label", "Инструменты изображения")
        tools.innerHTML = TOOLBAR_HTML
        card.appendChild(tools)
      }

      const item = ready ? readImageFromCard(card) : null
      const favorite = card.querySelector<HTMLButtonElement>("[data-malik-image-action='favorite']")
      if (favorite && item) {
        const active = isMalikImageFavorite(item.src)
        favorite.textContent = active ? "★" : "☆"
        favorite.setAttribute("aria-label", active ? "Убрать из избранного" : "Добавить в избранное")
      }
    }

    const enhanceAll = () => {
      document.querySelectorAll<HTMLElement>(".malik-photo-motion").forEach(enhanceCard)
    }

    enhanceAll()
    const observer = new MutationObserver(() => enhanceAll())
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "src"] })

    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const card = target.closest<HTMLElement>(".malik-photo-motion")
      if (!card || card.dataset.malikImageReady !== "1") return

      const actionButton = target.closest<HTMLElement>("[data-malik-image-action]")
      const stage = target.closest<HTMLElement>(".malik-art-stage[data-malik-openable='1']")
      if (!actionButton && !stage) return

      const image = readImageFromCard(card)
      if (!image) return

      const action = (actionButton?.dataset.malikImageAction || "open") as ImageAction
      if (action === "open") {
        setViewer(image)
        return
      }
      if (action === "download") {
        safeDownload(image.src)
        setNotice("Файл готов к скачиванию")
        return
      }
      if (action === "copy") {
        const ok = await copyText(image.prompt)
        setNotice(ok ? "Промпт скопирован" : "Не удалось скопировать промпт")
        return
      }
      if (action === "favorite") {
        const favorite = toggleMalikImageFavorite(image.src)
        if (actionButton) actionButton.textContent = favorite ? "★" : "☆"
        setNotice(favorite ? "Добавлено в избранное" : "Убрано из избранного")
        return
      }
      if (action === "history") {
        setHistory(readMalikImageHistory())
        setHistoryOpen(true)
        return
      }

      const prompt = nextPrompt(action, image.prompt)
      if (prompt) {
        prefillPrompt(prompt)
        const label: Record<string, string> = {
          variation: "Вариация подготовлена",
          enhance: "Ultra 2K подготовлен",
          detail: "Detail+ подготовлен",
          remaster: "Remaster подготовлен",
          cinematic: "Cinema-версия подготовлена",
          wide: "Формат 16:9 подготовлен",
          portrait: "Формат 9:16 подготовлен",
        }
        setNotice(label[action] || "Новая версия подготовлена")
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || (event.key !== "Enter" && event.key !== " ")) return
      const stage = target.closest<HTMLElement>(".malik-art-stage[data-malik-openable='1']")
      if (!stage) return
      event.preventDefault()
      const card = stage.closest<HTMLElement>(".malik-photo-motion")
      const image = card ? readImageFromCard(card) : null
      if (image) setViewer(image)
    }

    document.addEventListener("click", onClick)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      observer.disconnect()
      document.removeEventListener("click", onClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 1800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!viewer && !historyOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (viewer) setViewer(null)
      else setHistoryOpen(false)
    }
    window.addEventListener("keydown", close)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", close)
    }
  }, [viewer, historyOpen])

  const overlay = viewer && typeof document !== "undefined"
    ? createPortal(
        <div className="malik-image-viewer" role="dialog" aria-modal="true" aria-label="Просмотр изображения" onMouseDown={(event) => { if (event.currentTarget === event.target) setViewer(null) }}>
          <div className="malik-image-viewer__topbar">
            <div className="malik-image-viewer__meta">
              <strong>Malik Image</strong>
              {viewer.provider ? <span>{viewer.provider}</span> : null}
              {viewer.quality ? <span>{viewer.quality}</span> : null}
            </div>
            <div className="malik-image-viewer__actions">
              <button type="button" onClick={() => copyText(viewer.prompt).then((ok) => setNotice(ok ? "Промпт скопирован" : "Не удалось скопировать"))}>Промпт</button>
              <button type="button" onClick={() => safeDownload(viewer.src)}>Скачать</button>
              <button type="button" className="is-close" onClick={() => setViewer(null)} aria-label="Закрыть">×</button>
            </div>
          </div>

          <div className="malik-image-viewer__canvas" onDoubleClick={() => setViewer(null)}>
            <img src={viewer.src} alt={viewer.prompt || "Malik AI generated image"} draggable={false} />
          </div>

          <div className="malik-image-viewer__bottom">
            <button type="button" onClick={() => { const favorite = toggleMalikImageFavorite(viewer.src); setNotice(favorite ? "Добавлено в избранное" : "Убрано из избранного") }}>{isMalikImageFavorite(viewer.src) ? "★ Избранное" : "☆ Избранное"}</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("variation", viewer.prompt)); setViewer(null) }}>Вариация</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("enhance", viewer.prompt)); setViewer(null) }}>Ultra 2K</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("detail", viewer.prompt)); setViewer(null) }}>Detail+</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("remaster", viewer.prompt)); setViewer(null) }}>Remaster</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("cinematic", viewer.prompt)); setViewer(null) }}>Cinema</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("wide", viewer.prompt)); setViewer(null) }}>16:9</button>
            <button type="button" onClick={() => { prefillPrompt(nextPrompt("portrait", viewer.prompt)); setViewer(null) }}>9:16</button>
            <button type="button" onClick={() => { setViewer(null); setHistory(readMalikImageHistory()); setHistoryOpen(true) }}>История</button>
          </div>
        </div>,
        document.body,
      )
    : null

  const historyOverlay = historyOpen && typeof document !== "undefined"
    ? createPortal(
        <div className="malik-image-history" role="dialog" aria-modal="true" aria-label="История изображений" onMouseDown={(event) => { if (event.currentTarget === event.target) setHistoryOpen(false) }}>
          <section className="malik-image-history__panel">
            <header className="malik-image-history__head">
              <div><strong>Malik Image Library</strong><span>{history.length} изображений</span></div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Закрыть">×</button>
            </header>
            <div className="malik-image-history__grid">
              {history.length ? history.map((item) => (
                <article key={item.id} className="malik-image-history__item">
                  <button type="button" onClick={() => setViewer({ src: item.src, prompt: item.prompt, provider: item.provider, quality: item.quality })} aria-label="Открыть изображение">
                    <img src={item.src} alt={item.prompt || "Malik AI image"} loading="lazy" />
                  </button>
                  <button type="button" className={`malik-image-history__favorite ${item.favorite ? "is-active" : ""}`} onClick={() => { toggleMalikImageFavorite(item.src); setHistory(readMalikImageHistory()) }} aria-label="Избранное">{item.favorite ? "★" : "☆"}</button>
                  <div className="malik-image-history__meta">
                    <p>{item.prompt || "Без названия"}</p>
                    <small>{[item.provider, item.quality].filter(Boolean).join(" · ") || "Malik Image"}</small>
                  </div>
                </article>
              )) : <div className="malik-image-history__empty">Готовые изображения появятся здесь автоматически.</div>}
            </div>
          </section>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      {overlay}
      {historyOverlay}
      {notice && typeof document !== "undefined"
        ? createPortal(<div className="malik-image-toast" role="status">{notice}</div>, document.body)
        : null}
    </>
  )
}

export default ImageResultExperience
