"use client"

const modes = [
  ["Reasoning", "Глубокие рассуждения", "◎", true],
  ["Planning", "Планирование и стратегии", "▣", false],
  ["Deep analysis", "Глубокий анализ данных", "△", false],
  ["Fast answer", "Быстрые ответы", "ϟ", false],
] as const

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export function MediaDirectorShowcase() {
  return (
    <section className="relative overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/84 shadow-[0_18px_70px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(217, 174, 69,.16),transparent_32%),radial-gradient(circle_at_92%_90%,rgba(177, 132, 44,.10),transparent_38%)]" />
      <div className="relative z-10 p-5">
        <h3 className="font-serif text-xl font-semibold text-white">Режимы мышления</h3>
        <p className="mt-1 text-sm text-slate-400">Выберите режим, соответствующий вашей задаче.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {modes.map(([title, text, icon, active]) => (
            <button
              key={title}
              type="button"
              className={cn(
                "group flex min-h-[78px] items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                active
                  ? "border-violet-400/45 bg-violet-500/20 shadow-[0_0_30px_rgba(217, 174, 69,.30)]"
                  : "border-slate-700/70 bg-[#07101e]/75 hover:border-blue-400/30",
              )}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-100">
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{title}</span>
                <span className="block text-[11px] text-slate-400">{text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

