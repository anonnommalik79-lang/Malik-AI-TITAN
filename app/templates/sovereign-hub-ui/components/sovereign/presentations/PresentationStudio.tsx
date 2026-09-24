"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  Globe2,
  GraduationCap,
  HeartPulse,
  Landmark,
  LayoutList,
  Leaf,
  Lightbulb,
  MonitorPlay,
  Palette,
  Rocket,
  Sparkles,
  TrendingUp,
  Zap,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileDown,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  StickyNote,
  Trash2,
  Wand2,
  X,
} from "lucide-react"
import {
  PRESENTATION_COSTS,
  deckId as newDeckId,
  detectDeckLanguage,
  normalizeDeck,
  normalizeSlide,
  slideId,
} from "@/lib/presentations/deck"
import { DECK_THEMES, DEFAULT_THEME, THEME_IDS } from "@/lib/presentations/themes"
import {
  IMAGE_LAYOUTS,
  SLIDE_LAYOUTS,
  type Deck,
  type DeckLanguage,
  type DeckOutline,
  type DeckTone,
  type OutlineItem,
  type Slide,
  type SlideLayout,
  type ThemeId,
} from "@/lib/presentations/types"
import { SlideCanvas, SlideFrame, slideBuildTiming, type SlidePatch } from "./SlideRenderer"
import { applyPhoto, photoSlots, usedPhotoUrls, type PhotoSlot } from "@/lib/presentations/images"
import { PresentationShowcase } from "./PresentationShowcase"
import "./presentation-studio.css"
import "./presentation-desktop.css"

/**
 * The presentation studio.
 *
 * The flow is the one people already know from the tools this competes with:
 * describe the deck, look at the plan and fix it before anything expensive
 * happens, then watch the slides arrive. After that everything is direct —
 * click a word on a slide to change it, ask for one slide to be rewritten,
 * switch the theme and see every slide change at once, present full screen,
 * download it as PowerPoint or PDF.
 *
 * What it will not do is spend a credit silently. The cost of the plan and of
 * the slides is on screen before the button that spends it.
 */

type Quota = {
  tier: "guest" | "free" | "pro" | "ultra" | "owner"
  unlimited: boolean
  dailyCredits: number
  used: number
  remaining: number
  maxSlides: number
  resetAt: string
}

type EntryState = "pending" | "ready" | "failed"
type Entry = { key: string; outline: OutlineItem; slide: Slide | null; state: EntryState }
type Stage = "start" | "outline" | "deck"
type Busy = null | "outline" | "slides" | "rewrite" | "images" | "export"

const HANDOFF_KEY = "malik.presentation.handoff"
const STORAGE_PREFIX = "malik.presentations.v1"
const MAX_RECENT = 12
const BATCH = 4
const PARALLEL = 2

const TONES: Array<{ id: DeckTone; label: string }> = [
  { id: "confident", label: "Уверенный" },
  { id: "friendly", label: "Дружелюбный" },
  { id: "academic", label: "Академичный" },
  { id: "bold", label: "Смелый" },
]

const COUNTS = [6, 8, 10, 12, 15, 20]

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: "Обложка",
  section: "Раздел",
  bullets: "Список",
  "two-column": "Две колонки",
  stat: "Цифры",
  quote: "Цитата",
  "image-text": "Фото и текст",
  cards: "Карточки",
  timeline: "Таймлайн",
  comparison: "Сравнение",
  chart: "График",
  closing: "Финал",
  hero: "Фото на весь слайд",
  features: "Иконки",
  process: "Процесс",
  gallery: "Галерея",
}

const EXAMPLES = [
  "Питч-дек кофейни в Алматы для инвесторов",
  "Итоги квартала отдела продаж",
  "Как работает ИИ — лекция для школьников",
  "Стратегия выхода на рынок Узбекистана",
]

const MORE_EXAMPLES = [
  "Запуск мобильного приложения для фитнеса",
  "Здоровое питание — урок для 7 класса",
  "История Абылай хана",
  "Экологичный офис: план на год",
]

const EXAMPLE_ICONS = [TrendingUp, BarChart3, GraduationCap, Globe2, Rocket, HeartPulse, Landmark, Leaf]

// The magic button: a topic written the way that gets the best deck.
const RICH_TOPICS = [
  "Кинематографичная презентация об Абылай хане: путь к власти, дипломатия между Россией и Цинской империей, ключевые битвы, наследие для Казахстана",
  "Питч-дек кофейни у метро в Алматы для инвесторов: проблема, решение, рынок, цифры окупаемости, команда и что нужно от инвестора",
  "Итоги квартала отдела продаж: выручка против плана, лучшие сделки, что не сработало и три решения на следующий квартал",
  "Как работает искусственный интеллект — лекция для школьников: простые примеры, чем ИИ полезен и где он ошибается",
]

const THEME_NOTES: Record<ThemeId, string> = {
  obsidian: "Элегантная тьма",
  paper: "Чистый и минималистичный",
  ember: "Энергия и смелость",
  forest: "Гармония природы",
  sand: "Тёплая классика",
  royal: "Премиальный стиль",
}

/** Wide screens get the two-column start screen with the live preview. */
const DESKTOP_QUERY = "(min-width: 901px)"
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
function useDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false)
}

/* ------------------------------------------------------------------ helpers */

function headline(slide: Slide) {
  return slide.layout === "quote" ? slide.quote : slide.title
}

function storageKey(username?: string) {
  return `${STORAGE_PREFIX}:${(username || "guest").toLowerCase()}`
}

function readRecent(username?: string): Deck[] {
  try {
    const raw = window.localStorage.getItem(storageKey(username))
    const list = raw ? JSON.parse(raw) : []
    return (Array.isArray(list) ? list : []).map(normalizeDeck).filter((deck): deck is Deck => Boolean(deck)).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeRecent(username: string | undefined, decks: Deck[]) {
  const key = storageKey(username)
  try {
    window.localStorage.setItem(key, JSON.stringify(decks.slice(0, MAX_RECENT)))
  } catch {
    // Pictures kept as data URLs are what fill storage. Keep the decks and
    // drop only those, rather than losing the whole list.
    try {
      const light = decks.slice(0, MAX_RECENT).map((deck) => ({
        ...deck,
        slides: deck.slides.map((slide) => (slide.imageUrl?.startsWith("data:") ? { ...slide, imageUrl: undefined } : slide)),
      }))
      window.localStorage.setItem(key, JSON.stringify(light))
    } catch {
      /* Private mode or a full disk: the deck on screen is unaffected. */
    }
  }
}

async function callApi(body: Record<string, unknown>, timeoutMs = 180_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch("/api/presentations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok && Boolean(data?.ok), status: response.status, data }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError"
    return { ok: false, status: 0, data: { error: aborted ? "Сервер слишком долго не отвечал. Попробуйте ещё раз." : "Нет связи с сервером." } }
  } finally {
    window.clearTimeout(timer)
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await task(queue.shift() as T)
  }))
}

function creditsLabel(quota: Quota | null) {
  if (!quota) return "…"
  if (quota.unlimited) return "∞"
  return `${quota.remaining} / ${quota.dailyCredits}`
}

type FoundPhoto = { url: string; credit?: string; link?: string }

/**
 * Real photographs for the given slots — found by the server in photo
 * libraries, by each slide's own search words. Free; never throws: a failed
 * search simply leaves the slot for the next try or for an AI picture.
 */
async function searchPhotos(slots: PhotoSlot[], exclude: string[]): Promise<Record<string, FoundPhoto | null>> {
  if (!slots.length) return {}
  try {
    const response = await fetch("/api/presentations/photos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: slots.slice(0, 12), exclude: exclude.slice(-60) }),
    })
    const data = await response.json().catch(() => null)
    return response.ok && data?.ok && data.photos && typeof data.photos === "object" ? data.photos : {}
  } catch {
    return {}
  }
}

function withPhotos(slide: Slide, photos: Record<string, FoundPhoto | null>) {
  return photoSlots(slide).reduce((current, slot) => {
    const photo = photos[slot.key]
    return photo?.url ? applyPhoto(current, slot.key, photo) : current
  }, slide)
}

/** The plan the server writes against, rebuilt from the deck as it is now —
 *  after edits, moves and deletions — so slide n in the plan is slide n on
 *  screen. A title the user emptied falls back to the planned one, because
 *  the server drops untitled items and every later index would shift. */
function planOf(title: string, entries: Entry[]): DeckOutline {
  return {
    title,
    items: entries.map((entry) => entry.slide
      ? { title: headline(entry.slide) || entry.outline.title || "Слайд", point: entry.outline.point, layout: entry.slide.layout }
      : entry.outline),
  }
}

/**
 * How fast the assembly scene plays a slide. Each slide keeps the pace it
 * started with (so an animation never changes speed halfway); a new slide
 * speeds up when several finished slides are already waiting behind it.
 */
function assemblyPace(entries: Entry[], at: number) {
  const waiting = entries.slice(at + 1).filter((entry) => entry.state === "ready").length
  return waiting >= 4 ? 0.5 : waiting >= 2 ? 0.7 : 1
}

/* ------------------------------------------------------------------- studio */

/**
 * The page a slide is being written on, while the model is still writing it:
 * the planned headline types itself out and lines of text shimmer where the
 * body will be.
 */
function WritingPage({ title, layout, failed }: { title: string; layout: string; failed: boolean }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    let reduced = false
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      /* no matchMedia: animate */
    }
    if (reduced) {
      setShown(title.length)
      return
    }
    let frame = 0
    const start = performance.now()
    const duration = Math.min(1600, 300 + title.length * 28)
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setShown(Math.round(progress * title.length))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [title])

  return (
    <div className="ps-writing" data-failed={failed}>
      <div className="ps-writing-kicker">{failed ? "Этот слайд не получился — кредит не списан" : `Пишу · ${layout}`}</div>
      <div className="ps-writing-title">
        {title.slice(0, shown)}
        {!failed ? <span className="ps-writing-caret" aria-hidden="true" /> : null}
        <span style={{ visibility: "hidden" }}>{title.slice(shown)}</span>
      </div>
      {!failed ? (
        <div className="ps-writing-lines" aria-hidden="true">
          <i style={{ width: "78%" }} />
          <i style={{ width: "64%" }} />
          <i style={{ width: "71%" }} />
          <i style={{ width: "42%" }} />
        </div>
      ) : null}
    </div>
  )
}

/** A one-line field that grows instead of cutting a long title off — on a
 *  phone an outline title rarely fits on one line. */
function GrowingField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${node.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault() }}
    />
  )
}

export function PresentationStudio({ username }: { username?: string }) {
  const [stage, setStage] = useState<Stage>("start")
  const [topic, setTopic] = useState("")
  const [requestedCount, setCount] = useState(10)
  const [tone, setTone] = useState<DeckTone>("confident")
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME)
  const [language, setLanguage] = useState<DeckLanguage>("ru")
  const [quota, setQuota] = useState<Quota | null>(null)
  const [authenticated, setAuthenticated] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<Busy>(null)

  const [outline, setOutline] = useState<DeckOutline | null>(null)
  const [deckId, setDeckId] = useState("")
  const [deckTitle, setDeckTitle] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [current, setCurrent] = useState(0)
  const [instruction, setInstruction] = useState("")
  const [composer, setComposer] = useState(false)
  const [showAllExamples, setShowAllExamples] = useState(false)
  const [richIndex, setRichIndex] = useState(0)
  const desktop = useDesktop()
  const [newSlideText, setNewSlideText] = useState("")
  const [newSlideLayout, setNewSlideLayout] = useState<SlideLayout>("bullets")
  const [presenting, setPresenting] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [assembling, setAssembling] = useState(false)
  const [assemblyAt, setAssemblyAt] = useState(0)
  const [spotlight, setSpotlight] = useState<{ index: number; nonce: number } | null>(null)
  const assemblyRef = useRef<{ index: number; at: number } | null>(null)
  // Photos already on the deck, so a new search never repeats one.
  const usedPhotosRef = useRef<Set<string>>(new Set())
  const [recent, setRecent] = useState<Deck[]>([])
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null)

  const createdAtRef = useRef(0)
  const handoffRef = useRef(false)

  const applyQuota = useCallback((data: { quota?: Quota } | null) => {
    if (data?.quota) setQuota(data.quota)
  }, [])

  /* ------------------------------------------------------------ bootstrap */

  useEffect(() => {
    let cancelled = false
    fetch("/api/presentations", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        applyQuota(data)
        setAuthenticated(data?.authenticated !== false)
      })
      .catch(() => undefined)
    setRecent(readRecent(username))
    return () => { cancelled = true }
  }, [applyQuota, username])

  const maxSlides = quota?.maxSlides || 12
  const countOptions = COUNTS.filter((option) => option <= maxSlides)

  // A plan that allows fewer slides than were asked for gets the largest
  // size it does allow.
  const count = requestedCount <= maxSlides ? requestedCount : Math.max(...countOptions, 6)

  /* ------------------------------------------------------------- the deck */

  const readySlides = useMemo(() => entries.filter((entry) => entry.slide).map((entry) => entry.slide as Slide), [entries])

  const currentDeck = useCallback((): Deck => ({
    id: deckId || newDeckId(),
    title: deckTitle || "Презентация",
    theme,
    language,
    slides: readySlides,
    prompt: topic,
    createdAt: createdAtRef.current || Date.now(),
    updatedAt: Date.now(),
  }), [deckId, deckTitle, language, readySlides, theme, topic])

  // Every change is kept, a moment after it stops.
  useEffect(() => {
    if (stage !== "deck" || !readySlides.length || !deckId) return
    const timer = window.setTimeout(() => {
      const deck = currentDeck()
      setRecent((previous) => {
        const next = [deck, ...previous.filter((item) => item.id !== deck.id)].slice(0, MAX_RECENT)
        writeRecent(username, next)
        return next
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [currentDeck, deckId, readySlides, stage, username])

  /* --------------------------------------------------------------- outline */

  const requestOutline = useCallback(async (topicValue: string, countValue: number, toneValue: DeckTone) => {
    const clean = topicValue.trim()
    if (clean.length < 3) {
      setError("Опишите, о чём презентация — хотя бы пару слов.")
      return
    }
    const lang = detectDeckLanguage(clean)
    setBusy("outline")
    setError("")
    const result = await callApi({ action: "outline", topic: clean, count: countValue, language: lang, tone: toneValue })
    applyQuota(result.data)
    setBusy(null)
    if (!result.ok) {
      setError(String(result.data?.error || "Не удалось составить план."))
      if (result.status === 401) setAuthenticated(false)
      return
    }
    setLanguage(lang)
    setOutline(result.data.outline as DeckOutline)
    setStage("outline")
  }, [applyQuota])

  // A deck asked for in the chat arrives here with its topic already set.
  useEffect(() => {
    if (handoffRef.current) return
    handoffRef.current = true
    try {
      const raw = window.sessionStorage.getItem(HANDOFF_KEY)
      if (!raw) return
      window.sessionStorage.removeItem(HANDOFF_KEY)
      const handoff = JSON.parse(raw) as { topic?: string; count?: number }
      if (!handoff?.topic) return
      setTopic(handoff.topic)
      const handoffCount = Number(handoff.count) || 10
      setCount(handoffCount)
      void requestOutline(handoff.topic, handoffCount, "confident")
    } catch {
      /* A broken hand-off leaves the studio on its start screen. */
    }
  }, [requestOutline])

  const updateOutlineItem = (index: number, patch: Partial<OutlineItem>) => {
    setOutline((previous) => previous ? { ...previous, items: previous.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) } : previous)
  }

  const removeOutlineItem = (index: number) => {
    setOutline((previous) => previous && previous.items.length > 4 ? { ...previous, items: previous.items.filter((_, i) => i !== index) } : previous)
  }

  const addOutlineItem = (after: number) => {
    setOutline((previous) => {
      if (!previous || previous.items.length >= maxSlides) return previous
      const items = [...previous.items]
      items.splice(after + 1, 0, { title: "Новый слайд", point: "", layout: "bullets" })
      return { ...previous, items }
    })
  }

  /* ----------------------------------------------------------------- slides */

  const fillSlides = useCallback(async (plan: DeckOutline, indexes: number[]) => {
    const delivered = new Map<number, Slide>()
    const batches = chunk(indexes, BATCH)
    await runLimited(batches, PARALLEL, async (batch) => {
      // Indexes in a batch are contiguous by construction.
      const result = await callApi({
        action: "slides",
        topic,
        outline: plan,
        startIndex: batch[0],
        count: batch.length,
        language,
        tone,
      })
      applyQuota(result.data)
      if (!result.ok) {
        setError(String(result.data?.error || "Часть слайдов не получилась."))
        setEntries((previous) => previous.map((entry, i) => (batch.includes(i) ? { ...entry, state: "failed" } : entry)))
        return
      }
      const written = new Map<number, Slide>()
      for (const item of (result.data.slides || []) as Array<{ index: number; slide: unknown }>) {
        const slide = normalizeSlide(item.slide)
        // Ids key the editor, the pictures and the export; never trust two
        // batches not to repeat one.
        if (slide) written.set(item.index, { ...slide, id: slideId() } as Slide)
      }
      // Photos for these slides are searched right away. A slide waits a
      // moment for them, so it usually appears with its picture; photos that
      // take longer are put in as soon as they arrive.
      const slots = [...written.values()].flatMap(photoSlots)
      const photoSearch = searchPhotos(slots, [...usedPhotosRef.current])
      const early = slots.length ? await Promise.race([photoSearch, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500))]) : null
      const place = (photos: Record<string, FoundPhoto | null>) => {
        for (const photo of Object.values(photos)) if (photo?.url) usedPhotosRef.current.add(photo.url)
      }
      if (early) {
        place(early)
        for (const [index, slide] of written) written.set(index, withPhotos(slide, early))
      } else if (slots.length) {
        void photoSearch.then((photos) => {
          place(photos)
          const ids = new Set([...written.values()].map((slide) => slide.id))
          setEntries((previous) => previous.map((entry) => (entry.slide && ids.has(entry.slide.id) ? { ...entry, slide: withPhotos(entry.slide, photos) } : entry)))
        })
      }

      for (const [index, slide] of written) delivered.set(index, slide)
      setEntries((previous) => previous.map((entry, i) => {
        if (!batch.includes(i)) return entry
        const slide = written.get(i)
        return slide ? { ...entry, slide, state: "ready" } : { ...entry, state: "failed" }
      }))
    })
    return delivered
  }, [applyQuota, language, tone, topic])

  const buildDeck = useCallback(async () => {
    if (!outline) return
    const plan = { ...outline, items: outline.items.filter((item) => item.title.trim()) }
    setEntries(plan.items.map((item) => ({ key: slideId(), outline: item, slide: null, state: "pending" })))
    setDeckTitle(plan.title)
    setDeckId(newDeckId())
    createdAtRef.current = Date.now()
    setCurrent(0)
    setStage("deck")
    setError("")
    setBusy("slides")
    assemblyRef.current = null
    setAssemblyAt(0)
    setAssembling(true)
    await fillSlides(plan, plan.items.map((_, i) => i))
    setBusy(null)
  }, [fillSlides, outline])

  /* --------------------------------------------------------------- assembly */

  // The pace is decided when the scene reaches a slide and kept for it.
  const scenePace = useMemo(
    () => assemblyPace(entries, assemblyAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assemblyAt, assembling],
  )

  // The assembly scene shows the deck being made: slide by slide, in order,
  // each one assembling itself as soon as it has been written. A slide that
  // is still being written is shown as a page being written. When the
  // writing gets ahead of the show, the show speeds up instead of making the
  // user wait for animations of slides that are already done.
  useEffect(() => {
    if (!assembling) return
    if (assemblyAt >= entries.length) {
      const timer = window.setTimeout(() => {
        setAssembling(false)
        setCurrent(0)
      }, 350)
      return () => window.clearTimeout(timer)
    }
    const entry = entries[assemblyAt]
    if (!entry || entry.state === "pending") return
    if (assemblyRef.current?.index !== assemblyAt) assemblyRef.current = { index: assemblyAt, at: performance.now() }
    const show = entry.state === "failed" || !entry.slide ? 1200 : slideBuildTiming(entry.slide, scenePace).total
    const hold = show + (scenePace < 1 ? 250 : 900)
    const timer = window.setTimeout(() => setAssemblyAt((value) => value + 1), Math.max(0, assemblyRef.current.at + hold - performance.now()))
    return () => window.clearTimeout(timer)
  }, [assembling, assemblyAt, entries, scenePace])

  // One slide assembling in the editor after it was rewritten or added.
  const spotlightSlide = (index: number, slide: Slide) => {
    const ms = slideBuildTiming(slide).total + 250
    const nonce = Date.now()
    setSpotlight({ index, nonce })
    window.setTimeout(() => setSpotlight((value) => (value?.nonce === nonce ? null : value)), ms)
  }

  const planFromEntries = useCallback((): DeckOutline => planOf(deckTitle, entries), [deckTitle, entries])

  // A new slide, written by the model, in the middle of a finished deck. It
  // goes after the current slide — or before the closing one, because a deck
  // should still end on its conclusion.
  const addSlide = async () => {
    const title = newSlideText.trim()
    if (title.length < 3 || entries.length >= maxSlides) return
    const last = entries[entries.length - 1]
    const lastIsClosing = (last?.slide?.layout || last?.outline.layout) === "closing"
    let at = current + 1
    if (at >= entries.length && lastIsClosing) at = entries.length - 1
    const entry: Entry = { key: slideId(), outline: { title, point: "", layout: newSlideLayout }, slide: null, state: "pending" }
    const next = [...entries.slice(0, at), entry, ...entries.slice(at)]
    setEntries(next)
    setCurrent(at)
    setNewSlideText("")
    setComposer(false)
    setBusy("slides")
    setError("")
    const delivered = await fillSlides(planOf(deckTitle, next), [at])
    setBusy(null)
    const slide = delivered.get(at)
    if (slide) spotlightSlide(at, slide)
  }

  const retrySlide = async (index: number) => {
    setEntries((previous) => previous.map((entry, i) => (i === index ? { ...entry, state: "pending" } : entry)))
    setBusy("slides")
    setError("")
    const delivered = await fillSlides(planFromEntries(), [index])
    setBusy(null)
    const slide = delivered.get(index)
    if (slide) spotlightSlide(index, slide)
  }

  /* ---------------------------------------------------------------- editing */

  const patchSlide = (index: number, patch: SlidePatch) => {
    setEntries((previous) => previous.map((entry, i) => (i === index && entry.slide ? { ...entry, slide: { ...entry.slide, ...patch } as Slide } : entry)))
  }

  const rewrite = async (index: number, layout?: SlideLayout) => {
    const entry = entries[index]
    if (!entry?.slide) return
    setBusy("rewrite")
    setError("")
    const result = await callApi({
      action: "rewrite",
      deckTitle,
      slide: entry.slide,
      layout,
      instruction,
      neighbours: [entries[index - 1]?.slide, entries[index + 1]?.slide].map((slide) => (slide ? headline(slide) : "")),
      language,
      tone,
    })
    applyQuota(result.data)
    setBusy(null)
    if (!result.ok) {
      setError(String(result.data?.error || "Не удалось переписать слайд."))
      return
    }
    const written = normalizeSlide(result.data.slide)
    if (written) {
      const slots = photoSlots(written)
      const photos = slots.length ? await searchPhotos(slots, [...usedPhotosRef.current]) : {}
      for (const photo of Object.values(photos)) if (photo?.url) usedPhotosRef.current.add(photo.url)
      const slide = withPhotos(written, photos)
      setEntries((previous) => previous.map((item, i) => (i === index ? { ...item, slide, state: "ready" } : item)))
      setInstruction("")
      spotlightSlide(index, slide)
    }
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= entries.length) return
    setEntries((previous) => {
      const next = [...previous]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
    setCurrent(target)
  }

  const duplicate = (index: number) => {
    const entry = entries[index]
    if (!entry?.slide) return
    const copy: Entry = { ...entry, key: slideId(), slide: { ...entry.slide, id: slideId() } as Slide }
    setEntries((previous) => [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)])
    setCurrent(index + 1)
  }

  const remove = (index: number) => {
    if (entries.length <= 1) return
    setEntries((previous) => previous.filter((_, i) => i !== index))
    setCurrent((value) => Math.max(0, Math.min(value, entries.length - 2)))
  }

  /* ----------------------------------------------------------------- images */

  // Another photograph for the current slide: the same search, skipping
  // every photo the deck already shows (including this slide's own).
  const otherPhotos = async (index: number) => {
    const entry = entries[index]
    if (!entry?.slide) return
    const current = entry.slide
    const cleared: Slide = current.layout === "gallery"
      ? ({ ...current, items: current.items.map(({ image: _image, ...item }) => { void _image; return item }) } as Slide)
      : ({ ...current, imageUrl: undefined, imageCredit: undefined, imageLink: undefined } as Slide)
    const slots = photoSlots(cleared)
    if (!slots.length) return
    setBusy("images")
    setError("")
    const exclude = [...new Set([...usedPhotosRef.current, ...usedPhotoUrls(entries.map((item) => item.slide).filter((slide): slide is Slide => Boolean(slide)))])]
    const photos = await searchPhotos(slots, exclude)
    setBusy(null)
    const found = Object.values(photos).filter((photo) => photo?.url)
    if (!found.length) {
      setError("Другого подходящего фото не нашлось — можно создать ИИ-изображение.")
      return
    }
    for (const photo of found) if (photo?.url) usedPhotosRef.current.add(photo.url)
    const slide = withPhotos(cleared, photos)
    setEntries((previous) => previous.map((item, i) => (i === index ? { ...item, slide } : item)))
  }

  const imageTargets = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.slide && IMAGE_LAYOUTS.has(entry.slide.layout) && !entry.slide.imageUrl)

  const addImages = async () => {
    if (!imageTargets.length) return
    setBusy("images")
    setError("")
    setImageProgress({ done: 0, total: imageTargets.length })

    for (const [position, { entry, index }] of imageTargets.entries()) {
      const slide = entry.slide as Slide
      const prompt = `${slide.imagePrompt || `${deckTitle}: ${headline(slide)}`}. Editorial photograph, natural light, rich detail, no text, no letters, no logos.`
      let data: Record<string, unknown> | null = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/media/image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, aspectRatio: slide.layout === "hero" ? "16:9" : "4:5", imageSize: "1K", mode: "cinematic" }),
        }).catch(() => null)
        data = response ? await response.json().catch(() => null) : null
        // Another picture from this account is still rendering; wait for it.
        if (response?.status === 409 && attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 4000))
          continue
        }
        if (!response?.ok || !data?.ok) {
          setError(String(data?.error || data?.message || "Не удалось создать изображение. Фото-кредиты не списаны."))
          data = null
        }
        break
      }
      if (!data) break

      // A picture in the account's own storage survives; a provider's link
      // may not. Without a bucket, the inline copy is the durable one.
      const url = String(
        (data.durable ? data.imageUrl : data.browserCacheImageUrl || data.imageUrl) || data.url || data.mediaUrl || "",
      )
      if (url) patchSlide(index, { imageUrl: url, imageCredit: "Изображение: Malik AI", imageLink: undefined })
      setImageProgress({ done: position + 1, total: imageTargets.length })
    }

    window.dispatchEvent(new Event("malik-image-credits-changed"))
    setImageProgress(null)
    setBusy(null)
  }

  /* ----------------------------------------------------------------- export */

  const exportPptx = async () => {
    setBusy("export")
    setError("")
    try {
      const response = await fetch("/api/presentations/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deck: currentDeck() }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(String(data?.error || "Не удалось собрать файл."))
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${(deckTitle || "presentation").replace(/[\\/:*?"<>|]+/g, "").slice(0, 60) || "presentation"}.pptx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Не удалось собрать файл.")
    } finally {
      setBusy(null)
    }
  }

  // PDF through the browser's own print dialog, with every slide laid out as
  // one 13.333 × 7.5 inch page. "Save as PDF" is in every browser's dialog.
  const exportPdf = () => {
    setPrinting(true)
  }

  useEffect(() => {
    if (!printing) return
    const previousTitle = document.title
    document.title = deckTitle || "Презентация"
    const done = () => {
      document.title = previousTitle
      setPrinting(false)
    }
    window.addEventListener("afterprint", done, { once: true })
    let cancelled = false
    // Slides live in shadow roots; wait (briefly) for their pictures so the
    // PDF does not come out with empty image panels.
    const waitForImages = () => {
      const images = Array.from(document.querySelectorAll(".deck-print .deck-host")).flatMap((host) =>
        Array.from(host.shadowRoot?.querySelectorAll("img") || []),
      )
      const loads = images.map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
      return Promise.race([Promise.all(loads), new Promise((resolve) => window.setTimeout(resolve, 4000))])
    }
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        void waitForImages().then(() => {
          if (!cancelled) window.print()
        })
      }),
    )
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.removeEventListener("afterprint", done)
    }
  }, [deckTitle, printing])

  /* ---------------------------------------------------------------- present */

  const presentable = entries.map((entry) => entry.slide).filter((slide): slide is Slide => Boolean(slide))
  const [showIndex, setShowIndex] = useState(0)
  const showRef = useRef<HTMLDivElement>(null)

  const startShow = (from = 0) => {
    if (!presentable.length) return
    setShowIndex(Math.min(from, presentable.length - 1))
    setPresenting(true)
  }

  useEffect(() => {
    if (!presenting) return
    const element = showRef.current
    element?.requestFullscreen?.().catch(() => undefined)
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault()
        setShowIndex((value) => Math.min(presentable.length - 1, value + 1))
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault()
        setShowIndex((value) => Math.max(0, value - 1))
      } else if (event.key === "Home") setShowIndex(0)
      else if (event.key === "End") setShowIndex(presentable.length - 1)
      else if (event.key.toLowerCase() === "n") setShowNotes((value) => !value)
      else if (event.key === "Escape") setPresenting(false)
    }
    const onFullscreen = () => { if (!document.fullscreenElement) setPresenting(false) }
    window.addEventListener("keydown", onKey)
    document.addEventListener("fullscreenchange", onFullscreen)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("fullscreenchange", onFullscreen)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined)
    }
  }, [presenting, presentable.length])

  /* ----------------------------------------------------------- open & reset */

  const openDeck = (deck: Deck) => {
    setDeckId(deck.id)
    setDeckTitle(deck.title)
    setTheme(deck.theme)
    setLanguage(deck.language)
    setTopic(deck.prompt)
    createdAtRef.current = deck.createdAt
    setEntries(deck.slides.map((slide) => ({ key: slideId(), outline: { title: headline(slide), point: "", layout: slide.layout }, slide, state: "ready" })))
    setCurrent(0)
    setAssembling(false)
    setSpotlight(null)
    setStage("deck")
    setError("")
  }

  const deleteDeck = (id: string) => {
    setRecent((previous) => {
      const next = previous.filter((deck) => deck.id !== id)
      writeRecent(username, next)
      return next
    })
  }

  const newDeck = () => {
    setAssembling(false)
    setSpotlight(null)
    setStage("start")
    setOutline(null)
    setEntries([])
    setDeckId("")
    setDeckTitle("")
    setError("")
    setInstruction("")
  }

  /* ------------------------------------------------------------------- view */

  const generating = busy === "slides"
  const active = entries[current]
  const lowCredits = Boolean(quota && !quota.unlimited && quota.remaining < (outline?.items.length || count) + 1)
  const slideCost = (outline?.items.length || 0) * PRESENTATION_COSTS.slide

  const header = (
    <div className="ps-top">
      <Presentation size={18} aria-hidden="true" />
      <h1>Презентации</h1>
      <span className="ps-spacer" />
      <span className="ps-credits" data-low={lowCredits} title={quota && !quota.unlimited ? `Обновится ${new Date(quota.resetAt).toLocaleString("ru-RU")}` : undefined}>
        Кредиты <strong>{creditsLabel(quota)}</strong>
      </span>
      {stage !== "start" ? (
        <button type="button" className="ps-btn ps-btn--small" onClick={newDeck} disabled={generating}>
          <Plus size={15} /> Новая
        </button>
      ) : null}
    </div>
  )

  /* ------------------------------------------------------------ start */
  if (stage === "start") {
    const examples = showAllExamples ? [...EXAMPLES, ...MORE_EXAMPLES] : EXAMPLES
    return (
      <div className="ps-root" data-preserve-brand-color="true">
        {header}
        <div className="ps-start-scene">
          {/* The light behind the start screen on a wide screen. */}
          <div className="ps-scene-light ps-desk-only" aria-hidden="true">
            <i className="ps-glow ps-glow--1" />
            <i className="ps-glow ps-glow--2" />
            <i className="ps-glow ps-glow--3" />
            <b className="ps-arc ps-arc--1" />
            <b className="ps-arc ps-arc--2" />
          </div>

          <div className="ps-start">
            <div className="ps-start-main">
              <h2 className="ps-start-title">Презентация <span className="ps-grad">за минуту</span></h2>
              <p className="ps-start-sub">
                <span className="ps-mob-only">Опишите тему — Malik AI составит план, напишет слайды и соберёт дизайн. Любой текст потом можно поправить прямо на слайде.</span>
                <span className="ps-desk-only">Опишите тему — Malik AI составит план, напишет слайды, подберёт дизайн и создаст готовую презентацию. Просто, быстро, профессионально.</span>
              </p>

              <div className="ps-features ps-desk-only">
                <span><Zap size={15} /> На основе ИИ</span>
                <span><Palette size={15} /> Красивый дизайн</span>
                <span><LayoutList size={15} /> Структурированный контент</span>
                <span><MonitorPlay size={15} /> Готово к презентации</span>
              </div>

              <div className="ps-prompt">
                <textarea
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Например: питч-дек кофейни у метро в Алматы для инвесторов — окупаемость, команда, что нужно от инвестора"
                  aria-label="Тема презентации"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void requestOutline(topic, count, tone)
                  }}
                />
                <div className="ps-prompt-row">
                  <label className="ps-field">
                    <Presentation size={15} className="ps-desk-only" aria-hidden="true" />
                    Слайдов
                    <select className="ps-select" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                      {countOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="ps-field">
                    Тон
                    <select className="ps-select" value={tone} onChange={(event) => setTone(event.target.value as DeckTone)}>
                      {TONES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ps-magic ps-desk-only"
                    onClick={() => {
                      const next = RICH_TOPICS[richIndex % RICH_TOPICS.length]
                      setRichIndex((value) => value + 1)
                      setTopic(next)
                    }}
                    title="Подсказать подробную тему"
                    aria-label="Подсказать подробную тему"
                  >
                    <Sparkles size={16} />
                  </button>
                  <span className="ps-spacer" />
                  {authenticated ? (
                    <button type="button" className="ps-btn ps-btn--primary ps-create" onClick={() => void requestOutline(topic, count, tone)} disabled={busy === "outline" || topic.trim().length < 3}>
                      {busy === "outline" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                      <span className="ps-mob-only">{busy === "outline" ? "Составляю план…" : `Составить план · ${PRESENTATION_COSTS.outline} кр.`}</span>
                      <span className="ps-desk-only">{busy === "outline" ? "Составляю план…" : "Создать презентацию"}</span>
                      {busy === "outline" ? null : <ArrowRight size={16} className="ps-desk-only" />}
                    </button>
                  ) : (
                    <a className="ps-btn ps-btn--primary ps-create" href="/auth">Войти, чтобы создавать</a>
                  )}
                </div>
              </div>
              {error ? <p className="ps-error" role="alert">{error}</p> : null}
              <p className="ps-hint">
                Полная презентация из {count} слайдов стоит {count + PRESENTATION_COSTS.outline} кредитов: 1 за план и по 1 за каждый слайд. Переписать слайд — 1 кредит. Скачать PPTX и PDF — бесплатно.
              </p>

              <div className="ps-section-label">
                <Lightbulb size={17} className="ps-desk-only" aria-hidden="true" />
                <span>Примеры</span>
                <button type="button" className="ps-more ps-desk-only" onClick={() => setShowAllExamples((value) => !value)}>
                  {showAllExamples ? "Свернуть" : "Показать все"} <ArrowRight size={13} />
                </button>
              </div>
              <div className="ps-chips">
                {examples.map((example, index) => {
                  const Icon = EXAMPLE_ICONS[index % EXAMPLE_ICONS.length]
                  return (
                    <button key={example} type="button" className="ps-chip" onClick={() => setTopic(example)}>
                      <span className="ps-chip-icon ps-desk-only" aria-hidden="true"><Icon size={17} /></span>
                      <span>{example}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {desktop ? <PresentationShowcase /> : null}

            <div className="ps-start-themes">
              <div className="ps-section-label">
                <Sparkles size={17} className="ps-desk-only" aria-hidden="true" />
                <span>Тема оформления</span>
              </div>
              <div className="ps-themes">
                {THEME_IDS.map((id) => {
                  const option = DECK_THEMES[id]
                  return (
                    <button key={id} type="button" className="ps-theme" data-theme-id={id} aria-pressed={theme === id} onClick={() => setTheme(id)}>
                      <span className="ps-theme-swatch" style={{ background: `#${option.bg}`, border: `1px solid #${option.border}` }}>
                        <i style={{ background: `#${option.text}` }} />
                        <i style={{ background: `#${option.muted}` }} />
                        <b style={{ background: `#${option.accent}` }} />
                        {theme === id ? <span className="ps-theme-check ps-desk-only" aria-hidden="true"><Check size={12} strokeWidth={3} /></span> : null}
                      </span>
                      <span className="ps-theme-name">{option.name}</span>
                      <span className="ps-theme-desc ps-desk-only">{THEME_NOTES[id]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {recent.length ? (
              <div className="ps-start-recent">
                <div className="ps-section-label">Мои презентации</div>
                <div className="ps-recent">
                  {recent.map((deck) => (
                    <div key={deck.id} style={{ position: "relative" }}>
                      <button type="button" className="ps-recent-card" onClick={() => openDeck(deck)}>
                        <SlideFrame slide={deck.slides[0]} theme={deck.theme} index={0} total={deck.slides.length} language={deck.language} />
                        <span>{deck.title}</span>
                        <small>{deck.slides.length} слайдов · {new Date(deck.updatedAt).toLocaleDateString("ru-RU")}</small>
                      </button>
                      <button type="button" className="ps-icon-btn" style={{ position: "absolute", right: 6, top: 6, background: "rgba(0,0,0,.6)" }} onClick={() => deleteDeck(deck.id)} aria-label={`Удалить «${deck.title}»`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- outline */
  if (stage === "outline" && outline) {
    return (
      <div className="ps-root" data-preserve-brand-color="true">
        {header}
        <div className="ps-outline">
          <div className="ps-section-label" style={{ marginTop: 0 }}>План презентации — поправьте, прежде чем писать слайды</div>
          <input className="ps-outline-title" value={outline.title} onChange={(event) => setOutline({ ...outline, title: event.target.value })} aria-label="Название презентации" />
          <ol className="ps-outline-list">
            {outline.items.map((item, index) => (
              <li className="ps-outline-item" key={index}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div style={{ minWidth: 0 }}>
                  <GrowingField value={item.title} onChange={(title) => updateOutlineItem(index, { title })} label={`Слайд ${index + 1}`} />
                  {item.point ? <small>{item.point}</small> : null}
                </div>
                <select className="ps-select" value={item.layout} onChange={(event) => updateOutlineItem(index, { layout: event.target.value as SlideLayout })} aria-label="Макет слайда">
                  {SLIDE_LAYOUTS.map((layout) => <option key={layout} value={layout}>{LAYOUT_LABELS[layout]}</option>)}
                </select>
                <span style={{ display: "inline-flex" }}>
                  <button type="button" className="ps-icon-btn" onClick={() => addOutlineItem(index)} disabled={outline.items.length >= maxSlides} aria-label="Добавить слайд ниже"><Plus size={15} /></button>
                  <button type="button" className="ps-icon-btn" onClick={() => removeOutlineItem(index)} disabled={outline.items.length <= 4} aria-label="Убрать слайд"><Trash2 size={15} /></button>
                </span>
              </li>
            ))}
          </ol>
          {error ? <p className="ps-error" role="alert">{error}</p> : null}
          <div className="ps-outline-actions">
            <button type="button" className="ps-btn" onClick={() => setStage("start")}><ChevronLeft size={16} /> Назад</button>
            <span className="ps-spacer" />
            <span className="ps-cost">{outline.items.length} слайдов · {slideCost} кредитов · осталось {creditsLabel(quota)}</span>
            <button type="button" className="ps-btn ps-btn--primary" onClick={() => void buildDeck()} disabled={Boolean(quota && !quota.unlimited && quota.remaining < slideCost)}>
              <Wand2 size={16} /> Создать презентацию
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------- deck */
  const readyCount = entries.filter((entry) => entry.state === "ready").length

  if (assembling && entries.length) {
    const at = Math.min(assemblyAt, entries.length - 1)
    const entry = entries[at]
    const palette = DECK_THEMES[theme]
    const sceneStyle = {
      "--b-bg": `#${palette.bg}`,
      "--b-surface": `#${palette.surface}`,
      "--b-text": `#${palette.text}`,
      "--b-muted": `#${palette.muted}`,
      "--b-accent": `#${palette.accent}`,
      "--b-border": `#${palette.border}`,
      "--b-heading-font": palette.headingFont,
    } as CSSProperties
    return (
      <div className="ps-root" data-preserve-brand-color="true">
        {header}
        <div className="ps-build" style={sceneStyle} aria-live="polite">
          <div className="ps-build-top">
            <span className="ps-build-pulse" aria-hidden="true" />
            <span className="ps-build-label">
              {entry.state === "pending" ? "Malik AI пишет" : "Malik AI собирает"} слайд <b>{at + 1}</b> из {entries.length}
            </span>
            <span className="ps-spacer" />
            <button type="button" className="ps-build-skip" onClick={() => setAssembling(false)}>
              {generating ? "Открыть редактор" : "Пропустить анимацию"}
            </button>
          </div>

          <div className="ps-build-stage">
            {entry.slide ? (
              <div className="ps-build-frame" key={`slide-${at}-${entry.slide.id}`}>
                <SlideFrame slide={entry.slide} theme={theme} index={at} total={entries.length} language={language} build pace={scenePace} />
              </div>
            ) : (
              <div className="ps-build-frame ps-build-frame--writing" key={`writing-${at}-${entry.state}`}>
                <WritingPage title={entry.outline.title} layout={LAYOUT_LABELS[entry.outline.layout]} failed={entry.state === "failed"} />
              </div>
            )}
          </div>

          <div className="ps-build-track" aria-hidden="true">
            {entries.map((item, index) => (
              <span
                key={item.key}
                className="ps-build-tick"
                data-state={index < at ? "done" : index === at ? "now" : item.state}
              />
            ))}
          </div>
          <div className="ps-build-caption">
            {generating ? `Готово ${readyCount} из ${entries.length}` : "Все слайды написаны"} · {creditsLabel(quota)} кредитов
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-root" data-preserve-brand-color="true">
      {header}
      <div className="ps-editor">
        <nav className="ps-rail" aria-label="Слайды">
          {entries.map((entry, index) => (
            <button key={entry.key} type="button" className="ps-thumb" aria-current={index === current} onClick={() => setCurrent(index)} aria-label={`Слайд ${index + 1}`}>
              <span className="ps-thumb-num">{index + 1}</span>
              {entry.slide ? (
                <SlideFrame slide={entry.slide} theme={theme} index={index} total={entries.length} language={language} />
              ) : (
                <div className="ps-pending" data-state={entry.state}>
                  <div><span>{entry.outline.title}</span><small>{entry.state === "failed" ? "не получилось" : "пишу…"}</small></div>
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className="ps-stage" role="region" aria-label="Слайд">
          <div className="ps-toolbar">
            <input
              className="ps-outline-title"
              style={{ fontSize: 22, margin: 0, flex: "1 1 240px", minWidth: 0 }}
              value={deckTitle}
              onChange={(event) => setDeckTitle(event.target.value)}
              aria-label="Название презентации"
            />
            <span className="ps-theme-dots" role="group" aria-label="Тема оформления">
              {THEME_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="ps-theme-dot"
                  aria-pressed={theme === id}
                  title={DECK_THEMES[id].name}
                  style={{ background: `linear-gradient(135deg, #${DECK_THEMES[id].bg} 50%, #${DECK_THEMES[id].accent} 50%)` }}
                  onClick={() => setTheme(id)}
                />
              ))}
            </span>
            <button type="button" className="ps-btn ps-btn--small" onClick={() => startShow(current)} disabled={!presentable.length}><Play size={14} /> Показ</button>
            <button type="button" className="ps-btn ps-btn--small" onClick={() => void exportPptx()} disabled={!presentable.length || generating || busy === "export"}>
              {busy === "export" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PPTX
            </button>
            <button type="button" className="ps-btn ps-btn--small" onClick={exportPdf} disabled={!presentable.length || generating}><FileDown size={14} /> PDF</button>
          </div>

          {generating ? <p className="ps-hint" style={{ marginTop: -4, marginBottom: 12 }} aria-live="polite">Пишу слайды: готово {readyCount} из {entries.length}</p> : null}
          {error ? <p className="ps-error" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{error}</p> : null}

          {active ? (
            <>
              <div className="ps-main-slide">
                {active.slide ? (
                  <SlideFrame
                    key={spotlight?.index === current ? `spotlight-${spotlight.nonce}` : "main"}
                    slide={active.slide}
                    theme={theme}
                    index={current}
                    total={entries.length}
                    editable={busy !== "rewrite"}
                    build={spotlight?.index === current}
                    language={language}
                    onChange={(patch) => patchSlide(current, patch)}
                  />
                ) : (
                  <div className="ps-pending" data-state={active.state}>
                    <div>
                      <span>{active.outline.title}</span>
                      {active.state === "failed" ? (
                        <small>
                          Этот слайд не получился — кредит за него не списан.{" "}
                          <button type="button" className="ps-btn ps-btn--small" style={{ marginTop: 12 }} onClick={() => void retrySlide(current)} disabled={generating}>
                            <RefreshCw size={14} /> Написать ещё раз · 1 кр.
                          </button>
                        </small>
                      ) : <small>Пишу этот слайд…</small>}
                    </div>
                  </div>
                )}
              </div>

              <div className="ps-slide-tools">
                <button type="button" className="ps-icon-btn" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0} aria-label="Предыдущий слайд"><ChevronLeft size={18} /></button>
                <span className="ps-cost" style={{ fontVariantNumeric: "tabular-nums" }}>{current + 1} / {entries.length}</span>
                <button type="button" className="ps-icon-btn" onClick={() => setCurrent((value) => Math.min(entries.length - 1, value + 1))} disabled={current >= entries.length - 1} aria-label="Следующий слайд"><ChevronRight size={18} /></button>

                {active.slide ? (
                  <>
                    <form
                      className="ps-rewrite"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void rewrite(current)
                      }}
                    >
                      <input
                        value={instruction}
                        onChange={(event) => setInstruction(event.target.value)}
                        placeholder="Что изменить? «короче», «добавь цифры», «сильнее заголовок»…"
                        aria-label="Как переписать слайд"
                        disabled={busy === "rewrite"}
                      />
                      <button type="submit" className="ps-btn ps-btn--small" disabled={busy === "rewrite" || generating} title="Переписать слайд · 1 кредит">
                        {busy === "rewrite" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Переписать · 1 кр.
                      </button>
                    </form>
                    <select
                      className="ps-select"
                      value={active.slide.layout}
                      onChange={(event) => void rewrite(current, event.target.value as SlideLayout)}
                      disabled={busy === "rewrite" || generating}
                      aria-label="Сменить макет (1 кредит)"
                      title="Сменить макет · 1 кредит"
                    >
                      {SLIDE_LAYOUTS.map((layout) => <option key={layout} value={layout}>{LAYOUT_LABELS[layout]}</option>)}
                    </select>
                    <span className="ps-spacer" />
                    <button type="button" className="ps-icon-btn" onClick={() => move(current, -1)} disabled={generating || current === 0} aria-label="Переместить выше"><ArrowUp size={16} /></button>
                    <button type="button" className="ps-icon-btn" onClick={() => move(current, 1)} disabled={generating || current >= entries.length - 1} aria-label="Переместить ниже"><ArrowDown size={16} /></button>
                    <button type="button" className="ps-icon-btn" onClick={() => setComposer((value) => !value)} disabled={generating || entries.length >= maxSlides} aria-label="Новый слайд" aria-expanded={composer} title={entries.length >= maxSlides ? `Максимум ${maxSlides} слайдов на вашем тарифе` : "Новый слайд · 1 кредит"}><Plus size={16} /></button>
                    {IMAGE_LAYOUTS.has(active.slide.layout) || active.slide.layout === "gallery" ? (
                      <button type="button" className="ps-icon-btn" onClick={() => void otherPhotos(current)} disabled={Boolean(busy)} aria-label="Другое фото" title="Подобрать другое фото"><ImageIcon size={16} /></button>
                    ) : null}
                    <button type="button" className="ps-icon-btn" onClick={() => duplicate(current)} disabled={generating} aria-label="Дублировать"><Copy size={16} /></button>
                    <button type="button" className="ps-icon-btn" onClick={() => remove(current)} disabled={generating || entries.length <= 1} aria-label="Удалить слайд"><Trash2 size={16} /></button>
                  </>
                ) : null}
              </div>

              {composer ? (
                <form
                  className="ps-rewrite ps-composer"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void addSlide()
                  }}
                >
                  <input
                    autoFocus
                    value={newSlideText}
                    onChange={(event) => setNewSlideText(event.target.value)}
                    placeholder="О чём новый слайд? Например: «риски и как мы их закрываем»"
                    aria-label="О чём новый слайд"
                  />
                  <select className="ps-select" value={newSlideLayout} onChange={(event) => setNewSlideLayout(event.target.value as SlideLayout)} aria-label="Макет нового слайда">
                    {SLIDE_LAYOUTS.filter((layout) => layout !== "title" && layout !== "closing").map((layout) => (
                      <option key={layout} value={layout}>{LAYOUT_LABELS[layout]}</option>
                    ))}
                  </select>
                  <button type="submit" className="ps-btn ps-btn--small ps-btn--primary" disabled={newSlideText.trim().length < 3 || generating}>
                    <Wand2 size={14} /> Добавить · {PRESENTATION_COSTS.slide} кр.
                  </button>
                </form>
              ) : null}

              {active.slide ? (
                <div className="ps-notes">
                  <label htmlFor="ps-notes-field"><StickyNote size={11} style={{ display: "inline", marginRight: 6 }} />Заметки докладчика</label>
                  <textarea
                    id="ps-notes-field"
                    value={active.slide.notes || ""}
                    onChange={(event) => patchSlide(current, { notes: event.target.value })}
                    placeholder="Что сказать на этом слайде"
                  />
                </div>
              ) : null}

              {imageTargets.length || imageProgress ? (
                <div className="ps-slide-tools">
                  <button type="button" className="ps-btn ps-btn--small" onClick={() => void addImages()} disabled={Boolean(busy)}>
                    {busy === "images" ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    {imageProgress ? `Рисую изображения: ${imageProgress.done} из ${imageProgress.total}` : `Нарисовать ИИ-изображения · ${imageTargets.length} шт.`}
                  </button>
                  <span className="ps-cost">Фото подбираются сами и бесплатно. Для слайдов без подходящего фото ИИ нарисует картинку — это фото-кредиты.</span>
                </div>
              ) : null}

              <p className="ps-hint">Нажмите на любой текст на слайде, чтобы исправить его. Enter — сохранить, Esc — отменить.</p>
            </>
          ) : null}
        </div>
      </div>

      {presenting && typeof document !== "undefined" ? createPortal(
        <div
          className="ps-show"
          ref={showRef}
          onClick={(event) => {
            const half = event.clientX > window.innerWidth / 2
            setShowIndex((value) => (half ? Math.min(presentable.length - 1, value + 1) : Math.max(0, value - 1)))
          }}
          role="dialog"
          aria-label="Показ презентации"
        >
          <div className="ps-show-frame">
            <SlideFrame slide={presentable[showIndex]} theme={theme} index={showIndex} total={presentable.length} language={language} />
          </div>
          {showNotes && presentable[showIndex]?.notes ? <div className="ps-show-notes">{presentable[showIndex].notes}</div> : null}
          <div className="ps-show-bar" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ps-icon-btn" style={{ color: "#fff" }} onClick={() => setShowIndex((value) => Math.max(0, value - 1))} aria-label="Назад"><ChevronLeft size={18} /></button>
            <span>{showIndex + 1} / {presentable.length}</span>
            <button type="button" className="ps-icon-btn" style={{ color: "#fff" }} onClick={() => setShowIndex((value) => Math.min(presentable.length - 1, value + 1))} aria-label="Вперёд"><ChevronRight size={18} /></button>
            <button type="button" className="ps-icon-btn" style={{ color: "#fff" }} onClick={() => setShowNotes((value) => !value)} aria-label="Заметки (N)"><StickyNote size={16} /></button>
            <button type="button" className="ps-icon-btn" style={{ color: "#fff" }} onClick={() => setPresenting(false)} aria-label="Выйти (Esc)"><X size={18} /></button>
          </div>
        </div>,
        document.body,
      ) : null}

      {printing && typeof document !== "undefined" ? createPortal(
        <div className="deck-print" aria-hidden="true">
          {presentable.map((slide, index) => (
            <div className="deck-print-page" key={slide.id}>
              <SlideCanvas slide={slide} theme={theme} index={index} total={presentable.length} language={language} />
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export default PresentationStudio
