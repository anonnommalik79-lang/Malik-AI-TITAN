"use client"
import { memo, useState } from "react"
import { ChevronDown, LogOut, Menu, Settings } from "lucide-react"
import type { AiModeId } from "./power-registry"

interface HeaderProps { onMenuClick: () => void; isSidebarCollapsed: boolean; onOpenCodex?: () => void; onOpenCanvas?: () => void; onViewChange?: (view: string) => void; onLogout?: () => void; currentMode?: AiModeId; onModeChange?: (mode: AiModeId) => void; isOwner?: boolean; userEmail?: string; homeMode?: boolean; onOpenCommandCenter?: () => void }

function HeaderInner({ onMenuClick, onViewChange, onLogout, userEmail, isOwner }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const initial = (userEmail || "M").trim().charAt(0).toUpperCase()
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#07090d]/95 px-4 text-white backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 lg:hidden" aria-label="Открыть меню"><Menu className="h-4 w-4" /></button>
        <div className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" /><span className="text-[12px] font-semibold text-zinc-300">Malik AI готов к работе</span></div>
      </div>
      <div className="relative">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-sm transition hover:bg-white/[0.08]">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-white text-[11px] font-black text-black">{initial}</span><span className="hidden max-w-40 truncate text-xs font-medium text-zinc-300 sm:block">{isOwner ? "Founder" : "Workspace"}</span><ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
        </button>
        {open && <div className="absolute right-0 top-12 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#111318] p-1.5 shadow-2xl shadow-black/60">
          <button type="button" onClick={() => { onViewChange?.("settings"); setOpen(false) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"><Settings className="h-4 w-4" />Настройки</button>
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4" />Выйти</button>
        </div>}
      </div>
    </header>
  )
}
export const Header = memo(HeaderInner)
export default Header
