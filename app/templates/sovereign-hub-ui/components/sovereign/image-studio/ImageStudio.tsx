"use client"

import "./image-studio.css"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft, ArrowUpRight, AudioLines, Brush, Building, Building2, Camera, Car, Cat, Check, ChevronDown, Clapperboard,
  Coffee, Compass, Cpu, Download, Droplets, Eraser, Ghost, Heart, House, Image as ImageIcon, ImagePlus, Loader2, Lock,
  Maximize2, Mountain, Package, Palette, Paperclip, PawPrint, PencilLine, Plus, Radio, RefreshCw, Rocket, RotateCcw,
  Search, Shapes, Shuffle, SlidersHorizontal, Smile, Sofa, Sparkles, UserRound, Users, Video, Wand2, X,
  type LucideIcon,
} from "lucide-react"
import {
  composeImagePrompt, filterImageTemplates, findImageTemplate, IMAGE_EDIT_PRESETS, IMAGE_STYLE_PRESETS,
  IMAGE_TEMPLATE_CATEGORIES, IMAGE_TEMPLATES, type ImageStudioTab, type ImageTemplate, type ImageTemplateCategory,
  type ImageTemplateIcon,
} from "@/lib/media/image-templates"
import {
  canUseMalikImageModel, loadMalikImageModelSelection, MALIK_IMAGE_MODELS, saveMalikImageModelSelection,
  type MalikImageModelId,
} from "@/lib/media/image-models"

export type StudioAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "4:5"
export type StudioResolution = "1K" | "2K" | "4K"

export type StudioAttachment = {
  id: string
  name: string
  mime: string
  kind: string
  url?: string
  base64?: string
}

export type StudioCredits = {
  remaining: number
  daily: number
  costs: Record<StudioResolution, number>
  remaining4k: number
}

type Result = {
  id: string
  batch: string
  status: "queued" | "painting" | "ready" | "failed"
  prompt: string
  aspect: StudioAspectRatio
  url?: string
  master?: string
  error?: string
  startedAt?: number
}

type Run = {
  text: string
  styles: string[]
  editing: boolean
  source?: StudioAttachment
  aspect: StudioAspectRatio
  size: StudioResolution
  model: MalikImageModelId
}

const ICONS: Record<ImageTemplateIcon, LucideIcon> = {
  car: Car, building: Building2, mountain: Mountain, shapes: Shapes, package: Package, city: Building, sofa: Sofa,
  cpu: Cpu, camera: Camera, coffee: Coffee, radio: Radio, droplets: Droplets, home: House, brush: Brush, rocket: Rocket,
  paw: PawPrint, wand: Wand2, clapper: Clapperboard, smile: Smile, cat: Cat, compass: Compass, user: UserRound,
  ghost: Ghost, heart: Heart,
}

const RATIOS: StudioAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "4:5"]
const QUALITIES: Array<{ size: StudioResolution; label: string; note: string }> = [
  { size: "1K", label: "Стандарт", note: "1K · быстрее" },
  { size: "2K", label: "Высокое", note: "2K · детальнее" },
  { size: "4K", label: "Ультра", note: "4K · максимум" },
]
const COUNTS = [1, 2, 3, 4]
const DEFAULT_COSTS: Record<StudioResolution, number> = { "1K": 1, "2K": 2, "4K": 5 }
const EXPECTED_MS = 28_000
const REQUEST_TIMEOUT_MS = 150_000

const TAB_COPY: Record<ImageStudioTab, { title: string; subtitle: string; placeholder: string }> = {
  images: {
    title: "Создание изображений",
    subtitle: "Опишите идею или выберите шаблон, чтобы начать генерацию",
    placeholder: "Опишите, что вы хотите создать...",
  },
  characters: {
    title: "Создание персонажей",
    subtitle: "Выберите образ героя или опишите своего — Malik AI нарисует его",
    placeholder: "Опишите персонажа: внешность, одежда, характер, место...",
  },
  edit: {
    title: "Редактирование изображений",
    subtitle: "Загрузите фото и опишите, что изменить — остальное останется как было",
    placeholder: "Опишите, что изменить на фото...",
  },
}

function uid() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve() }, { once: true })
  })
}

function isImage(item: StudioAttachment) {
  return item.kind === "image" || String(item.mime || "").startsWith("image/")
}

function previewOf(item: StudioAttachment) {
  if (item.url) return item.url
  if (item.base64) return item.base64.startsWith("data:") ? item.base64 : `data:${item.mime};base64,${item.base64}`
  return ""
}

function formatCredits(value: number) {
  return value > 1_000_000 ? "∞" : String(Math.max(0, Math.floor(value)))
}

function ratioStyle(aspect: StudioAspectRatio): CSSProperties {
  const [w, h] = aspect.split(":").map(Number)
  return { aspectRatio: `${w} / ${h}` }
}

function useDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return desktop
}

/** A small anchored menu that closes on outside click. */
function Menu({
  open, onClose, placement = "up", align = "left", children, label, style,
}: {
  open: boolean
  onClose: () => void
  placement?: "up" | "down" | "fixed"
  align?: "left" | "right"
  children: ReactNode
  label: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      // Its own button toggles the menu; any other click closes it.
      if (!target || ref.current?.contains(target) || target.closest?.("[data-mis-trigger]")) return
      onClose()
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open, onClose])
  if (!open) return null
  const where = placement === "up" ? "is-up" : placement === "down" ? "is-down" : "is-fixed"
  return (
    <div ref={ref} role="menu" aria-label={label} style={style} className={`mis-menu ${where} ${align === "right" ? "is-right" : ""}`}>
      {children}
    </div>
  )
}

export function ImageStudio({
  attachments,
  credits,
  plan,
  onAddImage,
  onAddFiles,
  onRemoveAttachment,
  onClose,
}: {
  attachments: StudioAttachment[]
  credits?: StudioCredits | null
  plan?: string
  onAddImage: () => void
  /** Files dropped on the studio; they go through the composer's own checks. */
  onAddFiles?: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onClose: () => void
}) {
  const desktop = useDesktop()
  const [left, setLeft] = useState(0)
  const [tab, setTab] = useState<ImageStudioTab>("images")
  const [category, setCategory] = useState<ImageTemplateCategory | "all">("popular")
  const [query, setQuery] = useState("")
  const [prompt, setPrompt] = useState("")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [styleId, setStyleId] = useState("none")
  const [aspect, setAspect] = useState<StudioAspectRatio>("1:1")
  const [size, setSize] = useState<StudioResolution>("2K")
  const [count, setCount] = useState(1)
  const [model, setModel] = useState<MalikImageModelId>(() => loadMalikImageModelSelection())
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [menu, setMenu] = useState<null | "model" | "model-bar" | "plus" | "kind" | "style" | "quality">(null)
  const [results, setResults] = useState<Result[]>([])
  const [showResults, setShowResults] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [lightbox, setLightbox] = useState<Result | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [painting, setPainting] = useState<string[]>([])
  const [canPaint, setCanPaint] = useState(false)
  const [paintedCount, setPaintedCount] = useState(0)
  const [paintTotal, setPaintTotal] = useState(0)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [now, setNow] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastExampleRef = useRef("")
  const lastRunRef = useRef<Run | null>(null)

  const copy = TAB_COPY[tab]
  const template = findImageTemplate(templateId)
  const style = IMAGE_STYLE_PRESETS.find((item) => item.id === styleId) || IMAGE_STYLE_PRESETS[0]
  const modelInfo = MALIK_IMAGE_MODELS.find((item) => item.id === model) || MALIK_IMAGE_MODELS[0]
  const images = useMemo(() => attachments.filter(isImage), [attachments])
  const source = images.find((item) => item.base64 || item.url?.startsWith("data:")) || images[0]
  const editing = tab === "edit" || images.length > 0
  const costs = credits?.costs || DEFAULT_COSTS
  const cost = (costs[size] ?? DEFAULT_COSTS[size]) * (editing ? 1 : count)
  const shortOfCredits = Boolean(credits && credits.remaining < cost)
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

  const visible = useMemo(
    () => (tab === "edit" ? [] : filterImageTemplates(tab, category, query)),
    [tab, category, query],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  // The studio covers the main area and leaves the app's sidebar in view.
  useLayoutEffect(() => {
    const main = document.querySelector(".malik-dashboard-shell main") as HTMLElement | null
    const update = () => {
      if (!main || window.innerWidth < 1024) return setLeft(0)
      setLeft(Math.max(0, Math.round(main.getBoundingClientRect().left)))
    }
    update()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    if (main) observer?.observe(main)
    window.addEventListener("resize", update)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  // The content scrolls under the prompt panel; keep room for it.
  useLayoutEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    if (!panel || !root) return
    const update = () => root.style.setProperty("--mis-panel-h", `${Math.ceil(panel.getBoundingClientRect().height)}px`)
    update()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    observer?.observe(panel)
    return () => observer?.disconnect()
  }, [settingsOpen, images.length, error, templateId])

  useEffect(() => {
    if (!desktop) return
    const timer = window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 260)
    return () => window.clearTimeout(timer)
  }, [desktop])

  // Elapsed seconds on the tiles that are being painted.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (lightbox) return setLightbox(null)
      if (menu) return setMenu(null)
      onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [lightbox, menu, onClose])

  // ------------------------------------------------------------ covers
  const paintCover = useCallback(async (id: string, force = false) => {
    setPainting((list) => (list.includes(id) ? list : [...list, id]))
    try {
      const response = await fetch("/api/media/image/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force }),
      })
      const payload = await response.json().catch(() => null)
      if (payload?.ok && typeof payload.url === "string") {
        setCovers((current) => ({ ...current, [id]: payload.url }))
        setPaintedCount((value) => value + 1)
      }
    } catch {
      // The bundled cover stays; the next visit tries again.
    } finally {
      setPainting((list) => list.filter((item) => item !== id))
    }
  }, [])

  // Covers painted by Malik AI replace the bundled ones. On the owner's
  // visit every missing cover is painted, two at a time, popular ones first.
  const paintStopped = useRef(false)
  useEffect(() => {
    paintStopped.current = false
    let cancelled = false
    fetch("/api/media/image/templates", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.ok) return
        const known: Record<string, string> = payload.covers && typeof payload.covers === "object" ? payload.covers : {}
        setCovers(known)
        setCanPaint(Boolean(payload.canPaint))
        if (!payload.canPaint) return
        const queue = IMAGE_TEMPLATES.filter((item) => !known[item.id]).map((item) => item.id)
        if (!queue.length) return
        setPaintTotal(queue.length)
        const worker = async () => {
          while (!paintStopped.current && queue.length) await paintCover(queue.shift() as string)
        }
        void Promise.all([worker(), worker()])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      paintStopped.current = true
    }
  }, [paintCover])

  // ------------------------------------------------------------ choosing
  const pickTemplate = (item: ImageTemplate) => {
    if (templateId === item.id) {
      setTemplateId(null)
      if (prompt === lastExampleRef.current) setPrompt("")
      return
    }
    setTemplateId(item.id)
    if (!prompt.trim() || prompt === lastExampleRef.current) {
      setPrompt(item.example)
      lastExampleRef.current = item.example
    }
    setError("")
    window.setTimeout(() => {
      const field = textareaRef.current
      if (!field) return
      field.focus({ preventScroll: true })
      field.setSelectionRange(field.value.length, field.value.length)
    }, 0)
  }

  const switchTab = (next: ImageStudioTab | "video" | "audio") => {
    setMenu(null)
    if (next === "video" || next === "audio") {
      window.dispatchEvent(new CustomEvent("malik-open-view", { detail: { view: next === "video" ? "video-generation" : "music-generation" } }))
      onClose()
      return
    }
    setTab(next)
    setShowResults(false)
    setQuery("")
    setError("")
    if (next === "characters" || (templateId && findImageTemplate(templateId)?.tab !== next)) {
      if (prompt === lastExampleRef.current) setPrompt("")
      setTemplateId(null)
    }
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const randomIdea = () => {
    const pool = tab === "edit" ? IMAGE_EDIT_PRESETS.map((item) => item.prompt) : IMAGE_TEMPLATES.filter((item) => item.tab === tab).map((item) => item.example)
    const idea = pool[Math.floor(Math.random() * pool.length)]
    if (idea) {
      setPrompt(idea)
      lastExampleRef.current = idea
    }
    setMenu(null)
    textareaRef.current?.focus({ preventScroll: true })
  }

  const openFloating = (key: "model" | "quality", element: HTMLElement) => {
    if (menu === key) return setMenu(null)
    const rect = element.getBoundingClientRect()
    setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), bottom: window.innerHeight - rect.top + 8 })
    setMenu(key)
  }

  const chooseModel = (id: MalikImageModelId) => {
    setModel(id)
    saveMalikImageModelSelection(id)
    setMenu(null)
  }

  // ------------------------------------------------------------ generating
  const patch = (id: string, change: Partial<Result>) =>
    setResults((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)))

  const requestOne = async (run: Run, signal: AbortSignal) => {
    const body = {
      prompt: run.editing ? run.text : composeImagePrompt(run.text, run.styles),
      operation: run.editing ? "edit" : "generate",
      kind: "photo",
      provider: "auto",
      stream: false,
      imageSize: run.size,
      aspectRatio: run.aspect,
      format: run.aspect,
      imageModelId: run.model,
      seed: run.editing ? undefined : Math.floor(Math.random() * 2_147_483_000),
      attachments: run.editing && run.source
        ? [{ id: run.source.id, name: run.source.name, mime: run.source.mime, kind: "image", base64: run.source.base64, url: run.source.url }]
        : [],
    }
    // Another picture from the chat may be rendering: the server lets one
    // run at a time per account, so wait for it instead of failing.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const timeout = new AbortController()
      const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
      const onAbort = () => timeout.abort()
      signal.addEventListener("abort", onAbort, { once: true })
      try {
        const response = await fetch("/api/media/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: timeout.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (response.status === 409 && payload?.error === "IMAGE_GENERATION_ALREADY_RUNNING") {
          await wait(2500, signal)
          if (signal.aborted) throw new Error("aborted")
          continue
        }
        if ((response.status === 503 || payload?.retryable) && attempt < 2) {
          await wait(Number(payload?.retryAfterMs) || 2000, signal)
          if (signal.aborted) throw new Error("aborted")
          continue
        }
        if (!response.ok || !payload?.ok) {
          const stop = response.status === 429 || response.status === 403 || response.status === 401
          const message = payload?.publicError || payload?.error || `Не удалось создать изображение (HTTP ${response.status}).`
          return { ok: false as const, stop, error: String(message) }
        }
        const url = payload.url || payload.mediaUrl || payload.imageUrl || payload.browserCacheImageUrl
        if (typeof url !== "string" || !url) return { ok: false as const, stop: false, error: "Генератор не вернул изображение." }
        const master = payload.masterUrl || payload.imageUrl || url
        return { ok: true as const, url, master: typeof master === "string" ? master : url }
      } catch {
        if (signal.aborted) throw new Error("aborted")
        return { ok: false as const, stop: false, error: "Сервер не ответил вовремя. Попробуйте ещё раз." }
      } finally {
        window.clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
      }
    }
    return { ok: false as const, stop: true, error: "Другая генерация всё ещё идёт. Попробуйте чуть позже." }
  }

  const execute = async (run: Run, amount: number) => {
    const batch = uid()
    const tiles: Result[] = Array.from({ length: amount }, () => ({
      id: uid(), batch, status: "queued", prompt: run.text, aspect: run.aspect,
    }))
    lastRunRef.current = run
    setResults((list) => [...tiles, ...list].slice(0, 36))
    setShowResults(true)
    setError("")
    setRunning(true)
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for (let index = 0; index < tiles.length; index += 1) {
        const tile = tiles[index]
        patch(tile.id, { status: "painting", startedAt: Date.now() })
        let outcome: Awaited<ReturnType<typeof requestOne>>
        try {
          outcome = await requestOne(run, controller.signal)
        } catch {
          return
        }
        if (outcome.ok) {
          patch(tile.id, { status: "ready", url: outcome.url, master: outcome.master })
          window.dispatchEvent(new Event("malik-image-credits-changed"))
        } else {
          patch(tile.id, { status: "failed", error: outcome.error })
          if (outcome.stop) {
            setError(outcome.error)
            for (const rest of tiles.slice(index + 1)) patch(rest.id, { status: "failed", error: "Не запущено" })
            break
          }
        }
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setRunning(false)
    }
  }

  const generate = () => {
    if (running) return
    const text = prompt.trim()
    if (!text) {
      setError(editing ? "Опишите, что изменить на фото." : "Опишите, что нарисовать, или выберите шаблон.")
      textareaRef.current?.focus()
      return
    }
    if (editing && !source) {
      setError("Прикрепите фото, которое нужно изменить.")
      return
    }
    if (shortOfCredits) {
      setError(`Не хватает фото-кредитов: нужно ${cost}, осталось ${formatCredits(credits?.remaining ?? 0)}.`)
      return
    }
    const styles = editing ? [] : [template?.style || "", style.style].filter(Boolean)
    void execute({ text, styles, editing, source, aspect, size, model }, editing ? 1 : count)
  }

  const retry = () => {
    if (running || !lastRunRef.current) return
    void execute(lastRunRef.current, 1)
  }

  const download = async (item: Result) => {
    const url = item.master || item.url
    if (!url) return
    const name = `malik-ai-${item.id.slice(0, 8)}.${/png/i.test(url) ? "png" : /jpe?g/i.test(url) ? "jpg" : "webp"}`
    try {
      const response = await fetch(url.split("#")[0])
      if (!response.ok) throw new Error("fetch")
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 2000)
    } catch {
      window.open(url.split("#")[0], "_blank", "noopener,noreferrer")
    }
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    // Dropped files go through the composer's own checks and resizing, the
    // same as every other attachment.
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"))
    if (files.length && onAddFiles) onAddFiles(files)
    else onAddImage()
  }

  if (typeof document === "undefined") return null

  const readyCount = results.filter((item) => item.status === "ready").length
  const paintingNow = results.filter((item) => item.status === "painting" || item.status === "queued").length
  const coverProgress = painting.length && paintTotal ? `Malik AI рисует обложки · ${Math.min(paintedCount, paintTotal)}/${paintTotal}` : ""
  const batch = results.length ? results.filter((item) => item.batch === results[0].batch) : []
  const batchDone = batch.filter((item) => item.status === "ready" || item.status === "failed").length

  const tabs: Array<{ id: ImageStudioTab | "video" | "audio"; label: string; icon: LucideIcon; external?: boolean }> = [
    { id: "images", label: "Изображения", icon: ImageIcon },
    { id: "video", label: "Видео", icon: Video, external: true },
    { id: "audio", label: "Аудио", icon: AudioLines, external: true },
    { id: "characters", label: "Персонажи", icon: Users },
    { id: "edit", label: "Редактирование", icon: PencilLine },
  ]

  const modelMenu = (key: "model" | "model-bar", placement: "up" | "down" | "fixed", style?: CSSProperties) => (
    <Menu open={menu === key} onClose={() => setMenu(null)} placement={placement} label="Модель" style={style}>
      {MALIK_IMAGE_MODELS.map((item) => {
        const locked = !canUseMalikImageModel(item.id, plan)
        return (
          <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === model} className="mis-menu-item" disabled={locked} onClick={() => chooseModel(item.id)}>
            <Sparkles />
            <span className="mis-menu-text">
              <span>{item.label}</span>
              <small>{item.description}</small>
            </span>
            {locked ? <span className="mis-menu-tag"><Lock style={{ width: 10, height: 10, display: "inline" }} /> Plus</span> : null}
            {item.id === model ? <Check className="mis-check" /> : null}
          </button>
        )
      })}
    </Menu>
  )

  const searchField = (
    <label className="mis-search">
      <Search />
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); if (tab === "edit") setTab("images"); setShowResults(false) }}
        placeholder="Поиск шаблонов"
        aria-label="Поиск шаблонов"
      />
      {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X /></button> : null}
    </label>
  )

  const studio = (
    <div
      ref={rootRef}
      className="mis"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      style={{ left }}
      onDragOver={(event) => { if (onAddFiles && event.dataTransfer?.types?.includes("Files")) event.preventDefault() }}
      onDrop={(event) => {
        if (!onAddFiles) return
        const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"))
        if (!files.length) return
        event.preventDefault()
        setDragOver(false)
        onAddFiles(files)
      }}
    >
      <div className="mis-top">
        <div className="mis-top-left">
          <div className="mis-tool">
            <button type="button" data-mis-trigger className="mis-model-btn" onClick={() => setMenu(menu === "model-bar" ? null : "model-bar")} aria-haspopup="menu" aria-expanded={menu === "model-bar"}>
              <span className="mis-model-mark"><Sparkles /></span>
              <span className="mis-model-name">{modelInfo.label}</span>
              <ChevronDown />
            </button>
            {modelMenu("model-bar", "down")}
          </div>
        </div>

        <nav className="mis-tabs" aria-label="Что создать">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mis-tab ${tab === item.id ? "is-active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => switchTab(item.id)}
              title={item.external ? `Открыть студию «${item.label}»` : undefined}
            >
              <item.icon />
              {item.label}
              {item.external ? <ArrowUpRight className="mis-tab-out" /> : null}
            </button>
          ))}
        </nav>

        <div className="mis-top-right">
          {searchField}
          <button type="button" className="mis-icon-btn" onClick={onClose} aria-label="Закрыть">
            <X />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="mis-body">
        <div className="mis-inner">
          <div className="mis-hero">
            <div>
              <h1 className="mis-title">{copy.title}</h1>
              <p className="mis-subtitle">{copy.subtitle}</p>
            </div>
            {coverProgress ? (
              <span className="mis-status" role="status"><Loader2 className="mis-spin" /> {coverProgress}</span>
            ) : running ? (
              <span className="mis-status" role="status"><Loader2 className="mis-spin" /> Рисую {Math.min(batchDone + 1, batch.length)} из {batch.length}</span>
            ) : !showResults && readyCount ? (
              <button type="button" className="mis-ghost-btn" onClick={() => setShowResults(true)}><ImageIcon /> Результаты · {readyCount}</button>
            ) : null}
          </div>

          {tab !== "edit" ? <div className="mis-mobile-search">{searchField}</div> : null}

          {showResults && results.length ? (
            <section aria-label="Результаты">
              <div className="mis-results-head">
                <div>
                  <h2>Результаты</h2>
                  <p>{results[0]?.prompt}</p>
                </div>
                <button type="button" className="mis-ghost-btn" onClick={() => setShowResults(false)}>
                  <ArrowLeft /> {tab === "edit" ? "К фото" : "К шаблонам"}
                </button>
              </div>
              <div className="mis-results">
                {results.map((item) => {
                  const elapsed = item.startedAt && now ? Math.max(0, Math.round((now - item.startedAt) / 1000)) : 0
                  const progress = item.status === "painting" ? Math.min(92, 8 + ((elapsed * 1000) / EXPECTED_MS) * 84) : 4
                  return (
                    <div key={item.id} className="mis-result" style={ratioStyle(item.aspect)}>
                      {item.status === "ready" && item.url ? (
                        <>
                          <button type="button" className="mis-result-open" onClick={() => setLightbox(item)} aria-label="Открыть изображение">
                            <img src={item.url} alt={item.prompt} draggable={false} />
                          </button>
                          <div className="mis-result-actions">
                            <button type="button" onClick={() => void download(item)} aria-label="Скачать" title="Скачать"><Download /></button>
                            <button type="button" onClick={() => setLightbox(item)} aria-label="Открыть" title="Открыть"><Maximize2 /></button>
                            <button type="button" onClick={retry} disabled={running} aria-label="Ещё вариант" title="Ещё вариант"><RotateCcw /></button>
                          </div>
                        </>
                      ) : item.status === "failed" ? (
                        <div className="mis-result-wait">
                          <strong className="mis-result-failed">Не получилось</strong>
                          <span>{item.error}</span>
                          {item.error !== "Не запущено" ? (
                            <button type="button" className="mis-ghost-btn" onClick={retry} disabled={running}><RefreshCw /> Повторить</button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mis-result-wait" aria-live="polite">
                          {item.status === "painting" ? <Loader2 className="mis-spin" /> : <Sparkles />}
                          <strong>{item.status === "painting" ? "Malik AI рисует…" : "В очереди"}</strong>
                          <span>{item.status === "painting" ? `${elapsed} с` : "начнётся следом"}</span>
                          <span className="mis-result-bar"><i style={{ width: `${progress}%` }} /></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mis-section-label">{tab === "edit" ? "Фото для редактирования" : "Шаблоны"}</p>
            </section>
          ) : null}

          {tab === "edit" ? (
            <div className="mis-drop">
              <button
                type="button"
                className={`mis-drop-zone ${dragOver ? "is-over" : ""}`}
                onClick={onAddImage}
                onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                aria-label={source ? "Заменить фото" : "Загрузить фото"}
              >
                {source && previewOf(source) ? (
                  <img src={previewOf(source)} alt="Фото для редактирования" />
                ) : (
                  <>
                    <span className="mis-drop-icon"><ImagePlus /></span>
                    <span>
                      <strong>Загрузите фото</strong>
                      <small>PNG, JPEG или WebP · до 12 МБ</small>
                    </span>
                  </>
                )}
              </button>
              <div className="mis-presets">
                {IMAGE_EDIT_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="mis-preset"
                    onClick={() => { setPrompt(item.prompt); lastExampleRef.current = item.prompt; textareaRef.current?.focus({ preventScroll: true }) }}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {tab === "images" && !query ? (
                <div className="mis-chips" role="tablist" aria-label="Категории">
                  {IMAGE_TEMPLATE_CATEGORIES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={category === item.id}
                      className={`mis-chip ${category === item.id ? "is-active" : ""}`}
                      onClick={() => setCategory(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {visible.length ? (
                <div className="mis-grid">
                  {visible.map((item, index) => {
                    const Icon = ICONS[item.icon] || Sparkles
                    const selected = item.id === templateId
                    const busy = painting.includes(item.id)
                    const src = covers[item.id] || item.fallback
                    return (
                      <div key={`${tab}-${category}-${item.id}`} className="mis-card-wrap" style={{ position: "relative" }}>
                        <button
                          type="button"
                          className={`mis-card ${selected ? "is-selected" : ""}`}
                          style={{ "--i": index } as CSSProperties}
                          onClick={() => pickTemplate(item)}
                          aria-pressed={selected}
                          aria-label={`${item.title}: ${item.subtitle}`}
                        >
                          <img
                            key={src}
                            className="mis-card-img"
                            src={src}
                            alt=""
                            loading={index < 8 ? "eager" : "lazy"}
                            decoding="async"
                            draggable={false}
                            onError={(event) => {
                              if (event.currentTarget.src.endsWith(item.fallback)) return
                              event.currentTarget.src = item.fallback
                            }}
                          />
                          {busy ? <span className="mis-card-painting"><span><Loader2 className="mis-spin" /> Рисую обложку</span></span> : null}
                          <span className="mis-card-icon">{selected ? <Check /> : <Icon />}</span>
                          <span className="mis-card-text">
                            <span className="mis-card-title">{item.title}</span>
                            <span className="mis-card-sub">{item.subtitle}</span>
                          </span>
                          <span className="mis-card-arrow"><ArrowUpRight /></span>
                        </button>
                        {canPaint && !busy ? (
                          <button type="button" className="mis-card-repaint" onClick={() => void paintCover(item.id, true)} aria-label={`Перерисовать обложку «${item.title}»`} title="Перерисовать обложку">
                            <RefreshCw />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="mis-empty">
                  <Search style={{ width: 22, height: 22 }} />
                  <span>По запросу «{query}» шаблонов нет — просто опишите идею ниже.</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mis-dock">
        <div ref={panelRef} className="mis-panel">
          <div className="mis-panel-main">
            {error ? <p className="mis-error" role="alert">{error}</p> : null}
            {template || images.length ? (
              <div className="mis-attached">
                {template ? (
                  <button type="button" className="mis-pill" onClick={() => pickTemplate(template)} title="Убрать шаблон">
                    <img src={covers[template.id] || template.fallback} alt="" />
                    <span>{template.title}</span>
                    <X />
                  </button>
                ) : null}
                {images.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" className="mis-pill" onClick={() => onRemoveAttachment(item.id)} title="Убрать фото">
                    {previewOf(item) ? <img src={previewOf(item)} alt="" /> : <ImageIcon />}
                    <span>{item.name || "Фото"}</span>
                    <X />
                  </button>
                ))}
                {images.length ? (
                  <span className="mis-hint">{images.length > 1 ? "Будет изменено первое фото" : "Malik AI изменит это фото по описанию"}</span>
                ) : null}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              className="mis-textarea"
              value={prompt}
              rows={2}
              onChange={(event) => { setPrompt(event.target.value); if (error) setError("") }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  generate()
                }
              }}
              placeholder={template ? `Опишите, что создать в духе «${template.title}»...` : editing ? TAB_COPY.edit.placeholder : copy.placeholder}
              aria-label="Описание изображения"
            />

            <div className="mis-actions">
              <div className="mis-tool">
                <button type="button" data-mis-trigger className={`mis-tool-btn is-square ${menu === "plus" ? "is-open" : ""}`} onClick={() => setMenu(menu === "plus" ? null : "plus")} aria-label="Ещё" aria-haspopup="menu" aria-expanded={menu === "plus"}>
                  <Plus />
                </button>
                <Menu open={menu === "plus"} onClose={() => setMenu(null)} label="Ещё">
                  <button type="button" className="mis-menu-item" onClick={() => { setMenu(null); onAddImage() }}><ImagePlus /><span className="mis-menu-text">Загрузить фото</span></button>
                  <button type="button" className="mis-menu-item" onClick={randomIdea}><Shuffle /><span className="mis-menu-text">Случайная идея</span></button>
                  <button type="button" className="mis-menu-item" onClick={() => { setPrompt(""); setTemplateId(null); setStyleId("none"); setMenu(null) }}><Eraser /><span className="mis-menu-text">Очистить</span></button>
                </Menu>
              </div>

              <div className="mis-tool">
                <button type="button" data-mis-trigger className={`mis-tool-btn ${menu === "kind" ? "is-open" : ""}`} onClick={() => setMenu(menu === "kind" ? null : "kind")} aria-haspopup="menu" aria-expanded={menu === "kind"}>
                  {tab === "characters" ? <Users /> : tab === "edit" ? <PencilLine /> : <ImageIcon />}
                  <span className="mis-tool-label">{tab === "characters" ? "Персонаж" : tab === "edit" ? "Редактирование" : "Изображение"}</span>
                  <ChevronDown className="mis-tool-label" />
                </button>
                <Menu open={menu === "kind"} onClose={() => setMenu(null)} label="Что создать">
                  {([["images", "Изображение", ImageIcon], ["characters", "Персонаж", Users], ["edit", "Редактирование фото", PencilLine]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" className="mis-menu-item" onClick={() => switchTab(id)}>
                      <Icon /><span className="mis-menu-text">{label}</span>{tab === id ? <Check className="mis-check" /> : null}
                    </button>
                  ))}
                </Menu>
              </div>

              <div className="mis-tool">
                <button type="button" data-mis-trigger className={`mis-tool-btn ${menu === "style" ? "is-open" : ""} ${styleId !== "none" ? "is-on" : ""}`} onClick={() => setMenu(menu === "style" ? null : "style")} aria-haspopup="menu" aria-expanded={menu === "style"} disabled={editing}>
                  <Palette />
                  <span className="mis-tool-label">{styleId !== "none" ? style.label : "Стиль"}</span>
                </button>
                <Menu open={menu === "style"} onClose={() => setMenu(null)} label="Стиль">
                  {IMAGE_STYLE_PRESETS.map((item) => (
                    <button key={item.id} type="button" className="mis-menu-item" onClick={() => { setStyleId(item.id); setMenu(null) }}>
                      <Palette /><span className="mis-menu-text">{item.label}</span>{item.id === styleId ? <Check className="mis-check" /> : null}
                    </button>
                  ))}
                </Menu>
              </div>

              <button type="button" className="mis-tool-btn" onClick={onAddImage}>
                <Paperclip />
                <span className="mis-tool-label">Прикрепить</span>
              </button>

              <button type="button" className={`mis-tool-btn ${settingsOpen ? "is-on" : ""}`} onClick={() => setSettingsOpen((value) => !value)} aria-pressed={settingsOpen}>
                <SlidersHorizontal />
                <span className="mis-tool-label">Настройки</span>
              </button>

              <span className="mis-spacer" />

              <button type="button" className="mis-generate" onClick={generate} disabled={running || !prompt.trim()}>
                {running ? <Loader2 className="mis-spin" /> : <Wand2 />}
                <span>{running ? `Рисую… ${paintingNow}` : desktop ? "Сгенерировать" : "Создать"}</span>
                <span className="mis-kbd">{isMac ? "⌘↵" : "Ctrl ↵"}</span>
              </button>
            </div>
          </div>

          {settingsOpen ? (
            <div className="mis-settings">
              <div className="mis-setting">
                <span>Модель</span>
                <div className="mis-tool">
                  <button type="button" data-mis-trigger className="mis-select" onClick={(event) => openFloating("model", event.currentTarget)} aria-haspopup="menu" aria-expanded={menu === "model"}>
                    {modelInfo.shortLabel}<ChevronDown />
                  </button>
                </div>
              </div>

              <div className="mis-setting">
                <span>Соотношение сторон</span>
                <div className="mis-seg" role="radiogroup" aria-label="Соотношение сторон">
                  {RATIOS.map((item) => (
                    <button key={item} type="button" role="radio" aria-checked={aspect === item} className={aspect === item ? "is-active" : ""} onClick={() => setAspect(item)} disabled={editing}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mis-setting">
                <span>Качество</span>
                <div className="mis-tool">
                  <button type="button" data-mis-trigger className="mis-select" onClick={(event) => openFloating("quality", event.currentTarget)} aria-haspopup="menu" aria-expanded={menu === "quality"}>
                    {QUALITIES.find((item) => item.size === size)?.label}<ChevronDown />
                  </button>
                </div>
              </div>

              {!editing ? (
                <div className="mis-setting">
                  <span>Количество</span>
                  <div className="mis-seg" role="radiogroup" aria-label="Количество">
                    {COUNTS.map((item) => (
                      <button key={item} type="button" role="radio" aria-checked={count === item} className={count === item ? "is-active" : ""} onClick={() => setCount(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <span className="mis-credits">
                <b>{cost} кр.</b> · осталось <b>{credits ? formatCredits(credits.remaining) : "…"}</b>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* The settings row scrolls sideways, so its menus float above it. */}
      {anchor && menu === "model" ? modelMenu("model", "fixed", { left: anchor.left, bottom: anchor.bottom }) : null}
      {anchor && menu === "quality" ? (
            <Menu open onClose={() => setMenu(null)} label="Качество" placement="fixed" style={{ left: anchor.left, bottom: anchor.bottom }}>
              {QUALITIES.map((item) => {
                const price = costs[item.size] ?? DEFAULT_COSTS[item.size]
                const blocked = Boolean(credits && (credits.remaining < price || (item.size === "4K" && credits.remaining4k <= 0)))
                return (
                  <button key={item.size} type="button" className="mis-menu-item" disabled={blocked} onClick={() => { setSize(item.size); setMenu(null) }}>
                    <Sparkles />
                    <span className="mis-menu-text"><span>{item.label}</span><small>{item.note} · {price} кр.</small></span>
                    {item.size === size ? <Check className="mis-check" /> : null}
                  </button>
                )
              })}
            </Menu>
      ) : null}

      {lightbox?.url ? (
        <div className="mis-lightbox" onClick={() => setLightbox(null)} role="presentation">
          <div className="mis-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="mis-icon-btn" onClick={() => void download(lightbox)} aria-label="Скачать"><Download /></button>
            <button type="button" className="mis-icon-btn" onClick={() => setLightbox(null)} aria-label="Закрыть просмотр"><X /></button>
          </div>
          <img src={lightbox.url} alt={lightbox.prompt} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  )

  return createPortal(studio, document.body)
}

export default ImageStudio
