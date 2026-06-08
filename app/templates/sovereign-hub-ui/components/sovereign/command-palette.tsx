"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Sparkles, X } from "lucide-react"
import { COMMAND_ACTIONS, CORE_POWER_ACTIONS, type PowerAction } from "./power-registry"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRunAction: (action: PowerAction) => void
}

export function CommandPalette({ open, onOpenChange, onRunAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange(!open)
      }
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const actions = q
      ? COMMAND_ACTIONS.filter((action) =>
          `${action.title} ${action.category} ${action.description} ${action.safeStatus}`.toLowerCase().includes(q),
        )
      : COMMAND_ACTIONS

    return actions.slice(0, 60)
  }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[140] bg-black/70 p-3 text-white backdrop-blur-xl sm:p-6">
      <div className="mx-auto flex h-[min(760px,calc(100dvh-2rem))] max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#060608] shadow-2xl shadow-violet-950/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 p-4">
          <Search className="h-5 w-5 text-cyan-200" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, modes, templates, deploy and power actions..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600 sm:text-base"
          />
          <kbd className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-500 sm:block">Ctrl K</kbd>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl p-2 text-zinc-500 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden border-r border-white/10 p-4 lg:block">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Power actions</p>
            <div className="mt-4 space-y-2">
              {CORE_POWER_ACTIONS.slice(0, 10).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    onRunAction(action)
                    onOpenChange(false)
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left text-sm hover:bg-white/[0.07]"
                >
                  <div className="font-black text-white">{action.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">{action.safeStatus}</div>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-200">Command Palette</p>
                <h3 className="text-xl font-black">75+ useful functions registry</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-zinc-400">
                {filteredActions.length} shown
              </span>
            </div>

            <div className="grid gap-2">
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    onRunAction(action)
                    onOpenChange(false)
                  }}
                  className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-100">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-white">{action.title}</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-cyan-100">{action.category}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-zinc-400">{action.description}</span>
                  </span>
                  <span className="hidden max-w-[180px] shrink-0 text-right text-xs text-zinc-500 sm:block">{action.safeStatus}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette

