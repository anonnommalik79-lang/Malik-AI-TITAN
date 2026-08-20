"use client"
import { memo, useState, type ComponentType } from "react"
import { ArrowUp, Code2, Image, MessageSquare, Paperclip, Video, WandSparkles } from "lucide-react"
import type { MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

type ToolCardProps = { icon: ComponentType<{ className?: string }>; title: string; detail: string; accent: string; onClick?: () => void }
function ToolCard({ icon: Icon, title, detail, accent, onClick }: ToolCardProps) {
  return <button type="button" onClick={onClick} className="group relative min-h-40 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#101218] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-white/[0.16] hover:bg-[#151820]">
    <span className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${accent} to-transparent opacity-80`} />
    <span className="mb-8 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-100 transition group-hover:scale-105 group-hover:bg-white/[0.09]"><Icon className="h-5 w-5" /></span>
    <strong className="block text-[15px] font-semibold tracking-tight text-white">{title}</strong><span className="mt-1.5 block text-xs leading-5 text-zinc-500">{detail}</span>
  </button>
}

function WelcomeScreenInner({ onSubmit, isLoading, onOpenPhoto, onOpenVideo, onOpenCode }: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const submit = () => { const value = prompt.trim(); if (value && !isLoading) onSubmit(value) }
  return <main className="relative min-h-0 flex-1 overflow-y-auto bg-[#090b0f] text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(105,79,255,.13),transparent_36%)]" />
    <div className="relative mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
      <div className="mb-8"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-white text-black shadow-[0_12px_40px_rgba(255,255,255,.08)]"><WandSparkles className="h-5 w-5" /></span><span className="text-[11px] font-bold uppercase tracking-[.22em] text-zinc-500">Malik AI Workspace</span></div>
        <h1 className="text-3xl font-semibold tracking-[-.04em] text-zinc-50 sm:text-4xl">Что создаём?</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">Опиши результат. Malik AI сам выберет нужный режим и откроет рабочую область.</p></div>
      <section className="rounded-[28px] border border-white/[0.09] bg-[#111319] p-2 shadow-[0_30px_100px_rgba(0,0,0,.4)]">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit() } }} rows={4} placeholder="Например: создай приложение для управления финансами с тёмным интерфейсом..." className="min-h-28 w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600 sm:px-5" />
        <div className="flex items-center justify-between border-t border-white/[0.07] px-2 pt-2"><button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Прикрепить файл"><Paperclip className="h-4 w-4" /></button><button type="button" onClick={submit} disabled={!prompt.trim() || isLoading} className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">{isLoading ? "Создаю..." : "Запустить"}<ArrowUp className="h-4 w-4" /></button></div>
      </section>
      <div className="mt-10 flex items-center justify-between"><h2 className="text-sm font-semibold text-zinc-200">Рабочие режимы</h2><span className="text-[11px] text-zinc-600">4 основных инструмента</span></div>
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ToolCard icon={MessageSquare} title="AI-диалог" detail="Ответы, анализ и решение задач" accent="via-violet-400" onClick={() => setPrompt("Помоги мне ")} />
        <ToolCard icon={Image} title="Создать фото" detail="Генерация и редактирование изображений" accent="via-cyan-400" onClick={onOpenPhoto} />
        <ToolCard icon={Video} title="Создать видео" detail="Сцены, движение и готовые ролики" accent="via-rose-400" onClick={onOpenVideo} />
        <ToolCard icon={Code2} title="Написать код" detail="Приложения, сайты и компоненты" accent="via-amber-400" onClick={onOpenCode} />
      </section>
      <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-8 text-[11px] text-zinc-600"><span>Malik AI · TITAN</span><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Система работает</span></div>
    </div>
  </main>
}
export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
