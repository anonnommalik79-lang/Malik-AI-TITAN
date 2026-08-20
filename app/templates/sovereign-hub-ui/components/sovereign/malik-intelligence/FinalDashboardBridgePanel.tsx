"use client"

import { useState } from "react"

const nodesLeft = [
  ["GPT-4o", "Язык и рассуждения", "✺"],
  ["Vision Model", "Анализ изображений", "◉"],
  ["Code Interpreter", "Код и вычисления", "</>"],
]

const nodesRight = [
  ["Web Search", "Поиск и верификация", "◎"],
  ["Memory Layer", "Память и контекст", "▣"],
  ["Smart Routing", "Выбор лучшей модели", "⌬"],
]

function ModelNode({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <div className="relative z-20 flex min-h-[62px] items-center gap-3 rounded-2xl border border-slate-700/70 bg-[#07101e]/92 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,.28)]">
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

export function FinalDashboardBridgePanel({ onPrompt }: { onPrompt?: (prompt: string) => void }) {
  const [prompt] = useState("Построй интеллектуальный оркестратор для анализа проекта")

  return (
    <section className="relative min-h-[330px] overflow-hidden rounded-[1.35rem] border border-slate-700/60 bg-[#050b18]/82 shadow-[0_18px_70px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(228, 187, 94,.12),transparent_34%),radial-gradient(circle_at_80%_100%,rgba(201, 152, 47,.10),transparent_36%)]" />
      <div className="relative z-10 flex items-start justify-between gap-4 p-5 pb-2">
        <div>
          <h3 className="font-serif text-xl font-semibold text-white">Модельный оркестратор</h3>
          <p className="mt-1 text-sm text-slate-400">Динамическая маршрутизация между лучшими ИИ-моделями.</p>
        </div>
        <button
          onClick={() => onPrompt?.(prompt)}
          className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1 text-[11px] font-semibold text-emerald-300"
        >
          ● Оркестратор активен
        </button>
      </div>

      <div className="relative z-10 mx-auto grid min-h-[248px] max-w-[820px] grid-cols-[1fr_180px_1fr] items-center gap-6 px-5 pb-5">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-90" viewBox="0 0 820 260" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bridgeLine" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(228, 187, 94,.25)" />
              <stop offset="50%" stopColor="rgba(217, 174, 69,.95)" />
              <stop offset="100%" stopColor="rgba(228, 187, 94,.25)" />
            </linearGradient>
            <filter id="bridgeGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M190 58 C270 58 270 130 355 130" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
          <path d="M190 130 C270 130 270 130 355 130" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
          <path d="M190 202 C270 202 270 130 355 130" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
          <path d="M465 130 C550 130 550 58 630 58" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
          <path d="M465 130 C550 130 550 130 630 130" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
          <path d="M465 130 C550 130 550 202 630 202" stroke="url(#bridgeLine)" strokeWidth="3" fill="none" filter="url(#bridgeGlow)" />
        </svg>

        <div className="space-y-5">
          {nodesLeft.map(([title, subtitle, icon]) => (
            <ModelNode key={title} title={title} subtitle={subtitle} icon={icon} />
          ))}
        </div>

        <div className="relative z-20 flex flex-col items-center">
          <div className="grid h-24 w-24 place-items-center rounded-3xl border border-violet-300/40 bg-[radial-gradient(circle_at_50%_35%,rgba(217, 174, 69,.52),rgba(30,41,59,.38)_58%,rgba(2,6,23,.92))] text-5xl text-violet-100 shadow-[0_0_44px_rgba(217, 174, 69,.55)]">
            ⬡
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Orchestrator</p>
          <p className="text-[12px] text-slate-400">Интеллектуальный роутинг</p>
        </div>

        <div className="space-y-5">
          {nodesRight.map(([title, subtitle, icon]) => (
            <ModelNode key={title} title={title} subtitle={subtitle} icon={icon} />
          ))}
        </div>
      </div>
    </section>
  )
}

