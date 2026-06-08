"use client"

import { Code2, Rocket, Sparkles, X } from "lucide-react"
import { BRAND_NAME, BRAND_VERSION } from "@/lib/brand-assets"

export function CodexComingSoonShelf({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-2xl">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#05070f] p-8 text-white shadow-[0_40px_120px_rgba(88,28,135,.35)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl border border-white/10 p-2 text-slate-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(139,92,246,.22),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(34,211,238,.12),transparent_40%)]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-violet-100">
            <Sparkles className="h-3.5 w-3.5" />
            В разработке
          </div>
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-black shadow-[0_0_50px_rgba(139,92,246,.4)]">
              <Code2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">Malik Codex</h2>
              <p className="mt-1 text-sm text-slate-400">
                {BRAND_NAME} {BRAND_VERSION} · post-release module
              </p>
            </div>
          </div>
          <p className="mt-6 text-base leading-7 text-slate-300">
            Полка агентского кодинга почти готова. После релиза здесь будет полноценный cockpit: файлы, план, терминал и безопасный apply.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["File explorer", "Task plan", "Safe terminal"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-300">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-black">
              <Rocket className="h-4 w-4" />
              Скоро после релиза
            </span>
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/5">
              Вернуться в dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
