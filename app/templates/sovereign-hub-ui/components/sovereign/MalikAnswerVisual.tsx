"use client"

import { answerVisualTotal, type AnswerVisual, type AnswerVisualItem } from "@/lib/ai/answer-visuals"
import { MalikAnswerChecklist } from "./MalikAnswerChecklist"
import "./answer-blocks.css"

const SHADES = ["#f5f5f5", "#a3a3a3", "#737373", "#d4d4d4", "#525252", "#e5e5e5", "#bdbdbd", "#8a8a8a"]
const format = (value: number) => new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 15 }).format(value)

function Value({ value, unit }: { value: number; unit?: string }) {
  return <>{format(value)}{unit ? <span className="ml-1.5 text-[0.55em] font-medium text-zinc-400">{unit}</span> : null}</>
}

function ItemLabel({ item }: { item: AnswerVisualItem }) {
  return <><span className="block break-words text-sm font-semibold leading-5 text-white sm:text-base">{item.label}</span>
    {item.detail ? <span className="mt-1 block break-words text-xs leading-5 text-zinc-400">{item.detail}</span> : null}</>
}

/** CSS/semantic HTML only: no canvas snapshots, chart dependency or network calls. */
export function MalikAnswerVisual({ visual, stateKey }: { visual: AnswerVisual; stateKey?: string }) {
  if (visual.type === "checklist") return <MalikAnswerChecklist title={visual.title} items={visual.items} stateKey={stateKey} />
  if (visual.type === "comparison") return <figure className="malik-answer-comparison malik-answer-visual-enter" data-malik-answer-visual="comparison" aria-label={visual.title}>
    <figcaption>{visual.title}</figcaption>
    <div className={`malik-answer-comparison__columns${visual.columns.length === 3 ? " is-three" : ""}`}>
      {visual.columns.map((column, index) => <div key={index} className="malik-answer-comparison__column">
        <span className="malik-answer-comparison__label">{column.label}</span>
        {column.subtitle ? <strong className="malik-answer-comparison__subtitle">{column.subtitle}</strong> : null}
        <strong className="malik-answer-comparison__title">{column.title}</strong>
        {column.detail ? <span className="malik-answer-comparison__detail">{column.detail}</span> : null}
      </div>)}
    </div>
  </figure>
  const total = answerVisualTotal(visual)
  const maxValue = visual.type === "bars" ? Math.max(...visual.items.map((item) => Math.abs(item.value))) || 1 : 1
  return <figure data-malik-answer-visual={visual.type} aria-label={visual.title} className="malik-answer-visual-enter my-5 w-full min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-black px-4 py-5 text-white sm:px-6">
    <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><span className="block break-words text-sm font-medium leading-6 text-zinc-400">{visual.title}</span>
        {visual.subtitle ? <span className="mt-1 block break-words text-xs leading-5 text-zinc-400">{visual.subtitle}</span> : null}
        {total !== null && visual.type === "composition" ? <span data-malik-visual-total className="mt-2 block break-words text-4xl font-bold tracking-tight sm:text-5xl"><Value value={total} unit={visual.unit} /></span> : null}
      </div>
      {visual.badge ? <span className="max-w-full break-words rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white">{visual.badge}</span> : null}
    </figcaption>
    {visual.type === "composition" && total !== null ? <>
      <div className="flex h-4 w-full overflow-hidden rounded-full" aria-hidden="true">
        {visual.items.map((item, index) => <span key={item.label} style={{ width: `${item.value / total * 100}%`, backgroundColor: SHADES[index % SHADES.length] }} />)}
      </div>
      <div className={"mt-5 grid gap-x-3 gap-y-5 " + (visual.items.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
        {visual.items.map((item, index) => <div key={item.label} className="min-w-0">
          <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SHADES[index % SHADES.length] }} aria-hidden="true" /><span className="text-2xl font-bold sm:text-3xl">{format(item.value)}</span></div>
          <ItemLabel item={item} />
        </div>)}
      </div>
    </> : null}
    {visual.type === "bars" ? <div className="space-y-4">
      {visual.items.map((item, index) => <div key={item.label}>
        <div className="mb-1.5 flex items-start justify-between gap-3"><div className="min-w-0"><ItemLabel item={item} /></div><span className="max-w-[50%] break-words text-right text-sm font-semibold"><Value value={item.value} unit={visual.unit} /></span></div>
        <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-black" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${Math.abs(item.value) / maxValue * 100}%`, backgroundColor: SHADES[index % SHADES.length] }} /></div>
      </div>)}
      {visual.items.some((item) => item.value < 0) ? <p className="text-xs text-zinc-400">Длина полос показывает величину; знак указан рядом с числом.</p> : null}
    </div> : null}
    {visual.type === "metrics" ? <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 sm:grid-cols-3">
      {visual.items.map((item) => <div key={item.label} className="min-w-0 border-l-2 border-white/20 pl-3">
        <div className="mb-2 break-words text-3xl font-bold"><Value value={item.value} unit={visual.unit} /></div><ItemLabel item={item} />
      </div>)}
    </div> : null}
    {visual.type === "timeline" ? <ol className="m-0 list-none space-y-0 p-0">
      {visual.steps.map((step, index) => <li key={index} className="relative flex min-w-0 gap-3 pb-5 last:pb-0">
        {index < visual.steps.length - 1 ? <span className="absolute bottom-0 left-[13px] top-8 w-px bg-white/20" aria-hidden="true" /> : null}
        <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/30 bg-black text-xs font-semibold" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0 pt-0.5"><span className="block break-words text-sm font-semibold sm:text-base">{step.label}</span>
          {step.date ? <span className="mt-1 block text-xs text-zinc-400">{step.date}</span> : null}
          {step.detail ? <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{step.detail}</p> : null}
        </div>
      </li>)}
    </ol> : null}
  </figure>
}
