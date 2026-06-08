"use client"

import type { ReactNode } from "react"

type FinalIntelligenceHomeProps = {
  onPrompt?: (prompt: string) => void
}

const metricCards = [
  { icon: "✣", label: "Активные модели", value: "12", text: "Работают синхронно", delta: "+3 новых сегодня", tone: "violet" },
  { icon: "◎", label: "Точность", value: "98.7%", text: "Средняя точность ответов", delta: "+2.1% с прошлой недели", tone: "purple" },
  { icon: "⌁", label: "Сессии", value: "1,248", text: "Активные сессии", delta: "+18% с прошлой недели", tone: "blue" },
  { icon: "◔", label: "Скорость ответа", value: "1.42s", text: "Среднее время ответа", delta: "-12% быстрее", tone: "amber" },
] as const

const leftNodes = [
  ["GPT-4o", "Язык и рассуждения", "✺"],
  ["Vision Model", "Анализ изображений", "◉"],
  ["Code Interpreter", "Код и вычисления", "</>"],
] as const

const rightNodes = [
  ["Web Search", "Поиск и верификация", "◎"],
  ["Memory Layer", "Память и контекст", "▣"],
  ["Smart Routing", "Выбор лучшей модели", "⌬"],
] as const

const memories = [
  ["Анализ рынка AI-инструментов", "2 мин назад"],
  ["План запуска продукта v2.0", "15 мин назад"],
  ["Исследование конкурентов Q2", "1 ч назад"],
  ["Стратегия контента на июнь", "3 ч назад"],
  ["Финансовая модель проекта", "1 дн назад"],
] as const

const insights = [
  ["⌁", "Модельный оркестратор повысил точность на 2.1% за счёт динамической маршрутизации."],
  ["✺", "Наиболее эффективен режим Reasoning для сложных аналитических задач."],
  ["◉", "Рекомендуем добавить больше источников в проект для повышения качества ответов."],
  ["ϟ", "Время ответа оптимизировано: -12% быстрее чем на прошлой неделе."],
] as const

const bottomCards = [
  { title: "AI Planner", text: "Планируйте задачи и проекты с помощью ИИ.", button: "Открыть Planner", visual: "calendar" },
  { title: "Knowledge Memory", text: "Управляйте знаниями и создавайте базу знаний.", button: "Открыть Memory", visual: "cube" },
  { title: "Reasoning Sessions", text: "История сессий и логика рассуждений моделей.", button: "Открыть Sessions", visual: "network" },
  { title: "Prompt Optimizer", text: "Оптимизируйте промпты для лучших результатов.", button: "Открыть Optimizer", visual: "optimizer" },
] as const

const intelligenceTopbarItems = [
  { icon: "✣", label: "Malik AI Jarvis", prompt: "Open Malik AI Jarvis planning mode" },
  { icon: "ϟ", label: "High-Speed queue", prompt: "Open the high-speed answer queue" },
  { icon: "⌘", label: "Malik Ask", prompt: "Open Malik Ask" },
  { icon: "⌕", label: "Craft & Search", prompt: "Open craft and search workflow" },
  { icon: "↯", label: "API 2.0", prompt: "Open API 2.0 cockpit" },
  { icon: "✧", label: "Create AI flow", prompt: "Create an AI flow" },
  { icon: "⟡", label: "Deploy", prompt: "Open deploy workflow" },
  { icon: ">_", label: "Malik Codex", prompt: "Open Malik Codex" },
  { icon: "✣", label: "Creator Mode: ON", prompt: "Switch to creator mode" },
] as const

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "fi-glass-card relative overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/82 shadow-[0_18px_70px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_20%_0%,rgba(96,165,250,.12),transparent_34%),radial-gradient(circle_at_80%_100%,rgba(124,58,237,.10),transparent_36%)]",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </section>
  )
}

function IconBubble({
  children,
  tone = "violet",
}: {
  children: ReactNode
  tone?: "violet" | "purple" | "blue" | "amber" | "cyan"
}) {
  const tones = {
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-200 shadow-[0_0_26px_rgba(139,92,246,.24)]",
    purple: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_26px_rgba(217,70,239,.20)]",
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-100 shadow-[0_0_26px_rgba(59,130,246,.22)]",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100 shadow-[0_0_26px_rgba(245,158,11,.18)]",
    cyan: "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,.20)]",
  } as const

  return (
    <div className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-xl font-black", tones[tone])}>
      {children}
    </div>
  )
}

function MetricCard({ item }: { item: (typeof metricCards)[number] }) {
  return (
    <GlassCard className="fi-metric-card min-h-[104px]">
      <div className="flex items-center gap-4 p-4">
        <IconBubble tone={item.tone}>{item.icon}</IconBubble>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-300">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{item.value}</p>
          <p className="mt-1 text-[12px] text-slate-400">{item.text}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-emerald-400">{item.delta}</p>
        </div>
      </div>
    </GlassCard>
  )
}

function ModelNode({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <div className="fi-model-node relative z-20 flex min-h-[62px] items-center gap-3 rounded-2xl border border-slate-700/70 bg-[#07101e]/92 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,.28)]">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-sm font-black text-violet-100">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-emerald-400">● Активен</p>
      </div>
    </div>
  )
}

function OrchestratorPanel() {
  return (
    <GlassCard className="fi-orchestrator-card min-h-[330px] xl:col-span-7">
      <div className="flex items-start justify-between gap-4 p-5 pb-2">
        <div>
          <h3 className="font-serif text-xl font-semibold text-white">Модельный оркестратор</h3>
          <p className="mt-1 text-sm text-slate-400">Динамическая маршрутизация между лучшими ИИ-моделями.</p>
        </div>
        <div className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1 text-[11px] font-semibold text-emerald-300">
          ● Оркестратор активен
        </div>
      </div>

      <div className="fi-orchestrator-map relative mx-auto grid min-h-[248px] max-w-[820px] grid-cols-[1fr_180px_1fr] items-center gap-6 px-5 pb-5">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-90" viewBox="0 0 820 260" preserveAspectRatio="none">
          <defs>
            <linearGradient id="fiLine" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(34,211,238,.25)" />
              <stop offset="50%" stopColor="rgba(139,92,246,.95)" />
              <stop offset="100%" stopColor="rgba(34,211,238,.25)" />
            </linearGradient>
            <filter id="fiGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path d="M190 58 C270 58 270 130 355 130" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />
          <path d="M190 130 C270 130 270 130 355 130" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />
          <path d="M190 202 C270 202 270 130 355 130" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />

          <path d="M465 130 C550 130 550 58 630 58" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />
          <path d="M465 130 C550 130 550 130 630 130" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />
          <path d="M465 130 C550 130 550 202 630 202" stroke="url(#fiLine)" strokeWidth="3" fill="none" filter="url(#fiGlow)" />

          {[190, 355, 465, 630].map((x) => (
            <circle key={x} cx={x} cy="130" r="4" fill="rgba(216,180,254,.95)" filter="url(#fiGlow)" />
          ))}
        </svg>

        <div className="space-y-5">
          {leftNodes.map(([title, subtitle, icon]) => (
            <ModelNode key={title} title={title} subtitle={subtitle} icon={icon} />
          ))}
        </div>

        <div className="relative z-20 flex flex-col items-center">
          <div className="grid h-24 w-24 place-items-center rounded-3xl border border-violet-300/40 bg-[radial-gradient(circle_at_50%_35%,rgba(139,92,246,.52),rgba(30,41,59,.38)_58%,rgba(2,6,23,.92))] text-5xl text-violet-100 shadow-[0_0_44px_rgba(139,92,246,.55)]">
            ⬡
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Orchestrator</p>
          <p className="text-[12px] text-slate-400">Интеллектуальный роутинг</p>
        </div>

        <div className="space-y-5">
          {rightNodes.map(([title, subtitle, icon]) => (
            <ModelNode key={title} title={title} subtitle={subtitle} icon={icon} />
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

function ContextMemoryPanel({ onPrompt }: FinalIntelligenceHomeProps) {
  return (
    <GlassCard className="fi-context-card min-h-[330px] xl:col-span-5">
      <div className="p-5">
        <h3 className="font-serif text-xl font-semibold text-white">Контекст и память</h3>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-2xl border border-slate-700/70 bg-[#07101e]/78 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Недавняя память</p>
              <button type="button" onClick={() => onPrompt?.("Покажи всю сохранённую память проекта")} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300">Смотреть все</button>
            </div>

            <div className="space-y-2.5">
              {memories.map(([title, time]) => (
                <div key={title} className="flex items-center justify-between gap-3 text-[12px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-blue-500/15 text-blue-300">▣</span>
                    <span className="truncate text-slate-300">{title}</span>
                  </div>
                  <span className="shrink-0 text-slate-500">{time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-[#07101e]/78 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Контекст проекта</p>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200">TechNova Launch</span>
            </div>

            {[
              ["Цель", "Запуск AI-платформы"],
              ["Дедлайн", "30 июня 2025"],
              ["Приоритет", "Высокий"],
              ["Участники", "7 человек"],
            ].map(([label, value]) => (
              <div key={label} className="mb-2 grid grid-cols-[80px_1fr] items-center gap-2 text-[12px]">
                <span className="rounded-lg bg-white/[0.04] px-2 py-1 text-slate-500">{label}</span>
                <span className="text-slate-300">{value}</span>
              </div>
            ))}

            <button type="button" onClick={() => onPrompt?.("Открой текущий проект TechNova Launch")} className="mt-3 w-full rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-100">
              Открыть проект
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-700/70 bg-[#07101e]/70 p-4">
          <div className="flex items-center justify-between text-[12px] text-slate-400">
            <span>Живой контекст</span>
            <span>82,541 / 200,000</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800">
            <div className="h-full w-[41%] rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-300 shadow-[0_0_18px_rgba(139,92,246,.45)]" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <p className="text-slate-500">Обновляется</p>
              <p className="font-semibold text-white">в реальном времени</p>
            </div>
            <div>
              <p className="text-slate-500">Использование</p>
              <p className="font-semibold text-white">41%</p>
            </div>
            <div>
              <p className="text-slate-500">Источники</p>
              <p className="font-semibold text-white">24</p>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

function ThinkingModes({ onPrompt }: FinalIntelligenceHomeProps) {
  const modes = [
    ["Reasoning", "Глубокие рассуждения", "◎", true],
    ["Planning", "Планирование и стратегии", "▣", false],
    ["Deep analysis", "Глубокий анализ данных", "△", false],
    ["Fast answer", "Быстрые ответы", "ϟ", false],
  ] as const

  return (
    <GlassCard className="fi-thinking-card xl:col-span-7">
      <div className="p-5">
        <h3 className="font-serif text-xl font-semibold text-white">Режимы мышления</h3>
        <p className="mt-1 text-sm text-slate-400">Выберите режим, соответствующий вашей задаче.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {modes.map(([title, text, icon, active]) => (
            <button
              key={title}
              type="button"
              onClick={() => onPrompt?.(`Переключи режим мышления на ${title}`)}
              className={cx(
                "fi-mode-card group flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                active
                  ? "border-violet-400/45 bg-violet-500/20 shadow-[0_0_30px_rgba(139,92,246,.30)]"
                  : "border-slate-700/70 bg-[#07101e]/75 hover:border-blue-400/30",
              )}
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-100">{icon}</span>
              <span>
                <span className="block text-sm font-semibold text-white">{title}</span>
                <span className="block text-[11px] text-slate-400">{text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

function InsightsPanel() {
  return (
    <GlassCard className="fi-insights-card xl:col-span-5">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-semibold text-white">Инсайты</h3>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">Сгенерировано ИИ</span>
        </div>

        <div className="mt-4 space-y-3">
          {insights.map(([icon, text]) => (
            <div key={text} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <span className="text-base text-violet-300">{icon}</span>
              <p className="text-sm leading-relaxed text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

function BottomVisual({ type }: { type: string }) {
  if (type === "calendar") {
    return (
      <div className="grid h-28 w-40 grid-cols-5 gap-1 rounded-2xl border border-blue-400/15 bg-black/25 p-3">
        {Array.from({ length: 20 }).map((_, index) => (
          <span key={index} className={cx("rounded bg-slate-800/80", index === 7 || index === 8 || index === 13 ? "bg-violet-500/80 shadow-[0_0_14px_rgba(139,92,246,.55)]" : "")} />
        ))}
      </div>
    )
  }

  if (type === "cube") {
    return (
      <div className="relative h-28 w-44">
        <div className="absolute left-8 top-8 h-16 w-28 rotate-[-28deg] rounded-xl border border-cyan-300/30 bg-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,.32)]" />
        <div className="absolute left-14 top-2 h-16 w-28 rotate-[-28deg] rounded-xl border border-violet-300/30 bg-violet-500/25 shadow-[0_0_40px_rgba(139,92,246,.35)]" />
        <div className="absolute left-20 top-[-8px] h-14 w-14 rotate-45 rounded-xl border border-blue-200/30 bg-cyan-400/20" />
      </div>
    )
  }

  if (type === "network") {
    return (
      <svg className="h-28 w-44" viewBox="0 0 180 110" fill="none">
        <path d="M28 78L70 28L116 84L146 26M70 28L146 26M70 28L96 54M96 54L116 84M96 54L146 26" stroke="rgba(139,92,246,.75)" strokeWidth="2" />
        {[28, 70, 116, 146, 96].map((x, i) => (
          <circle key={x} cx={x} cy={[78, 28, 84, 26, 54][i]} r="5" fill="rgb(167 139 250)" filter="drop-shadow(0 0 8px rgb(139 92 246))" />
        ))}
      </svg>
    )
  }

  return (
    <div className="h-28 w-44 rounded-2xl border border-violet-400/15 bg-black/35 p-3">
      <div className="mb-2 h-2 w-28 rounded bg-pink-400/50" />
      <div className="mb-2 h-2 w-36 rounded bg-cyan-400/40" />
      <div className="mb-4 h-2 w-24 rounded bg-violet-400/45" />
      <p className="text-[10px] text-slate-500">Optimization Score</p>
      <div className="mt-1 h-2 rounded bg-slate-800">
        <div className="h-full w-[92%] rounded bg-gradient-to-r from-violet-500 to-cyan-300" />
      </div>
      <p className="mt-1 text-right text-[11px] font-bold text-cyan-200">92%</p>
    </div>
  )
}

function BottomCard({ card }: { card: (typeof bottomCards)[number] }) {
  return (
    <GlassCard className="fi-bottom-card min-h-[150px]">
      <div className="grid h-full grid-cols-[1fr_auto] gap-4 p-5">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-serif text-xl font-semibold text-white">{card.title}</h3>
          <p className="mt-2 max-w-[230px] text-sm leading-relaxed text-slate-400">{card.text}</p>
          <span className="mt-auto w-fit rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100">
            {card.button} →
          </span>
        </div>
        <div className="hidden opacity-85 md:block">
          <BottomVisual type={card.visual} />
        </div>
      </div>
    </GlassCard>
  )
}

export function FinalIntelligenceHome({ onPrompt }: FinalIntelligenceHomeProps) {
  return (
    <main className="final-intelligence-home relative min-h-[calc(100vh-72px)] overflow-hidden rounded-[1.2rem] bg-[#020611] px-4 py-4 text-white md:px-6">
      <div className="fi-aura-layer pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_2%,rgba(88,28,135,.18),transparent_34%),radial-gradient(circle_at_0%_55%,rgba(37,99,235,.13),transparent_34%),linear-gradient(180deg,rgba(15,23,42,.36),rgba(2,6,23,.92))]" />
      <div className="fi-grid-layer pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(148,163,184,.38)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.38)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="fi-topbar" aria-label="Final Intelligence shortcuts">
        {intelligenceTopbarItems.map((item) => (
          <button key={item.label} type="button" onClick={() => onPrompt?.(item.prompt)}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="fi-topbar-status" aria-hidden="true">
        <span>♢</span>
        <span>♛ 4,460</span>
        <span>M</span>
      </div>

      <section className="final-intelligence-inner relative z-10 mx-auto max-w-[1540px] space-y-4">
        <header className="fi-header flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-white md:text-4xl">Final Intelligence</h1>
            <p className="mt-1 text-sm text-slate-400">ИИ нового поколения для планирования, анализа и сверхточных ответов.</p>
          </div>

          <button type="button" onClick={() => onPrompt?.("Открой настройки панели Final Intelligence")} className="rounded-xl border border-slate-700/70 bg-[#07101e]/80 px-4 py-2 text-sm font-semibold text-slate-200 shadow-[0_12px_36px_rgba(0,0,0,.25)]">
            ⚙ Настроить панель
          </button>
        </header>

        <section className="fi-metric-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((item) => (
            <MetricCard key={item.label} item={item} />
          ))}
        </section>

        <section className="fi-main-grid grid gap-4 xl:grid-cols-12">
          <OrchestratorPanel />
          <ContextMemoryPanel onPrompt={onPrompt} />
        </section>

        <section className="fi-secondary-grid grid gap-4 xl:grid-cols-12">
          <ThinkingModes onPrompt={onPrompt} />
          <InsightsPanel />
        </section>

        <section className="fi-bottom-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {bottomCards.map((card) => (
            <button key={card.title} type="button" onClick={() => onPrompt?.(`Открой ${card.title}: ${card.text}`)} className="text-left">
              <BottomCard card={card} />
            </button>
          ))}
        </section>
      </section>
    </main>
  )
}

