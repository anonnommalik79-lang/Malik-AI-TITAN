"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bot,
  BookOpen,
  CircleHelp,
  Code2,
  Crown,
  FolderKanban,
  History,
  Home,
  Image as ImageIcon,
  Languages,
  LibraryBig,
  LogOut,
  MessageSquare,
  Mic2,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
  Video,
} from "lucide-react"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/supabase"
import { prefetchStudioChunks } from "@/lib/studio-prefetch"

interface Chat {
  id: string
  title: string
  timestamp: Date
  isPinned?: boolean
}

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  onNewChat?: () => void
  onSelectChat?: (chatId: string) => void
  onDeleteChat?: (chatId: string) => void
  activeView?: string
  onViewChange?: (view: string) => void
  chats?: Chat[]
  onLogout?: () => void
  onOpenCodex?: () => void
  onOpenSearch?: () => void
}

type NavItem = {
  key: string
  label: string
  view: string
  icon: typeof Home
  prefetch?: boolean
}

const MAIN_NAV: NavItem[] = [
  { key: "home", label: "Главная", view: "home", icon: Home },
  { key: "chat", label: "Чат", view: "chats", icon: MessageSquare },
  { key: "projects", label: "Проекты", view: "projects", icon: FolderKanban },
  { key: "library", label: "Библиотека", view: "templates", icon: LibraryBig },
  { key: "knowledge", label: "База знаний", view: "capabilities", icon: BookOpen },
  { key: "images", label: "Изображения", view: "photo-generation", icon: ImageIcon, prefetch: true },
  { key: "video", label: "Видео", view: "video-generation", icon: Video, prefetch: true },
  { key: "code", label: "Код", view: "code-generation", icon: Code2, prefetch: true },
  { key: "agents", label: "Агенты AI", view: "command-center", icon: Bot, prefetch: true },
  { key: "analytics", label: "Аналитика", view: "business-command-center", icon: BarChart3, prefetch: true },
  { key: "history", label: "История", view: "chats", icon: History },
]

const TOOL_NAV: NavItem[] = [
  { key: "voice", label: "Voice AI", view: "ai-generator", icon: Mic2, prefetch: true },
  { key: "translator", label: "Translator", view: "final-intelligence", icon: Languages, prefetch: true },
  { key: "data", label: "Анализ данных", view: "business-command-center", icon: BarChart3, prefetch: true },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "MA"
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MA"
}

function SidebarInner({
  isCollapsed,
  onToggle,
  onNewChat,
  activeView = "home",
  onViewChange,
  onLogout,
  onOpenCodex,
  onOpenSearch,
}: SidebarProps) {
  const [profile, setProfile] = useState<ReturnType<typeof getStoredAuthSnapshot>>(null)

  useEffect(() => {
    const syncProfile = () => setProfile(getStoredAuthSnapshot())
    syncProfile()
    window.addEventListener("malik-auth-updated", syncProfile)
    window.addEventListener("storage", syncProfile)
    return () => {
      window.removeEventListener("malik-auth-updated", syncProfile)
      window.removeEventListener("storage", syncProfile)
    }
  }, [])

  const email = profile?.email || "guest@malik.ai"
  const name = profile?.name || "Гость"
  const avatar = profile?.avatar || buildFallbackAvatar(email)
  const isGuest = /guest|anonymous/i.test(email)
  const displayName = isGuest ? "Гостевой доступ" : name
  const planLabel = isGuest ? "Free plan" : "TITAN workspace"

  const openView = useCallback((view: string, shouldPrefetch = false) => {
    if (shouldPrefetch) prefetchStudioChunks()
    onViewChange?.(view)
  }, [onViewChange])

  const openSearch = useCallback(() => {
    if (onOpenSearch) onOpenSearch()
    else window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
  }, [onOpenSearch])

  const logout = useCallback(async () => {
    await signOutMalik()
    onLogout?.()
  }, [onLogout])

  const collapsedItems = useMemo(() => MAIN_NAV.slice(0, 9), [])

  if (isCollapsed) {
    return (
      <aside className="relative z-40 flex h-[100dvh] w-[68px] shrink-0 flex-col border-r border-[#d9a928]/10 bg-[#030404] text-white">
        <div className="flex h-[68px] items-center justify-center border-b border-white/[0.04]">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Развернуть меню"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#d9a928]/15 bg-[#0b0c09] text-[#e5b934] transition hover:border-[#e5b934]/45 hover:bg-[#151108]"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 px-2 py-3">
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Новый чат"
            className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-[#d9a934] to-[#9f6b13] text-black shadow-[0_8px_24px_rgba(203,151,30,.2)]"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Поиск"
            className="grid h-10 w-10 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <Search className="h-[17px] w-[17px]" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1" aria-label="Основная навигация">
          {collapsedItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.view && item.key !== "history"
            return (
              <button
                key={item.key}
                type="button"
                title={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => openView(item.view, item.prefetch)}
                className={`relative grid h-10 w-full place-items-center rounded-xl transition ${
                  active
                    ? "border border-[#d9a928]/25 bg-[#d9a928]/10 text-[#f3ca4f]"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                {active ? <span className="absolute left-0 h-5 w-[2px] rounded-r-full bg-[#e4b72e]" /> : null}
                <Icon className="h-[17px] w-[17px]" />
              </button>
            )
          })}
        </nav>

        <div className="flex flex-col items-center gap-1 border-t border-white/[0.05] px-2 py-3">
          <button type="button" onClick={onOpenCodex} title="Malik Codex" className="grid h-10 w-10 place-items-center rounded-xl text-[#d8aa27] transition hover:bg-[#d9a928]/10">
            <TerminalSquare className="h-[17px] w-[17px]" />
          </button>
          <button type="button" onClick={() => openView("settings")} title="Настройки" className="grid h-10 w-10 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200">
            <Settings className="h-[17px] w-[17px]" />
          </button>
          <div className="mt-1 grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 text-[10px] font-bold text-zinc-300">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} /> : initials(displayName)}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="relative z-40 flex h-[100dvh] w-[274px] shrink-0 flex-col overflow-hidden border-r border-[#d9a928]/10 bg-[#030404] text-white shadow-[16px_0_55px_rgba(0,0,0,.28)]">
      <div className="flex h-[78px] shrink-0 items-center gap-3 border-b border-white/[0.04] px-4">
        <div className="relative grid h-11 w-11 place-items-center rounded-[13px] border border-[#e0b532]/35 bg-[#100d05] text-[#efc745] shadow-[0_0_24px_rgba(217,169,40,.12)]">
          <Crown className="h-[22px] w-[22px]" />
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-[#030404] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[.02em] text-zinc-100">MALIK AI</p>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[.08em] text-[#cda12a]">v6.5 TITAN</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Свернуть меню"
          className="grid h-9 w-9 place-items-center rounded-xl text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"
        >
          <PanelLeftClose className="h-[17px] w-[17px]" />
        </button>
      </div>

      <div className="shrink-0 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-[42px] w-full items-center gap-3 rounded-[12px] border border-[#f0c34a]/35 bg-gradient-to-r from-[#a96f12] via-[#c28a1e] to-[#8c5b0e] px-4 text-left text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,228,143,.18),0_12px_28px_rgba(173,115,14,.18)] transition hover:brightness-110"
        >
          <Plus className="h-[18px] w-[18px]" />
          <span className="flex-1">Новый чат</span>
          <span className="rounded-md bg-black/20 px-1.5 py-1 text-[9px] font-medium text-amber-100/80">⌘K</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1" aria-label="Навигация MALIK AI">
        <div className="space-y-[2px]">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon
            const active = activeView === item.view && item.key !== "history"
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => openView(item.view, item.prefetch)}
                className={`group flex h-[37px] w-full items-center gap-3 rounded-[10px] border px-3 text-left text-[11.5px] transition ${
                  active
                    ? "border-[#d9a928]/14 bg-gradient-to-r from-[#1b1608] to-[#0b0b08] text-[#efc542] shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"
                    : "border-transparent text-zinc-400 hover:border-white/[0.035] hover:bg-white/[0.035] hover:text-zinc-200"
                }`}
              >
                <Icon className={`h-[16px] w-[16px] shrink-0 ${active ? "text-[#e8ba35]" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
        <p className="px-3 pb-2 text-[8.5px] font-medium uppercase tracking-[.16em] text-zinc-700">Инструменты</p>

        <div className="space-y-[2px]">
          <button
            type="button"
            onClick={onOpenCodex}
            className="group flex h-[37px] w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-left text-[11.5px] text-zinc-400 transition hover:border-[#d9a928]/10 hover:bg-[#d9a928]/[.045] hover:text-zinc-200"
          >
            <TerminalSquare className="h-[16px] w-[16px] text-[#d9aa29]" />
            <span className="flex-1">Malik Codex</span>
            <span className="rounded-md border border-[#d9a928]/20 bg-[#d9a928]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#dcb236]">NEW</span>
          </button>

          {TOOL_NAV.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => openView(item.view, item.prefetch)}
                className="group flex h-[37px] w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-left text-[11.5px] text-zinc-400 transition hover:border-white/[0.035] hover:bg-white/[0.035] hover:text-zinc-200"
              >
                <Icon className="h-[16px] w-[16px] text-[#c99a22]" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-white/[0.05] bg-[#040504] px-3 pb-3 pt-3">
        <div className="flex items-center gap-3 rounded-[12px] px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-[#111] text-[10px] font-semibold text-zinc-300">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} /> : initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-medium text-zinc-300">{displayName}</p>
            <p className="mt-0.5 truncate text-[9px] text-zinc-600">{isGuest ? "Гостевой доступ" : "Solo-founder"}</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.6)]" />
        </div>

        <div className="mt-1 flex items-center gap-3 rounded-[12px] border border-[#d9a928]/15 bg-[#0d0b06] px-3 py-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#d9a928]/20 bg-[#171107] text-[#e2b52f]">
            <Crown className="h-[16px] w-[16px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] font-semibold tracking-[.03em] text-[#dfb333]">MALIK AI TITAN</p>
            <p className="mt-0.5 truncate text-[8.5px] text-zinc-600">{planLabel}</p>
          </div>
          <Sparkles className="h-[14px] w-[14px] text-[#c79820]" />
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1 border-t border-white/[0.045] pt-2">
          <button type="button" onClick={() => openView("settings")} aria-label="Настройки" className="grid h-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"><Settings className="h-[15px] w-[15px]" /></button>
          <button type="button" onClick={() => openView("capabilities")} aria-label="Возможности" className="grid h-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"><Sparkles className="h-[15px] w-[15px]" /></button>
          <button type="button" onClick={() => openView("support")} aria-label="Помощь" className="grid h-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"><CircleHelp className="h-[15px] w-[15px]" /></button>
          <button type="button" onClick={logout} aria-label="Выйти" className="grid h-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-red-500/[0.06] hover:text-red-300"><LogOut className="h-[15px] w-[15px]" /></button>
        </div>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
