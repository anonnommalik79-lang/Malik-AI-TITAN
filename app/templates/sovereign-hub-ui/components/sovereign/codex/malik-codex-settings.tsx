"use client"

import { Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react"
import { useEffect, useState } from "react"

type EngineRow = {
  id: string
  title: string
  configured: boolean
  status: "online" | "fallback"
}

export function MalikCodexSettings({ onClose }: { onClose: () => void }) {
  const [engines, setEngines] = useState<EngineRow[]>([])
  const [status, setStatus] = useState("Loading secure runtime readiness...")
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/codex/providers", { cache: "no-store" })
      const data = await response.json()
      setEngines(Array.isArray(data.engines) ? data.engines : [])
      setStatus("Secrets stay server-side. Public settings show branded readiness only.")
    } catch {
      setStatus("Runtime readiness is temporarily unavailable. Safe mode remains active.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  return (
    <div className="absolute inset-0 z-20 bg-black/80 p-4 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-4xl flex-col rounded-[2rem] border border-white/10 bg-[#080808] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <h2 className="text-2xl font-black">Malik Codex Runtime</h2>
            <p className="mt-1 text-sm text-zinc-500">{status}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
            <div className="mb-1 flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> White-label privacy active</div>
            Runtime credentials are configured only in server environment settings. This browser never asks for or stores production secrets.
          </div>
          <button type="button" onClick={() => void refresh()} className="mb-5 flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-black hover:bg-white/10">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh readiness
          </button>
          <div className="grid gap-4 md:grid-cols-2">
            {engines.map((engine) => (
              <div key={engine.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black">{engine.title}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{engine.configured ? "Server runtime ready" : "Safe backup active"}</p>
                  </div>
                  <Check className={engine.configured ? "h-5 w-5 text-emerald-300" : "h-5 w-5 text-zinc-600"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MalikCodexSettings
