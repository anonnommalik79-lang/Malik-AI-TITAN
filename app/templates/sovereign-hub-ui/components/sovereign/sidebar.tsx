"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioLines,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  ChevronRight,
  Crown,
  Languages,
  Code2,
  CreditCard,
  FileText,
  FolderKanban,
  Globe2,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Newspaper,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Presentation,
  Rocket,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Video,
  Wand2,
} from "lucide-react"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/supabase"
import { prefetchStudioChunks } from "@/lib/studio-prefetch"
import { prefillPrompt } from "@/lib/malik-context"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const GROUP_STATE_KEY = "malik.sidebar.groups.v1"

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
  /** Opens the ⌘K command palette. Falls back to a window event picked up by the header. */
  onOpenSearch?: () => void
}

type NavItem = {
  id: string
  icon: typeof Home
  label: string
  /** Shown as a native tooltip; keeps the rail itself single-line and quiet. */
  hint?: string
  children?: NavItem[]
}

type NavGroup = {
  id: string
  title?: string
  items: NavItem[]
}

/**
 * Laid out to match the design, with one rule kept from the cleanup: every entry
 * lands on a screen that exists. Three labels in the mockup have no dedicated
 * view, so they point at the closest real one rather than at nothing —
 * "База знаний" opens the capability library, "Агенты AI" opens Command Center.
 * The build studios stay behind one collapsed row so six working screens are
 * still reachable without adding six lines to the design.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "main",
    items: [
      { id: "home", icon: Home, label: "Главная", hint: "Стартовый экран и композер" },
      { id: "chats", icon: MessageSquare, label: "Чат", hint: "Все диалоги" },
      { id: "projects", icon: FolderKanban, label: "Проекты" },
      { id: "templates", icon: LayoutTemplate, label: "Библиотека", hint: "Готовые шаблоны" },
      { id: "capabilities", icon: BookOpen, label: "База знаний", hint: "Библиотека готовых AI-сценариев" },
      { id: "photo-generation", icon: ImageIcon, label: "Изображения", hint: "MALIK Vision" },
      { id: "video-generation", icon: Video, label: "Видео", hint: "MALIK Cinema" },
      { id: "code-generation", icon: Code2, label: "Код", hint: "Генерация файлов и модулей" },
      { id: "command-center", icon: Bot, label: "Агенты AI", hint: "Действия и управление агентами" },
      { id: "dashboard-generation", icon: BarChart3, label: "Аналитика", hint: "Сборка дашбордов и отчётов" },
      { id: "website-generation", icon: Globe2, label: "Сайты", hint: "Сборка страниц с превью" },
      {
        id: "studios",
        icon: Palette,
        label: "Студии сборки",
        children: [
          { id: "ai-generator", icon: Wand2, label: "AI Генератор" },
          { id: "component-generation", icon: Layers, label: "Компоненты" },
          { id: "landing-generation", icon: Rocket, label: "Лендинги" },
          { id: "document-generation", icon: FileText, label: "Документы" },
          { id: "presentation-generation", icon: Presentation, label: "Презентации" },
          { id: "template-generation", icon: LayoutTemplate, label: "Генератор шаблонов" },
          { id: "business-command-center", icon: Briefcase, label: "Бизнес-центр" },
          { id: "media-newsroom", icon: Newspaper, label: "Newsroom" },
          { id: "final-intelligence", icon: Sparkles, label: "Final Intelligence" },
          { id: "unbreakable-ai", icon: ShieldCheck, label: "Unbreakable AI" },
        ],
      },
    ],
  },
]

type ToolItem = {
  id: string
  icon: typeof Home
  label: string
  badge?: string
}

const TOOL_ITEMS: ToolItem[] = [
  { id: "codex", icon: Terminal, label: "Malik Codex", badge: "NEW" },
  { id: "voice", icon: AudioLines, label: "Voice AI", badge: "NEW" },
  { id: "translate", icon: Languages, label: "Translator" },
  { id: "data", icon: BarChart3, label: "Анализ данных" },
]

const RAIL_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

const PROFILE_MENU = [
  { id: "settings", icon: Settings, label: "Настройки" },
  { id: "billing", icon: CreditCard, label: "Подписка и биллинг" },
  { id: "support", icon: LifeBuoy, label: "Поддержка" },
]

function formatChatTime(value: Date) {
  try {
    const date = value instanceof Date ? value : new Date(value)
    const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
    if (minutes < 1) return "сейчас"
    if (minutes < 60) return `${minutes} мин`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ч`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days} д`
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  } catch {
    return ""
  }
}

function readGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(GROUP_STATE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function SidebarInner({
  isCollapsed,
  onToggle,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  activeView = "home",
  onViewChange,
  chats = [],
  onLogout,
  onOpenCodex,
  onOpenSearch,
}: SidebarProps) {
  const [profile, setProfile] = useState<ReturnType<typeof getStoredAuthSnapshot>>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const update = () => setProfile(getStoredAuthSnapshot())
    update()
    window.addEventListener("malik-auth-updated", update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener("malik-auth-updated", update)
      window.removeEventListener("storage", update)
    }
  }, [])

  useEffect(() => {
    setOpenGroups(readGroupState())
  }, [])

  // Keep the disclosure open when the active view lives inside it.
  const parentOfActive = useMemo(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.children?.some((child) => child.id === activeView)) return item.id
      }
    }
    return null
  }, [activeView])

  useEffect(() => {
    if (!parentOfActive) return
    setOpenGroups((prev) => (prev[parentOfActive] ? prev : { ...prev, [parentOfActive]: true }))
  }, [parentOfActive])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  const email = profile?.email || "guest@malik.ai"
  const name = profile?.name || "Гость"
  const avatar = profile?.avatar || buildFallbackAvatar(email)
  const isGuest = /guest|anonymous/i.test(email)
  const displayName = isGuest ? "Гостевой доступ" : name
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "M"
  const isPro = Boolean(profile?.isAdmin) || !isGuest
  const roleLabel = profile?.isAdmin ? "Соло-фаундер" : isGuest ? "Free plan" : "Pro workspace"

  const recentChats = useMemo(() => chats.slice(0, 5), [chats])
  const counters = useMemo<Record<string, number>>(() => ({ chats: chats.length }), [chats.length])

  const openView = useCallback(
    (view: string) => {
      onViewChange?.(view)
      setMenuOpen(false)
    },
    [onViewChange],
  )

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(next))
      } catch {
        /* storage can be unavailable — the sidebar still works, it just won't remember */
      }
      return next
    })
  }, [])

  /**
   * The four tools in the design have no screens of their own. Rather than add
   * navigation that leads nowhere, each one does the thing it names using what
   * the app already has: Codex opens its console, Voice AI focuses the composer
   * where the microphone lives, Translator and Анализ данных drop a starting
   * prompt into that same composer.
   */
  const runTool = useCallback(
    (id: string) => {
      setMenuOpen(false)
      if (id === "codex") {
        onOpenCodex?.()
        return
      }
      onViewChange?.("home")
      if (id === "voice") {
        window.setTimeout(() => {
          document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")?.focus()
        }, 60)
        return
      }
      if (id === "translate") {
        prefillPrompt("Переведи текст ниже на казахский и английский, сохрани смысл и тон:\n\n")
        return
      }
      if (id === "data") {
        prefillPrompt("Проанализируй данные ниже: найди тренды, аномалии и три вывода с цифрами.\n\n")
      }
    },
    [onOpenCodex, onViewChange],
  )

  const openSearch = useCallback(() => {
    if (onOpenSearch) {
      onOpenSearch()
      return
    }
    window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
  }, [onOpenSearch])

  const handleLogout = async () => {
    setMenuOpen(false)
    await signOutMalik()
    onLogout?.()
  }

  const showTooltip = (label: string) => (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }
  const hideTooltip = () => setTooltip(null)

  /* ------------------------------------------------------------------ rail */

  if (isCollapsed) {
    return (
      <aside className="malik-sidebar flex h-[100dvh] w-16 shrink-0 flex-col border-r border-[var(--malik-hairline,rgba(255,255,255,.06))] bg-[var(--malik-bg,#0a0a0b)] text-white">
        <div className="flex h-14 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Развернуть панель"
            onMouseEnter={showTooltip("Развернуть панель")}
            onMouseLeave={hideTooltip}
            className="malik-sidebar-icon-btn"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Новый чат"
            onMouseEnter={showTooltip("Новый чат")}
            onMouseLeave={hideTooltip}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black transition hover:bg-zinc-200"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Поиск"
            onMouseEnter={showTooltip("Поиск · Ctrl K")}
            onMouseLeave={hideTooltip}
            className="malik-sidebar-icon-btn"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        </div>

        <nav aria-label="Навигация" className="malik-sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.children
              ? item.children.some((child) => child.id === activeView)
              : activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => openView(item.children ? item.children[0].id : item.id)}
                onMouseEnter={(event) => {
                  prefetchStudioChunks()
                  showTooltip(item.label)(event)
                }}
                onMouseLeave={hideTooltip}
                onFocus={prefetchStudioChunks}
                className={cn("malik-sidebar-rail-btn", isActive && "is-active")}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            )
          })}
        </nav>

        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-[var(--malik-hairline,rgba(255,255,255,.06))] p-2">
          <button
            type="button"
            onClick={onOpenCodex}
            aria-label="Malik Codex"
            onMouseEnter={showTooltip("Malik Codex")}
            onMouseLeave={hideTooltip}
            className="malik-sidebar-icon-btn"
          >
            <Terminal className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => openView("settings")}
            aria-label="Настройки"
            onMouseEnter={showTooltip("Настройки")}
            onMouseLeave={hideTooltip}
            className="malik-sidebar-icon-btn"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <img
            src={avatar}
            alt=""
            className="mt-1 h-8 w-8 rounded-lg object-cover"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden"
            }}
          />
        </div>

        {tooltip ? (
          <div className="malik-sidebar-tooltip" style={{ top: tooltip.top }}>
            {tooltip.label}
          </div>
        ) : null}

        <SidebarStyles />
      </aside>
    )
  }

  /* -------------------------------------------------------------- expanded */

  const renderItem = (item: NavItem, depth = 0) => {
    const Icon = item.icon
    const count = counters[item.id]

    if (item.children) {
      const isOpen = Boolean(openGroups[item.id])
      const hasActiveChild = item.children.some((child) => child.id === activeView)
      return (
        <div key={item.id}>
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggleGroup(item.id)}
            onMouseEnter={prefetchStudioChunks}
            className={cn("malik-sidebar-item", hasActiveChild && !isOpen && "is-active")}
          >
            <Icon className="malik-sidebar-item-icon" />
            <span className="malik-sidebar-item-label">{item.label}</span>
            <ChevronRight className={cn("malik-sidebar-chevron", isOpen && "is-open")} />
          </button>
          {isOpen ? (
            <div className="malik-sidebar-subtree">{item.children.map((child) => renderItem(child, depth + 1))}</div>
          ) : null}
        </div>
      )
    }

    const isActive = activeView === item.id
    return (
      <button
        key={item.id}
        type="button"
        title={item.hint}
        aria-current={isActive ? "page" : undefined}
        onClick={() => openView(item.id)}
        onMouseEnter={prefetchStudioChunks}
        onFocus={prefetchStudioChunks}
        className={cn("malik-sidebar-item", isActive && "is-active", depth > 0 && "is-nested")}
      >
        <Icon className="malik-sidebar-item-icon" />
        <span className="malik-sidebar-item-label">{item.label}</span>
        {count ? <span className="malik-sidebar-count">{count > 99 ? "99+" : count}</span> : null}
      </button>
    )
  }

  return (
    <aside className="malik-sidebar relative flex h-[100dvh] w-[264px] max-w-[86vw] shrink-0 flex-col border-r border-[var(--malik-hairline,rgba(255,255,255,.06))] bg-[var(--malik-bg,#0a0a0b)] text-white">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
            <svg viewBox="0 0 44 44" className="h-4 w-4" aria-hidden="true">
              <path d="M9 29 L22 15 L22 29 Z" fill="#0A0A0C" />
              <path d="M24 15 H38 L24 29 Z" fill="#0A0A0C" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight">MALIK AI</span>
            <span className="block truncate text-[10px] leading-tight text-zinc-600">v6.5 Titan</span>
          </span>
        </div>
        <button type="button" onClick={onToggle} aria-label="Свернуть панель" className="malik-sidebar-icon-btn">
          <PanelLeftClose className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="shrink-0 space-y-1.5 px-3 pb-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-semibold text-black transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Plus className="h-4 w-4" />
          Новый чат
        </button>
        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 text-[13px] text-zinc-500 transition hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Поиск</span>
          <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-zinc-600">Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="Навигация" className="malik-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className={group.title ? "mt-5 first:mt-0" : ""}>
            {group.title ? <p className="malik-sidebar-group-title">{group.title}</p> : null}
            <div className="space-y-0.5">{group.items.map((item) => renderItem(item))}</div>
          </div>
        ))}

        <div className="mt-5">
          <p className="malik-sidebar-group-title">Инструменты</p>
          <div className="space-y-0.5">
            {TOOL_ITEMS.map((tool) => {
              const Icon = tool.icon
              return (
                <button key={tool.id} type="button" onClick={() => runTool(tool.id)} className="malik-sidebar-item">
                  <Icon className="malik-sidebar-item-icon" />
                  <span className="malik-sidebar-item-label">{tool.label}</span>
                  {tool.badge ? <span className="malik-sidebar-tag">{tool.badge}</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        {recentChats.length > 0 ? (
          <div className="mt-5">
            <p className="malik-sidebar-group-title">Недавние</p>
            <div className="space-y-0.5">
              {recentChats.map((chat) => (
                <div key={chat.id} className="malik-sidebar-recent group">
                  <button type="button" onClick={() => onSelectChat?.(chat.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] leading-tight text-zinc-400 transition group-hover:text-zinc-100">
                      {chat.title}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-zinc-600">
                      {formatChatTime(chat.timestamp)}
                    </span>
                  </button>
                  {onDeleteChat ? (
                    <button
                      type="button"
                      aria-label={`Удалить «${chat.title}»`}
                      onClick={() => onDeleteChat(chat.id)}
                      className="shrink-0 rounded-md p-1 text-zinc-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div ref={menuRef} className="relative shrink-0 border-t border-[var(--malik-hairline,rgba(255,255,255,.06))] p-2">
        {menuOpen ? (
          <div
            role="menu"
            className="absolute bottom-full left-2 right-2 mb-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#141417] p-1 shadow-2xl shadow-black/60"
          >
            <p className="truncate px-2.5 py-2 text-[11px] text-zinc-500">{email}</p>
            <div className="my-1 h-px bg-white/[0.07]" />
            {PROFILE_MENU.map((entry) => {
              const Icon = entry.icon
              return (
                <button key={entry.id} type="button" role="menuitem" onClick={() => openView(entry.id)} className="malik-sidebar-menu-item">
                  <Icon className="h-4 w-4" />
                  {entry.label}
                </button>
              )
            })}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onOpenCodex?.()
              }}
              className="malik-sidebar-menu-item"
            >
              <Terminal className="h-4 w-4" />
              Malik Codex
            </button>
            {profile?.isAdmin ? (
              <button type="button" role="menuitem" onClick={() => openView("command-center")} className="malik-sidebar-menu-item">
                <Shield className="h-4 w-4" />
                Админ-консоль
              </button>
            ) : null}
            <div className="my-1 h-px bg-white/[0.07]" />
            <button type="button" role="menuitem" onClick={handleLogout} className="malik-sidebar-menu-item is-danger">
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        ) : null}

        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="malik-sidebar-user"
        >
          <span className="malik-sidebar-user-avatar">
            <img
              src={avatar}
              alt=""
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden"
              }}
            />
            <span>{initials}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="malik-sidebar-user-name">{displayName}</span>
            <span className="malik-sidebar-user-role">{roleLabel}</span>
          </span>
          <span className="malik-sidebar-user-dot" aria-hidden="true" />
        </button>

        <button type="button" onClick={() => openView("billing")} className="malik-sidebar-premium">
          <span className="malik-sidebar-premium-mark" aria-hidden="true">
            <svg viewBox="0 0 44 44">
              <path d="M9 29 L22 15 L22 29 Z" fill="#1b1405" />
              <path d="M24 15 H38 L24 29 Z" fill="#1b1405" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="malik-sidebar-premium-title">MALIK AI TITAN</span>
            <span className="malik-sidebar-premium-note">{isPro ? "Премиум активен" : "Открыть премиум"}</span>
          </span>
          <Crown className="h-4 w-4 shrink-0 text-[var(--malik-accent-bright,#e8c56a)]" />
        </button>

        <div className="malik-sidebar-quickrow">
          <button type="button" onClick={() => openView("settings")} aria-label="Настройки" className="malik-sidebar-icon-btn">
            <Settings className="h-[17px] w-[17px]" />
          </button>
          <button type="button" onClick={() => openView("capabilities")} aria-label="Возможности" className="malik-sidebar-icon-btn">
            <Sparkles className="h-[17px] w-[17px]" />
          </button>
          <button type="button" onClick={() => openView("support")} aria-label="Поддержка" className="malik-sidebar-icon-btn">
            <LifeBuoy className="h-[17px] w-[17px]" />
          </button>
          <button type="button" onClick={handleLogout} aria-label="Выйти" className="malik-sidebar-icon-btn is-danger">
            <LogOut className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>

      <SidebarStyles />
    </aside>
  )
}

function SidebarStyles() {
  return (
    <style jsx global>{`
      .malik-sidebar {
        contain: layout paint;
        font-feature-settings: "cv02", "cv03", "cv04", "cv11";
      }
      .malik-sidebar-scroll {
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }
      .malik-sidebar-scroll:hover {
        scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
      }
      .malik-sidebar-scroll::-webkit-scrollbar {
        width: 8px;
      }
      .malik-sidebar-scroll::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        background-clip: content-box;
        border-radius: 999px;
        background-color: transparent;
      }
      .malik-sidebar-scroll:hover::-webkit-scrollbar-thumb {
        background-color: rgba(255, 255, 255, 0.14);
      }

      .malik-sidebar-group-title {
        margin: 0 0 4px;
        padding: 0 8px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #5b5b63;
      }

      .malik-sidebar-item {
        position: relative;
        display: flex;
        width: 100%;
        align-items: center;
        gap: 10px;
        height: 32px;
        padding: 0 8px;
        border-radius: 8px;
        color: #a1a1aa;
        font-size: 13px;
        font-weight: 450;
        text-align: left;
        transition: background-color 0.13s ease, color 0.13s ease;
      }
      .malik-sidebar-item:hover {
        background-color: rgba(255, 255, 255, 0.045);
        color: #f4f4f5;
      }
      .malik-sidebar-item:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
      }
      .malik-sidebar-item.is-active {
        background-color: rgba(255, 255, 255, 0.075);
        color: #ffffff;
        font-weight: 500;
      }
      .malik-sidebar-item.is-active::before {
        content: "";
        position: absolute;
        left: -12px;
        top: 50%;
        height: 16px;
        width: 2px;
        transform: translateY(-50%);
        border-radius: 0 2px 2px 0;
        background: var(--malik-accent, #c9982f);
      }
      .malik-sidebar-item-icon {
        height: 16px;
        width: 16px;
        flex-shrink: 0;
        color: #71717a;
        transition: color 0.13s ease;
      }
      .malik-sidebar-item:hover .malik-sidebar-item-icon,
      .malik-sidebar-item.is-active .malik-sidebar-item-icon {
        color: currentColor;
      }
      .malik-sidebar-item-label {
        min-width: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .malik-sidebar-item.is-nested {
        height: 30px;
        font-size: 12.5px;
      }

      .malik-sidebar-count {
        flex-shrink: 0;
        min-width: 18px;
        border-radius: 999px;
        padding: 1px 5px;
        text-align: center;
        font-size: 10px;
        font-weight: 500;
        color: #8a8a93;
        background: rgba(255, 255, 255, 0.06);
      }

      .malik-sidebar-chevron {
        height: 14px;
        width: 14px;
        flex-shrink: 0;
        color: #52525b;
        transition: transform 0.15s ease;
      }
      .malik-sidebar-chevron.is-open {
        transform: rotate(90deg);
      }
      .malik-sidebar-subtree {
        margin: 2px 0 2px 15px;
        padding-left: 9px;
        border-left: 1px solid rgba(255, 255, 255, 0.07);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .malik-sidebar-subtree .malik-sidebar-item.is-active::before {
        left: -10px;
      }

      .malik-sidebar-recent {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 8px;
        padding: 5px 8px;
        transition: background-color 0.13s ease;
      }
      .malik-sidebar-recent:hover {
        background-color: rgba(255, 255, 255, 0.045);
      }

      .malik-sidebar-icon-btn {
        display: flex;
        height: 30px;
        width: 30px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: #71717a;
        transition: background-color 0.13s ease, color 0.13s ease;
      }
      .malik-sidebar-icon-btn:hover {
        background-color: rgba(255, 255, 255, 0.06);
        color: #ffffff;
      }
      .malik-sidebar-icon-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
      }

      .malik-sidebar-rail-btn {
        position: relative;
        display: flex;
        height: 36px;
        width: 100%;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: #71717a;
        transition: background-color 0.13s ease, color 0.13s ease;
      }
      .malik-sidebar-rail-btn:hover {
        background-color: rgba(255, 255, 255, 0.05);
        color: #f4f4f5;
      }
      .malik-sidebar-rail-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
      }
      .malik-sidebar-rail-btn.is-active {
        background-color: rgba(255, 255, 255, 0.075);
        color: #ffffff;
      }
      .malik-sidebar-rail-btn.is-active::before {
        content: "";
        position: absolute;
        left: -8px;
        top: 50%;
        height: 16px;
        width: 2px;
        transform: translateY(-50%);
        border-radius: 0 2px 2px 0;
        background: var(--malik-accent, #c9982f);
      }

      .malik-sidebar-tooltip {
        position: fixed;
        left: 70px;
        z-index: 120;
        transform: translateY(-50%);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.09);
        background: var(--malik-surface-raised, #121214);
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 450;
        color: #e4e4e7;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      }

      .malik-sidebar-menu-item {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 9px;
        border-radius: 7px;
        padding: 7px 10px;
        font-size: 13px;
        color: #d4d4d8;
        text-align: left;
        transition: background-color 0.13s ease, color 0.13s ease;
      }
      .malik-sidebar-menu-item:hover {
        background-color: rgba(255, 255, 255, 0.06);
        color: #ffffff;
      }
      .malik-sidebar-menu-item:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
      }
      .malik-sidebar-menu-item.is-danger {
        color: #fca5a5;
      }
      /* ---------------------------------------------------- tools + footer */

      .malik-sidebar-tag {
        flex-shrink: 0;
        border-radius: 5px;
        border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
        background: var(--malik-accent-8, rgba(212, 175, 55, 0.08));
        padding: 1px 5px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--malik-accent-pale, #f3de96);
      }

      .malik-sidebar-user {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 10px;
        border-radius: 10px;
        padding: 8px;
        text-align: left;
        transition: background-color 0.13s ease;
      }
      .malik-sidebar-user:hover {
        background: var(--malik-accent-4, rgba(212, 175, 55, 0.04));
      }
      .malik-sidebar-user:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
      }
      .malik-sidebar-user-avatar {
        position: relative;
        display: flex;
        height: 32px;
        width: 32px;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 999px;
        border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
        background: var(--malik-gradient-gold, linear-gradient(135deg, #f3de96, #a87c22));
        color: #1b1405;
        font-size: 11px;
        font-weight: 700;
      }
      .malik-sidebar-user-avatar img {
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
        object-fit: cover;
      }
      .malik-sidebar-user-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.2;
        color: #efe9dc;
      }
      .malik-sidebar-user-role {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        line-height: 1.2;
        color: #6f695f;
      }
      .malik-sidebar-user-dot {
        height: 7px;
        width: 7px;
        flex-shrink: 0;
        border-radius: 999px;
        background: #34d399;
      }

      .malik-sidebar-premium {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 10px;
        margin-top: 6px;
        border-radius: 12px;
        border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
        background:
          radial-gradient(140% 120% at 0% 0%, rgba(201, 152, 47, 0.18), transparent 62%),
          var(--malik-surface-raised, #121214);
        padding: 9px 10px;
        text-align: left;
        transition: border-color 0.13s ease, background-color 0.13s ease;
      }
      .malik-sidebar-premium:hover {
        border-color: rgba(232, 197, 106, 0.5);
      }
      .malik-sidebar-premium:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
      }
      .malik-sidebar-premium-mark {
        display: flex;
        height: 26px;
        width: 26px;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: var(--malik-gradient-gold, linear-gradient(135deg, #f3de96, #a87c22));
      }
      .malik-sidebar-premium-mark svg {
        height: 16px;
        width: 16px;
      }
      .malik-sidebar-premium-title {
        display: block;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        color: var(--malik-accent-pale, #f3de96);
      }
      .malik-sidebar-premium-note {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.2;
        color: #8f887d;
      }

      .malik-sidebar-quickrow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        margin-top: 8px;
        border-top: 1px solid var(--malik-hairline, rgba(255, 255, 255, 0.06));
        padding-top: 8px;
      }
      .malik-sidebar-quickrow .malik-sidebar-icon-btn.is-danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #fca5a5;
      }

      .malik-sidebar-menu-item.is-danger:hover {
        background-color: rgba(239, 68, 68, 0.1);
        color: #fecaca;
      }

      @media (prefers-reduced-motion: reduce) {
        .malik-sidebar * {
          transition: none !important;
        }
      }
    `}</style>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
