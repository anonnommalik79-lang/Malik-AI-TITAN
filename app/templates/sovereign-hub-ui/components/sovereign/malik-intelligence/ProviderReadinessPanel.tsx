"use client"

import { launchReadiness } from "@/lib/malik-intelligence"

export function ProviderReadinessPanel() {
  const readiness = launchReadiness()
  const status = readiness.ok ? "READY" : "NEEDS KEYS"
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200/70">Launch Readiness</p>
          <p className="mt-2 text-2xl font-black text-white">{readiness.score}%</p>
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">{status}</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {readiness.providers.map((provider) => (
          <div key={provider.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{provider.title}</p>
              <span className={provider.configured ? "text-emerald-300" : "text-zinc-500"}>{provider.configured ? "●" : "○"}</span>
            </div>
            <p className="mt-1 text-xs text-white/40">{provider.kind}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

