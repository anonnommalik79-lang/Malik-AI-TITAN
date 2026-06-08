"use client"

import { baseHealthChecks } from "@/lib/malik-unbreakable-ai"

export function UnbreakableHealthGrid() {
  const checks = baseHealthChecks()
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {checks.map((check) => (
        <div key={check.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-white">{check.title}</p>
            <span className="text-emerald-300">●</span>
          </div>
          <p className="mt-2 text-xs text-white/50">{check.message}</p>
        </div>
      ))}
    </div>
  )
}

