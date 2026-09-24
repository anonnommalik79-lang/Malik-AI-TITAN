"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowRight,
  ExternalLink,
  Github,
  Globe2,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react"

export type ChatToolWorkspaceMode = "web" | "deep" | "github" | "gmail"

type WorkspaceConfig = {
  eyebrow: string
  title: string
  description: string
  placeholder: string
  action: string
  icon: LucideIcon
  examples: string[]
}

const WORKSPACE: Record<ChatToolWorkspaceMode, WorkspaceConfig> = {
  web: {
    eyebrow: "MALIK AI · WEB",
    title: "Поиск в сети",
    description: "Введите тему — Malik AI сам запустит веб-поиск, прочитает актуальные страницы и вернёт ответ с источниками.",
    placeholder: "Что нужно найти в интернете?",
    action: "Найти в сети",
    icon: Search,
    examples: ["Последние новости про AI", "Сравнить цены и характеристики", "Найти официальную документацию"],
  },
  deep: {
    eyebrow: "MALIK AI · DEEP RESEARCH",
    title: "Глубокое исследование",
    description: "Отдельный режим для длинного исследования: несколько источников, проверка фактов и структурированный итог.",
    placeholder: "Какую тему исследовать подробно?",
    action: "Начать исследование",
    icon: Globe2,
    examples: ["Исследовать рынок AI-видео", "Сравнить конкурентов и технологии", "Собрать отчёт со ссылками"],
  },
  github: {
    eyebrow: "MALIK AI · GITHUB",
    title: "GitHub",
    description: "Подключите GitHub официально, чтобы Malik AI мог работать с доступными репозиториями, PR, issues и CI.",
    placeholder: "",
    action: "Подключить GitHub",
    icon: Github,
    examples: ["Репозитории", "Pull requests", "Issues и CI"],
  },
  gmail: {
    eyebrow: "MALIK AI · GMAIL",
    title: "Gmail",
    description: "Подключите Gmail официально, чтобы Malik AI мог читать доступные письма и использовать их в работе по вашему запросу.",
    placeholder: "",
    action: "Подключить Gmail",
    icon: Mail,
    examples: ["Поиск писем", "Разбор переписки", "Подготовка ответа"],
  },
}

export function ChatToolWorkspace({
  mode,
  onClose,
  onRunResearch,
  onConnect,
}: {
  mode: ChatToolWorkspaceMode | null
  onClose: () => void
  onRunResearch?: (mode: "web" | "deep", query: string) => void
  onConnect?: (provider: "github" | "gmail") => void
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!mode) return
    setQuery("")
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mode, onClose])

  const config = useMemo(() => mode ? WORKSPACE[mode] : null, [mode])
  if (!mode || !config || typeof document === "undefined") return null

  const Icon = config.icon
  const researchMode = mode === "web" || mode === "deep"
  const submit = () => {
    if (researchMode) {
      const clean = query.trim()
      if (!clean) return
      onRunResearch?.(mode, clean)
      return
    }
    onConnect?.(mode)
  }

  return createPortal(
    <section
      className="fixed inset-0 z-[2147483200] flex min-h-0 flex-col overflow-hidden bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      <header className="shrink-0 border-b border-white/10 bg-black px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white text-black">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold tracking-[0.24em] text-zinc-500">{config.eyebrow}</div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{config.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[#0b0b0b] text-zinc-400 transition hover:bg-white hover:text-black"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto grid w-full max-w-[1180px] gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-[28px] border border-white/10 bg-[#080808] p-5 sm:p-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white text-black">
              <Icon className="h-7 w-7" />
            </div>
            <h3 className="mt-6 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{config.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px]">{config.description}</p>

            {researchMode ? (
              <div className="mt-8 rounded-[22px] border border-white/10 bg-black p-3">
                <textarea
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value.slice(0, 2400))}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit()
                  }}
                  rows={6}
                  placeholder={config.placeholder}
                  className="min-h-[150px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-white outline-none placeholder:text-zinc-600"
                />
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-1 pt-3">
                  <span className="text-[10px] text-zinc-600">Ctrl/⌘ + Enter — запустить</span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!query.trim()}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {mode === "deep" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    {config.action}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={submit}
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                <ExternalLink className="h-4 w-4" />
                {config.action}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-[#080808] p-5 sm:p-7">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <ShieldCheck className="h-4 w-4" />
              {researchMode ? "Что произойдёт" : "Официальное подключение"}
            </div>
            <div className="mt-5 grid gap-2">
              {config.examples.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  disabled={!researchMode}
                  onClick={() => researchMode && setQuery(item)}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/[0.08] bg-black px-4 text-left text-sm text-zinc-300 disabled:cursor-default"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] text-white">{index + 1}</span>
                  <span>{item}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-5 text-zinc-600">
              {researchMode
                ? "Этот экран запускает настоящий research-режим Malik AI. Текст не подставляется в обычный composer."
                : "Malik AI не просит пароль сервиса. Авторизация проходит через официальный OAuth/API поток."}
            </p>
          </aside>
        </div>
      </div>
    </section>,
    document.body,
  )
}

export default ChatToolWorkspace
