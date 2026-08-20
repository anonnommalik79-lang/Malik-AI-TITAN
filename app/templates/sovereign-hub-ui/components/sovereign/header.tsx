"use client"

import { memo, useMemo } from "react"
import {
  BarChart3,
  Bell,
  FolderKanban,
  LibraryBig,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  Zap,
} from "lucide-react"
import type { AiModeId } from "./power-registry"

interface HeaderProps {
  onMenuClick: () => void
  isSidebarCollapsed: boolean
  onOpenCodex?: () => void
  onOpenCanvas?: () => void
  onViewChange?: (view: string) => void
  onLogout?: () => void
  currentMode?: AiModeId
  onModeChange?: (mode: AiModeId) => void
  isOwner?: boolean
  userEmail?: string
  homeMode?: boolean
  onOpenCommandCenter?: () => void
}

type TopItem = {
  id: string
  label: string
  view: string
  icon: typeof MessageSquare
}

const TOP_ITEMS: TopItem[] = [
  { id: "chat", label: "Чат", view: "home", icon: MessageSquare },
  { id: "workspace", label: "Рабочая область", view: "final-intelligence", icon: Sparkles },
  { id: "projects", label: "Проекты", view: "projects", icon: FolderKanban },
  { id: "library", label: "Библиотека", view: "templates", icon: LibraryBig },
  { id: "analytics", label: "Аналитика", view: "business-command-center", icon: BarChart3 },
]

function HeaderInner({
  onMenuClick,
  onViewChange,
  currentMode = "auto",
  onModeChange,
  userEmail,
  homeMode = false,
  onOpenCommandCenter,
}: HeaderProps) {
  const initials = useMemo(() => {
    const value = String(userEmail || "MA").trim()
    if (!value) return "MA"
    const local = value.includes("@") ? value.split("@")[0] : value
    const parts = local.split(/[._\-\s]+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0] || "M"}${parts[1][0] || "A"}`.toUpperCase()
    return local.slice(0, 2).toUpperCase() || "MA"
  }, [userEmail])

  const openSearch = () => window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
  const fastMode = currentMode === "fast"

  return (
    <header className="relative z-30 flex h-[62px] shrink-0 items-center border-b border-[#d9a928]/10 bg-[#020303] px-3 text-white shadow-[0_12px_40px_rgba(0,0,0,.2)] sm:px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Открыть меню"
        className="mr-2 grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 lg:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <nav className="hidden min-w-0 items-center gap-1 md:flex" aria-label="Верхняя навигация">
        {TOP_ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            (item.id === "chat" && homeMode) ||
            (item.id === "workspace" && !homeMode && currentMode !== "auto")

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange?.(item.view)}
              className={`flex h-9 items-center gap-2 rounded-[12px] border px-3 text-[10.5px] font-medium transition ${
                active
                  ? "border-[#d9a928]/20 bg-[#161107] text-[#efc94d] shadow-[inset_0_1px_0_rgba(255,255,255,.025)]"
                  : "border-transparent text-zinc-500 hover:border-white/[0.04] hover:bg-white/[0.035] hover:text-zinc-200"
              }`}
            >
              <Icon className="h-[14px] w-[14px]" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={openSearch}
          className="hidden h-9 w-[220px] items-center gap-2 rounded-[13px] border border-white/[0.055] bg-[#070807] px-3 text-left text-[10.5px] text-zinc-600 transition hover:border-[#d9a928]/15 hover:text-zinc-400 xl:flex 2xl:w-[250px]"
        >
          <Search className="h-[14px] w-[14px]" />
          <span className="flex-1">Поиск...</span>
          <span className="rounded-md bg-white/[0.035] px-1.5 py-1 text-[8px] text-zinc-600">⌘F</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange?.(fastMode ? "auto" : "fast")}
          aria-label={fastMode ? "Выключить быстрый режим" : "Включить быстрый режим"}
          className={`grid h-9 w-9 place-items-center rounded-full border transition ${
            fastMode
              ? "border-[#f2c746]/45 bg-[#d9a928]/12 text-[#f1c84c] shadow-[0_0_18px_rgba(217,169,40,.13)]"
              : "border-[#d9a928]/18 bg-[#070807] text-[#d5a724] hover:border-[#e4b52d]/40 hover:text-[#f0c846]"
          }`}
        >
          <Zap className="h-[15px] w-[15px]" />
        </button>

        <button
          type="button"
          onClick={() => onViewChange?.("notifications")}
          aria-label="Уведомления"
          className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.055] bg-[#070807] text-zinc-500 transition hover:border-[#d9a928]/16 hover:text-zinc-200"
        >
          <Bell className="h-[15px] w-[15px]" />
        </button>

        <button
          type="button"
          onClick={onOpenCommandCenter}
          aria-label="Профиль MALIK AI"
          className="relative grid h-9 w-9 place-items-center rounded-full border border-[#d9a928]/28 bg-gradient-to-br from-[#281f0b] to-[#0c0b08] text-[10px] font-semibold text-[#f0c94e] shadow-[0_0_18px_rgba(217,169,40,.08)]"
        >
          {initials}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#020303] bg-emerald-400" />
        </button>
      </div>
    </header>
  )
}

export const Header = memo(HeaderInner)
export default Header
