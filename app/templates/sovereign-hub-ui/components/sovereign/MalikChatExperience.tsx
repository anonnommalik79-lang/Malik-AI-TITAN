"use client"

import { ArrowUpRight, BrainCircuit, ChartNoAxesCombined, Code2, FileSearch, Globe2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react"
import { canUseUltra, type ResponseDepth } from "@/lib/ai/response-depth"
import type { AIPlan } from "@/lib/ai/types"
import "./malik-chat-experience.css"

const suggestions = [
  { title: "Исследовать тему", detail: "Факты и источники", prompt: "Исследуй вопрос, проверяя даты и источники: ", Icon: FileSearch },
  { title: "Решить сложную задачу", detail: "Математика и логика", prompt: "Реши по шагам и проверь вычисления: ", Icon: BrainCircuit },
  { title: "Написать код", detail: "Архитектура и тесты", prompt: "Спроектируй надёжное решение с тестами: ", Icon: Code2 },
  { title: "Разобрать данные", detail: "Показатели и выводы", prompt: "Проанализируй данные, проверь расчёты и дай выводы: ", Icon: ChartNoAxesCombined },
]

export function MalikChatHome({ onQuickAction }: { onQuickAction: (prompt: string) => void }) {
  return (
    <section className="malik-v7-home" aria-label="Начало чата Malik AI">
      <div className="malik-v7-home__intro">
        <div className="malik-v7-home__eyebrow"><Sparkles size={14} aria-hidden="true" /> MALIK AI</div>
        <h1>С чего начнём?</h1>
        <p>Исследования, код, расчёты и работа с файлами — в одном чате.</p>
      </div>
      <div className="malik-v7-home__grid">
        {suggestions.map(({ title, detail, prompt, Icon }) => (
          <button type="button" key={title} className="malik-v7-home__card" onClick={() => onQuickAction(prompt)}>
            <Icon aria-hidden="true" size={19} strokeWidth={1.7} />
            <span><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight aria-hidden="true" className="malik-v7-home__corner" size={15} />
          </button>
        ))}
      </div>
      <p className="malik-v7-home__foot"><ShieldCheck aria-hidden="true" size={14} /> Важные факты проверяйте по источникам. Внешние действия требуют разрешения.</p>
    </section>
  )
}

type ResearchMode = "off" | "web" | "deep"
const levels: { id: ResponseDepth; title: string }[] = [
  { id: "fast", title: "Быстро" }, { id: "deep", title: "Глубоко" }, { id: "ultra", title: "MAX" },
]

export function MalikChatControls({
  plan, depth, research, onDepthChange, onResearchChange, onUpgrade,
}: {
  plan: AIPlan
  depth: ResponseDepth
  research: ResearchMode
  onDepthChange: (next: ResponseDepth) => void
  onResearchChange: (next: ResearchMode) => void
  onUpgrade?: () => void
}) {
  return (
    <div className="malik-v7-controls" aria-label="Параметры ответа">
      <div className="malik-v7-controls__levels" role="group" aria-label="Глубина ответа">
        {levels.map(({ id, title }) => {
          const locked = id === "ultra" && !canUseUltra(plan)
          return <button
            key={id} type="button" className="malik-v7-controls__level"
            data-active={!locked && depth === id ? "1" : "0"}
            aria-pressed={!locked && depth === id}
            aria-label={locked ? "MAX доступен с Malik PRO" : title}
            title={locked ? "Требуется Malik PRO" : title}
            disabled={locked && !onUpgrade}
            onClick={() => locked ? onUpgrade?.() : onDepthChange(id)}
          >{locked ? <LockKeyhole size={12} aria-hidden="true" /> : null}{title}</button>
        })}
      </div>
      <button type="button" className="malik-v7-controls__research"
        role="switch" aria-checked={research !== "off"}
        data-active={research === "off" ? "0" : "1"}
        title="Включить или выключить веб-поиск с источниками"
        onClick={() => onResearchChange(research === "off" ? "web" : "off")}
      ><Globe2 aria-hidden="true" size={14} />
      {research === "deep" ? "Исследование" : research === "web" ? "Поиск включён" : "Поиск в сети"}</button>
    </div>
  )
}
