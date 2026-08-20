"use client"

import { memo, useRef, useState, type ComponentType } from "react"
import {
  ArrowRight,
  BarChart3,
  Bot,
  ChevronDown,
  Code2,
  Crown,
  Globe2,
  Image as ImageIcon,
  MemoryStick,
  MessageSquare,
  Mic2,
  Paperclip,
  Play,
  ShoppingBag,
  Sparkles,
} from "lucide-react"
import { unsplashPhoto } from "@/lib/section-media"

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenWebsite?: () => void
  onOpenCode?: () => void
  onOpenBilling?: () => void
  onOpenCanvas?: () => void
  onOpenCommandCenter?: () => void
  onOpenSupport?: () => void
  onOpenCapabilities?: () => void
}

type ActionCard = {
  id: string
  title: string
  detail: string
  icon: ComponentType<{ className?: string }>
  image: string
  action: () => void
}

type TemplateCard = {
  id: string
  title: string
  subtitle: string
  kind: "chat" | "crm" | "commerce" | "analytics" | "booking"
  prompt: string
}

const HERO_IMAGE = unsplashPhoto("photo-1519681393784-d120267933ba", 1800)
const CHAT_IMAGE = unsplashPhoto("photo-1519681393784-d120267933ba", 900)
const IMAGE_IMAGE = unsplashPhoto("photo-1500530855697-b586d89ba3ee", 900)
const VIDEO_IMAGE = unsplashPhoto("photo-1485846234645-a62644f84728", 900)
const CODE_IMAGE = unsplashPhoto("photo-1555066931-4365d14bab8c", 900)

function TemplatePreview({ kind }: { kind: TemplateCard["kind"] }) {
  if (kind === "chat") {
    return (
      <div className="flex h-full flex-col gap-2 rounded-[8px] border border-white/[0.06] bg-[#090b0f] p-2">
        <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#d7ac2d]" /><span className="h-1.5 w-8 rounded-full bg-white/10" /></div>
        <div className="mt-1 h-2 w-[72%] rounded-full bg-white/10" />
        <div className="h-2 w-[52%] rounded-full bg-white/[0.06]" />
        <div className="mt-auto flex gap-1.5"><span className="h-4 flex-1 rounded bg-[#16181d]" /><span className="h-4 w-5 rounded bg-[#bb8920]" /></div>
      </div>
    )
  }

  if (kind === "crm") {
    return (
      <div className="grid h-full grid-cols-[28%_1fr] gap-2 rounded-[8px] border border-white/[0.06] bg-[#090b0f] p-2">
        <div className="space-y-1.5"><div className="h-2 w-full rounded bg-[#b98b21]" /><div className="h-2 w-4/5 rounded bg-white/10" /><div className="h-2 w-3/5 rounded bg-white/[0.06]" /></div>
        <div className="flex flex-col"><div className="text-[8px] font-bold text-zinc-200">1,248</div><div className="mt-auto flex h-7 items-end gap-1"><span className="h-2 w-1 bg-[#906b18]" /><span className="h-4 w-1 bg-[#b68b24]" /><span className="h-6 w-1 bg-[#d2a62f]" /><span className="h-3 w-1 bg-[#9e731b]" /></div></div>
      </div>
    )
  }

  if (kind === "commerce") {
    return (
      <div className="grid h-full grid-cols-3 gap-1.5 rounded-[8px] border border-white/[0.06] bg-[#090b0f] p-2">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className={`rounded ${item === 2 ? "bg-[#8e6c24]" : "bg-[#24231e]"}`} />)}
      </div>
    )
  }

  if (kind === "analytics") {
    return (
      <div className="relative h-full rounded-[8px] border border-white/[0.06] bg-[#090b0f] p-2">
        <div className="text-[8px] font-bold text-zinc-200">+24.6%</div>
        <svg className="absolute inset-x-2 bottom-4 h-8 w-[calc(100%-16px)]" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="M0 23 L17 15 L33 19 L49 9 L66 13 L82 4 L100 9" fill="none" stroke="#d9ad2f" strokeWidth="2" /></svg>
        <div className="absolute inset-x-2 bottom-1 flex h-2 items-end gap-1">{[30, 55, 38, 72, 44, 82, 63, 94].map((h, i) => <span key={i} className="flex-1 bg-[#a67a1d]" style={{ height: `${h}%` }} />)}</div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-7 gap-1 rounded-[8px] border border-white/[0.06] bg-[#090b0f] p-2">
      {Array.from({ length: 28 }).map((_, item) => <span key={item} className={`rounded-sm ${item === 11 || item === 18 ? "bg-[#be9028]" : "bg-[#181a1e]"}`} />)}
    </div>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState("Create")
  const [webEnabled, setWebEnabled] = useState(true)
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  const focusPrompt = (value?: string) => {
    if (typeof value === "string") setPrompt(value)
    requestAnimationFrame(() => promptRef.current?.focus())
  }

  const submit = () => {
    const value = prompt.trim()
    if (!value || props.isLoading) return
    props.onSubmit(value)
    setPrompt("")
  }

  const actionCards: ActionCard[] = [
    {
      id: "chat",
      title: "AI Чат",
      detail: "Размышляет. Анализирует. Отвечает глубоко.",
      icon: MessageSquare,
      image: CHAT_IMAGE,
      action: () => focusPrompt(""),
    },
    {
      id: "image",
      title: "Создать изображение",
      detail: "Премиум визуализация в 4K",
      icon: ImageIcon,
      image: IMAGE_IMAGE,
      action: () => focusPrompt("/image "),
    },
    {
      id: "video",
      title: "Сгенерировать видео",
      detail: "Киноуровень за минуты.",
      icon: Play,
      image: VIDEO_IMAGE,
      action: () => focusPrompt("/video "),
    },
    {
      id: "code",
      title: "Написать код",
      detail: "Тысячи строк. Без воды.",
      icon: Code2,
      image: CODE_IMAGE,
      action: () => props.onOpenCode ? props.onOpenCode() : focusPrompt("Напиши код: "),
    },
  ]

  const templates: TemplateCard[] = [
    { id: "ai-chat", title: "AI Chat", subtitle: "Умный ассистент", kind: "chat", prompt: "Создай AI Chat продукт с умным ассистентом" },
    { id: "crm", title: "CRM System", subtitle: "Управление клиентами", kind: "crm", prompt: "Создай AI CRM для малого бизнеса" },
    { id: "commerce", title: "E-commerce", subtitle: "Интернет-магазин", kind: "commerce", prompt: "Создай современный интернет-магазин с AI помощником" },
    { id: "analytics", title: "Analytics", subtitle: "Аналитика и инсайты", kind: "analytics", prompt: "Создай аналитическую панель с AI инсайтами" },
    { id: "booking", title: "Booking", subtitle: "Система бронирования", kind: "booking", prompt: "Создай систему бронирования с AI автоматизацией" },
  ]

  return (
    <main className="relative min-h-full bg-[#020303] px-4 pb-5 pt-4 text-white sm:px-5 lg:px-6">
      <section className="relative mx-auto w-full max-w-[1040px] overflow-hidden rounded-[22px] border border-[#d9a928]/12 bg-[#050606]">
        <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" loading="eager" decoding="async" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.7)_65%,#020303_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_50%,rgba(215,158,38,.18),transparent_22%)]" />

        <div className="relative flex min-h-[228px] flex-col items-center justify-center px-6 pb-5 pt-7 text-center sm:min-h-[242px]">
          <Crown className="mb-1 h-7 w-7 fill-[#d7aa2c]/15 text-[#e9bf3d] drop-shadow-[0_0_16px_rgba(229,178,50,.38)]" />
          <h1 className="text-[clamp(42px,6.2vw,76px)] font-black leading-none tracking-[.09em] text-transparent [background:linear-gradient(180deg,#ffffff_0%,#d8d8d8_48%,#8f9295_100%)] bg-clip-text drop-shadow-[0_7px_18px_rgba(0,0,0,.75)]">
            MALIK AI
          </h1>
          <p className="mt-1 text-[clamp(18px,2.2vw,28px)] font-semibold tracking-[.34em] text-[#efbf34]">TITAN</p>
          <p className="mt-3 max-w-[640px] text-[11px] leading-5 text-zinc-300 sm:text-[12px]">
            Ваш личный ИИ-ассистент. Создаёт. Анализирует. Автоматизирует.<br />Один интеллект — безграничные возможности.
          </p>
        </div>
      </section>

      <section className="relative mx-auto -mt-1 w-full max-w-[1040px] rounded-[24px] border border-[#d9a928]/40 bg-[#050606]/95 p-3 shadow-[0_0_34px_rgba(197,143,24,.13),inset_0_1px_0_rgba(255,230,145,.04)] sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d9a928]/20 bg-[#0b0b08] px-3 text-[10px] text-zinc-200">
            <Sparkles className="h-3.5 w-3.5 text-[#dfb32e]" />
            <span>MalikLLM75B</span>
            <ChevronDown className="h-3 w-3 text-zinc-600" />
          </button>

          <button type="button" onClick={() => setMode((value) => value === "Create" ? "Chat" : "Create")} className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d9a928]/20 bg-[#0b0b08] px-3 text-[10px] text-zinc-200">
            <Bot className="h-3.5 w-3.5 text-[#dfb32e]" />
            <span>{mode}</span>
            <ChevronDown className="h-3 w-3 text-zinc-600" />
          </button>

          <button type="button" onClick={() => setWebEnabled((value) => !value)} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] ${webEnabled ? "border-[#d9a928]/22 bg-[#0b0b08] text-zinc-200" : "border-white/[0.06] bg-[#070707] text-zinc-600"}`}>
            <Globe2 className="h-3.5 w-3.5 text-[#dfb32e]" />
            <span>Web</span>
            <ChevronDown className="h-3 w-3 text-zinc-600" />
          </button>

          <button type="button" onClick={() => setMemoryEnabled((value) => !value)} className={`ml-auto inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[10px] ${memoryEnabled ? "border-[#d9a928]/18 bg-[#0b0b08] text-zinc-200" : "border-white/[0.06] bg-[#070707] text-zinc-600"}`}>
            <MemoryStick className="h-3.5 w-3.5" />
            <span>Memory: {memoryEnabled ? "On" : "Off"}</span>
          </button>
        </div>

        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="Например: Создай AI CRM для малого бизнеса с премиальным тёмным интерфейсом, интеграцией Telegram и автоматизацией продаж...."
          className="mt-3 min-h-[94px] w-full resize-none rounded-[16px] border border-white/[0.045] bg-[#050606] px-4 py-4 text-[12px] leading-5 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-[#d9a928]/18"
        />

        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => focusPrompt(prompt)} title="Добавить вложение" className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.055] bg-[#0a0b0a] text-zinc-400 transition hover:border-[#d9a928]/15 hover:text-zinc-200"><Paperclip className="h-4 w-4" /></button>
          <button type="button" onClick={() => focusPrompt(prompt.startsWith("/image ") ? prompt : `/image ${prompt}`)} title="Изображение" className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.055] bg-[#0a0b0a] text-zinc-400 transition hover:border-[#d9a928]/15 hover:text-zinc-200"><ImageIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => props.onOpenCode ? props.onOpenCode() : focusPrompt("Напиши код: ")} title="Код" className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.055] bg-[#0a0b0a] text-zinc-400 transition hover:border-[#d9a928]/15 hover:text-zinc-200"><Code2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => focusPrompt(prompt)} title="Voice AI" className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.055] bg-[#0a0b0a] text-zinc-400 transition hover:border-[#d9a928]/15 hover:text-zinc-200"><Mic2 className="h-4 w-4" /></button>

          <button
            type="button"
            onClick={submit}
            disabled={!prompt.trim() || props.isLoading}
            className="ml-auto inline-flex h-10 min-w-[138px] items-center justify-center gap-2 rounded-[12px] border border-[#f0c547]/45 bg-gradient-to-r from-[#3b2b08] via-[#211a08] to-[#181204] px-5 text-[12px] font-semibold text-[#f1c84b] shadow-[inset_0_1px_0_rgba(255,236,169,.08),0_10px_22px_rgba(0,0,0,.25)] transition hover:border-[#f0c547]/70 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Sparkles className="h-4 w-4" />
            {props.isLoading ? "Создаю..." : "Создать"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      <section className="mx-auto mt-4 grid w-full max-w-[1040px] grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actionCards.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.id} type="button" onClick={card.action} className="group relative min-h-[142px] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#080909] text-left transition hover:-translate-y-0.5 hover:border-[#d9a928]/22">
              <img src={card.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-[.28] transition duration-300 group-hover:scale-[1.03] group-hover:opacity-[.36]" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050606] via-[#050606]/85 to-[#050606]/25" />
              <div className="relative flex min-h-[142px] flex-col p-4">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/30 text-zinc-100"><Icon className="h-4 w-4" /></span>
                <strong className="mt-auto text-[12px] font-semibold text-zinc-100">{card.title}</strong>
                <span className="mt-1 max-w-[160px] text-[9.5px] leading-4 text-zinc-500">{card.detail}</span>
                <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-[#e1b52f] transition group-hover:translate-x-1" />
              </div>
            </button>
          )
        })}
      </section>

      <section className="mx-auto mt-5 w-full max-w-[1040px]">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-[#dfb42f]" />
          <h2 className="text-[13px] font-semibold text-zinc-100">Популярные шаблоны</h2>
          <button type="button" onClick={props.onOpenTemplates} className="ml-auto inline-flex items-center gap-1 text-[9.5px] text-zinc-500 transition hover:text-[#dcb137]">Все шаблоны <ArrowRight className="h-3 w-3 text-[#dcb137]" /></button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => focusPrompt(template.prompt)} className="group overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#060707] p-2 text-left transition hover:border-[#d9a928]/18 hover:bg-[#080907]">
              <div className="h-[76px] overflow-hidden rounded-[10px] bg-[#090a0a] p-1"><TemplatePreview kind={template.kind} /></div>
              <div className="px-1 pb-1 pt-2.5">
                <strong className="block truncate text-[10.5px] font-medium text-zinc-200">{template.title}</strong>
                <span className="mt-1 block truncate text-[8.5px] text-zinc-600">{template.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <footer className="mx-auto mt-5 flex w-full max-w-[1040px] items-center justify-center gap-3 border-t border-white/[0.045] pt-3 text-[8.5px] text-zinc-700">
        <span>© MALIK AI — Sovereign Hub. Build the Future.</span>
        <span className="h-3 w-px bg-white/[0.06]" />
        <span className="font-semibold text-[#a98224]">v6.5 TITAN</span>
      </footer>
    </main>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
