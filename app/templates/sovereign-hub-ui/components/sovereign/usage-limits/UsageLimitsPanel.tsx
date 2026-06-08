"use client"

import { useEffect, useState } from "react"
import { Activity, Database, HardDrive, ImageIcon, Layers, MessageSquare, RefreshCw, Video } from "lucide-react"

type UsageResponse = {
  ok: boolean
  usage: Record<string, number | string>
  limits: Record<string, number>
  remaining: Record<string, number>
}

type StatusResponse = {
  ok: boolean
  database?: { configured: boolean; mode: string }
  redis?: { configured: boolean; mode: string }
  storage?: { configured: boolean; mode: string }
  engines?: Array<{ id: string; title: string; configured: boolean }>
}

const cards = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "video", label: "Video", icon: Video },
  { key: "project", label: "Project", icon: Layers },
] as const

export function UsageLimitsPanel({ userId = "guest", plan = "free" }: { userId?: string; plan?: string }) {
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [usageRes, statusRes] = await Promise.all([
        fetch(`/api/ai/usage?userId=${encodeURIComponent(userId)}&plan=${encodeURIComponent(plan)}`),
        fetch("/api/ai/scale/status"),
      ])
      setUsage(await usageRes.json())
      setStatus(await statusRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [userId, plan])

  return (
    <section className="rounded-3xl border border-white/10 bg-[#07070b] p-5 text-white shadow-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Usage / Limits</p>
          <h2 className="mt-1 text-2xl font-black">Scale readiness</h2>
          <p className="mt-1 text-sm text-zinc-400">Plan, limits, engine status, database/redis/storage readiness.</p>
        </div>
        <button onClick={refresh} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10">
          <RefreshCw className={loading ? "mr-2 inline h-4 w-4 animate-spin" : "mr-2 inline h-4 w-4"} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(({ key, label, icon: Icon }) => {
          const used = Number(usage?.usage?.[key] || 0)
          const limit = Number(usage?.limits?.[key] || 0)
          const remaining = Number(usage?.remaining?.[key] || 0)
          const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
          return (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <Icon className="h-5 w-5 text-cyan-300" />
              <p className="mt-3 text-sm font-black">{label}</p>
              <p className="mt-1 text-xs text-zinc-500">{remaining} left / {limit}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          { label: "Database", value: status?.database?.mode || "unknown", ok: Boolean(status?.database?.configured), icon: Database },
          { label: "Redis / Queue", value: status?.redis?.mode || "unknown", ok: Boolean(status?.redis?.configured), icon: Activity },
          { label: "Storage", value: status?.storage?.mode || "unknown", ok: Boolean(status?.storage?.configured), icon: HardDrive },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <item.icon className={item.ok ? "h-5 w-5 text-emerald-300" : "h-5 w-5 text-amber-300"} />
            <p className="mt-2 text-sm font-black">{item.label}</p>
            <p className="mt-1 text-xs text-zinc-500">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
        <p className="text-sm font-black">Engines</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(status?.engines || []).map((engine) => (
            <span key={engine.id} className={engine.configured ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200" : "rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-zinc-500"}>
              {engine.title}: {engine.configured ? "on" : "fallback"}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default UsageLimitsPanel

