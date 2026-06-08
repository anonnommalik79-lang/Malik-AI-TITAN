"use client"

const launchMetrics = [
  { label: "Активные модели", value: "12", detail: "Работают синхронно", delta: "+3 новых сегодня", icon: "✣" },
  { label: "Точность", value: "98.7%", detail: "Средняя точность ответов", delta: "+2.1% с прошлой недели", icon: "◎" },
  { label: "Сессии", value: "1,248", detail: "Активные сессии", delta: "+18% с прошлой недели", icon: "⌁" },
  { label: "Скорость ответа", value: "1.42s", detail: "Среднее время ответа", delta: "-12% быстрее", icon: "◔" },
]

export function AstanaHubLaunchSection() {
  return (
    <section className="relative overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/85 p-5 shadow-[0_18px_70px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.04)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(139,92,246,.16),transparent_32%),radial-gradient(circle_at_86%_86%,rgba(37,99,235,.13),transparent_36%)]" />
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-white md:text-4xl">Final Intelligence</h1>
          <p className="mt-1 text-sm text-slate-400">ИИ нового поколения для планирования, анализа и сверхточных ответов.</p>
        </div>
        <button className="rounded-xl border border-slate-700/70 bg-[#07101e]/80 px-4 py-2 text-sm font-semibold text-slate-200 shadow-[0_12px_36px_rgba(0,0,0,.25)]">
          ⚙ Настроить панель
        </button>
      </div>

      <div className="relative z-10 mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {launchMetrics.map((metric) => (
          <div key={metric.label} className="flex min-h-[104px] items-center gap-4 rounded-[1.15rem] border border-slate-700/70 bg-[#07101e]/82 p-4 shadow-[0_14px_46px_rgba(0,0,0,.30)]">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 text-xl font-black text-violet-100 shadow-[0_0_26px_rgba(139,92,246,.24)]">
              {metric.icon}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-slate-300">{metric.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{metric.value}</p>
              <p className="mt-1 text-[12px] text-slate-400">{metric.detail}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-emerald-400">{metric.delta}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

