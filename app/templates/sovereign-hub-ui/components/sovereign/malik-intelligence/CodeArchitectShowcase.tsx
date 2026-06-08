"use client"

const insights = [
  ["⌁", "Модельный оркестратор повысил точность на 2.1% за счёт динамической маршрутизации."],
  ["✺", "Наиболее эффективен режим Reasoning для сложных аналитических задач."],
  ["◉", "Рекомендуем добавить больше источников в проект для повышения качества ответов."],
  ["ϟ", "Время ответа оптимизировано: -12% быстрее чем на прошлой неделе."],
] as const

export function CodeArchitectShowcase() {
  return (
    <section className="relative overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/84 shadow-[0_18px_70px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(34,211,238,.10),transparent_34%),radial-gradient(circle_at_82%_86%,rgba(139,92,246,.16),transparent_38%)]" />
      <div className="relative z-10 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-xl font-semibold text-white">Инсайты</h3>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-400">
            Сгенерировано ИИ
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {insights.map(([icon, text]) => (
            <div key={text} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-sm text-violet-200">
                {icon}
              </span>
              <p className="text-sm leading-relaxed text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

