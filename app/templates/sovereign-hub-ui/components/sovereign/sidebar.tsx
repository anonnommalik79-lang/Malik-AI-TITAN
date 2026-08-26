"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart3,
  BookOpen,
  Bot,
  Code2,
  CreditCard,
  Crown,
  FolderKanban,
  Globe2,
  Image as ImageIcon,
  Languages,
  LayoutTemplate,
  LifeBuoy,
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Search,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Video,
} from "lucide-react"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/auth/client-session"
import { prefetchStudioChunks } from "@/lib/studio-prefetch"
import { prefillPrompt } from "@/lib/malik-context"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

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
  onRenameChat?: (chatId: string, title: string) => void
  onTogglePinChat?: (chatId: string) => void
  activeChatId?: string | null
  activeView?: string
  onViewChange?: (view: string) => void
  chats?: Chat[]
  onLogout?: () => void
  onOpenCodex?: () => void
  onOpenSearch?: () => void
  onOpenVoice?: () => void
}

type SidebarAction = {
  id: string
  label: string
  icon: typeof LayoutTemplate
  view?: string
  action?: "new" | "codex" | "voice"
}

const PRIMARY_ACTIONS: SidebarAction[] = [
  { id: "new", label: "Новый чат", icon: MessageSquarePlus, action: "new" },
  { id: "library", label: "Библиотека", icon: LayoutTemplate, view: "templates" },
  { id: "projects", label: "Проекты", icon: FolderKanban, view: "projects" },
  { id: "plugins", label: "Плагины", icon: Plug, view: "features" },
]

const MORE_ACTIONS: SidebarAction[] = [
  { id: "knowledge", label: "База знаний", icon: BookOpen, view: "capabilities" },
  { id: "images", label: "Изображения", icon: ImageIcon, view: "photo-generation" },
  { id: "video", label: "Видео", icon: Video, view: "video-generation" },
  { id: "code", label: "Код", icon: Code2, view: "code-generation" },
  { id: "agents", label: "Агенты AI", icon: Bot, view: "command-center" },
  { id: "analytics", label: "Аналитика", icon: BarChart3, view: "dashboard-generation" },
  { id: "sites", label: "Сайты", icon: Globe2, view: "website-generation" },
  { id: "studio", label: "Студия сборки", icon: Sparkles, view: "ai-generator" },
  { id: "codex", label: "Malik Codex", icon: Terminal, action: "codex" },
  { id: "voice", label: "Voice AI", icon: Shield, action: "voice" },
]

const TOOL_ACTIONS = [
  { id: "translate", label: "Переводчик", icon: Languages },
  { id: "data", label: "Анализ данных", icon: BarChart3 },
] as const

const PROFILE_MENU = [
  { id: "settings", icon: Settings, label: "Настройки" },
  { id: "billing", icon: CreditCard, label: "Подписка и биллинг" },
  { id: "support", icon: LifeBuoy, label: "Поддержка" },
]

function SidebarInner({
  isCollapsed,
  onToggle,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onTogglePinChat,
  activeChatId,
  activeView = "home",
  onViewChange,
  chats = [],
  onLogout,
  onOpenCodex,
  onOpenSearch,
  onOpenVoice,
}: SidebarProps) {
  const [profile, setProfile] = useState<ReturnType<typeof getStoredAuthSnapshot>>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [chatMenuId, setChatMenuId] = useState<string | null>(null)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)

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
    if (!editingChatId) return
    editInputRef.current?.focus()
    editInputRef.current?.select()
  }, [editingChatId])

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false)
        setMoreOpen(false)
        setChatMenuId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setProfileMenuOpen(false)
      setMoreOpen(false)
      setChatMenuId(null)
      setEditingChatId(null)
    }
    document.addEventListener("mousedown", closeMenus)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeMenus)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  const orderedChats = useMemo(
    () => [...chats].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [chats],
  )
  const pinnedChats = useMemo(() => orderedChats.filter((chat) => chat.isPinned), [orderedChats])
  const recentChats = useMemo(() => orderedChats.filter((chat) => !chat.isPinned), [orderedChats])

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

  const openView = useCallback((view: string) => {
    setMoreOpen(false)
    setProfileMenuOpen(false)
    setChatMenuId(null)
    onViewChange?.(view)
  }, [onViewChange])

  const openSearch = useCallback(() => {
    if (onOpenSearch) onOpenSearch()
    else window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
  }, [onOpenSearch])

  const runAction = useCallback((action: SidebarAction) => {
    setMoreOpen(false)
    if (action.action === "new") {
      onNewChat?.()
      return
    }
    if (action.action === "codex") {
      onOpenCodex?.()
      return
    }
    if (action.action === "voice") {
      onOpenVoice?.()
      return
    }
    if (action.view) openView(action.view)
  }, [onNewChat, onOpenCodex, onOpenVoice, openView])

  const runTool = useCallback((id: (typeof TOOL_ACTIONS)[number]["id"]) => {
    onViewChange?.("home")
    if (id === "translate") {
      prefillPrompt("Переведи текст ниже на нужный язык, сохрани смысл, факты и тон:\n\n")
    } else {
      prefillPrompt("Проанализируй данные ниже: найди тренды, аномалии и дай выводы с цифрами.\n\n")
    }
  }, [onViewChange])

  const saveRename = useCallback((chatId: string) => {
    const title = editingTitle.trim()
    if (title) onRenameChat?.(chatId, title)
    setEditingChatId(null)
    setEditingTitle("")
  }, [editingTitle, onRenameChat])

  const requestDelete = useCallback((chat: Chat) => {
    setChatMenuId(null)
    if (window.confirm(`Удалить чат «${chat.title}»? Это действие нельзя отменить.`)) onDeleteChat?.(chat.id)
  }, [onDeleteChat])

  const handleLogout = async () => {
    setProfileMenuOpen(false)
    await signOutMalik()
    onLogout?.()
  }

  const showTooltip = (label: string) => (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }

  const renderRailButton = (action: SidebarAction) => {
    const Icon = action.icon
    const isActive = action.view === activeView
    return (
      <button
        key={action.id}
        type="button"
        aria-label={action.label}
        aria-current={isActive ? "page" : undefined}
        onClick={() => runAction(action)}
        onMouseEnter={showTooltip(action.label)}
        onMouseLeave={() => setTooltip(null)}
        className={cn("malik-sidebar-rail-btn", isActive && "is-active")}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
    )
  }

  if (isCollapsed) {
    return (
      <aside ref={sidebarRef} data-collapsed="true" className="malik-sidebar flex h-[100dvh] w-16 shrink-0 flex-col border-r border-[var(--malik-hairline,rgba(255,255,255,.06))] bg-[#050506] text-white">
        <div className="flex h-14 shrink-0 items-center justify-center">
          <button type="button" onClick={onToggle} aria-label="Развернуть панель" onMouseEnter={showTooltip("Развернуть панель")} onMouseLeave={() => setTooltip(null)} className="malik-sidebar-icon-btn">
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
        </div>
        <nav aria-label="Навигация" className="malik-sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {PRIMARY_ACTIONS.map(renderRailButton)}
          <button type="button" aria-label="Больше" onClick={() => onToggle()} onMouseEnter={showTooltip("Больше")} onMouseLeave={() => setTooltip(null)} className="malik-sidebar-rail-btn">
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>
        </nav>
        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-[var(--malik-hairline,rgba(255,255,255,.06))] p-2">
          <button type="button" onClick={() => openView("settings")} aria-label="Настройки" className="malik-sidebar-icon-btn"><Settings className="h-[18px] w-[18px]" /></button>
          <img src={avatar} alt="" className="mt-1 h-8 w-8 rounded-full object-cover" />
        </div>
        {tooltip ? <div className="malik-sidebar-tooltip" style={{ top: tooltip.top }}>{tooltip.label}</div> : null}
        <SidebarStyles />
      </aside>
    )
  }

  const renderChatGroup = (label: string, list: Chat[]) => {
    if (!list.length) return null
    return (
      <section className="malik-sidebar-chat-group" aria-label={label}>
        <p className="malik-sidebar-group-title">{label}</p>
        <div className="space-y-0.5">
          {list.map((chat) => {
            const isSelected = chat.id === activeChatId
            const menuOpen = chatMenuId === chat.id
            return (
              <div key={chat.id} className={cn("malik-sidebar-chat-row group", isSelected && "is-active", menuOpen && "is-menu-open")}>
                {editingChatId === chat.id ? (
                  <input
                    ref={editInputRef}
                    value={editingTitle}
                    maxLength={90}
                    aria-label="Новое название чата"
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={() => saveRename(chat.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveRename(chat.id)
                      if (event.key === "Escape") setEditingChatId(null)
                    }}
                    className="malik-sidebar-rename-input"
                  />
                ) : (
                  <button type="button" onClick={() => { setChatMenuId(null); onSelectChat?.(chat.id) }} className="malik-sidebar-chat-title" title={chat.title}>
                    {chat.title}
                  </button>
                )}
                {editingChatId !== chat.id ? (
                  <button
                    type="button"
                    aria-label={`Действия с чатом «${chat.title}»`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(event) => { event.stopPropagation(); setChatMenuId((current) => current === chat.id ? null : chat.id) }}
                    className="malik-sidebar-chat-more"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                ) : null}
                {menuOpen ? (
                  <div role="menu" className="malik-sidebar-chat-menu">
                    <button type="button" role="menuitem" onClick={() => { setEditingChatId(chat.id); setEditingTitle(chat.title); setChatMenuId(null) }}>
                      <Pencil className="h-3.5 w-3.5" /> Переименовать
                    </button>
                    <button type="button" role="menuitem" onClick={() => { onTogglePinChat?.(chat.id); setChatMenuId(null) }}>
                      {chat.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      {chat.isPinned ? "Открепить" : "Закрепить"}
                    </button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => requestDelete(chat)}>
                      <Trash2 className="h-3.5 w-3.5" /> Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <aside ref={sidebarRef} data-collapsed="false" className="malik-sidebar relative flex h-[100dvh] w-[250px] max-w-[86vw] shrink-0 flex-col border-r border-[var(--malik-hairline,rgba(255,255,255,.06))] bg-[#050506] text-white">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
            <svg viewBox="0 0 44 44" className="h-4 w-4" aria-hidden="true"><path d="M9 29 L22 15 L22 29 Z" fill="#0A0A0C" /><path d="M24 15 H38 L24 29 Z" fill="#0A0A0C" /></svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight">MALIK AI</span>
            <span className="block truncate text-[10px] leading-tight text-zinc-600">v6.5 Titan</span>
          </span>
        </div>
        <button type="button" onClick={onToggle} aria-label="Свернуть панель" className="malik-sidebar-icon-btn"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
      </div>

      <div className="shrink-0 px-2.5 pb-2">
        <button type="button" onClick={openSearch} className="malik-sidebar-search">
          <Search className="h-4 w-4" /><span>Поиск</span><kbd>Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="Основная навигация" className="relative z-[60] shrink-0 px-2.5 pb-2">
        {PRIMARY_ACTIONS.map((action) => {
          const Icon = action.icon
          const isActive = action.view === activeView
          return (
            <button key={action.id} type="button" aria-current={isActive ? "page" : undefined} onClick={() => runAction(action)} className={cn("malik-sidebar-primary", isActive && "is-active")}>
              <Icon className="h-[17px] w-[17px]" /><span>{action.label}</span>
            </button>
          )
        })}
        <div className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => { setMoreOpen((open) => !open); setProfileMenuOpen(false) }} className={cn("malik-sidebar-primary", MORE_ACTIONS.some((item) => item.view === activeView) && "is-active")}>
            <MoreHorizontal className="h-[17px] w-[17px]" /><span>Больше</span>
          </button>
          {moreOpen ? (
            <div role="menu" className="malik-sidebar-more-menu">
              {MORE_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button key={action.id} type="button" role="menuitem" onMouseEnter={prefetchStudioChunks} onFocus={prefetchStudioChunks} onClick={() => runAction(action)} className={cn(action.view === activeView && "is-active")}>
                    <Icon className="h-4 w-4" /><span>{action.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="malik-sidebar-history min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {pinnedChats.length || recentChats.length ? (
          <>
            {renderChatGroup("Закреплённые", pinnedChats)}
            {renderChatGroup("Недавние", recentChats)}
          </>
        ) : (
          <div className="malik-sidebar-empty-history">
            <span>История пуста</span>
            <small>Новые диалоги появятся здесь</small>
          </div>
        )}
      </div>

      <div className="malik-sidebar-tools shrink-0 px-2.5 py-2">
        <p className="malik-sidebar-group-title">Инструменты</p>
        {TOOL_ACTIONS.map((tool) => {
          const Icon = tool.icon
          return (
            <button key={tool.id} type="button" onClick={() => runTool(tool.id)} className="malik-sidebar-primary">
              <Icon className="h-[17px] w-[17px]" /><span>{tool.label}</span>
            </button>
          )
        })}
      </div>

      <div className="relative shrink-0 border-t border-[var(--malik-hairline,rgba(255,255,255,.06))] p-2">
        {profileMenuOpen ? (
          <div role="menu" className="malik-sidebar-profile-menu">
            <p>{email}</p>
            <div className="malik-sidebar-menu-separator" />
            {PROFILE_MENU.map((entry) => {
              const Icon = entry.icon
              return <button key={entry.id} type="button" role="menuitem" onClick={() => openView(entry.id)}><Icon className="h-4 w-4" />{entry.label}</button>
            })}
            <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onOpenCodex?.() }}><Terminal className="h-4 w-4" />Malik Codex</button>
            {profile?.isAdmin ? <button type="button" role="menuitem" onClick={() => openView("command-center")}><Shield className="h-4 w-4" />Админ-консоль</button> : null}
            <div className="malik-sidebar-menu-separator" />
            <button type="button" role="menuitem" onClick={handleLogout} className="is-danger"><LogOut className="h-4 w-4" />Выйти</button>
          </div>
        ) : null}

        <button type="button" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => { setProfileMenuOpen((open) => !open); setMoreOpen(false) }} className="malik-sidebar-user">
          <span className="malik-sidebar-user-avatar"><img src={avatar} alt="" /><span>{initials}</span></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-user-name">{displayName}</span><span className="malik-sidebar-user-role">{roleLabel}</span></span>
          <span className="malik-sidebar-user-dot" aria-hidden="true" />
        </button>

        <button type="button" onClick={() => openView("billing")} className="malik-sidebar-premium">
          <span className="malik-sidebar-premium-mark" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M9 29 L22 15 L22 29 Z" fill="#1b1405" /><path d="M24 15 H38 L24 29 Z" fill="#1b1405" /></svg></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-premium-title">MALIK AI TITAN</span><span className="malik-sidebar-premium-note">{isPro ? "Премиум активен" : "Открыть премиум"}</span></span>
          <Crown className="h-4 w-4 shrink-0 text-[var(--malik-accent-bright,#e8c56a)]" />
        </button>

        <div className="malik-sidebar-quickrow">
          <button type="button" onClick={() => openView("settings")} aria-label="Настройки" className="malik-sidebar-icon-btn"><Settings className="h-[17px] w-[17px]" /></button>
          <button type="button" onClick={() => openView("capabilities")} aria-label="Возможности" className="malik-sidebar-icon-btn"><Sparkles className="h-[17px] w-[17px]" /></button>
          <button type="button" onClick={() => openView("support")} aria-label="Поддержка" className="malik-sidebar-icon-btn"><LifeBuoy className="h-[17px] w-[17px]" /></button>
          <button type="button" onClick={handleLogout} aria-label="Выйти" className="malik-sidebar-icon-btn is-danger"><LogOut className="h-[17px] w-[17px]" /></button>
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
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-feature-settings: "cv02", "cv03", "cv04", "cv11";
      }
      .malik-sidebar button { font: inherit; }
      .malik-sidebar-scroll,
      .malik-sidebar-history { scrollbar-width: thin; scrollbar-color: transparent transparent; }
      .malik-sidebar-scroll:hover,
      .malik-sidebar-history:hover { scrollbar-color: rgba(255,255,255,.16) transparent; }
      .malik-sidebar-scroll::-webkit-scrollbar,
      .malik-sidebar-history::-webkit-scrollbar { width: 7px; }
      .malik-sidebar-scroll::-webkit-scrollbar-thumb,
      .malik-sidebar-history::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background-clip: content-box; }
      .malik-sidebar-scroll:hover::-webkit-scrollbar-thumb,
      .malik-sidebar-history:hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.16); }

      .malik-sidebar-search { display:flex; width:100%; height:34px; align-items:center; gap:9px; border:1px solid rgba(255,255,255,.075); border-radius:9px; padding:0 9px; color:#6e6e78; background:rgba(255,255,255,.022); font-size:12.5px; transition:.14s ease; }
      .malik-sidebar-search:hover { color:#c7c7cf; background:rgba(255,255,255,.045); border-color:rgba(255,255,255,.12); }
      .malik-sidebar-search span { flex:1; text-align:left; }
      .malik-sidebar-search kbd { border:1px solid rgba(255,255,255,.09); border-radius:5px; padding:1px 5px; font-size:9px; color:#575760; }

      .malik-sidebar-primary { display:flex; width:100%; height:34px; align-items:center; gap:10px; border-radius:8px; padding:0 8px; color:#d2d2d6; font-size:13px; font-weight:450; text-align:left; transition:background-color .13s ease,color .13s ease; }
      .malik-sidebar-primary svg { flex-shrink:0; color:#a0a0aa; }
      .malik-sidebar-primary:hover { background:rgba(255,255,255,.055); color:#fff; }
      .malik-sidebar-primary.is-active { background:#202023; color:#fff; font-weight:520; }
      .malik-sidebar-primary.is-active svg { color:#fff; }

      .malik-sidebar-more-menu { position:absolute; z-index:80; top:calc(100% + 5px); left:0; width:216px; max-height:clamp(180px,calc(100dvh - 520px),380px); overflow-y:auto; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:#141416; padding:5px; box-shadow:0 20px 50px rgba(0,0,0,.65); }
      .malik-sidebar-more-menu button,
      .malik-sidebar-profile-menu button { display:flex; width:100%; align-items:center; gap:9px; border-radius:8px; padding:7px 9px; color:#d4d4d8; font-size:12.5px; text-align:left; }
      .malik-sidebar-more-menu button:hover,
      .malik-sidebar-more-menu button.is-active,
      .malik-sidebar-profile-menu button:hover { background:rgba(255,255,255,.07); color:#fff; }

      .malik-sidebar-history { border-top:1px solid rgba(255,255,255,.055); border-bottom:1px solid rgba(255,255,255,.055); }
      .malik-sidebar-chat-group + .malik-sidebar-chat-group { margin-top:14px; }
      .malik-sidebar-group-title { margin:0 0 5px; padding:0 7px; color:#72727c; font-size:10.5px; font-weight:520; letter-spacing:.02em; }
      .malik-sidebar-chat-row { position:relative; display:flex; height:34px; align-items:center; border-radius:8px; padding:0 4px 0 8px; color:#dedee3; transition:background-color .13s ease; }
      .malik-sidebar-chat-row:hover,
      .malik-sidebar-chat-row.is-menu-open { background:rgba(255,255,255,.05); }
      .malik-sidebar-chat-row.is-active { background:#202023; color:#fff; }
      .malik-sidebar-chat-title { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; font-size:12.5px; }
      .malik-sidebar-chat-more { display:flex; height:26px; width:26px; flex-shrink:0; align-items:center; justify-content:center; border-radius:7px; color:#7d7d86; opacity:0; }
      .malik-sidebar-chat-row:hover .malik-sidebar-chat-more,
      .malik-sidebar-chat-row.is-active .malik-sidebar-chat-more,
      .malik-sidebar-chat-row.is-menu-open .malik-sidebar-chat-more,
      .malik-sidebar-chat-more:focus-visible { opacity:1; }
      .malik-sidebar-chat-more:hover { background:rgba(255,255,255,.08); color:#fff; }
      .malik-sidebar-chat-menu { position:absolute; z-index:90; top:31px; right:0; width:164px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:#171719; padding:4px; box-shadow:0 18px 42px rgba(0,0,0,.7); }
      .malik-sidebar-chat-menu button { display:flex; width:100%; align-items:center; gap:8px; border-radius:7px; padding:7px 8px; color:#d4d4d8; font-size:12px; text-align:left; }
      .malik-sidebar-chat-menu button:hover { background:rgba(255,255,255,.07); color:#fff; }
      .malik-sidebar-chat-menu button.is-danger { color:#fca5a5; }
      .malik-sidebar-chat-menu button.is-danger:hover { background:rgba(239,68,68,.11); color:#fecaca; }
      .malik-sidebar-rename-input { min-width:0; flex:1; height:26px; border:1px solid rgba(232,197,106,.48); border-radius:6px; background:#111113; padding:0 7px; color:#fff; font-size:12.5px; outline:none; }
      .malik-sidebar-empty-history { display:flex; height:100%; min-height:88px; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#777780; }
      .malik-sidebar-empty-history span { font-size:12px; }
      .malik-sidebar-empty-history small { margin-top:3px; color:#505058; font-size:10.5px; }
      .malik-sidebar-tools { background:#050506; }

      .malik-sidebar-icon-btn { display:flex; height:30px; width:30px; align-items:center; justify-content:center; border-radius:8px; color:#797982; transition:.13s ease; }
      .malik-sidebar-icon-btn:hover { background:rgba(255,255,255,.06); color:#fff; }
      .malik-sidebar-icon-btn:focus-visible,
      .malik-sidebar-primary:focus-visible,
      .malik-sidebar-search:focus-visible { outline:none; box-shadow:0 0 0 2px rgba(255,255,255,.2); }
      .malik-sidebar-rail-btn { position:relative; display:flex; height:36px; width:100%; align-items:center; justify-content:center; border-radius:8px; color:#777780; }
      .malik-sidebar-rail-btn:hover,
      .malik-sidebar-rail-btn.is-active { background:rgba(255,255,255,.065); color:#fff; }
      .malik-sidebar-tooltip { position:fixed; left:70px; z-index:120; transform:translateY(-50%); border:1px solid rgba(255,255,255,.09); border-radius:7px; background:#151517; padding:5px 9px; color:#e4e4e7; font-size:12px; white-space:nowrap; pointer-events:none; box-shadow:0 10px 30px rgba(0,0,0,.55); }

      .malik-sidebar-profile-menu { position:absolute; z-index:100; bottom:calc(100% + 6px); left:8px; right:8px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:#141416; padding:5px; box-shadow:0 20px 50px rgba(0,0,0,.7); }
      .malik-sidebar-profile-menu p { overflow:hidden; margin:0; padding:7px 9px; color:#686871; font-size:10.5px; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-profile-menu button.is-danger { color:#fca5a5; }
      .malik-sidebar-profile-menu button.is-danger:hover { background:rgba(239,68,68,.1); }
      .malik-sidebar-menu-separator { height:1px; margin:4px; background:rgba(255,255,255,.07); }

      .malik-sidebar-user { display:flex; width:100%; align-items:center; gap:9px; border-radius:10px; padding:7px; text-align:left; }
      .malik-sidebar-user:hover { background:rgba(255,255,255,.04); }
      .malik-sidebar-user-avatar { position:relative; display:flex; height:30px; width:30px; flex-shrink:0; align-items:center; justify-content:center; overflow:hidden; border:1px solid rgba(212,175,55,.3); border-radius:999px; background:linear-gradient(135deg,#f3de96,#a87c22); color:#1b1405; font-size:10px; font-weight:700; }
      .malik-sidebar-user-avatar img { position:absolute; inset:0; height:100%; width:100%; object-fit:cover; }
      .malik-sidebar-user-name { display:block; overflow:hidden; color:#f0ece3; font-size:12.5px; font-weight:520; line-height:1.2; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-user-role { display:block; overflow:hidden; margin-top:2px; color:#706b62; font-size:10.5px; line-height:1.2; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-user-dot { height:7px; width:7px; flex-shrink:0; border-radius:999px; background:#34d399; box-shadow:0 0 0 2px rgba(52,211,153,.08); }

      .malik-sidebar-premium { display:flex; width:100%; align-items:center; gap:9px; margin-top:5px; border:1px solid rgba(212,175,55,.28); border-radius:11px; background:radial-gradient(140% 120% at 0% 0%,rgba(201,152,47,.18),transparent 62%),#121214; padding:8px 9px; text-align:left; }
      .malik-sidebar-premium:hover { border-color:rgba(232,197,106,.5); }
      .malik-sidebar-premium-mark { display:flex; height:25px; width:25px; flex-shrink:0; align-items:center; justify-content:center; border-radius:7px; background:linear-gradient(135deg,#f3de96,#a87c22); }
      .malik-sidebar-premium-mark svg { height:15px; width:15px; }
      .malik-sidebar-premium-title { display:block; color:#f3de96; font-size:11.5px; font-weight:620; line-height:1.2; }
      .malik-sidebar-premium-note { display:block; margin-top:2px; color:#8f887d; font-size:10.5px; line-height:1.2; }
      .malik-sidebar-quickrow { display:flex; align-items:center; justify-content:space-between; gap:4px; margin-top:7px; border-top:1px solid rgba(255,255,255,.06); padding-top:7px; }
      .malik-sidebar-quickrow .is-danger:hover { background:rgba(239,68,68,.1); color:#fca5a5; }

      @media (max-height: 780px) {
        .malik-sidebar-tools { padding-top:6px; padding-bottom:6px; }
        .malik-sidebar-primary { height:31px; }
        .malik-sidebar-premium { display:none; }
      }
      @media (prefers-reduced-motion: reduce) { .malik-sidebar * { transition:none !important; } }
    `}</style>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
