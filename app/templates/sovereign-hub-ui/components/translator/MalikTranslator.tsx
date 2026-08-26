"use client"

import { useCallback, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  Clipboard,
  Eraser,
  Languages,
  Loader2,
  Sparkles,
} from "lucide-react"

const LANGUAGES = [
  { code: "auto", label: "Определить язык" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "kk", label: "Қазақша" },
  { code: "tr", label: "Türkçe" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "uk", label: "Українська" },
  { code: "pl", label: "Polski" },
  { code: "nl", label: "Nederlands" },
  { code: "ar", label: "العربية" },
  { code: "zh-CN", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "hi", label: "हिन्दी" },
] as const

const labelFor = (code: string) => LANGUAGES.find((item) => item.code === code)?.label || code

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
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "Не удалось выполнить перевод.")

      setResult(String(payload?.translatedText || ""))
      setDetectedSource(String(payload?.detectedSource || ""))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить перевод.")
    } finally {
      setLoading(false)
    }
  }, [loading, source, target, text])

  const swap = () => {
    if (source === "auto") {
      const actual = detectedSource || "ru"
      setSource(target)
      setTarget(actual)
    } else {
      setSource(target)
      setTarget(source)
    }
    if (result) {
      setText(result)
      setResult(text)
    }
    setError("")
  }

  const clear = () => {
    setText("")
    setResult("")
    setError("")
    setDetectedSource("")
    setCopied(false)
  }

  const copy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <main className="min-h-[100dvh] bg-[#0f0f10] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0f0f10]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Вернуться в Malik AI"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-black">
              <svg viewBox="0 0 44 44" className="h-5 w-5" aria-hidden="true">
                <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
                <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">Malik Translator</h1>
              <p className="truncate text-[11px] text-zinc-500">Отдельный переводчик · без Malik AI моделей</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-zinc-500 sm:flex">
            <Languages className="h-3.5 w-3.5" />
            18 языков
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 pb-10 pt-7 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mb-7 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" />
            Быстрый перевод внутри Malik AI
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Перевод без лишнего интерфейса</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Вставьте текст, выберите язык и получите перевод. Этот раздел работает отдельно от чат-моделей Malik AI.
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#151516] shadow-[0_24px_90px_rgba(0,0,0,.28)]">
          <div className="grid border-b border-white/[0.06] lg:grid-cols-[1fr_68px_1fr]">
            <div className="flex min-h-16 items-center px-4 sm:px-5">
              <select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                  setDetectedSource("")
                }}
                className="w-full cursor-pointer bg-transparent text-sm font-medium text-zinc-200 outline-none"
                aria-label="Исходный язык"
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code} className="bg-[#151516] text-zinc-100">
                    {language.label}
                  </option>
                ))}
              </select>
              {source === "auto" ? <span className="ml-3 shrink-0 text-[11px] text-zinc-600">{sourceLabel}</span> : null}
            </div>

            <div className="hidden items-center justify-center border-x border-white/[0.06] lg:flex">
              <button
                type="button"
                onClick={swap}
                className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Поменять языки местами"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-16 items-center border-t border-white/[0.06] px-4 sm:px-5 lg:border-t-0">
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="w-full cursor-pointer bg-transparent text-sm font-medium text-zinc-200 outline-none"
                aria-label="Язык перевода"
              >
                {LANGUAGES.filter((language) => language.code !== "auto").map((language) => (
                  <option key={language.code} value={language.code} className="bg-[#151516] text-zinc-100">
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid lg:grid-cols-2">
            <section className="relative min-h-[360px] border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <textarea
                value={text}
                maxLength={3000}
                onChange={(event) => {
                  setText(event.target.value)
                  setError("")
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault()
                    void translate()
                  }
                }}
                placeholder="Введите или вставьте текст…"
                className="h-[360px] w-full resize-none bg-transparent p-5 text-[18px] leading-8 text-zinc-100 outline-none placeholder:text-zinc-650 sm:p-7 sm:text-[20px]"
              />
              <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between sm:left-7 sm:right-7">
                <span className="text-[11px] tabular-nums text-zinc-600">{text.length}/3000</span>
                <button
                  type="button"
                  onClick={clear}
                  disabled={!text && !result}
                  className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-30"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Очистить
                </button>
              </div>
            </section>

            <section className="relative min-h-[360px] bg-white/[0.012]">
              <div className="min-h-[360px] whitespace-pre-wrap p-5 pb-16 text-[18px] leading-8 text-zinc-100 sm:p-7 sm:pb-16 sm:text-[20px]">
                {loading ? (
                  <div className="flex h-[280px] items-center justify-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Перевожу…
                  </div>
                ) : result ? (
                  result
                ) : (
                  <span className="text-zinc-650">Перевод появится здесь.</span>
                )}
              </div>

              <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between sm:left-7 sm:right-7">
                <span className="text-[11px] text-zinc-600">{result ? labelFor(target) : ""}</span>
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!result}
                  className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-30"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </section>
          </div>

          <footer className="flex flex-col gap-3 border-t border-white/[0.06] bg-[#121213] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-h-5 text-xs text-zinc-500">
              {error ? <span className="text-red-400">{error}</span> : "Ctrl / ⌘ + Enter — быстрый перевод"}
            </div>
            <button
              type="button"
              onClick={() => void translate()}
              disabled={!text.trim() || loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              Перевести
            </button>
          </footer>
        </div>

        <p className="mt-4 text-center text-[11px] leading-5 text-zinc-650">
          Malik Translator использует отдельный классический сервис перевода и не расходует лимиты чат-моделей Malik AI.
        </p>
      </section>
    </main>
  )
}

export default MalikTranslator
