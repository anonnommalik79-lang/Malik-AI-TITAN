"use client"

import type { ReactNode } from "react"
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Headphones,
  ShoppingBag,
  UsersRound,
} from "lucide-react"
import type { Capability } from "@/lib/ai/capabilities/types"

type CapabilityHomeShowcaseProps = {
  onSelectCapability: (capability: Capability) => void
  onOpenCapabilities?: () => void
}

type AppTemplate = {
  id: string
  title: string
  subtitle: string
  tag: string
  icon: ReactNode
  accent: string
  capability: Capability
  preview: "chat" | "store" | "crm" | "analytics" | "booking" | "support"
}

const APP_TEMPLATES: AppTemplate[] = [
  {
    id: "ai-chat",
    title: "AI Chat",
    subtitle: "История, модели, файлы, streaming",
    tag: "AI",
    icon: <Bot className="h-4 w-4" />,
    accent: "from-cyan-400/20 via-blue-500/10 to-transparent",
    preview: "chat",
    capability: {
      id: "template-ai-chat",
      title: "AI Chat application",
      category: "Code",
      description: "Полноценный AI-чат с историей, моделями, файлами и streaming.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "ai", "chat", "app"],
      promptTemplate:
        "Создай полноценное AI Chat приложение, не лендинг. Нужны: левый sidebar с историей чатов, новый чат, выбор модели, streaming ответа, markdown, copy/regenerate, загрузка файлов, адаптивный mobile UI и рабочие состояния loading/error/empty. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "commerce",
    title: "Интернет-магазин",
    subtitle: "Каталог, корзина, checkout, профиль",
    tag: "SHOP",
    icon: <ShoppingBag className="h-4 w-4" />,
    accent: "from-violet-400/20 via-fuchsia-500/10 to-transparent",
    preview: "store",
    capability: {
      id: "template-commerce",
      title: "E-commerce application",
      category: "Code",
      description: "Рабочий интернет-магазин с каталогом, корзиной и checkout.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "ecommerce", "store", "app"],
      promptTemplate:
        "Создай полноценный интернет-магазин, не лендинг. Нужны: каталог товаров, категории и фильтры, карточка товара, поиск, корзина, checkout, профиль пользователя, история заказов, состояния empty/loading/error и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "crm",
    title: "CRM",
    subtitle: "Клиенты, сделки, pipeline, задачи",
    tag: "CRM",
    icon: <UsersRound className="h-4 w-4" />,
    accent: "from-emerald-400/20 via-teal-500/10 to-transparent",
    preview: "crm",
    capability: {
      id: "template-crm",
      title: "CRM application",
      category: "Code",
      description: "CRM для клиентов, сделок, pipeline и задач.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "crm", "sales", "app"],
      promptTemplate:
        "Создай полноценную CRM, не лендинг. Нужны: список клиентов, карточка клиента, kanban pipeline сделок, задачи, заметки, поиск, фильтры, статусы, dashboard показателей и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "analytics",
    title: "Analytics",
    subtitle: "Метрики, графики, таблицы, фильтры",
    tag: "DATA",
    icon: <BarChart3 className="h-4 w-4" />,
    accent: "from-amber-300/20 via-orange-500/10 to-transparent",
    preview: "analytics",
    capability: {
      id: "template-analytics",
      title: "Analytics dashboard application",
      category: "Code",
      description: "Рабочая аналитическая панель с графиками и таблицами.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "analytics", "dashboard", "app"],
      promptTemplate:
        "Создай полноценное analytics-приложение, не лендинг. Нужны: KPI карточки, несколько графиков, таблица данных, фильтры по периоду, поиск, экспорт, loading/empty/error состояния и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "booking",
    title: "Бронирование",
    subtitle: "Календарь, слоты, клиенты, оплаты",
    tag: "BOOK",
    icon: <CalendarDays className="h-4 w-4" />,
    accent: "from-sky-400/20 via-indigo-500/10 to-transparent",
    preview: "booking",
    capability: {
      id: "template-booking",
      title: "Booking application",
      category: "Code",
      description: "Сервис записи с календарём и управлением слотами.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "booking", "calendar", "app"],
      promptTemplate:
        "Создай полноценный сервис бронирования, не лендинг. Нужны: календарь, доступные слоты, выбор услуги и специалиста, форма клиента, подтверждение записи, список бронирований, отмена/перенос, статусы и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
  {
    id: "support",
    title: "Support Desk",
    subtitle: "Тикеты, очередь, чат, SLA",
    tag: "HELP",
    icon: <Headphones className="h-4 w-4" />,
    accent: "from-rose-400/20 via-red-500/10 to-transparent",
    preview: "support",
    capability: {
      id: "template-support",
      title: "Support desk application",
      category: "Code",
      description: "Система поддержки с тикетами, чатами и очередями.",
      suggestedMode: "code",
      riskLevel: "low",
      tags: ["template", "support", "tickets", "app"],
      promptTemplate:
        "Создай полноценный Support Desk, не лендинг. Нужны: очередь тикетов, статусы и приоритеты, карточка обращения, чат с клиентом, назначение агента, SLA-индикаторы, поиск, фильтры и адаптивный интерфейс. Используй текущий стек проекта. {{input}}",
    },
  },
]

function MiniPreview({ kind }: { kind: AppTemplate["preview"] }) {
  if (kind === "chat") {
    return (
      <div className="grid h-full grid-cols-[54px_1fr] gap-2">
        <div className="rounded-lg border border-white/8 bg-black/45 p-2">
          <div className="h-2 w-7 rounded bg-white/20" />
          <div className="mt-3 space-y-2">
            <div className="h-1.5 rounded bg-white/10" />
            <div className="h-1.5 rounded bg-white/10" />
            <div className="h-1.5 w-4/5 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2 rounded-lg border border-white/8 bg-black/35 p-2">
          <div className="ml-auto h-5 w-2/3 rounded-md bg-white/12" />
          <div className="h-7 w-5/6 rounded-md bg-cyan-300/10" />
          <div className="h-5 rounded-md border border-white/10 bg-white/5" />
        </div>
      </div>
    )
  }

  if (kind === "store") {
    return (
      <div className="grid h-full grid-cols-3 gap-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-lg border border-white/8 bg-black/35 p-2">
            <div className="h-12 rounded-md bg-white/10" />
            <div className="mt-2 h-2 w-4/5 rounded bg-white/20" />
            <div className="mt-2 h-1.5 w-1/2 rounded bg-white/10" />
          </div>
        ))}
      </div>
    )
  }

  if (kind === "crm") {
    return (
      <div className="grid h-full grid-cols-3 gap-2">
        {["Новые", "В работе", "Готово"].map((label, index) => (
          <div key={label} className="rounded-lg border border-white/8 bg-black/35 p-2">
            <div className="text-[7px] font-bold text-white/45">{label}</div>
            <div className="mt-2 h-6 rounded bg-white/10" />
            <div className="mt-2 h-6 rounded bg-white/7" />
            {index === 1 ? <div className="mt-2 h-6 rounded bg-emerald-300/10" /> : null}
          </div>
        ))}
      </div>
    )
  }

  if (kind === "analytics") {
    return (
      <div className="grid h-full grid-cols-[1.35fr_.65fr] gap-2">
        <div className="flex items-end gap-1 rounded-lg border border-white/8 bg-black/35 p-2">
          {[34, 52, 28, 70, 46, 82, 60].map((height, index) => (
            <div key={index} className="flex-1 rounded-t bg-amber-300/20" style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-[30%] rounded-lg border border-white/8 bg-white/7" />
          <div className="h-[30%] rounded-lg border border-white/8 bg-white/7" />
          <div className="h-[30%] rounded-lg border border-white/8 bg-white/7" />
        </div>
      </div>
    )
  }

  if (kind === "booking") {
    return (
      <div className="grid h-full grid-cols-[1fr_72px] gap-2">
        <div className="grid grid-cols-5 gap-1 rounded-lg border border-white/8 bg-black/35 p-2">
          {Array.from({ length: 20 }).map((_, index) => (
            <div key={index} className={index === 12 ? "rounded bg-sky-300/25" : "rounded bg-white/7"} />
          ))}
        </div>
        <div className="space-y-2 rounded-lg border border-white/8 bg-black/35 p-2">
          <div className="h-2 rounded bg-white/20" />
          <div className="h-5 rounded bg-sky-300/10" />
          <div className="h-5 rounded bg-white/7" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[78px_1fr] gap-2">
      <div className="space-y-2 rounded-lg border border-white/8 bg-black/35 p-2">
        <div className="h-5 rounded bg-rose-300/12" />
        <div className="h-5 rounded bg-white/7" />
        <div className="h-5 rounded bg-white/7" />
      </div>
      <div className="rounded-lg border border-white/8 bg-black/35 p-2">
        <div className="h-2 w-1/3 rounded bg-white/20" />
        <div className="mt-3 h-5 w-4/5 rounded bg-white/8" />
        <div className="mt-2 h-8 rounded bg-rose-300/8" />
      </div>
    </div>
  )
}

export function CapabilityHomeShowcase({ onSelectCapability }: CapabilityHomeShowcaseProps) {
  return (
    <section className="mx-auto mt-7 w-full max-w-6xl px-4 md:px-6" aria-label="Готовые приложения">
      <div className="rounded-2xl border border-white/10 bg-[#05070c]/92 p-4 text-white shadow-[0_24px_90px_rgba(0,0,0,.45)] backdrop-blur-md md:p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Шаблоны приложений</p>
            <h2 className="mt-1 text-xl font-black md:text-2xl">Выбери готовую структуру</h2>
          </div>
          <span className="hidden text-xs font-semibold text-white/30 sm:block">без лендингов</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {APP_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectCapability(template.capability)}
              className="group overflow-hidden rounded-xl border border-white/10 bg-black/35 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.045]"
            >
              <div className={`relative h-28 overflow-hidden border-b border-white/8 bg-gradient-to-br ${template.accent} p-3`}>
                <MiniPreview kind={template.preview} />
              </div>
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-white/55">
                      {template.icon}
                      <span className="text-[10px] font-black tracking-[0.14em]">{template.tag}</span>
                    </div>
                    <h3 className="mt-2 text-[15px] font-black text-white">{template.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-white/45">{template.subtitle}</p>
                  </div>
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition group-hover:border-white/20 group-hover:text-white">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
