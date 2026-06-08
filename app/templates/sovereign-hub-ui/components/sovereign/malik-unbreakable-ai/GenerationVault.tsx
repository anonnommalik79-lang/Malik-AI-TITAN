"use client"

import { listGenerations } from "@/lib/malik-unbreakable-ai"

export function GenerationVault() {
  const items = listGenerations()
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-white/50">Generation Vault</p>
      <div className="grid gap-3 md:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="line-clamp-1 text-sm font-bold text-white">{item.prompt}</p>
            <p className="mt-1 text-xs text-white/45">{item.kind} · {item.status}</p>
          </div>
        ))}
        {!items.length && <p className="text-sm text-white/45">No generations saved yet.</p>}
      </div>
    </div>
  )
}

