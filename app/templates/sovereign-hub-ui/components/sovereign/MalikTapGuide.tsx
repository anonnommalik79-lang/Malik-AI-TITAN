"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check, ChevronLeft, ChevronRight, MousePointer2 } from "lucide-react"
import { planTapGuide } from "@/lib/ai/tap-guide"

/**
 * An interactive arrow-guided SCHEMATIC based strictly on the answer's labels.
 * It never overlays invented coordinates onto a third-party screenshot.
 */
export function MalikTapGuide({ question, answer }: { question: string; answer: string }) {
  const guide = useMemo(() => planTapGuide(question, answer), [question, answer])
  const [active, setActive] = useState(0)
  useEffect(() => { setActive(0) }, [question, answer])
  if (!guide) return null
  const index = Math.min(active, guide.steps.length - 1)
  const step = guide.steps[index]
  const complete = index === guide.steps.length - 1
  return (
    <section data-malik-tap-guide className="my-5 min-w-0 max-w-[720px] rounded-2xl border border-white/20 bg-black p-3 text-white sm:p-5" aria-label="Интерактивная схема: где нажимать">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><MousePointer2 className="h-4 w-4" aria-hidden="true" />Где нажать</h3>
          <p className="mt-1 text-xs text-zinc-400">{guide.context} · шаг {index + 1} из {guide.steps.length}</p>
        </div>
        <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] text-zinc-300">Пошаговая схема</span>
      </header>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div role="img" aria-label={"Схема интерфейса. Стрелка указывает на пункт: " + step.label} className="mx-auto flex w-full max-w-[280px] flex-col rounded-[24px] border-2 border-zinc-600 bg-[#0a0a0a] p-3 shadow-[0_14px_32px_rgba(0,0,0,.35)]">
          <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-zinc-600" aria-hidden="true" />
          <p className="mb-2 border-b border-white/10 pb-2 text-center text-xs font-medium">{guide.context}</p>
          <div className="min-h-[128px] space-y-2">
            {guide.steps.slice(Math.max(0, index - 2), index).map((prior, position) => (
              <div key={index + "-" + position} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.035] px-2 py-2 text-xs text-zinc-400">
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{prior.label}</span>
              </div>
            ))}
            <div className="flex min-w-0 items-center gap-1" data-malik-highlighted-target>
              <ArrowRight className="h-5 w-5 shrink-0 animate-pulse text-white motion-reduce:animate-none" strokeWidth={2.5} aria-hidden="true" />
              <div className="min-w-0 flex-1 rounded-lg border-2 border-white bg-white/15 px-2.5 py-3 text-xs font-semibold leading-5 text-white ring-2 ring-white/15">{step.label}</div>
            </div>
          </div>
          <div className="mx-auto mt-auto pt-4"><span className="block h-1 w-12 rounded-full bg-zinc-700" /></div>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[.03] p-3 sm:p-4">
          <div aria-live="polite" aria-atomic="true">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Действие {index + 1}</p>
            <p className="mt-2 break-words text-sm font-medium leading-6">{step.instruction}</p>
            <p className="mt-3 text-xs text-zinc-400">Стрелка указывает на выделенный пункт на схеме.</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setActive((current) => Math.max(0, current - 1))} disabled={index === 0} aria-label="Предыдущий шаг" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-white/20 px-3 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-4 w-4" />Назад</button>
            <button type="button" onClick={() => setActive((current) => Math.min(guide.steps.length - 1, current + 1))} disabled={complete} aria-label="Следующий шаг" className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{complete ? "Последний шаг" : "Далее"}<ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <nav aria-label="Перейти к шагу" className="mt-3 flex flex-wrap items-center gap-1.5">
        {guide.steps.map((item, stepIndex) => (
          <button key={stepIndex} type="button" onClick={() => setActive(stepIndex)} aria-label={"Шаг " + (stepIndex + 1) + ": " + item.label} aria-current={stepIndex === index ? "step" : undefined} className={"grid h-8 w-8 place-items-center rounded-full border text-xs " + (stepIndex === index ? "border-white bg-white font-bold text-black" : "border-white/20 text-zinc-300 hover:border-white/70")}>{stepIndex + 1}</button>
        ))}
      </nav>
      <p className="mt-3 text-[11px] leading-5 text-zinc-400">Схема по тексту ответа, не подлинный скриншот. Меню и названия пунктов могут отличаться между версиями приложений. На оригинальных снимках стрелки без подтверждённого расположения элементов не ставятся.</p>
    </section>
  )
}
