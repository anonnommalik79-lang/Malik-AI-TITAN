"use client"

import { Home, LayoutGrid, Code2, User, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type MobileBottomNavTab = "home" | "canvas" | "codex" | "profile"

export type MobileBottomNavProps = {
  activeTab: MobileBottomNavTab
  onHome: () => void
  onCanvas: () => void
  onCodex: () => void
  onProfile: () => void
  onCenterAction: () => void
}

function NavTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "malik-mobile-nav-tab flex min-w-[56px] flex-col items-center gap-1 px-2 py-1 transition-colors",
        active ? "text-cyan-300" : "text-zinc-500",
      )}
    >
      <Icon className={cn("h-5 w-5", active && "text-cyan-300 drop-shadow-[0_0_12px_rgba(228, 187, 94,.45)]")} />
      <span className={cn("text-[10px] font-bold tracking-wide", active ? "text-cyan-200" : "text-zinc-500")}>{label}</span>
    </button>
  )
}

export function MobileBottomNav({
  activeTab,
  onHome,
  onCanvas,
  onCodex,
  onProfile,
  onCenterAction,
}: MobileBottomNavProps) {
  return (
    <nav
      className="malik-mobile-bottom-nav fixed inset-x-0 bottom-0 z-[65] border-t border-cyan-400/15 bg-[#020612]/98 backdrop-blur-2xl lg:hidden"
      aria-label="Мобильная навигация"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between px-3 pb-[max(env(safe-area-inset-bottom),6px)] pt-2">
        <NavTab icon={Home} label="Главная" active={activeTab === "home"} onClick={onHome} />
        <NavTab icon={LayoutGrid} label="Canvas" active={activeTab === "canvas"} onClick={onCanvas} />
        <button
          type="button"
          onClick={onCenterAction}
          className="malik-mobile-nav-fab -mt-7 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 text-white shadow-[0_12px_40px_rgba(201, 152, 47,.45),0_0_24px_rgba(211, 162, 62,.28)] transition-transform active:scale-95"
          aria-label="Быстрое действие AI"
        >
          <Sparkles className="h-5 w-5" />
        </button>
        <NavTab icon={Code2} label="Codex" active={activeTab === "codex"} onClick={onCodex} />
        <NavTab icon={User} label="Профиль" active={activeTab === "profile"} onClick={onProfile} />
      </div>
      <div className="mx-auto mb-1.5 h-1 w-[108px] rounded-full bg-white/22" aria-hidden="true" />
    </nav>
  )
}

export default MobileBottomNav
