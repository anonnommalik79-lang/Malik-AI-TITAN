"use client"

const bottomCards = [
  {
    title: "AI Planner",
    text: "Планируйте задачи и проекты с помощью ИИ.",
    button: "Открыть Planner",
    visual: "calendar",
  },
  {
    title: "Knowledge Memory",
    text: "Управляйте знаниями и создавайте базу знаний.",
    button: "Открыть Memory",
    visual: "cube",
  },
  {
    title: "Reasoning Sessions",
    text: "История сессий и логика рассуждений моделей.",
    button: "Открыть Sessions",
    visual: "network",
  },
  {
    title: "Prompt Optimizer",
    text: "Оптимизируйте промпты для лучших результатов.",
    button: "Открыть Optimizer",
    visual: "optimizer",
  },
] as const

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function BottomVisual({ type }: { type: string }) {
  if (type === "calendar") {
    return (
      <div className="grid h-28 w-40 grid-cols-5 gap-1 rounded-2xl border border-blue-400/15 bg-black/25 p-3">
        {Array.from({ length: 20 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "rounded bg-slate-800/80",
              index === 7 || index === 8 || index === 13 ? "bg-violet-500/80 shadow-[0_0_14px_rgba(139,92,246,.55)]" : "",
            )}
          />
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

export function FinalIntelligencePanel() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {bottomCards.map((card) => (
        <article
          key={card.title}
          className="relative min-h-[150px] overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/84 shadow-[0_18px_70px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.035)]"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(59,130,246,.12),transparent_36%),radial-gradient(circle_at_85%_88%,rgba(139,92,246,.14),transparent_40%)]" />
          <div className="relative z-10 grid h-full grid-cols-[1fr_auto] gap-4 p-5">
            <div className="flex min-w-0 flex-col">
              <h3 className="font-serif text-xl font-semibold text-white">{card.title}</h3>
              <p className="mt-2 max-w-[230px] text-sm leading-relaxed text-slate-400">{card.text}</p>
              <button className="mt-auto w-fit rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100">
                {card.button} →
              </button>
            </div>
            <div className="hidden opacity-85 md:block">
              <BottomVisual type={card.visual} />
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}

