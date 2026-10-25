"use client"

import { Crown, X } from "lucide-react"

export function PlusUpgradePrompt({ feature, onClose, onUpgrade }: {
  feature: string
  onClose: () => void
  onUpgrade: () => void
}) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="alertdialog" aria-modal="true" aria-label={`${feature}: MalikAI Plus`}
        className="relative w-full max-w-[430px] rounded-3xl border border-white/15 bg-[#111112] p-6 text-white shadow-[0_24px_90px_rgba(0,0,0,.75)]">
        <button type="button" onClick={onClose} aria-label="Закрыть"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5"><Crown className="h-5 w-5" /></span>
        <p className="text-xs font-semibold uppercase tracking-[.13em] text-zinc-400">MalikAI Plus</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Для запуска нужна подписка</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {feature} доступно с MalikAI Plus. Изучать интерфейс можно бесплатно. Подписка нужна только для выполнения платного действия.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-white/15 text-sm font-medium hover:bg-white/5">Не сейчас</button>
          <button type="button" onClick={onUpgrade} className="h-11 rounded-xl bg-white px-2 text-sm font-semibold text-black hover:bg-zinc-200">Приобрести Plus</button>
        </div>
      </section>
    </div>
  )
}
