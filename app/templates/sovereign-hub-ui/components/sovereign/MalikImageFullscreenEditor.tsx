"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Image as ImageIcon,
  Layers3,
  Redo2,
  SendHorizontal,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react"
import { ImageSelectionCanvas } from "./ImageSelectionCanvas"
import {
  imageVersionChain,
  isMalikImageFavorite,
  readMalikImageHistory,
  toggleMalikImageFavorite,
  type MalikImageHistoryItem,
} from "@/lib/media/image-history"
import {
  requestMalikImageEditor,
  type MalikImageEditorMode,
  type MalikImageSelection,
} from "@/lib/media/image-editor-events"
import { resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

type ViewerImage = {
  src: string
  prompt: string
  provider: string
  quality?: string
}

type Resolution = "1K" | "2K" | "4K"
type Aspect = "1:1" | "16:9" | "9:16" | "4:5" | "4:3"

type Credits = {
  remaining: number
  costs: Record<Resolution, number>
  remaining4k: number
}

const QUICK_PROMPTS = [
  "Сделай реалистичнее",
  "Смени фон",
  "Убери объект",
  "Добавь текст",
  "Сделай как постер",
]

function masterImageUrl(src: string) {
  const value = String(src || "").trim()
  const marker = value.lastIndexOf("#malik-master=")
  if (marker < 0) return value
  try {
    return decodeURIComponent(value.slice(marker + "#malik-master=".length)) || value.slice(0, marker)
  } catch {
    return value.slice(0, marker)
  }
}

async function copyText(text: string) {
  const clean = String(text || "").trim()
  if (!clean) return false
  try {
    await navigator.clipboard.writeText(clean)
    return true
  } catch {
    return false
  }
}

function downloadImage(src: string) {
  const href = masterImageUrl(src)
  if (!href) return
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = `malik-ai-${Date.now()}.png`
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function actionPrompt(mode: MalikImageEditorMode, sourcePrompt: string) {
  const base = String(sourcePrompt || "").trim()
  if (mode === "variation") {
    return `Создай новую премиальную вариацию этого изображения. Сохрани главный объект, его идентичность и ключевую идею кадра, но сделай заметно новую версию через композицию, свет, оптику и детали.${base ? ` Исходный замысел: ${base}` : ""}`
  }
  if (mode === "transparent") {
    return "Удали фон и сделай чистый прозрачный фон. Полностью сохрани главный объект, края, волосы, мелкие детали, цвета и пропорции. Не добавляй новые предметы."
  }
  if (mode === "enhance") {
    return "Улучши это изображение как Ultra master: сохрани сцену и идентичность, увеличь реалистичность, микротекстуры, чистоту краёв, материалы, отражения, свет и детализацию. Не меняй композицию без необходимости."
  }
  if (mode === "detail") {
    return "Усиль только качество и микродетали: фактуры, волосы, кожу, материалы, края, отражения и локальный контраст. Сохрани исходную сцену, лица, геометрию и композицию."
  }
  if (mode === "remaster") {
    return "Сделай premium remaster этой же сцены: исправь визуальные артефакты, геометрию, перспективу, материалы и свет, сохрани главный объект и смысл кадра."
  }
  if (mode === "cinematic") {
    return "Сохрани главный объект и сцену, но сделай дорогую кинематографичную версию: реалистичная оптика, естественная глубина резкости, объёмный свет и профессиональный film color grading."
  }
  if (mode === "wide") {
    return "Пересобери эту же сцену в формате 16:9. Сохрани главный объект полностью, естественно дорисуй пространство по краям и не искажай исходные детали."
  }
  if (mode === "portrait") {
    return "Пересобери эту же сцену в вертикальном формате 9:16. Сохрани главный объект полностью и оптимизируй композицию под экран телефона без искажений."
  }
  return ""
}

function useResolvedImage(src: string) {
  const [resolved, setResolved] = useState(src)
  useEffect(() => {
    let cancelled = false
    resolveGeneratedImageUrl(masterImageUrl(src))
      .then((value) => { if (!cancelled) setResolved(value || src) })
      .catch(() => { if (!cancelled) setResolved(src) })
    return () => { cancelled = true }
  }, [src])
  return resolved
}

function VersionThumb({
  item,
  active,
  onClick,
}: {
  item: MalikImageHistoryItem
  active: boolean
  onClick: () => void
}) {
  const src = useResolvedImage(item.src)
  return (
    <button
      type="button"
      className={`malik-image-editor__version${active ? " is-active" : ""}`}
      onClick={onClick}
      title={item.operation ? `Версия · ${item.operation}` : "Версия"}
      aria-label={`Открыть версию ${item.versionIndex + 1}`}
    >
      <img src={src} alt="" loading="lazy" decoding="async" />
      <span>{item.versionIndex + 1}</span>
    </button>
  )
}

export function MalikImageFullscreenEditor({
  image,
  onClose,
  onOpenHistory,
  onNotice,
}: {
  image: ViewerImage
  onClose: () => void
  onOpenHistory: () => void
  onNotice: (text: string) => void
}) {
  const [active, setActive] = useState<ViewerImage>(image)
  const [prompt, setPrompt] = useState("")
  const [selectionMode, setSelectionMode] = useState(false)
  const [selection, setSelection] = useState<MalikImageSelection | undefined>()
  const [resetKey, setResetKey] = useState(0)
  const [brushSize, setBrushSize] = useState(42)
  const [imageSize, setImageSize] = useState<Resolution>("1K")
  const [aspectRatio, setAspectRatio] = useState<Aspect>("1:1")
  const [credits, setCredits] = useState<Credits | null>(null)
  const [historyNonce, setHistoryNonce] = useState(0)
  const displaySrc = useResolvedImage(active.src)

  useEffect(() => {
    setActive(image)
    setPrompt("")
    setSelection(undefined)
    setSelectionMode(false)
    setResetKey((value) => value + 1)
  }, [image])

  useEffect(() => {
    let cancelled = false
    fetch("/api/ai/image/credits", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.ok) return
        setCredits({
          remaining: Number(payload.remaining || 0),
          remaining4k: Number(payload.remaining4k || 0),
          costs: {
            "1K": Number(payload?.costs?.["1K"] ?? 1),
            "2K": Number(payload?.costs?.["2K"] ?? 2),
            "4K": Number(payload?.costs?.["4K"] ?? 5),
          },
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const historyItem = useMemo(
    () => readMalikImageHistory().find((item) => masterImageUrl(item.src) === masterImageUrl(active.src) || item.src === active.src),
    [active.src, historyNonce],
  )
  const versions = useMemo(
    () => historyItem ? imageVersionChain(historyItem) : [],
    [historyItem, historyNonce],
  )
  const activeVersionIndex = historyItem ? versions.findIndex((item) => item.id === historyItem.id) : -1
  const favorite = isMalikImageFavorite(active.src)

  const chooseVersion = (item: MalikImageHistoryItem) => {
    setActive({
      src: item.src,
      prompt: item.prompt,
      provider: item.provider,
      quality: item.quality,
    })
    setPrompt("")
    setSelection(undefined)
    setSelectionMode(false)
    setResetKey((value) => value + 1)
  }

  const run = (mode: MalikImageEditorMode, customPrompt?: string, forcedAspect?: Aspect) => {
    const text = String(customPrompt ?? prompt).trim() || actionPrompt(mode, active.prompt)
    if (!text) {
      onNotice("Опишите, что изменить")
      return
    }
    const ok = requestMalikImageEditor({
      sourceSrc: active.src,
      sourcePrompt: active.prompt,
      prompt: text,
      mode,
      imageSize,
      imageAspectRatio: forcedAspect || aspectRatio,
      selection: selectionMode ? selection : undefined,
      parentHistoryId: historyItem?.id,
    })
    if (!ok) {
      onNotice("Не удалось отправить правку")
      return
    }
    onNotice(selectionMode && selection ? "Редактирую выбранную область" : mode === "variation" ? "Создаю вариацию" : "Редактирование запущено")
    onClose()
  }

  const moveVersion = (delta: number) => {
    if (!versions.length || activeVersionIndex < 0) return
    const next = versions[activeVersionIndex + delta]
    if (next) chooseVersion(next)
  }

  return (
    <div className="malik-image-viewer malik-image-editor" role="dialog" aria-modal="true" aria-label="Редактор изображения">
      <div className="malik-image-viewer__topbar malik-image-editor__topbar">
        <div className="malik-image-viewer__meta">
          <strong>Malik Image Editor</strong>
          {active.provider ? <span>{active.provider}</span> : null}
          {active.quality ? <span>{active.quality}</span> : null}
        </div>
        <div className="malik-image-viewer__actions">
          <button type="button" onClick={() => copyText(active.prompt).then((ok) => onNotice(ok ? "Промпт скопирован" : "Не удалось скопировать"))}>Промпт</button>
          <button type="button" onClick={() => downloadImage(active.src)}><Download className="h-3.5 w-3.5" /> Скачать</button>
          <button type="button" className="is-close" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="malik-image-editor__workspace">
        <div className="malik-image-editor__stage">
          <div className="malik-image-editor__image-wrap">
            <img src={displaySrc} alt={active.prompt || "Malik AI image"} draggable={false} decoding="async" />
            <ImageSelectionCanvas
              active={selectionMode}
              brushSize={brushSize}
              resetKey={resetKey}
              onSelectionChange={setSelection}
            />
          </div>

          {selectionMode ? (
            <div className="malik-image-editor__selection-tools">
              <span><Wand2 className="h-3.5 w-3.5" /> Кисть</span>
              <input
                type="range"
                min={18}
                max={96}
                step={2}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                aria-label="Размер кисти"
              />
              <button type="button" onClick={() => { setResetKey((value) => value + 1); setSelection(undefined) }}><Eraser className="h-3.5 w-3.5" /> Очистить</button>
              <small>{selection ? `Область: ${Math.round(selection.coverage)}%` : "Закрасьте область, которую нужно изменить"}</small>
            </div>
          ) : null}
        </div>

        <aside className="malik-image-editor__panel">
          <div className="malik-image-editor__panel-head">
            <div>
              <strong>Редактирование</strong>
              <span>Продолжайте с этой же картинкой — без повторной загрузки.</span>
            </div>
            <button type="button" onClick={() => setSelectionMode((value) => !value)} className={selectionMode ? "is-active" : ""}>
              <Wand2 className="h-4 w-4" /> {selectionMode ? "Выделение включено" : "Выделить область"}
            </button>
          </div>

          <div className="malik-image-editor__quick">
            {QUICK_PROMPTS.map((item) => (
              <button key={item} type="button" onClick={() => setPrompt(item)}>{item}</button>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                run("edit")
              }
            }}
            placeholder={selectionMode ? "Что изменить в выделенной области?" : "Что изменить в этом изображении?"}
            rows={4}
          />

          <div className="malik-image-editor__settings">
            <div>
              <span>Качество</span>
              <div className="malik-image-editor__segments">
                {(["1K", "2K", "4K"] as Resolution[]).map((size) => {
                  const cost = credits?.costs[size] ?? (size === "1K" ? 1 : size === "2K" ? 2 : 5)
                  const disabled = Boolean(credits && (credits.remaining < cost || (size === "4K" && credits.remaining4k <= 0)))
                  return (
                    <button key={size} type="button" disabled={disabled} className={imageSize === size ? "is-active" : ""} onClick={() => setImageSize(size)} title={`${cost} кр.`}>
                      {size}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <span>Формат</span>
              <div className="malik-image-editor__segments is-scroll">
                {(["1:1", "16:9", "9:16", "4:5", "4:3"] as Aspect[]).map((ratio) => (
                  <button key={ratio} type="button" className={aspectRatio === ratio ? "is-active" : ""} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="malik-image-editor__primary-actions">
            <button type="button" className="is-primary" onClick={() => run("edit")} disabled={!prompt.trim()}>
              <SendHorizontal className="h-4 w-4" /> Изменить
            </button>
            <button type="button" onClick={() => run("variation")}><Sparkles className="h-4 w-4" /> Вариация</button>
            <button type="button" onClick={() => run("transparent")}><ImageIcon className="h-4 w-4" /> Прозрачный фон</button>
          </div>

          <div className="malik-image-editor__power-actions">
            <button type="button" onClick={() => run("enhance")}>Ultra</button>
            <button type="button" onClick={() => run("detail")}>Detail+</button>
            <button type="button" onClick={() => run("remaster")}>Remaster</button>
            <button type="button" onClick={() => run("cinematic")}>Cinema</button>
            <button type="button" onClick={() => run("wide", undefined, "16:9")}>16:9</button>
            <button type="button" onClick={() => run("portrait", undefined, "9:16")}>9:16</button>
          </div>

          <div className="malik-image-editor__versions">
            <div className="malik-image-editor__versions-head">
              <span><Layers3 className="h-4 w-4" /> Версии</span>
              <div>
                <button type="button" disabled={activeVersionIndex <= 0} onClick={() => moveVersion(-1)} aria-label="Предыдущая версия"><Undo2 className="h-4 w-4" /></button>
                <button type="button" disabled={activeVersionIndex < 0 || activeVersionIndex >= versions.length - 1} onClick={() => moveVersion(1)} aria-label="Следующая версия"><Redo2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="malik-image-editor__version-strip">
              {versions.length ? versions.map((item) => (
                <VersionThumb key={item.id} item={item} active={historyItem?.id === item.id} onClick={() => chooseVersion(item)} />
              )) : (
                <span className="malik-image-editor__version-empty">Следующая правка появится здесь как новая версия.</span>
              )}
            </div>
            <button type="button" className="malik-image-editor__library" onClick={onOpenHistory}>Открыть всю библиотеку</button>
          </div>

          <div className="malik-image-editor__footer-nav">
            <button type="button" disabled={activeVersionIndex <= 0} onClick={() => moveVersion(-1)}><ChevronLeft className="h-4 w-4" /> Назад</button>
            <button type="button" onClick={() => { toggleMalikImageFavorite(active.src); setHistoryNonce((value) => value + 1); onNotice(favorite ? "Убрано из избранного" : "Добавлено в избранное") }}>
              {favorite ? "★ Избранное" : "☆ В избранное"}
            </button>
            <button type="button" disabled={activeVersionIndex < 0 || activeVersionIndex >= versions.length - 1} onClick={() => moveVersion(1)}>Вперёд <ChevronRight className="h-4 w-4" /></button>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default MalikImageFullscreenEditor
