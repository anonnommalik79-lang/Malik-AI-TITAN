"use client"

import { memo, useRef, useState, type ComponentType } from "react"
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Code2,
  Crown,
  Globe2,
  Image as ImageIcon,
  MemoryStick,
  MessageSquare,
  Play,
  ShoppingBag,
  Sparkles,
  Users,
  Zap,
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

const HERO_IMAGE = unsplashPhoto("photo-1519681393784-d120267933ba", 1600)
const CHAT_IMAGE = unsplashPhoto("photo-1519681393784-d120267933ba", 700)
const IMAGE_IMAGE = unsplashPhoto("photo-1500530855697-b586d89ba3ee", 700)
const VIDEO_IMAGE = unsplashPhoto("photo-1485846234645-a62644f84728", 700)
const CODE_IMAGE = unsplashPhoto("photo-1555066931-4365d14bab8c", 700)

function TemplatePreview({ kind }: { kind: TemplateCard["kind"] }) {
  if (kind === "chat") {
    return (
      <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-[#070807] p-3">
        <div className="flex items-center gap-2 text-[8px] text-zinc-500">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-[#d7aa2d]/10 text-[#e8bc3d]">M</span>
          <span>Malik Assistant</span>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-2 text-[7px] leading-3 text-zinc-400">
          Как запустить продажи быстрее?
        </div>
        <div className="mt-2 ml-5 rounded-lg border border-[#d7aa2d]/12 bg-[#d7aa2d]/[0.055] px-2.5 py-2 text-[7px] leading-3 text-zinc-300">
          Соберу воронку и план запуска.
        </div>
      </div>
    )
  }

  if (kind === "crm") {
    return (
      <div className="h-full rounded-xl border border-white/[0.06] bg-[#070807] p-3">
        <div className="flex items-center justify-between text-[7px] text-zinc-500"><span>Pipeline</span><span className="text-[#e3b631]">₸ 12.4M</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Новые", "В работе", "Сделка"].map((label, index) => (
            <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
              <div className="text-[6px] text-zinc-600">{label}</div>
              <div className="mt-1 text-[10px] font-semibold text-zinc-200">{[18, 11, 7][index]}</div>
              <div className="mt-2 h-1 rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-[#d7aa2d]" style={{ width: `${[72, 48, 31][index]}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === "commerce") {
    return (
      <div className="h-full rounded-xl border border-white/[0.06] bg-[#070807] p-3">
        <div className="flex items-center justify-between"><span className="text-[8px] text-zinc-400">Store AI</span><ShoppingBag className="h-3 w-3 text-[#d7aa2d]" /></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Pro", "Air", "Max"].map((name, index) => (
            <div key={name} className="rounded-lg border border-white/[0.05] bg-[#0c0d0c] p-2 text-center">
              <div className={`mx-auto h-7 w-full rounded-md ${index === 1 ? "bg-[#4f3b12]" : "bg-[#181a18]"}`} />
              <div className="mt-1.5 text-[7px] text-zinc-400">{name}</div>
              <div className="text-[7px] text-[#dbaf31]">₸{[89, 129, 179][index]}k</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === "analytics") {
    return (
      <div className="relative h-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#070807] p-3">
        <div className="flex items-end justify-between"><div><div className="text-[7px] text-zinc-600">Revenue</div><div className="text-[12px] font-semibold text-zinc-100">+24.6%</div></div><BarChart3 className="h-4 w-4 text-[#d7aa2d]" /></div>
        <svg className="mt-2 h-12 w-full" viewBox="0 0 120 42" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 36 L18 28 L34 31 L50 19 L66 23 L82 12 L100 17 L120 5" fill="none" stroke="#d9ad2f" strokeWidth="2" />
          <path d="M0 36 L18 28 L34 31 L50 19 L66 23 L82 12 L100 17 L120 5 L120 42 L0 42 Z" fill="rgba(217,173,47,.08)" />
        </svg>
      </div>
    )
  }

  return (
    <div className="h-full rounded-xl border border-white/[0.06] bg-[#070807] p-3">
      <div className="flex items-center justify-between"><span className="text-[8px] text-zinc-400">Август 2026</span><CalendarDays className="h-3 w-3 text-[#d7aa2d]" /></div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }).map((_, item) => (
          <span key={item} className={`grid aspect-square place-items-center rounded text-[6px] ${item === 11 || item === 18 ? "bg-[#d7aa2d] font-semibold text-black" : "bg-white/[0.035] text-zinc-600"}`}>{item + 1}</span>
        ))}
      </div>
    </div>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<"Create" | "Chat">("Create")
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

  const actions: ActionCard[] = [
    { id: "chat", title: "AI Чат", detail: "Глубокий анализ и точные ответы", icon: MessageSquare, image: CHAT_IMAGE, action: () => focusPrompt("") },
    { id: "image", title: "Изображение", detail: "Премиум визуализация до 4K", icon: ImageIcon, image: IMAGE_IMAGE, action: () => focusPrompt("/image ") },
    { id: "video", title: "Видео", detail: "Кинематографичная генерация", icon: Play, image: VIDEO_IMAGE, action: () => focusPrompt("/video ") },
    { id: "code", title: "Код", detail: "Архитектура, функции, интерфейсы", icon: Code2, image: CODE_IMAGE, action: () => props.onOpenCode ? props.onOpenCode() : focusPrompt("Напиши код: ") },
  ]

  const templates: TemplateCard[] = [
    { id: "ai-chat", title: "AI Chat", subtitle: "Интеллектуальный ассистент", kind: "chat", prompt: "Создай премиальный AI Chat продукт с умным ассистентом" },
    { id: "crm", title: "CRM System", subtitle: "Продажи и клиенты", kind: "crm", prompt: "Создай AI CRM для малого бизнеса с воронкой продаж" },
    { id: "commerce", title: "E-commerce", subtitle: "AI интернет-магазин", kind: "commerce", prompt: "Создай премиальный интернет-магазин с AI помощником" },
    { id: "analytics", title: "Analytics", subtitle: "Метрики и инсайты", kind: "analytics", prompt: "Создай аналитическую панель с AI инсайтами" },
    { id: "booking", title: "Booking", subtitle: "Умное бронирование", kind: "booking", prompt: "Создай систему бронирования с AI автоматизацией" },
  ]

  const chipClass = "inline-flex h-8 items-center gap-2 rounded-xl border border-[#d9a928]/14 bg-[#090a08]/90 px-3 text-[10px] font-medium text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition-all duration-200 hover:border-[#d9a928]/30 hover:bg-[#111008] hover:text-white active:translate-y-px"

  return (
    <main className="titan-center relative min-h-full bg-[#020303] px-3 pb-6 pt-3 text-white sm:px-4 lg:px-5">
      <div className="mx-auto w-full max-w-[920px]">
        <section className="relative overflow-hidden rounded-[20px] border border-[#d9a928]/12 bg-[#050606] shadow-[0_24px_70px_rgba(0,0,0,.36)]">
          <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" loading="eager" decoding="async" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,3,3,.96)_0%,rgba(2,3,3,.68)_48%,rgba(2,3,3,.88)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(203,145,24,.16),transparent_22%)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d9a928]/35 to-transparent" />

          <div className="relative flex min-h-[166px] flex-col items-center justify-center px-5 py-5 text-center sm:min-h-[178px]">
            <Crown className="mb-1 h-5 w-5 fill-[#d7aa2d]/10 text-[#e3b630] drop-shadow-[0_0_14px_rgba(227,182,48,.34)]" />
            <h1 className="text-[clamp(36px,5vw,58px)] font-black leading-[.95] tracking-[.10em] text-[#f0d174] drop-shadow-[0_3px_14px_rgba(0,0,0,.9)]">
              MALIK AI
            </h1>
            <div className="mt-1 text-[clamp(13px,1.8vw,18px)] font-semibold tracking-[.46em] text-[#d9aa2a]">TITAN</div>
            <p className="mt-3 max-w-[590px] text-[10px] leading-[1.55] text-zinc-400 sm:text-[11px]">
              Ваш личный ИИ-ассистент. Создаёт. Анализирует. Автоматизирует.<br className="hidden sm:block" /> Один интеллект — безграничные возможности.
            </p>
          </div>
        </section>

        <section className="relative -mt-2 rounded-[20px] border border-[#d9a928]/28 bg-[#050606]/[0.98] p-3 shadow-[0_18px_55px_rgba(0,0,0,.52),0_0_28px_rgba(199,146,28,.055),inset_0_1px_0_rgba(255,236,168,.035)] sm:p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className={chipClass} title="Текущий AI Core">
              <Sparkles className="h-3.5 w-3.5 text-[#e0b22c]" />
              <span>MalikLLM75B</span>
            </div>

            <button type="button" onClick={() => setMode((value) => value === "Create" ? "Chat" : "Create")} className={chipClass}>
              <Bot className="h-3.5 w-3.5 text-[#e0b22c]" />
              <span>{mode}</span>
            </button>

            <button type="button" onClick={() => setWebEnabled((value) => !value)} aria-pressed={webEnabled} className={`${chipClass} ${webEnabled ? "border-[#d9a928]/24 text-zinc-200" : "opacity-55"}`}>
              <Globe2 className="h-3.5 w-3.5 text-[#e0b22c]" />
              <span>Web</span>
              <span className={`h-1.5 w-1.5 rounded-full ${webEnabled ? "bg-emerald-400" : "bg-zinc-700"}`} />
            </button>

            <button type="button" onClick={() => setMemoryEnabled((value) => !value)} aria-pressed={memoryEnabled} className={`${chipClass} ml-auto ${memoryEnabled ? "border-[#d9a928]/24" : "opacity-55"}`}>
              <MemoryStick className="h-3.5 w-3.5 text-[#c9a54a]" />
              <span>Memory: {memoryEnabled ? "On" : "Off"}</span>
            </button>
          </div>

          <div className="mt-2.5 overflow-hidden rounded-[15px] border border-white/[0.055] bg-[#080909] shadow-[inset_0_1px_0_rgba(255,255,255,.018)] focus-within:border-[#d9a928]/28 focus-within:shadow-[0_0_0_1px_rgba(217,169,40,.045),inset_0_1px_0_rgba(255,255,255,.02)]">
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
              placeholder="Например: Создай AI CRM для малого бизнеса с премиальным тёмным интерфейсом и автоматизацией продаж…"
              className="min-h-[76px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[11px] leading-5 text-zinc-200 outline-none placeholder:text-zinc-650 sm:min-h-[82px]"
            />

            <div className="flex items-center gap-1.5 border-t border-white/[0.035] px-2.5 py-2">
              <button type="button" onClick={() => focusPrompt(prompt.startsWith("/image ") ? prompt : `/image ${prompt}`)} title="Режим изображения" className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-zinc-500 transition-all duration-200 hover:border-[#d9a928]/14 hover:bg-[#d9a928]/[0.055] hover:text-[#e2b731] active:scale-95"><ImageIcon className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => props.onOpenCode ? props.onOpenCode() : focusPrompt("Напиши код: ")} title="Открыть код" className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-zinc-500 transition-all duration-200 hover:border-[#d9a928]/14 hover:bg-[#d9a928]/[0.055] hover:text-[#e2b731] active:scale-95"><Code2 className="h-3.5 w-3.5" /></button>
              <div className="ml-1 hidden text-[9px] text-zinc-700 sm:block">Enter — отправить · Shift+Enter — новая строка</div>

              <button
                type="button"
                disabled={!prompt.trim() || props.isLoading}
                onClick={submit}
                className="group ml-auto inline-flex h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#f0c545]/30 bg-[linear-gradient(180deg,#e9bd42_0%,#bd8b1d_100%)] px-4 text-[10px] font-bold text-[#171006] shadow-[0_7px_22px_rgba(191,137,24,.18),inset_0_1px_0_rgba(255,246,196,.35)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_10px_28px_rgba(191,137,24,.25),inset_0_1px_0_rgba(255,246,196,.4)] active:translate-y-px active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{props.isLoading ? "Думаю…" : "Создать"}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {actions.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className="group relative min-h-[112px] overflow-hidden rounded-[16px] border border-white/[0.065] bg-[#070807] p-3 text-left shadow-[0_14px_35px_rgba(0,0,0,.22)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d9a928]/26 hover:shadow-[0_18px_42px_rgba(0,0,0,.34),0_0_18px_rgba(217,169,40,.045)] active:translate-y-0 active:scale-[.99]"
              >
                <img src={item.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-[.16] transition duration-300 group-hover:scale-[1.035] group-hover:opacity-[.22]" />
                <div className="absolute inset-0 bg-[linear-gradient(110deg,#060706_18%,rgba(6,7,6,.86)_62%,rgba(6,7,6,.42)_100%)]" />
                <div className="relative flex h-full flex-col">
                  <div className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] bg-black/35 text-zinc-300 transition group-hover:border-[#d9a928]/25 group-hover:text-[#e2b52e]"><Icon className="h-4 w-4" /></div>
                  <div className="mt-3 text-[11px] font-semibold text-zinc-100">{item.title}</div>
                  <div className="mt-1 pr-4 text-[8.5px] leading-4 text-zinc-600 group-hover:text-zinc-500">{item.detail}</div>
                  <ArrowRight className="absolute bottom-0 right-0 h-3.5 w-3.5 text-[#c99c28] transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )
          })}
        </section>

        <section className="mt-3.5">
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <Crown className="h-3.5 w-3.5 text-[#d7aa2d]" />
            <h2 className="text-[11px] font-semibold text-zinc-200">Популярные шаблоны</h2>
            <button type="button" onClick={props.onOpenTemplates} className="ml-auto inline-flex items-center gap-1 text-[8.5px] text-zinc-600 transition hover:text-[#dcb239]">Все шаблоны <ArrowRight className="h-3 w-3" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => focusPrompt(template.prompt)}
                className="group overflow-hidden rounded-[15px] border border-white/[0.06] bg-[#050606] p-2 text-left shadow-[0_12px_30px_rgba(0,0,0,.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d9a928]/22 hover:bg-[#070807] active:translate-y-0"
              >
                <div className="h-[84px] overflow-hidden rounded-xl"><TemplatePreview kind={template.kind} /></div>
                <div className="px-1 pb-1 pt-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-zinc-300 group-hover:text-white">{template.title}</span><ArrowRight className="h-3 w-3 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-[#d7aa2d]" /></div>
                  <div className="mt-0.5 truncate text-[7.5px] text-zinc-700">{template.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <footer className="mt-4 flex items-center justify-center gap-2 border-t border-white/[0.035] py-3 text-[7px] text-zinc-800">
          <Users className="h-3 w-3" />
          <span>MALIK AI · TITAN workspace</span>
        </footer>
      </div>
    </main>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
