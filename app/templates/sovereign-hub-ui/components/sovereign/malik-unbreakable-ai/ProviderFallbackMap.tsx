"use client"

import { MEDIA_PROVIDERS, TEXT_PROVIDERS } from "@/lib/malik-unbreakable-ai"

export function ProviderFallbackMap() {
  const items = [...TEXT_PROVIDERS, ...MEDIA_PROVIDERS]
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-white/50">Engine fallback map</p>
      <div className="grid gap-3 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p className="text-sm font-bold text-white">{item.title}</p>
            <p className="mt-1 text-xs text-white/40">priority {item.priority} · {item.kind}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

