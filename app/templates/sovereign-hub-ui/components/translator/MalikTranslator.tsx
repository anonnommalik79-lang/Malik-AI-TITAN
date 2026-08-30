"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardPaste,
  Clock,
  Globe,
  Languages,
  Layers,
  Loader2,
  ShieldCheck,
  Volume2,
  X,
  Zap,
} from "lucide-react"
import {
  QUICK_SOURCE_CODES,
  QUICK_TARGET_CODES,
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_LANGUAGE_FLOOR,
  languageLabel,
  speechLocale,
} from "@/lib/translator/languages"

const MAX_LENGTH = 5000
const HISTORY_KEY = "malik_translator_history_v1"
const MAX_HISTORY = 24

type HistoryEntry = {
  id: string
  text: string
  result: string
  source: string
  target: string
  at: number
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {
    /* private mode — history is a convenience, never a requirement */
  }
}

/** "2 минуты назад" — the list is about recency, so an exact clock would be noise. */
function relativeTime(at: number) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 60) return "только что"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${plural(minutes, "минута", "минуты", "минут")} назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`
  const days = Math.round(hours / 24)
  return `${days} ${plural(days, "день", "дня", "дней")} назад`
}

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function MalikMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white text-black" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="h-[18px] w-[18px]">
        <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
        <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

/** Quick chips plus an "Ещё" menu, so 130 languages stay reachable without a wall. */
function LanguageBar({
  codes,
  value,
  onChange,
  includeAuto,
  detected,
  align = "left",
}: {
  codes: readonly string[]
  value: string
  onChange: (code: string) => void
  includeAuto?: boolean
  detected?: string
  align?: "left" | "right"
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const options = useMemo(() => {
    const text = query.trim().toLowerCase()
    const all = includeAuto
      ? [{ code: "auto", label: "Авто", english: "auto" }, ...TRANSLATOR_LANGUAGES]
      : TRANSLATOR_LANGUAGES
    if (!text) return all
    return all.filter((item) => `${item.label} ${item.english} ${item.code}`.toLowerCase().includes(text))
  }, [includeAuto, query])

  const isQuick = codes.includes(value)

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium transition ${
              value === code
                ? "bg-white/[0.10] text-white"
                : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
            }`}
          >
            {code === "auto" && detected ? `Авто · ${languageLabel(detected)}` : languageLabel(code)}
          </button>
        ))}
      </div>

      <div ref={boxRef} className={`relative shrink-0 ${align === "right" ? "ml-auto" : ""}`}>
        {/* A framed control, like the design: it reads as "there are more here",
            not as another chip. */}
        <button
          type="button"
          onClick={() => { setOpen((state) => !state); setQuery("") }}
          className={`flex h-8 items-center justify-between gap-2 rounded-lg border border-white/[0.10] px-2.5 text-[12px] font-medium transition ${
            !isQuick ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="max-w-[104px] truncate">{isQuick ? "Ещё" : languageLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>

        {open ? (
          <div
            className={`malik-lang-menu absolute z-50 mt-2 w-[248px] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0d0d0f] ${
              align === "right" ? "right-0" : "left-0"
            }`}
            role="listbox"
          >
            <div className="border-b border-white/[0.08] p-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск языка"
                className="h-9 w-full rounded-xl bg-white/[0.05] px-3 text-[13px] text-white outline-none placeholder:text-zinc-600"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto py-1">
              {options.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={value === item.code}
                  onClick={() => { onChange(item.code); setOpen(false) }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition ${
                    value === item.code ? "bg-white/[0.09] text-white" : "text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {value === item.code ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              ))}
              {!options.length ? <p className="px-3 py-6 text-center text-[12.5px] text-zinc-600">Ничего не найдено</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Zap, title: "Быстрый перевод", body: "Мгновенный и точный перевод движком Malik AI." },
  { icon: ShieldCheck, title: "Чистый результат", body: "Только перевод, без лишних объяснений." },
  { icon: Layers, title: `${TRANSLATOR_LANGUAGE_FLOOR}+ языков`, body: "Поддержка всех популярных языков мира." },
  { icon: Clock, title: "История переводов", body: "Ваши переводы сохраняются в истории." },
]

export function MalikTranslator() {
  const [source, setSource] = useState("auto")
  const [target, setTarget] = useState("en")
  const [text, setText] = useState("")
  const [result, setResult] = useState("")
  const [detectedSource, setDetectedSource] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showAllHistory, setShowAllHistory] = useState(false)

  useEffect(() => setHistory(readHistory()), [])

  // legendary-aurora.css paints gold radial gradients on body::before and
  // body::after for every page in the app. Behind this section they read as a
  // yellow haze over what is meant to be a black page, so the flag below turns
  // them off while the translator is open and restores them on the way out.
  useEffect(() => {
    document.body.setAttribute("data-malik-plain-black", "true")
    return () => document.body.removeAttribute("data-malik-plain-black")
  }, [])

  const translate = useCallback(async () => {
    const value = text.trim()
    if (!value || loading) return
    setLoading(true)
    setError("")
    setCopied(false)

    try {
      const response = await fetch("/api/translator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, source, target }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.translatedText) throw new Error(payload?.error || "Не удалось выполнить перевод.")

      const translated = String(payload.translatedText)
      const detected = String(payload.detectedSource || "")
      setResult(translated)
      setDetectedSource(detected)

      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: value,
        result: translated,
        source: source === "auto" ? detected || "auto" : source,
        target,
        at: Date.now(),
      }
      setHistory((previous) => {
        const next = [entry, ...previous.filter((item) => item.text !== entry.text || item.target !== entry.target)]
        writeHistory(next)
        return next.slice(0, MAX_HISTORY)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить перевод.")
    } finally {
      setLoading(false)
    }
  }, [loading, source, target, text])

  const swap = () => {
    const actualSource = source === "auto" ? detectedSource || "ru" : source
    setSource(target)
    setTarget(actualSource === target ? "en" : actualSource)
    if (result) {
      const previous = text
      setText(result)
      setResult(previous)
    }
    setDetectedSource("")
    setError("")
  }

  const clear = () => {
    setText("")
    setResult("")
    setDetectedSource("")
    setError("")
    setCopied(false)
  }

  const paste = async () => {
    try {
      const value = await navigator.clipboard.readText()
      if (value) {
        setText(value.slice(0, MAX_LENGTH))
        setError("")
      }
    } catch {
      setError("Браузер не разрешил чтение буфера обмена.")
    }
  }

  const copy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const speak = (value: string, language: string) => {
    if (!value.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(value)
    utterance.lang = speechLocale(language)
    window.speechSynthesis.speak(utterance)
  }

  const restore = (entry: HistoryEntry) => {
    setText(entry.text)
    setResult(entry.result)
    setSource(entry.source === "auto" ? "auto" : entry.source)
    setTarget(entry.target)
    setError("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const visibleHistory = showAllHistory ? history : history.slice(0, 3)

  return (
    <main className="malik-translator-page min-h-[100dvh] bg-black text-zinc-100 antialiased">
      <style jsx global>{`
        /* Pure black behind the translator: no aurora, no gold haze, no tint
           inherited from the app shell. */
        body[data-malik-plain-black]::before,
        body[data-malik-plain-black]::after {
          content: none !important;
          display: none !important;
          background: none !important;
          box-shadow: none !important;
          opacity: 0 !important;
          animation: none !important;
        }
        body[data-malik-plain-black],
        body[data-malik-plain-black] #malik-root {
          background: #000 !important;
          background-image: none !important;
        }
        .malik-translator-page { background: #000 !important; }

        /* mobile-polish.css paints a warm gradient through
           "#malik-root section:first-of-type" and a gold glow through
           "#malik-root section:first-of-type button". The panes and the history
           block are sections, which is exactly where the haze showed.

           ":first-of-type" counts as a class, so those rules score (1,1,1) and
           (1,1,2) - the same as an override written with one class. A tie is
           broken by source order, and styled-jsx injects at runtime, so the haze
           came and went between loads. Repeating the class name adds a second
           class to the count and wins outright, whatever the order. */
        #malik-root .malik-translator-page.malik-translator-page,
        #malik-root .malik-translator-page.malik-translator-page section,
        #malik-root .malik-translator-page.malik-translator-page article,
        #malik-root .malik-translator-page.malik-translator-page header,
        #malik-root .malik-translator-page.malik-translator-page div,
        #malik-root .malik-translator-page.malik-translator-page span,
        #malik-root .malik-translator-page.malik-translator-page button {
          background-image: none !important;
        }
        #malik-root .malik-translator-page.malik-translator-page section,
        #malik-root .malik-translator-page.malik-translator-page article,
        #malik-root .malik-translator-page.malik-translator-page header,
        #malik-root .malik-translator-page.malik-translator-page button,
        #malik-root .malik-translator-page.malik-translator-page [role="button"],
        #malik-root .malik-translator-page.malik-translator-page a,
        #malik-root .malik-translator-page.malik-translator-page label,
        #malik-root .malik-translator-page.malik-translator-page textarea,
        #malik-root .malik-translator-page.malik-translator-page input {
          box-shadow: none !important;
        }
        /* The one exception: the language dropdown needs its lift to read as a
           layer above the pane. Pure black shadow, no warmth in it. */
        #malik-root .malik-translator-page.malik-translator-page .malik-lang-menu {
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7) !important;
        }
      `}</style>
      <header className="border-b border-white/[0.07]">
        <div className="mx-auto flex h-[68px] w-full max-w-[1180px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => window.location.assign("/dashboard")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
            aria-label="Назад"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <MalikMark />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">Malik Translator</h1>
            <p className="truncate text-[11.5px] text-zinc-500">Быстрый перевод · {TRANSLATOR_LANGUAGE_FLOOR}+ языков</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.04em] text-white sm:text-[36px]">Переводчик</h2>
            <p className="mt-2 max-w-xl text-[13.5px] leading-6 text-zinc-500">
              Введите текст, выберите язык и получите точный перевод без лишних ответов.
            </p>
          </div>

          {/* The language-count badge. Black card, white type: the page carries no
              warm tint anywhere, so the badge does not either. */}
          <div className="relative shrink-0 overflow-hidden rounded-[18px] border border-white/[0.12] bg-black px-5 py-4">
            <div className="relative flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-white/[0.05] text-white">
                <Globe className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-none tracking-[-0.02em] text-white">
                  {TRANSLATOR_LANGUAGE_FLOOR}+
                </span>
                <span className="mt-1 block text-[11.5px] leading-tight text-zinc-500">поддерживаемых языков</span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[22px] border border-white/[0.10] bg-[#0a0a0b]">
          <div className="flex flex-col gap-2 border-b border-white/[0.07] px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <LanguageBar
                codes={QUICK_SOURCE_CODES}
                value={source}
                includeAuto
                detected={detectedSource}
                onChange={(code) => { setSource(code); setDetectedSource(""); setError("") }}
              />
            </div>

            <button
              type="button"
              onClick={swap}
              className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-zinc-500 transition hover:bg-white/[0.08] hover:text-white sm:self-auto"
              aria-label="Поменять языки местами"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <LanguageBar
                codes={QUICK_TARGET_CODES}
                value={target}
                align="right"
                onChange={(code) => { setTarget(code); setError("") }}
              />
            </div>
          </div>

          {/* Two separate framed panes with a gap, as in the design — not one
              surface split by a divider. */}
          <div className="grid gap-3 p-3 lg:grid-cols-2">
            <section className="relative rounded-[16px] border border-white/[0.09] bg-[#0e0e10]">
              <textarea
                value={text}
                maxLength={MAX_LENGTH}
                onChange={(event) => { setText(event.target.value); setError("") }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault()
                    void translate()
                  }
                }}
                placeholder="Введите текст или вставьте его сюда..."
                className="h-[150px] w-full resize-none bg-transparent px-4 pb-12 pt-4 text-[14.5px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 sm:h-[168px]"
              />
              <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void paste()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 text-[11.5px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white">
                    <ClipboardPaste className="h-[14px] w-[14px]" />
                    Вставить
                  </button>
                  <button type="button" onClick={() => speak(text, source === "auto" ? detectedSource || "ru" : source)} disabled={!text.trim()} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Озвучить текст">
                    <Volume2 className="h-[14px] w-[14px]" />
                  </button>
                  {text ? (
                    <button type="button" onClick={clear} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Очистить">
                      <X className="h-[14px] w-[14px]" />
                    </button>
                  ) : null}
                </div>
                <span className="text-[11px] tabular-nums text-zinc-600">{text.length}/{MAX_LENGTH}</span>
              </div>
            </section>

            <section className="relative rounded-[16px] border border-white/[0.09] bg-[#0e0e10]">
              <div className="h-[150px] overflow-y-auto whitespace-pre-wrap px-4 pb-12 pt-4 text-[14.5px] leading-6 text-zinc-100 sm:h-[168px]">
                {loading ? (
                  <span className="inline-flex items-center gap-2 text-[13.5px] text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Перевожу…
                  </span>
                ) : result ? result : <span className="text-zinc-600">Здесь появится перевод...</span>}
              </div>
              <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-end gap-1">
                <button type="button" onClick={() => speak(result, target)} disabled={!result} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Озвучить перевод">
                  <Volume2 className="h-[14px] w-[14px]" />
                </button>
                <button type="button" onClick={() => void copy()} disabled={!result} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 text-[11.5px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25">
                  {copied ? <Check className="h-[14px] w-[14px]" /> : <Clipboard className="h-[14px] w-[14px]" />}
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-zinc-500">
              {error ? <span className="text-zinc-300">{error}</span> : "Ctrl / ⌘ + Enter — перевести"}
            </p>
            <button
              type="button"
              onClick={() => void translate()}
              disabled={!text.trim() || loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 text-[14px] font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              Перевести
            </button>
          </div>
        </div>

        {/* Icon on the left, text block beside it — the layout in the design. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="flex items-start gap-3 rounded-[16px] border border-white/[0.08] bg-[#0a0a0b] p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.12] bg-white/[0.05] text-white">
                <feature.icon className="h-[15px] w-[15px]" />
              </span>
              <span className="min-w-0">
                <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white">{feature.title}</h3>
                <p className="mt-1 text-[11px] leading-[17px] text-zinc-500">{feature.body}</p>
              </span>
            </article>
          ))}
        </div>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-white">Недавние переводы</h3>
              <p className="mt-1 text-[12px] text-zinc-500">История ваших переводов и быстрый доступ к ним.</p>
            </div>
            {history.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllHistory((state) => !state)}
                className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-zinc-400 transition hover:text-white"
              >
                {showAllHistory ? "Свернуть" : "Показать все"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {visibleHistory.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => restore(entry)}
                className="grid w-full grid-cols-1 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-[#0a0a0b] px-4 py-3.5 text-left transition hover:border-white/20 hover:bg-[#0f0f11] sm:grid-cols-[1fr_1fr_auto] sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-white">{entry.text}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-zinc-500">
                    {languageLabel(entry.source)} → {languageLabel(entry.target)}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-zinc-300">{entry.result}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-zinc-500">{relativeTime(entry.at)}</span>
                </span>
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-zinc-600 sm:block" />
              </button>
            ))}

            {!history.length ? (
              <p className="rounded-[16px] border border-white/[0.08] bg-[#0a0a0b] px-4 py-8 text-center text-[13px] text-zinc-600">
                Пока пусто. Переведите первый текст — он появится здесь.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}

export default MalikTranslator
