"use client"

import { listIncidents } from "@/lib/malik-unbreakable-ai"

export function IncidentTimeline() {
  const items = listIncidents()
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-white/50">Incidents</p>
      {items.length ? items.slice(0, 8).map((item) => (
        <div key={item.id} className="mb-2 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-sm font-bold text-white">{item.title}</p>
          <p className="text-xs text-white/45">{item.message}</p>
        </div>
      )) : <p className="text-sm text-white/45">No incidents recorded.</p>}
    </div>
  )
}

