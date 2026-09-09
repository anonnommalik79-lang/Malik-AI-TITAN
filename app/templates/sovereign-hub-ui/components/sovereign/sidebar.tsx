"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart3,
  Briefcase,
  CircleHelp,
  Clapperboard,
  Cpu,
  Crown,
  Eye,
  FolderKanban,
  Image as ImageIcon,
  Languages,
  LayoutTemplate,
  LifeBuoy,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Mic,
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
  Sun,
  Terminal,
  Trash2,
  Video,
} from "lucide-react"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/auth/client-session"
import { prefillPrompt } from "@/lib/malik-context"
import type { AIPlan } from "@/lib/ai/types"
import { publicPlanTitle } from "@/lib/billing/plans"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

type ChatMessagePreview = {
  role?: "user" | "assistant"
  content?: string
}

interface Chat {
  id: string
  title: string
  timestamp: Date
  isPinned?: boolean
  messages?: ChatMessagePreview[]
}

interface SidebarProps {
  canAccessAdmin?: boolean
  plan?: AIPlan
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
  action?: "new" | "voice" | "translate" | "data"
  href?: string
  badge?: string
}

const GENERIC_CHAT_TITLE = /^(?:новый\s+(?:проект|чат)|new\s+(?:project|chat)|untitled(?:\s+(?:project|chat))?|без\s+названия)$/iu
const TITLE_LIMIT = 58
const TITLE_WORD_LIMIT = 8

const MAIN_ACTIONS: SidebarAction[] = [
  { id: "new", label: "Новый чат", icon: MessageSquarePlus, action: "new" },
  { id: "voice", label: "Голосовой режим", icon: Mic, action: "voice" },
  { id: "library", label: "Библиотека", icon: LayoutTemplate, view: "templates" },
  { id: "projects", label: "Проекты", icon: FolderKanban, view: "projects" },
]

const CREATE_ACTIONS: SidebarAction[] = [
  { id: "business-autonomous", label: "Бизнес под ключ", icon: Briefcase, view: "business-command-center" },
  { id: "shorts", label: "Malik Shorts", icon: Clapperboard, href: "/shorts", badge: "BETA" },
  { id: "websites", label: "Сайты", icon: LayoutTemplate, view: "website-generation" },
  { id: "video-generation", label: "Генерация видео", icon: Video, view: "video-generation" },
  { id: "photo-generation", label: "Генерация изображений", icon: ImageIcon, view: "photo-generation" },
]

const TOOL_ACTIONS: SidebarAction[] = [
  { id: "plugins", label: "Плагины", icon: Plug, view: "features" },
  { id: "compute", label: "Compute", icon: Cpu, view: "compute" },
  { id: "translate", label: "Переводчик", icon: Languages, action: "translate" },
  { id: "data", label: "Анализ данных", icon: BarChart3, action: "data" },
]

const ALL_ACTIONS = [...MAIN_ACTIONS, ...CREATE_ACTIONS, ...TOOL_ACTIONS]

function isGenericChatTitle(title?: string | null) {
  const clean = String(title || "").trim()
  return !clean || GENERIC_CHAT_TITLE.test(clean)
}

function capitalizeChatTitle(value: string) {
  const clean = value.trim()
  if (!clean) return clean
  return clean.charAt(0).toLocaleUpperCase() + clean.slice(1)
}

function deriveChatTopicTitle(chat: Chat) {
  const current = String(chat.title || "").trim()
  if (!isGenericChatTitle(current)) return current

  const firstPrompt = chat.messages?.find((message) => message?.role === "user" && String(message?.content || "").trim())?.content
  if (!firstPrompt) return current || "Новый чат"

  let text = String(firstPrompt)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[#>*_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const firstSentence = text.split(/(?:\n|[.!?](?:\s|$))/u)[0]?.trim()
  if (firstSentence) text = firstSentence

  const fillerPatterns = [
    /^(?:кароче|короче|слушай|смотри|пожалуйста|плиз|please|pls)[,:\s-]+/iu,
    /^(?:мне\s+надо|мне\s+нужно|надо|нужно|я\s+хочу|хочу|можешь|можно\s+ли|давай)[,:\s-]+/iu,
    /^(?:i\s+need|i\s+want|can\s+you|could\s+you|please)[,:\s-]+/i,
  ]
  const actionPatterns = [
    /^(?:сделай|создай|разработай|напиши|сгенерируй|добавь|исправь|улучши|проверь|найди|покажи|объясни|составь|подключи|настрой|перепиши|придумай|сделаем|создадим)[,:\s-]+/iu,
    /^(?:как\s+(?:сделать|создать|настроить|подключить|исправить))\s+/iu,
    /^(?:make|create|build|write|generate|add|fix|improve|check|find|show|explain|connect|configure|rewrite|design|set\s+up)[,:\s-]+/i,
  ]

  for (let pass = 0; pass < 3; pass += 1) {
    const before = text
    for (const pattern of fillerPatterns) text = text.replace(pattern, "")
    for (const pattern of actionPatterns) text = text.replace(pattern, "")
    text = text.trim()
    if (text === before) break
  }

  if (!text) text = String(firstPrompt).replace(/\s+/g, " ").trim()
  const words = text.split(/\s+/).filter(Boolean)
  let title = words.slice(0, TITLE_WORD_LIMIT).join(" ")
  if (title.length > TITLE_LIMIT) {
    title = title.slice(0, TITLE_LIMIT + 1).replace(/\s+\S*$/, "").trim() || title.slice(0, TITLE_LIMIT).trim()
  }
  title = title.replace(/^["'«»“”]+|["'«»“”,:;.!?\-–—]+$/g, "").trim()
  return capitalizeChatTitle(title) || current || "Новый чат"
}

function localDayStart(value: Date | number) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function SidebarInner({
  canAccessAdmin = false,
  plan = "free",
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
    const close = (event: MouseEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false)
        setChatMenuId(null)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setProfileMenuOpen(false)
      setChatMenuId(null)
      setEditingChatId(null)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [])

  useEffect(() => {
    if (!onRenameChat) return
    for (const chat of chats) {
      if (!isGenericChatTitle(chat.title)) continue
      const nextTitle = deriveChatTopicTitle(chat)
      if (!nextTitle || isGenericChatTitle(nextTitle) || nextTitle === chat.title) continue
      onRenameChat(chat.id, nextTitle)
    }
  }, [chats, onRenameChat])

  const orderedChats = useMemo(
    () => [...chats].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [chats],
  )

  const chatGroups = useMemo(() => {
    const todayStart = localDayStart(Date.now())
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
    const pinned = orderedChats.filter((chat) => chat.isPinned)
    const rest = orderedChats.filter((chat) => !chat.isPinned)
    return {
      pinned,
      today: rest.filter((chat) => new Date(chat.timestamp).getTime() >= todayStart),
      yesterday: rest.filter((chat) => {
        const time = new Date(chat.timestamp).getTime()
        return time >= yesterdayStart && time < todayStart
      }),
      earlier: rest.filter((chat) => new Date(chat.timestamp).getTime() < yesterdayStart),
    }
  }, [orderedChats])

  const email = profile?.email || "guest@malik.ai"
  const name = profile?.name || "Гость"
  const avatar = profile?.avatar || buildFallbackAvatar(email)
  const isGuest = /guest|anonymous/i.test(email)
  const displayName = isGuest ? "Гостевой доступ" : name
  const initials = displayName.trim().split(/\s+/).map((part) => part.charAt(0)).join("").slice(0, 2).toUpperCase() || "M"
  const isPro = plan === "pro" || plan === "ultra" || plan === "owner"
  const roleLabel = canAccessAdmin ? "Соло-фаундер" : publicPlanTitle(plan)

  const openView = useCallback((view: string) => {
    setProfileMenuOpen(false)
    setChatMenuId(null)
    onViewChange?.(view)
  }, [onViewChange])

  const openSearch = useCallback(() => {
    if (onOpenSearch) onOpenSearch()
    else window.dispatchEvent(new CustomEvent("malik-open-command-palette"))
  }, [onOpenSearch])

  const runAction = useCallback((action: SidebarAction) => {
    if (action.action === "new") return onNewChat?.()
    if (action.action === "voice") return onOpenVoice?.()
    if (action.href) {
      window.location.assign(action.href)
      return
    }
    if (action.action === "translate") {
      window.location.assign("/translator")
      return
    }
    if (action.action === "data") {
      onViewChange?.("home")
      window.setTimeout(() => prefillPrompt("Проанализируй данные ниже: найди тренды, аномалии и дай выводы с цифрами.\n\n"), 0)
      return
    }
    if (action.view) openView(action.view)
  }, [onNewChat, onOpenVoice, onViewChange, openView])

  const actionIsActive = useCallback((action: SidebarAction) => {
    if (action.id === "new") return activeView === "home" && !activeChatId
    return Boolean(action.view && action.view === activeView)
  }, [activeChatId, activeView])

  const saveRename = useCallback((chatId: string) => {
    const title = editingTitle.trim()
    if (title) onRenameChat?.(chatId, title)
    setEditingChatId(null)
    setEditingTitle("")
  }, [editingTitle, onRenameChat])

  const requestDelete = useCallback((chat: Chat) => {
    setChatMenuId(null)
    const displayTitle = deriveChatTopicTitle(chat)
    if (window.confirm(`Удалить чат «${displayTitle}»? Это действие нельзя отменить.`)) onDeleteChat?.(chat.id)
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
    const active = actionIsActive(action)
    return (
      <button
        key={action.id}
        type="button"
        data-preserve-brand-color={active || action.badge ? "true" : undefined}
        aria-label={action.label}
        aria-current={active ? "page" : undefined}
        onClick={() => runAction(action)}
        onMouseEnter={showTooltip(action.label)}
        onMouseLeave={() => setTooltip(null)}
        className={cn("malik-sidebar-rail-btn", active && "is-active")}
      >
        <Icon className="h-[17px] w-[17px]" />
        {action.badge ? <i className="malik-sidebar-rail-dot" data-preserve-brand-color="true" /> : null}
      </button>
    )
  }

  const renderAction = (action: SidebarAction) => {
    const Icon = action.icon
    const active = actionIsActive(action)
    return (
      <button
        key={action.id}
        data-action-id={action.id}
        data-preserve-brand-color={active || action.badge ? "true" : undefined}
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => runAction(action)}
        className={cn("malik-sidebar-primary", active && "is-active")}
      >
        <Icon className="h-[16px] w-[16px]" />
        <span>{action.label}</span>
        {action.badge ? <em className="malik-shorts-beta" data-preserve-brand-color="true">{action.badge}</em> : null}
      </button>
    )
  }

  if (isCollapsed) {
    return (
      <aside ref={sidebarRef} data-collapsed="true" className="malik-sidebar flex h-[100dvh] w-16 shrink-0 flex-col border-r border-white/[.06] bg-[#050506] text-white">
        <div className="flex h-13 shrink-0 items-center justify-center py-2">
          <button type="button" onClick={onToggle} aria-label="Развернуть панель" className="malik-sidebar-icon-btn"><PanelLeft className="h-[18px] w-[18px]" /></button>
        </div>
        <nav className="malik-sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1" aria-label="Навигация">
          {ALL_ACTIONS.map(renderRailButton)}
        </nav>
        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-white/[.06] p-2">
          <button type="button" onClick={() => openView("settings")} className="malik-sidebar-icon-btn" aria-label="Настройки"><Settings className="h-[18px] w-[18px]" /></button>
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
        <div className="malik-sidebar-chat-list">
          {list.map((chat) => {
            const selected = chat.id === activeChatId
            const menuOpen = chatMenuId === chat.id
            const displayTitle = deriveChatTopicTitle(chat)
            return (
              <div key={chat.id} className={cn("malik-sidebar-chat-row group", selected && "is-active", menuOpen && "is-menu-open")}>
                <MessageSquare className="malik-sidebar-chat-icon h-[14px] w-[14px]" />
                {editingChatId === chat.id ? (
                  <input
                    ref={editInputRef}
                    value={editingTitle}
                    maxLength={90}
                    className="malik-sidebar-rename-input"
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={() => saveRename(chat.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveRename(chat.id)
                      if (event.key === "Escape") setEditingChatId(null)
                    }}
                  />
                ) : (
                  <button type="button" className="malik-sidebar-chat-title" title={displayTitle} onClick={() => { setChatMenuId(null); onSelectChat?.(chat.id) }}>{displayTitle}</button>
                )}
                {editingChatId !== chat.id ? (
                  <button
                    type="button"
                    className="malik-sidebar-chat-more"
                    aria-label={`Действия с чатом «${displayTitle}»`}
                    onClick={(event) => { event.stopPropagation(); setChatMenuId((current) => current === chat.id ? null : chat.id) }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                ) : null}
                {menuOpen ? (
                  <div role="menu" className="malik-sidebar-chat-menu">
                    <button type="button" onClick={() => { setEditingChatId(chat.id); setEditingTitle(displayTitle); setChatMenuId(null) }}><Pencil className="h-3.5 w-3.5" />Переименовать</button>
                    <button type="button" onClick={() => { onTogglePinChat?.(chat.id); setChatMenuId(null) }}>{chat.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}{chat.isPinned ? "Открепить" : "Закрепить"}</button>
                    <button type="button" className="is-danger" onClick={() => requestDelete(chat)}><Trash2 className="h-3.5 w-3.5" />Удалить</button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const hasHistory = chatGroups.pinned.length || chatGroups.today.length || chatGroups.yesterday.length || chatGroups.earlier.length

  return (
    <aside ref={sidebarRef} data-collapsed="false" className="malik-sidebar relative flex h-[100dvh] w-[240px] max-w-[86vw] shrink-0 flex-col border-r border-white/[.06] bg-[#050506] text-white">
      <div className="malik-sidebar-brand">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="malik-sidebar-brand-mark">
            <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M9 29 L22 15 L22 29 Z" fill="#0A0A0C" /><path d="M24 15 H38 L24 29 Z" fill="#0A0A0C" /></svg>
          </span>
          <span className="min-w-0">
            <span className="malik-sidebar-brand-name">MALIK AI</span>
            <span className="malik-sidebar-brand-version">v6.5 Titan</span>
          </span>
        </div>
        <button type="button" onClick={onToggle} aria-label="Свернуть панель" className="malik-sidebar-icon-btn"><PanelLeftClose className="h-[17px] w-[17px]" /></button>
      </div>

      <div className="malik-sidebar-search-wrap">
        <button type="button" onClick={openSearch} className="malik-sidebar-search"><Search className="h-[15px] w-[15px]" /><span>Поиск</span><kbd>Ctrl K</kbd></button>
      </div>

      <nav aria-label="Основная навигация" className="malik-sidebar-nav">
        <p className="malik-sidebar-section-label">Основное</p>
        {MAIN_ACTIONS.map(renderAction)}
        <p className="malik-sidebar-section-label">Создание</p>
        {CREATE_ACTIONS.map(renderAction)}
        <p className="malik-sidebar-section-label">Инструменты</p>
        {TOOL_ACTIONS.map(renderAction)}
      </nav>

      <div className="malik-sidebar-history min-h-0 flex-1 overflow-y-auto">
        <p className="malik-sidebar-history-title">История чатов</p>
        {hasHistory ? (
          <>
            {renderChatGroup("Закреплённые", chatGroups.pinned)}
            {renderChatGroup("Сегодня", chatGroups.today)}
            {renderChatGroup("Вчера", chatGroups.yesterday)}
            {renderChatGroup("Ранее", chatGroups.earlier)}
          </>
        ) : (
          <div className="malik-sidebar-empty-history"><span>История пуста</span><small>Новые сессии появятся здесь</small></div>
        )}
      </div>

      <div className="malik-sidebar-footer">
        {profileMenuOpen ? (
          <div role="menu" className="malik-sidebar-profile-menu">
            <p>{email}</p>
            <div className="malik-sidebar-menu-separator" />
            <button type="button" onClick={() => openView("settings")}><Settings className="h-4 w-4" />Настройки</button>
            <button type="button" onClick={() => openView("billing")}><Crown className="h-4 w-4" />Подписка</button>
            <button type="button" onClick={() => openView("support")}><LifeBuoy className="h-4 w-4" />Поддержка</button>
            <button type="button" onClick={() => { setProfileMenuOpen(false); onOpenCodex?.() }}><Terminal className="h-4 w-4" />Malik Codex</button>
            {canAccessAdmin ? <button type="button" onClick={() => openView("command-center")}><Shield className="h-4 w-4" />Админ-консоль</button> : null}
            <div className="malik-sidebar-menu-separator" />
            <button type="button" className="is-danger" onClick={handleLogout}><LogOut className="h-4 w-4" />Выйти</button>
          </div>
        ) : null}

        <button type="button" onClick={() => setProfileMenuOpen((value) => !value)} className="malik-sidebar-user">
          <span className="malik-sidebar-user-avatar"><img src={avatar} alt="" /><span>{initials}</span></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-user-name">{displayName}</span><span className="malik-sidebar-user-role">{roleLabel}</span></span>
          <Eye className="h-[15px] w-[15px] shrink-0 text-zinc-500" />
        </button>

        <button type="button" onClick={() => openView("billing")} className="malik-sidebar-premium">
          <span className="malik-sidebar-premium-mark"><Crown className="h-[14px] w-[14px]" /></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-premium-title">MalikAI Plus</span><span className="malik-sidebar-premium-note">{isPro ? "Подписка активна" : "Открыть все модели"}</span></span>
          <Crown className="h-[15px] w-[15px] shrink-0 text-zinc-400" />
        </button>

        <div className="malik-sidebar-quickrow">
          <button type="button" onClick={() => openView("settings")} aria-label="Настройки" className="malik-sidebar-icon-btn"><Settings className="h-[16px] w-[16px]" /></button>
          <button type="button" onClick={() => openView("capabilities")} aria-label="Возможности" className="malik-sidebar-icon-btn"><Sun className="h-[16px] w-[16px]" /></button>
          <button type="button" onClick={() => openView("support")} aria-label="Поддержка" className="malik-sidebar-icon-btn"><CircleHelp className="h-[16px] w-[16px]" /></button>
          <button type="button" onClick={handleLogout} aria-label="Выйти" className="malik-sidebar-icon-btn is-danger"><LogOut className="h-[16px] w-[16px]" /></button>
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
        position: sticky !important;
        top: 0 !important;
        align-self: flex-start !important;
        overflow: hidden !important;
        background: #050506 !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-feature-settings: "cv02", "cv03", "cv04", "cv11";
      }
      .malik-sidebar button { font: inherit; }
      .malik-sidebar-brand { display:flex; height:50px; flex-shrink:0; align-items:center; justify-content:space-between; gap:8px; padding:6px 9px 4px 11px; }
      .malik-sidebar-brand-mark { display:grid; width:29px; height:29px; flex-shrink:0; place-items:center; border-radius:7px; background:#f4f4f5; }
      .malik-sidebar-brand-mark svg { width:17px; height:17px; }
      .malik-sidebar-brand-name { display:block; color:#f4f4f5; font-size:12px; font-weight:700; line-height:1.1; letter-spacing:.015em; }
      .malik-sidebar-brand-version { display:block; margin-top:2px; color:#66666d; font-size:9px; line-height:1.1; }
      .malik-sidebar-search-wrap { flex-shrink:0; padding:0 8px 4px; }
      .malik-sidebar-search { display:flex; width:100%; height:31px; align-items:center; gap:8px; border:1px solid #26262a; border-radius:7px; padding:0 8px; background:#09090a; color:#85858d; font-size:11.5px; }
      .malik-sidebar-search:hover { border-color:#343439; color:#c7c7cd; }
      .malik-sidebar-search span { min-width:0; flex:1; text-align:left; }
      .malik-sidebar-search kbd { border:1px solid #232327; border-radius:4px; padding:1px 4px; color:#55555c; font-size:8px; font-weight:500; }
      .malik-sidebar-nav { min-height:0; flex:0 1 auto; overflow-y:auto; padding:0 7px 4px; scrollbar-width:none; }
      .malik-sidebar-nav::-webkit-scrollbar { display:none; }
      .malik-sidebar-section-label { margin:7px 5px 3px; color:#626269; font-size:9.5px; font-weight:500; line-height:1.2; user-select:none; }
      .malik-sidebar-primary { display:flex; width:100%; height:30px; align-items:center; gap:8px; border-radius:6px; padding:0 7px; color:#cfcfd4; font-size:11.8px; font-weight:470; text-align:left; transition:background .12s ease,color .12s ease; }
      .malik-sidebar-primary > span { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-primary svg { flex-shrink:0; color:#a0a0a8; }
      .malik-sidebar-primary:hover { background:#111113; color:#fff; }
      .malik-sidebar-primary.is-active { background:#19172d !important; color:#fff !important; font-weight:520; }
      .malik-sidebar-primary.is-active svg { color:#d9d5ff !important; }
      .malik-shorts-beta { margin-left:auto; flex-shrink:0; border-radius:999px; padding:2px 6px; background:linear-gradient(135deg,#7d5cff,#536dff); color:#fff; font-size:8px; font-style:normal; font-weight:800; line-height:1.2; letter-spacing:.055em; box-shadow:0 0 10px rgba(112,89,255,.42); }
      .malik-sidebar-history { min-height:112px; border-top:1px solid #1a1a1d; padding:6px 7px 5px; scrollbar-width:thin; scrollbar-color:transparent transparent; }
      .malik-sidebar-history:hover { scrollbar-color:#2b2b30 transparent; }
      .malik-sidebar-history-title { margin:0 5px 6px; color:#626269; font-size:9.5px; font-weight:500; line-height:1.2; }
      .malik-sidebar-chat-group + .malik-sidebar-chat-group { margin-top:7px; }
      .malik-sidebar-group-title { margin:0 0 2px; padding:0 5px; color:#707078; font-size:9.5px; font-weight:510; }
      .malik-sidebar-chat-list { display:flex; flex-direction:column; gap:1px; }
      .malik-sidebar-chat-row { position:relative; display:flex; height:27px; align-items:center; gap:7px; border-radius:6px; padding:0 3px 0 6px; color:#babac0; }
      .malik-sidebar-chat-row:hover,.malik-sidebar-chat-row.is-menu-open { background:#101012; color:#efeff2; }
      .malik-sidebar-chat-row.is-active { background:#151518; color:#fff; }
      .malik-sidebar-chat-icon { flex-shrink:0; color:#8c8c94; }
      .malik-sidebar-chat-title { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; font-size:10.8px; }
      .malik-sidebar-chat-more { display:grid; width:23px; height:23px; flex-shrink:0; place-items:center; border-radius:5px; color:#777780; opacity:0; }
      .malik-sidebar-chat-row:hover .malik-sidebar-chat-more,.malik-sidebar-chat-row.is-menu-open .malik-sidebar-chat-more { opacity:1; }
      .malik-sidebar-chat-menu { position:absolute; z-index:90; top:25px; right:0; width:170px; border:1px solid #2a2a2e; border-radius:9px; background:#151517; padding:4px; box-shadow:0 18px 42px rgba(0,0,0,.72); }
      .malik-sidebar-chat-menu button,.malik-sidebar-profile-menu button { display:flex; width:100%; align-items:center; gap:8px; border-radius:6px; padding:7px 8px; color:#d4d4d8; font-size:11.5px; text-align:left; }
      .malik-sidebar-chat-menu button:hover,.malik-sidebar-profile-menu button:hover { background:#202023; color:#fff; }
      .malik-sidebar-chat-menu .is-danger,.malik-sidebar-profile-menu .is-danger { color:#fca5a5; }
      .malik-sidebar-rename-input { min-width:0; flex:1; height:23px; border:1px solid #3a3a40; border-radius:5px; background:#101012; padding:0 6px; color:#fff; font-size:10.8px; outline:none; }
      .malik-sidebar-empty-history { display:flex; min-height:72px; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#696970; }
      .malik-sidebar-empty-history span { font-size:10.5px; }
      .malik-sidebar-empty-history small { margin-top:2px; color:#4e4e54; font-size:9px; }
      .malik-sidebar-footer { position:relative; flex-shrink:0; border-top:1px solid #1a1a1d; background:#050506; padding:5px 7px 6px; }
      .malik-sidebar-user { display:flex; width:100%; height:40px; align-items:center; gap:8px; border-radius:8px; padding:4px 6px; text-align:left; }
      .malik-sidebar-user:hover { background:#101012; }
      .malik-sidebar-user-avatar { position:relative; display:flex; width:29px; height:29px; flex-shrink:0; align-items:center; justify-content:center; overflow:hidden; border:1px solid #2a2a2e; border-radius:999px; background:#171719; color:#eee; font-size:9px; font-weight:700; }
      .malik-sidebar-user-avatar img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .malik-sidebar-user-name { display:block; overflow:hidden; color:#ececf0; font-size:10.8px; font-weight:560; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-user-role { display:block; margin-top:1px; overflow:hidden; color:#77777f; font-size:8.8px; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-premium { display:flex !important; width:100%; min-height:42px; align-items:center; gap:8px; margin-top:3px; border:1px solid #29292d; border-radius:8px; background:#121214; padding:5px 7px; text-align:left; }
      .malik-sidebar-premium:hover { border-color:#38383d; background:#171719; }
      .malik-sidebar-premium-mark { display:grid; width:27px; height:27px; flex-shrink:0; place-items:center; border-radius:999px; background:#f1f1f2; color:#111; }
      .malik-sidebar-premium-title { display:block; color:#f0f0f2; font-size:10.5px; font-weight:650; }
      .malik-sidebar-premium-note { display:block; margin-top:1px; color:#797981; font-size:8.8px; }
      .malik-sidebar-quickrow { display:flex; height:34px; align-items:center; justify-content:space-between; gap:4px; margin-top:4px; border-top:1px solid #1a1a1d; padding:4px 2px 0; }
      .malik-sidebar-icon-btn { display:flex; height:27px; width:27px; align-items:center; justify-content:center; border-radius:6px; color:#8a8a92; }
      .malik-sidebar-icon-btn:hover { background:#151517; color:#fff; }
      .malik-sidebar-icon-btn.is-danger:hover { color:#fca5a5; }
      .malik-sidebar-rail-btn { position:relative; display:flex; height:34px; width:100%; align-items:center; justify-content:center; border-radius:7px; color:#85858e; }
      .malik-sidebar-rail-btn:hover,.malik-sidebar-rail-btn.is-active { background:#151517; color:#fff; }
      .malik-sidebar-rail-dot { position:absolute; top:5px; right:5px; width:6px; height:6px; border-radius:50%; background:#7c5cff; box-shadow:0 0 7px rgba(124,92,255,.75); }
      .malik-sidebar-tooltip { position:fixed; left:70px; z-index:120; transform:translateY(-50%); border:1px solid #29292d; border-radius:7px; background:#151517; padding:5px 9px; color:#e4e4e7; font-size:11px; white-space:nowrap; pointer-events:none; }
      .malik-sidebar-profile-menu { position:absolute; z-index:100; bottom:calc(100% + 5px); left:7px; right:7px; border:1px solid #2a2a2e; border-radius:10px; background:#141416; padding:4px; box-shadow:0 20px 50px rgba(0,0,0,.72); }
      .malik-sidebar-profile-menu p { margin:0; padding:6px 8px; overflow:hidden; color:#696971; font-size:9.5px; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-menu-separator { height:1px; margin:4px; background:#26262a; }
      .malik-founder-nav { display:none !important; }
      @media (max-height:780px) {
        .malik-sidebar-primary { height:28px !important; }
        .malik-sidebar-section-label { margin-top:5px; }
        .malik-sidebar-history { min-height:92px; }
        .malik-sidebar-user { height:36px; }
        .malik-sidebar-premium { min-height:38px; }
        .malik-sidebar-quickrow { height:30px; }
      }
      @media (prefers-reduced-motion:reduce) { .malik-sidebar * { transition:none!important; } }
    `}</style>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
