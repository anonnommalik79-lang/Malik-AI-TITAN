"use client"

import { memo, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Brain,
  Code2,
  Crown,
  Film,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  SquareCode,
} from "lucide-react"
import { sectionHeroUrl, unsplashPhoto } from "@/lib/section-media"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { clientFetchWithTimeout } from "@/lib/api-client"
import type { AiModeId } from "../power-registry"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenWebsite?: () => void
  onOpenCode?: () => void
  onOpenBilling?: () => void
  onOpenCanvas?: () => void
  onOpenCommandCenter?: () => void
  onOpenSupport?: () => void
  onOpenCapabilities?: () => void
  currentMode?: AiModeId
  onModeChange?: (mode: AiModeId) => void
}

const HERO_PHOTO = unsplashPhoto("photo-1454496522488-7a8e488e8606", 1800)

type TemplateKind = "chat" | "crm" | "shop" | "analytics" | "booking"

/**
 * Template thumbnails are drawn, not photographed. A stock picture of an office
 * says nothing about what the template builds, and five remote images would be
 * five more requests competing with the hero on first paint. These are inline
 * SVGs in the product palette: no network, and they actually resemble the
 * screen the template produces.
 */
function templateShot(kind: TemplateKind) {
  const gold = "#d9ae45"
  const pale = "#f3de96"
  const dim = "#2a2620"

  const body: Record<TemplateKind, string> = {
    chat: `
      <rect x="26" y="34" width="150" height="12" rx="6" fill="${dim}"/>
      <rect x="26" y="58" width="196" height="30" rx="10" fill="${dim}"/>
      <rect x="118" y="98" width="176" height="30" rx="10" fill="${gold}" opacity=".5"/>
      <rect x="26" y="140" width="150" height="26" rx="10" fill="${dim}"/>
      <rect x="26" y="180" width="268" height="26" rx="13" fill="none" stroke="${gold}" stroke-opacity=".45"/>`,
    crm: `
      <rect x="26" y="30" width="80" height="176" rx="10" fill="${dim}"/>
      <rect x="38" y="44" width="56" height="8" rx="4" fill="${gold}" opacity=".7"/>
      <rect x="38" y="62" width="44" height="6" rx="3" fill="${gold}" opacity=".3"/>
      <rect x="38" y="78" width="50" height="6" rx="3" fill="${gold}" opacity=".3"/>
      <rect x="118" y="30" width="176" height="48" rx="10" fill="${dim}"/>
      <text x="132" y="62" fill="${pale}" font-family="Arial" font-size="21" font-weight="700">1 248</text>
      <rect x="118" y="90" width="176" height="116" rx="10" fill="${dim}"/>
      <polyline points="132,184 162,162 192,170 222,134 252,146 282,112" fill="none" stroke="${gold}" stroke-width="3"/>`,
    shop: `
      <rect x="26" y="30" width="78" height="78" rx="10" fill="${dim}"/>
      <rect x="116" y="30" width="78" height="78" rx="10" fill="${dim}"/>
      <rect x="206" y="30" width="88" height="78" rx="10" fill="${gold}" opacity=".32"/>
      <rect x="26" y="120" width="78" height="86" rx="10" fill="${dim}"/>
      <rect x="116" y="120" width="78" height="86" rx="10" fill="${dim}"/>
      <rect x="206" y="120" width="88" height="86" rx="10" fill="${dim}"/>`,
    analytics: `
      <text x="26" y="54" fill="${pale}" font-family="Arial" font-size="21" font-weight="700">+24.6%</text>
      <rect x="26" y="72" width="268" height="58" rx="10" fill="${dim}"/>
      <polyline points="40,116 82,96 124,104 166,80 208,90 250,64 282,74" fill="none" stroke="${gold}" stroke-width="3"/>
      <rect x="26" y="148" width="36" height="58" rx="6" fill="${gold}" opacity=".5"/>
      <rect x="74" y="166" width="36" height="40" rx="6" fill="${gold}" opacity=".33"/>
      <rect x="122" y="134" width="36" height="72" rx="6" fill="${gold}" opacity=".7"/>
      <rect x="170" y="160" width="36" height="46" rx="6" fill="${gold}" opacity=".4"/>
      <rect x="218" y="142" width="36" height="64" rx="6" fill="${gold}" opacity=".6"/>`,
    booking: `
      <rect x="26" y="30" width="268" height="34" rx="10" fill="${dim}"/>
      <rect x="26" y="76" width="268" height="130" rx="10" fill="${dim}"/>
      ${Array.from({ length: 21 }, (_, index) => {
        const column = index % 7
        const row = Math.floor(index / 7)
        const marked = index === 4 || index === 9 || index === 15
        return `<rect x="${40 + column * 36}" y="${92 + row * 38}" width="26" height="26" rx="6" fill="${marked ? gold : "#1b1a1f"}" opacity="${marked ? 0.85 : 1}"/>`
      }).join("")}`,
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 230" width="320" height="230">
    <rect width="320" height="230" fill="#111013"/>
    <rect x="0" y="0" width="320" height="18" fill="#17161a"/>
    <circle cx="16" cy="9" r="3" fill="${gold}" opacity=".6"/>
    <circle cx="28" cy="9" r="3" fill="${gold}" opacity=".3"/>
    <circle cx="40" cy="9" r="3" fill="${gold}" opacity=".3"/>
    ${body[kind]}
  </svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const TEMPLATES: Array<{ id: TemplateKind; title: string; detail: string; prompt: string }> = [
  {
    id: "chat",
    title: "AI Chat",
    detail: "Умный ассистент",
    prompt: "Собери премиальный AI-чат: тёмный интерфейс, история диалогов, потоковые ответы и загрузка файлов.",
  },
  {
    id: "crm",
    title: "CRM System",
    detail: "Управление клиентами",
    prompt: "Создай CRM для малого бизнеса: воронка сделок, карточка клиента, задачи и отчёт по выручке.",
  },
  {
    id: "shop",
    title: "E-commerce",
    detail: "Интернет-магазин",
    prompt: "Создай интернет-магазин: каталог, карточка товара, корзина и оформление заказа. Тёмная премиальная тема.",
  },
  {
    id: "analytics",
    title: "Analytics",
    detail: "Аналитика и инсайты",
    prompt: "Собери аналитический дашборд: KPI-карты, график роста, разбивка по каналам и короткие выводы.",
  },
  {
    id: "booking",
    title: "Booking",
    detail: "Система бронирования",
    prompt: "Создай систему бронирования: календарь свободных слотов, форма записи и подтверждение брони.",
  },
]

function HomeHero({ modelOnline }: { modelOnline: boolean | null }) {
  return (
    <section className="thome-hero" aria-label="MALIK AI TITAN">
      <img
        className="thome-hero-photo"
        src={HERO_PHOTO}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />

      <div className={cn("thome-model-badge", modelOnline === false && "is-down")}>
        <span className="thome-pulse" />
        <span>
          <b>MalikLLM75B</b>
          <small>{modelOnline === null ? "Проверяю…" : modelOnline ? "Online" : "Offline"}</small>
        </span>
      </div>

      <Crown className="thome-crown h-7 w-7" aria-hidden="true" />
      <h1 className="thome-wordmark">MALIK AI</h1>
      <p className="thome-wordmark-sub">TITAN</p>
      <p className="thome-hero-lead">
        <span>Ваш личный ИИ-ассистент. Создаёт. Анализирует. Автоматизирует.</span>
        <span>Один интеллект — безграничные возможности.</span>
      </p>
    </section>
  )
}

function HomeComposer({
  prompt,
  isLoading,
  webOn,
  memoryOn,
  onPromptChange,
  onSubmit,
  onToggleWeb,
  onToggleMemory,
  onOpenPhoto,
  onOpenCode,
  onOpenCanvas,
}: {
  prompt: string
  isLoading?: boolean
  webOn: boolean
  memoryOn: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onToggleWeb: () => void
  onToggleMemory: () => void
  onOpenPhoto?: () => void
  onOpenCode?: () => void
  onOpenCanvas?: () => void
}) {
  return (
    <section className="thome-composer" aria-label="Новый запрос">
      <div className="thome-composer-top">
        <span className="thome-chip is-on">
          <Sparkles className="h-4 w-4" />
          MalikLLM75B
        </span>
        <span className="thome-chip">
          <SquareCode className="h-4 w-4" />
          Create
        </span>
        <button type="button" onClick={onToggleWeb} aria-pressed={webOn} className={cn("thome-chip", webOn && "is-on")}>
          <Globe className="h-4 w-4" />
          Web
        </button>
        <span className="thome-chip-spacer" />
        <button
          type="button"
          onClick={onToggleMemory}
          aria-pressed={memoryOn}
          className={cn("thome-chip", memoryOn && "is-on")}
        >
          <Brain className="h-4 w-4" />
          Memory: {memoryOn ? "On" : "Off"}
        </button>
      </div>

      <textarea
        value={prompt}
        onFocus={prefetchChatShell}
        onChange={(event) => {
          if (event.target.value.trim()) prefetchChatShell()
          onPromptChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
        rows={3}
        aria-label="Опишите задачу"
        placeholder="Например: Создай AI CRM для малого бизнеса с премиальным тёмным интерфейсом, интеграцией Telegram и автоматизацией продаж…"
      />

      <div className="thome-composer-bottom">
        <button type="button" onClick={onOpenCanvas} className="thome-tool" aria-label="Открыть холст">
          <Paperclip className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={onOpenPhoto} className="thome-tool" aria-label="Студия изображений">
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={onOpenCode} className="thome-tool" aria-label="Генератор кода">
          <Code2 className="h-[18px] w-[18px]" />
        </button>
        <button type="button" className="thome-tool" aria-label="Голосовой ввод" disabled>
          <Mic className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!prompt.trim() || isLoading}
          className="malik-gold-button thome-submit"
        >
          <Send className="h-4 w-4" />
          {isLoading ? "Генерация…" : "Создать"}
        </button>
      </div>
    </section>
  )
}

function HomeActions({
  onStartChat,
  onOpenPhoto,
  onOpenVideo,
  onOpenCode,
}: {
  onStartChat: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenCode?: () => void
}) {
  const cards = [
    {
      id: "chat",
      icon: MessageSquare,
      title: "AI Чат",
      detail: "Размышляет. Анализирует. Отвечает глубоко.",
      photo: sectionHeroUrl("final-intelligence", 700),
      action: onStartChat,
    },
    {
      id: "photo",
      icon: ImageIcon,
      title: "Создать изображение",
      detail: "Премиум визуализация в 4K.",
      photo: sectionHeroUrl("photo-generation", 700),
      action: onOpenPhoto,
    },
    {
      id: "video",
      icon: Film,
      title: "Сгенерировать видео",
      detail: "Киноуровень за минуты.",
      photo: sectionHeroUrl("video-generation", 700),
      action: onOpenVideo,
    },
    {
      id: "code",
      icon: Code2,
      title: "Написать код",
      detail: "Тысячи строк. Без воды.",
      photo: sectionHeroUrl("website-generation", 700),
      action: onOpenCode,
    },
  ] as const

  return (
    <section className="thome-actions" aria-label="Быстрые действия">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <button key={card.id} type="button" onClick={card.action} className="thome-action">
            <img
              className="thome-action-photo"
              src={card.photo}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <span className="thome-action-icon">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <h3>{card.title}</h3>
            <p>{card.detail}</p>
            <ArrowRight className="thome-action-arrow h-4 w-4" />
          </button>
        )
      })}
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [webOn, setWebOn] = useState(true)
  const [memoryOn, setMemoryOn] = useState(true)
  const [modelOnline, setModelOnline] = useState<boolean | null>(null)

  // One read on mount, so the hero badge reflects the real runtime instead of a
  // hardcoded "Online".
  useEffect(() => {
    let cancelled = false
    clientFetchWithTimeout("/api/ai/status", { method: "GET" }, 6000)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setModelOnline(Boolean(data?.ok))
      })
      .catch(() => {
        if (!cancelled) setModelOnline(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = () => {
    const text = prompt.trim()
    if (!text || props.isLoading) return
    props.onSubmit(text)
    setPrompt("")
  }

  const runTemplate = (value: string) => {
    if (props.isLoading) return
    props.onSubmit(value)
    setPrompt("")
  }

  const templates = useMemo(() => TEMPLATES.map((template) => ({ ...template, shot: templateShot(template.id) })), [])

  return (
    <div className="thome">
      <div className="thome-inner">
        <HomeHero modelOnline={modelOnline} />

        <HomeComposer
          prompt={prompt}
          isLoading={props.isLoading}
          webOn={webOn}
          memoryOn={memoryOn}
          onPromptChange={setPrompt}
          onSubmit={submit}
          onToggleWeb={() => setWebOn((on) => !on)}
          onToggleMemory={() => setMemoryOn((on) => !on)}
          onOpenPhoto={props.onOpenPhoto}
          onOpenCode={props.onOpenCode}
          onOpenCanvas={props.onOpenCanvas}
        />

        <HomeActions
          onStartChat={() => document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")?.focus()}
          onOpenPhoto={props.onOpenPhoto}
          onOpenVideo={props.onOpenVideo}
          onOpenCode={props.onOpenCode}
        />

        <div>
          <div className="thome-section-head">
            <h2>
              <Crown className="h-[18px] w-[18px]" />
              Популярные шаблоны
            </h2>
            <button type="button" onClick={props.onOpenTemplates} className="thome-section-link">
              Все шаблоны
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <section className="thome-templates" style={{ marginTop: 14 }} aria-label="Популярные шаблоны">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => runTemplate(template.prompt)}
                className="thome-template"
              >
                <img
                  className="thome-template-shot"
                  src={template.shot}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span className="thome-template-body">
                  <strong>{template.title}</strong>
                  <span>{template.detail}</span>
                </span>
              </button>
            ))}
          </section>
        </div>

        <footer className="thome-footer">
          <span>© MALIK AI — Sovereign Hub. Build the Future.</span>
          <b>v6.5 TITAN</b>
        </footer>
      </div>
    </div>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
