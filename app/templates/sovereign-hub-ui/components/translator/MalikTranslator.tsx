"use client"

import { useCallback, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  Clipboard,
  ClipboardPaste,
  Languages,
  Loader2,
  Volume2,
  X,
} from "lucide-react"

const LANGUAGES = [
  { code: "auto", label: "Определить язык", short: "Авто" },
  { code: "ru", label: "Русский", short: "Русский" },
  { code: "en", label: "English", short: "English" },
  { code: "kk", label: "Қазақша", short: "Қазақша" },
  { code: "tr", label: "Türkçe", short: "Türkçe" },
  { code: "de", label: "Deutsch", short: "Deutsch" },
  { code: "fr", label: "Français", short: "Français" },
  { code: "es", label: "Español", short: "Español" },
  { code: "it", label: "Italiano", short: "Italiano" },
  { code: "pt", label: "Português", short: "Português" },
  { code: "uk", label: "Українська", short: "Українська" },
  { code: "pl", label: "Polski", short: "Polski" },
  { code: "nl", label: "Nederlands", short: "Nederlands" },
  { code: "ar", label: "العربية", short: "العربية" },
  { code: "zh-CN", label: "中文", short: "中文" },
  { code: "ja", label: "日本語", short: "日本語" },
  { code: "ko", label: "한국어", short: "한국어" },
  { code: "hi", label: "हिन्दी", short: "हिन्दी" },
] as const

const QUICK_SOURCE = ["auto", "ru", "en", "kk"] as const
const QUICK_TARGET = ["ru", "en", "kk"] as const
const labelFor = (code: string) => LANGUAGES.find((item) => item.code === code)?.label || code
const speechLocale = (code: string) => code === "kk" ? "kk-KZ" : code === "ru" ? "ru-RU" : code === "en" ? "en-US" : code

function MalikMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-black" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="h-5 w-5">
        <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
        <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

export function MalikTranslator() {
  const [source, setSource] = useState("auto")
  const [target, setTarget] = useState("en")
  const [text, setText] = useState("")
  const [result, setResult] = useState("")
  const [detectedSource, setDetectedSource] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const sourceLabel = useMemo(() => {
    if (source !== "auto") return labelFor(source)
    return detectedSource ? `Определено: ${labelFor(detectedSource)}` : "Определить язык"
  }, [source, detectedSource])

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
      setResult(String(payload.translatedText))
      setDetectedSource(String(payload.detectedSource || ""))
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
        setText(value.slice(0, 5000))
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
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  }

  const setSourceLanguage = (code: string) => {
    setSource(code)
    setDetectedSource("")
    setError("")
  }

  return (
    <main
      className="min-h-[100dvh] bg-black text-zinc-100 antialiased"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <header className="border-b border-white/[0.08] bg-black">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
              aria-label="Вернуться в Malik AI"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <MalikMark />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">Malik Translator</h1>
              <p className="truncate text-[11px] text-zinc-500">Быстрый перевод · 18 языков</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
            <Languages className="h-4 w-4" />
            <span>Перевод внутри Malik AI</span>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 px-1">
          <h2 className="text-[22px] font-semibold tracking-[-0.035em] text-white sm:text-[26px]">Переводчик</h2>
          <p className="mt-1 text-[13px] text-zinc-500">Введите текст, выберите язык и получите чистый перевод без лишних ответов.</p>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-white/[0.11] bg-[#0a0a0b] shadow-[0_24px_80px_rgba(0,0,0,.55)]">
          <div className="grid lg:grid-cols-[1fr_58px_1fr]">
            <div className="min-w-0 border-b border-white/[0.08] lg:border-b-0">
              <div className="flex h-[58px] items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {QUICK_SOURCE.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setSourceLanguage(code)}
                    className={`h-9 shrink-0 rounded-lg px-3 text-[13px] font-medium transition ${source === code ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}
                  >
                    {code === "auto" && detectedSource ? sourceLabel : LANGUAGES.find((item) => item.code === code)?.short}
                  </button>
                ))}
                <select
                  value={QUICK_SOURCE.includes(source as (typeof QUICK_SOURCE)[number]) ? "" : source}
                  onChange={(event) => event.target.value && setSourceLanguage(event.target.value)}
                  className="ml-auto h-9 max-w-[132px] cursor-pointer rounded-lg bg-transparent px-2 text-[12px] text-zinc-500 outline-none hover:bg-white/[0.05]"
                  aria-label="Все исходные языки"
                >
                  <option value="" className="bg-[#111113]">Ещё</option>
                  {LANGUAGES.filter((item) => !QUICK_SOURCE.includes(item.code as (typeof QUICK_SOURCE)[number])).map((item) => (
                    <option key={item.code} value={item.code} className="bg-[#111113] text-zinc-100">{item.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="hidden items-center justify-center border-x border-white/[0.08] lg:flex">
              <button
                type="button"
                onClick={swap}
                className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Поменять языки местами"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="min-w-0 border-b border-white/[0.08] lg:border-b-0">
              <div className="flex h-[58px] items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {QUICK_TARGET.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => { setTarget(code); setError("") }}
                    className={`h-9 shrink-0 rounded-lg px-3 text-[13px] font-medium transition ${target === code ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}
                  >
                    {LANGUAGES.find((item) => item.code === code)?.short}
                  </button>
                ))}
                <select
                  value={QUICK_TARGET.includes(target as (typeof QUICK_TARGET)[number]) ? "" : target}
                  onChange={(event) => event.target.value && setTarget(event.target.value)}
                  className="ml-auto h-9 max-w-[132px] cursor-pointer rounded-lg bg-transparent px-2 text-[12px] text-zinc-500 outline-none hover:bg-white/[0.05]"
                  aria-label="Все языки перевода"
                >
                  <option value="" className="bg-[#111113]">Ещё</option>
                  {LANGUAGES.filter((item) => item.code !== "auto" && !QUICK_TARGET.includes(item.code as (typeof QUICK_TARGET)[number])).map((item) => (
                    <option key={item.code} value={item.code} className="bg-[#111113] text-zinc-100">{item.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2">
            <section className="relative min-h-[330px] border-b border-white/[0.08] lg:border-b-0 lg:border-r lg:border-white/[0.08]">
              <textarea
                value={text}
                maxLength={5000}
                onChange={(event) => { setText(event.target.value); setError("") }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault()
                    void translate()
                  }
                }}
                placeholder="Введите текст"
                className="h-[330px] w-full resize-none bg-transparent px-5 pb-16 pt-5 text-[19px] font-normal leading-8 text-zinc-100 outline-none placeholder:text-zinc-600 sm:px-6 sm:text-[21px]"
                autoFocus
              />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between sm:left-4 sm:right-4">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void paste()} className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                    <ClipboardPaste className="h-4 w-4" />
                    <span className="hidden sm:inline">Вставить</span>
                  </button>
                  <button type="button" onClick={() => speak(text, source === "auto" ? detectedSource || "ru" : source)} disabled={!text.trim()} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Озвучить исходный текст">
                    <Volume2 className="h-4 w-4" />
                  </button>
                  {text ? (
                    <button type="button" onClick={clear} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Очистить">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <span className="text-[11px] tabular-nums text-zinc-600">{text.length}/5000</span>
              </div>
            </section>

            <section className="relative min-h-[330px] bg-[#0d0d0f]">
              <div className="min-h-[330px] whitespace-pre-wrap px-5 pb-16 pt-5 text-[19px] leading-8 text-zinc-100 sm:px-6 sm:text-[21px]">
                {loading ? (
                  <div className="flex h-[245px] items-center justify-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Перевожу…
                  </div>
                ) : result ? result : <span className="text-zinc-600">Перевод</span>}
              </div>

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between sm:left-4 sm:right-4">
                <span className="px-2 text-[11px] text-zinc-600">{result ? labelFor(target) : ""}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => speak(result, target)} disabled={!result} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Озвучить перевод">
                    <Volume2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void copy()} disabled={!result} className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25">
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    <span>{copied ? "Скопировано" : "Копировать"}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>

          <footer className="flex flex-col gap-3 border-t border-white/[0.08] bg-black px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-h-5 text-[12px] text-zinc-500">
              {error ? <span className="text-red-400">{error}</span> : source === "auto" && detectedSource ? sourceLabel : "Ctrl / ⌘ + Enter — перевести"}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={swap} className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.09] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden" aria-label="Поменять языки местами">
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void translate()}
                disabled={!text.trim() || loading}
                className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                Перевести
              </button>
            </div>
          </footer>
        </div>

        <p className="mt-3 px-1 text-[11px] text-zinc-600">Malik Translator работает отдельно от лимитов чат-моделей Malik AI.</p>
      </section>
    </main>
  )
}

export default MalikTranslator
