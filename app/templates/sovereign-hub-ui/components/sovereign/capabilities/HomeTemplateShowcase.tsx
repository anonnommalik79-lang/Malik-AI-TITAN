"use client"

import type { ReactNode } from "react"
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ShoppingBag,
  UsersRound,
} from "lucide-react"
import type { Capability } from "@/lib/ai/capabilities/types"

type CapabilityHomeShowcaseProps = {
  onSelectCapability: (capability: Capability) => void
  onOpenCapabilities?: () => void
}

type TemplateKind = "chat" | "crm" | "store" | "analytics" | "booking"

type AppTemplate = {
  id: string
  title: string
  subtitle: string
  tag: string
  icon: ReactNode
  glow: string
  kind: TemplateKind
  capability: Capability
}

const TEMPLATES: AppTemplate[] = [
  {
    id: "ai-chat",
    title: "AI Chat",
    subtitle: "История диалогов, модели, файлы и streaming",
    tag: "POPULAR",
    icon: <Bot className="h-4 w-4" />,
    glow: "from-cyan-400/25 via-blue-500/10 to-transparent",
    kind: "chat",
    capability: {
      id: "template-ai-chat",
      title: "AI Chat application",
      category: "Code",
      description: "Полноценный AI-чат с историей, моделями, файлами и streaming.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "ai", "chat", "app"],
      promptTemplate:
        "Создай полноценное AI Chat приложение. Нужны: левый sidebar с историей чатов, новый чат, выбор модели, streaming ответа, markdown, copy/regenerate, загрузка файлов, адаптивный mobile UI, loading/error/empty состояния и аккуратная тёмная тема. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "crm",
    title: "CRM",
    subtitle: "Клиенты, сделки, pipeline и задачи",
    tag: "SALES",
    icon: <UsersRound className="h-4 w-4" />,
    glow: "from-emerald-400/20 via-teal-500/10 to-transparent",
    kind: "crm",
    capability: {
      id: "template-crm",
      title: "CRM application",
      category: "Code",
      description: "CRM для клиентов, сделок, pipeline и задач.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "crm", "sales", "app"],
      promptTemplate:
        "Создай полноценную CRM: список клиентов, карточка клиента, kanban pipeline сделок, задачи, заметки, поиск, фильтры, статусы, dashboard показателей и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "store",
    title: "Интернет-магазин",
    subtitle: "Каталог, корзина, checkout и профиль",
    tag: "COMMERCE",
    icon: <ShoppingBag className="h-4 w-4" />,
    glow: "from-violet-400/20 via-fuchsia-500/10 to-transparent",
    kind: "store",
    capability: {
      id: "template-store",
      title: "E-commerce application",
      category: "Code",
      description: "Рабочий интернет-магазин с каталогом, корзиной и checkout.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "commerce", "store", "app"],
      promptTemplate:
        "Создай полноценный интернет-магазин: каталог товаров, категории и фильтры, карточка товара, поиск, корзина, checkout, профиль пользователя, история заказов, empty/loading/error состояния и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "analytics",
    title: "Analytics",
    subtitle: "KPI, графики, таблицы и фильтры",
    tag: "DATA",
    icon: <BarChart3 className="h-4 w-4" />,
    glow: "from-amber-300/20 via-orange-500/10 to-transparent",
    kind: "analytics",
    capability: {
      id: "template-analytics",
      title: "Analytics application",
      category: "Code",
      description: "Аналитическая панель с графиками, KPI и таблицами.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "analytics", "dashboard", "app"],
      promptTemplate:
        "Создай полноценное analytics-приложение: KPI карточки, несколько графиков, таблица данных, фильтры по периоду, поиск, экспорт, loading/empty/error состояния и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "booking",
    title: "Бронирование",
    subtitle: "Календарь, слоты, клиенты и оплаты",
    tag: "BOOKING",
    icon: <CalendarDays className="h-4 w-4" />,
    glow: "from-sky-400/20 via-indigo-500/10 to-transparent",
    kind: "booking",
    capability: {
      id: "template-booking",
      title: "Booking application",
      category: "Code",
      description: "Сервис записи с календарём и управлением слотами.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "booking", "calendar", "app"],
      promptTemplate:
        "Создай полноценный сервис бронирования: календарь, доступные слоты, выбор услуги и специалиста, форма клиента, подтверждение записи, список бронирований, отмена/перенос, статусы и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
]

function AppWindow({ kind, large = false }: { kind: TemplateKind; large?: boolean }) {
  const shell = large ? "h-[210px]" : "h-[126px]"

  if (kind === "chat") {
    return (
      <div className={`${shell} grid grid-cols-[86px_1fr] overflow-hidden rounded-2xl border border-white/10 bg-[#080b12] shadow-2xl shadow-black/40`}>
        <div className="border-r border-white/10 bg-black/35 p-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/70" />
            <span className="h-2 w-7 rounded bg-white/20" />
          </div>
          <div className="mt-4 rounded-md bg-white/10 px-2 py-1.5 text-[7px] font-bold text-white/60">+ New chat</div>
          <div className="mt-3 space-y-2">
            <div className="h-1.5 rounded bg-white/10" />
            <div className="h-1.5 w-4/5 rounded bg-white/10" />
            <div className="h-1.5 w-3/5 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col p-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="h-2 w-16 rounded bg-white/20" />
            <div className="h-5 w-16 rounded-full border border-white/10 bg-white/5" />
          </div>
          <div className="flex flex-1 flex-col justify-end gap-2 py-3">
            <div className="ml-auto h-6 w-2/3 rounded-xl bg-white/10" />
            <div className="h-10 w-[82%] rounded-xl border border-cyan-300/10 bg-cyan-300/[0.06]" />
          </div>
          <div className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3">
            <div className="h-1.5 flex-1 rounded bg-white/10" />
            <div className="h-5 w-5 rounded-full bg-white/80" />
          </div>
        </div>
      </div>
    )
  }

  if (kind === "crm") {
    return (
      <div className={`${shell} rounded-2xl border border-white/10 bg-[#080b12] p-3 shadow-xl shadow-black/30`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2 w-20 rounded bg-white/20" />
          <div className="h-5 w-14 rounded-md bg-emerald-300/10" />
        </div>
        <div className="grid h-[calc(100%-20px)] grid-cols-3 gap-2">
          {["Новые", "В работе", "Закрыто"].map((label, index) => (
            <div key={label} className="rounded-lg border border-white/8 bg-black/25 p-2">
              <div className="text-[7px] font-bold text-white/40">{label}</div>
              <div className="mt-2 h-7 rounded-md border border-white/5 bg-white/[0.045]" />
              <div className={index === 1 ? "mt-2 h-7 rounded-md bg-emerald-300/10" : "mt-2 h-7 rounded-md bg-white/[0.035]"} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === "store") {
    return (
      <div className={`${shell} rounded-2xl border border-white/10 bg-[#080b12] p-3 shadow-xl shadow-black/30`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2 w-16 rounded bg-white/20" />
          <div className="h-5 w-20 rounded-full border border-white/10 bg-white/5" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-lg border border-white/8 bg-black/25 p-2">
              <div className={item === 1 ? "h-12 rounded-md bg-violet-300/10" : "h-12 rounded-md bg-white/[0.055]"} />
              <div className="mt-2 h-1.5 w-4/5 rounded bg-white/20" />
              <div className="mt-1.5 h-1.5 w-1/2 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === "analytics") {
    return (
      <div className={`${shell} grid grid-cols-[1.35fr_.65fr] gap-2 rounded-2xl border border-white/10 bg-[#080b12] p-3 shadow-xl shadow-black/30`}>
        <div className="flex items-end gap-1 rounded-lg border border-white/8 bg-black/25 p-2">
          {[32, 48, 38, 66, 54, 82, 70, 92].map((height, index) => (
            <div key={index} className="flex-1 rounded-t bg-amber-300/20" style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="grid grid-rows-3 gap-2">
          <div className="rounded-lg border border-white/8 bg-white/[0.045]" />
          <div className="rounded-lg border border-white/8 bg-white/[0.045]" />
          <div className="rounded-lg border border-white/8 bg-amber-300/[0.055]" />
        </div>
      </div>
    )
  }

  return (
    <div className={`${shell} grid grid-cols-[1fr_82px] gap-2 rounded-2xl border border-white/10 bg-[#080b12] p-3 shadow-xl shadow-black/30`}>
      <div className="grid grid-cols-5 gap-1 rounded-lg border border-white/8 bg-black/25 p-2">
        {Array.from({ length: 25 }).map((_, index) => (
          <div key={index} className={index === 12 || index === 18 ? "rounded bg-sky-300/25" : "rounded bg-white/[0.045]"} />
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-white/8 bg-black/25 p-2">
        <div className="h-2 rounded bg-white/20" />
        <div className="h-6 rounded bg-sky-300/10" />
        <div className="h-6 rounded bg-white/[0.045]" />
      </div>
    </div>
  )
}

function SmallTemplateCard({ template, onClick }: { template: AppTemplate; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-left shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.045]"
    >
      <div className={`bg-gradient-to-br ${template.glow} p-3`}>
        <AppWindow kind={template.kind} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-white/45">
            {template.icon}
            <span className="text-[9px] font-black tracking-[0.16em]">{template.tag}</span>
          </div>
          <h3 className="mt-1.5 truncate text-sm font-black text-white">{template.title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-white/35">{template.subtitle}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/45 transition group-hover:border-white/25 group-hover:text-white">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}

export function CapabilityHomeShowcase({ onSelectCapability }: CapabilityHomeShowcaseProps) {
  const featured = TEMPLATES[0]
  const secondary = TEMPLATES.slice(1)

  return (
    <section className="mx-auto mt-7 w-full max-w-6xl px-4 md:px-6" aria-label="Готовые приложения">
      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#05070b]/88 p-4 text-white shadow-[0_28px_100px_rgba(0,0,0,.48)] backdrop-blur-xl md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/45">MALIK AI · APP TEMPLATES</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.02em] md:text-2xl">Начни с готового приложения</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/35">Выбираешь структуру — MALIK AI сразу получает точный промпт на рабочий интерфейс.</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white/35">
            <Check className="h-3.5 w-3.5 text-emerald-300/70" />
            реальные экраны и состояния
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.12fr_.88fr]">
          <button
            type="button"
            onClick={() => onSelectCapability(featured.capability)}
            className="group relative overflow-hidden rounded-[22px] border border-cyan-200/15 bg-gradient-to-br from-cyan-400/[0.08] via-blue-500/[0.045] to-black/20 p-4 text-left shadow-[0_24px_80px_rgba(8,47,73,.16)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-100/25"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-cyan-100/55">
                  {featured.icon}
                  <span className="text-[9px] font-black tracking-[0.18em]">{featured.tag}</span>
                </div>
                <h3 className="mt-2 text-lg font-black tracking-[-0.02em]">{featured.title}</h3>
                <p className="mt-1 text-xs text-white/40">{featured.subtitle}</p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition group-hover:border-white/25 group-hover:text-white">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <AppWindow kind="chat" large />
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            {secondary.map((template) => (
              <SmallTemplateCard key={template.id} template={template} onClick={() => onSelectCapability(template.capability)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
