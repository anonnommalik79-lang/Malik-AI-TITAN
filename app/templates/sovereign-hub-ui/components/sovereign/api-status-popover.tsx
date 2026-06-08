"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Activity, ChevronDown, RefreshCw, ShieldCheck } from "lucide-react"

type ProviderStatus = "online" | "missing" | "fallback"

type ProviderItem = {
  id: string
  name: string
  status: ProviderStatus
  detail?: string
}

type RuntimeProvider = {
  id: string
  title: string
  configured: boolean
  ready?: boolean
  status?: ProviderStatus
}

const baseProviders: ProviderItem[] = [
  { id: "core", name: "MALIK Core", status: "missing" },
  { id: "reasoning", name: "MALIK Reasoning", status: "missing" },
  { id: "code", name: "MALIK Codex", status: "missing" },
  { id: "vision", name: "MALIK Vision", status: "missing" },
  { id: "cinema", name: "MALIK Cinema", status: "missing" },
  { id: "infrastructure", name: "MALIK Infrastructure", status: "missing" },
  { id: "identity", name: "Sovereign ID", status: "missing" },
]

function statusClass(status: ProviderStatus) {
  if (status === "online") return "bg-emerald-400/15 text-emerald-200 border-emerald-300/20"
  if (status === "missing") return "bg-amber-400/15 text-amber-100 border-amber-300/20"
  return "bg-cyan-400/10 text-cyan-100 border-cyan-300/20"
}

function providerItem(provider: RuntimeProvider): ProviderItem {
  const detail = provider.configured ? "Server runtime ready" : "Safe backup active"
  return {
    id: provider.id,
    name: provider.title,
    status: provider.ready === false ? "fallback" : provider.configured ? "online" : "missing",
    detail,
  }
}

export function ApiStatusPopover({ triggerLabel, compact = false }: { triggerLabel?: string; compact?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderItem[]>(baseProviders)
  const [statusText, setStatusText] = useState("server-side env check")

  const loadEnvCheckFallback = useCallback(async (signal?: AbortSignal) => {
    const fallback = await fetch("/api/env-check", { signal })
    if (!fallback.ok) return false
    const data = await fallback.json()
    const rows = Array.isArray(data?.engines) ? data.engines as RuntimeProvider[] : []
    setProviders(rows.map(providerItem))
    setStatusText(data?.backend?.ready ? "MALIK runtime ready" : "safe routing ready")
    return true
  }, [])

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/health/providers", { signal })
      if (response.ok) {
        const data = await response.json()
        const providerMap = data?.providers && typeof data.providers === "object" ? data.providers as Record<string, RuntimeProvider> : {}
        const rows = Object.values(providerMap).filter(Boolean) as RuntimeProvider[]
        if (rows.length) {
          setProviders(rows.map((row) => providerItem({
            id: row.id,
            title: row.title || row.id,
            configured: Boolean(row.configured),
            ready: row.ready,
          })))
          setStatusText(data?.freeModeActive ? "Free mode active — premium blocked" : "MALIK runtime ready")
          return
        }
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return
    }
    try {
      const ok = await loadEnvCheckFallback(signal)
      if (!ok) setStatusText("provider health unavailable")
    } catch (fallbackError) {
      if ((fallbackError as Error)?.name === "AbortError") return
      setStatusText("provider health unavailable")
    }
  }, [loadEnvCheckFallback])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void loadStatus(controller.signal)
    return () => controller.abort()
  }, [loadStatus, open])

  const onlineCount = useMemo(() => providers.filter((item) => item.status === "online").length, [providers])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={compact
          ? "inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border border-cyan-300/18 bg-white/[0.035] px-3 text-xs font-black text-cyan-50 transition hover:-translate-y-px hover:bg-white/[0.07]"
          : "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-zinc-200 hover:bg-white/[0.08]"}
      >
        <Activity className="h-4 w-4 text-cyan-200" />
        {triggerLabel || <>API {onlineCount}/{providers.length}</>}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
      </button>

      {open && (() => {
        const panel = (
        <div
          data-malik-overlay
          className={compact
            ? "fixed left-1/2 top-[112px] z-[120] w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] shadow-2xl shadow-black/50"
            : "absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] shadow-2xl shadow-black/50"}
        >
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <h3 className="font-black text-white">API Health</h3>
              <p className="text-xs text-zinc-500">{statusText}</p>
            </div>
            <button type="button" onClick={() => void loadStatus()} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto p-3">
            {providers.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-white">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-violet-200" />
                    {item.name}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-zinc-500">{item.detail}</span>
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-black ${statusClass(item.status)}`}>{item.status}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-zinc-500">
            Secrets remain server-side. This panel receives branded readiness only.
          </div>
        </div>
        )
        return compact && typeof document !== "undefined" ? createPortal(panel, document.body) : panel
      })()}
    </div>
  )
}

export default ApiStatusPopover
