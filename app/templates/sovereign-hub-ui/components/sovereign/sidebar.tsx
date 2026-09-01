"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart3,
  CreditCard,
  Cpu,
  Crown,
  FolderKanban,
  Languages,
  LayoutTemplate,
  LifeBuoy,
  LogOut,
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
  Sparkles,
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

const GENERIC_CHAT_TITLE = /^(?:новый\s+(?:проект|чат)|new\s+(?:project|chat)|untitled(?:\s+(?:project|chat))?|без\s+названия)$/iu
const TITLE_LIMIT = 58
const TITLE_WORD_LIMIT = 8

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
  if (!firstPrompt) return current || "Новый проект"

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
    /^(?:how\s+to\s+(?:make|create|build|configure|connect|fix))\s+/i,
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
  return capitalizeChatTitle(title) || current || "Новый проект"
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
  action?: "new" | "codex" | "voice" | "translate"
}

const PRIMARY_ACTIONS: SidebarAction[] = [
  { id: "new", label: "Новый чат", icon: MessageSquarePlus, action: "new" },
  // The sidebar declared this prop and this action and wired neither, so on
  // mobile - where the sidebar is the only navigation - there was no way to
  // reach Voice at all.
  { id: "voice", label: "Голосовой режим", icon: Mic, action: "voice" },
  { id: "library", label: "Библиотека", icon: LayoutTemplate, view: "templates" },
  { id: "projects", label: "Проекты", icon: FolderKanban, view: "projects" },
  { id: "plugins", label: "Плагины", icon: Plug, view: "features" },
  { id: "websites", label: "Сайты", icon: LayoutTemplate, view: "website-generation" },
  { id: "video-generation", label: "Генерация видео", icon: Video, view: "video-generation" },
  { id: "compute", label: "Compute", icon: Cpu, view: "compute" },
  { id: "translate", label: "Переводчик", icon: Languages, action: "translate" },
]

const TOOL_ACTIONS = [{ id: "data", label: "Анализ данных", icon: BarChart3 }] as const

const PROFILE_MENU = [
  { id: "settings", icon: Settings, label: "Настройки" },
  { id: "billing", icon: CreditCard, label: "Подписка" },
  { id: "support", icon: LifeBuoy, label: "Поддержка" },
]

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

  // Like ChatGPT/Claude: as soon as the first real prompt exists, replace the
  // generic "Новый проект" label with a short topic title. This is local and
  // deterministic, so it costs zero model tokens and also repairs old chats.
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
  const pinnedChats = useMemo(() => orderedChats.filter((chat) => chat.isPinned), [orderedChats])
  const recentChats = useMemo(() => orderedChats.filter((chat) => !chat.isPinned), [orderedChats])

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
    if (action.action === "codex") return onOpenCodex?.()
    if (action.action === "voice") return onOpenVoice?.()
    if (action.action === "translate") {
      onViewChange?.("home")
      prefillPrompt("Переведи текст ниже на нужный язык, сохрани смысл, факты и тон:\n\n")
      return
    }
    if (action.view) openView(action.view)
  }, [onNewChat, onOpenCodex, onOpenVoice, onViewChange, openView])

  const runTool = useCallback((id: (typeof TOOL_ACTIONS)[number]["id"]) => {
    onViewChange?.("home")
    if (id === "data") prefillPrompt("Проанализируй данные ниже: найди тренды, аномалии и дай выводы с цифрами.\n\n")
  }, [onViewChange])

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
    const active = action.view === activeView
    return (
      <button key={action.id} type="button" aria-label={action.label} aria-current={active ? "page" : undefined}
        onClick={() => runAction(action)} onMouseEnter={showTooltip(action.label)} onMouseLeave={() => setTooltip(null)}
        className={cn("malik-sidebar-rail-btn", active && "is-active")}>
        <Icon className="h-[18px] w-[18px]" />
      </button>
    )
  }

  if (isCollapsed) {
    return (
      <aside ref={sidebarRef} data-collapsed="true" className="malik-sidebar flex h-[100dvh] w-16 shrink-0 flex-col border-r border-white/[.06] bg-[#050506] text-white">
        <div className="flex h-14 shrink-0 items-center justify-center">
          <button type="button" onClick={onToggle} aria-label="Развернуть панель" className="malik-sidebar-icon-btn"><PanelLeft className="h-[18px] w-[18px]" /></button>
        </div>
        <nav className="malik-sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2" aria-label="Навигация">
          {PRIMARY_ACTIONS.map(renderRailButton)}
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
        <div className="space-y-0.5">
          {list.map((chat) => {
            const selected = chat.id === activeChatId
            const menuOpen = chatMenuId === chat.id
            const displayTitle = deriveChatTopicTitle(chat)
            return (
              <div key={chat.id} className={cn("malik-sidebar-chat-row group", selected && "is-active", menuOpen && "is-menu-open")}>
                {editingChatId === chat.id ? (
                  <input ref={editInputRef} value={editingTitle} maxLength={90} className="malik-sidebar-rename-input"
                    onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => saveRename(chat.id)}
                    onKeyDown={(event) => { if (event.key === "Enter") saveRename(chat.id); if (event.key === "Escape") setEditingChatId(null) }} />
                ) : (
                  <button type="button" className="malik-sidebar-chat-title" title={displayTitle} onClick={() => { setChatMenuId(null); onSelectChat?.(chat.id) }}>{displayTitle}</button>
                )}
                {editingChatId !== chat.id ? (
                  <button type="button" className="malik-sidebar-chat-more" aria-label={`Действия с чатом «${displayTitle}»`}
                    onClick={(event) => { event.stopPropagation(); setChatMenuId((current) => current === chat.id ? null : chat.id) }}>
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

  return (
    <aside ref={sidebarRef} data-collapsed="false" className="malik-sidebar relative flex h-[100dvh] w-[250px] max-w-[86vw] shrink-0 flex-col border-r border-white/[.06] bg-[#050506] text-white">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
            <svg viewBox="0 0 44 44" className="h-4 w-4" aria-hidden="true"><path d="M9 29 L22 15 L22 29 Z" fill="#0A0A0C" /><path d="M24 15 H38 L24 29 Z" fill="#0A0A0C" /></svg>
          </span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold leading-tight tracking-tight">MALIK AI</span><span className="block truncate text-[10px] leading-tight text-zinc-600">v6.5 Titan</span></span>
        </div>
        <button type="button" onClick={onToggle} aria-label="Свернуть панель" className="malik-sidebar-icon-btn"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
      </div>

      <div className="shrink-0 px-2.5 pb-2">
        <button type="button" onClick={openSearch} className="malik-sidebar-search"><Search className="h-4 w-4" /><span>Поиск</span><kbd>Ctrl K</kbd></button>
      </div>

      <nav aria-label="Основная навигация" className="relative z-[60] shrink-0 px-2.5 pb-2">
        {PRIMARY_ACTIONS.map((action) => {
          const Icon = action.icon
          const active = action.view === activeView
          return <button key={action.id} type="button" aria-current={active ? "page" : undefined} onClick={() => runAction(action)} className={cn("malik-sidebar-primary", active && "is-active")}><Icon className="h-[17px] w-[17px]" /><span>{action.label}</span></button>
        })}
      </nav>

      <div className="malik-sidebar-history min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {pinnedChats.length || recentChats.length ? <>{renderChatGroup("Закреплённые", pinnedChats)}{renderChatGroup("Недавние", recentChats)}</> : <div className="malik-sidebar-empty-history"><span>История пуста</span><small>Новые диалоги появятся здесь</small></div>}
      </div>

      <div className="malik-sidebar-tools shrink-0 px-2.5 py-2">
        <p className="malik-sidebar-group-title">Инструменты</p>
        {TOOL_ACTIONS.map((tool) => { const Icon = tool.icon; return <button key={tool.id} type="button" onClick={() => runTool(tool.id)} className="malik-sidebar-primary"><Icon className="h-[17px] w-[17px]" /><span>{tool.label}</span></button> })}
      </div>

      <div className="relative shrink-0 border-t border-white/[.06] p-2">
        {profileMenuOpen ? (
          <div role="menu" className="malik-sidebar-profile-menu">
            <p>{email}</p>
            <div className="malik-sidebar-menu-separator" />
            {PROFILE_MENU.map((entry) => { const Icon = entry.icon; return <button key={entry.id} type="button" onClick={() => openView(entry.id)}><Icon className="h-4 w-4" />{entry.label}</button> })}
            <button type="button" onClick={() => { setProfileMenuOpen(false); onOpenCodex?.() }}><Terminal className="h-4 w-4" />Malik Codex</button>
            {canAccessAdmin ? <button type="button" onClick={() => openView("command-center")}><Shield className="h-4 w-4" />Админ-консоль</button> : null}
            <div className="malik-sidebar-menu-separator" />
            <button type="button" className="is-danger" onClick={handleLogout}><LogOut className="h-4 w-4" />Выйти</button>
          </div>
        ) : null}

        <button type="button" onClick={() => setProfileMenuOpen((value) => !value)} className="malik-sidebar-user">
          <span className="malik-sidebar-user-avatar"><img src={avatar} alt="" /><span>{initials}</span></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-user-name">{displayName}</span><span className="malik-sidebar-user-role">{roleLabel}</span></span>
          <span className="malik-sidebar-user-dot" />
        </button>

        <button type="button" onClick={() => openView("billing")} className="malik-sidebar-premium">
          <span className="malik-sidebar-premium-mark"><svg viewBox="0 0 44 44"><path d="M9 29 L22 15 L22 29 Z" /><path d="M24 15 H38 L24 29 Z" /></svg></span>
          <span className="min-w-0 flex-1"><span className="malik-sidebar-premium-title">MalikAI Plus</span><span className="malik-sidebar-premium-note">{isPro ? "Подписка активна" : "Открыть все модели"}</span></span>
          <Crown className="h-4 w-4 shrink-0" />
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
      .malik-sidebar { font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-feature-settings:"cv02","cv03","cv04","cv11"; }
      .malik-sidebar button { font:inherit; }
      .malik-sidebar-scroll,.malik-sidebar-history { scrollbar-width:thin; scrollbar-color:transparent transparent; }
      .malik-sidebar-history:hover { scrollbar-color:rgba(255,255,255,.16) transparent; }
      .malik-sidebar-search { display:flex; width:100%; height:34px; align-items:center; gap:9px; border:1px solid rgba(255,255,255,.075); border-radius:9px; padding:0 9px; color:#6e6e78; background:rgba(255,255,255,.022); font-size:12.5px; }
      .malik-sidebar-search:hover { color:#c7c7cf; background:rgba(255,255,255,.045); }
      .malik-sidebar-search span { flex:1; text-align:left; }
      .malik-sidebar-search kbd { border:1px solid rgba(255,255,255,.09); border-radius:5px; padding:1px 5px; font-size:9px; color:#575760; }
      .malik-sidebar-primary { display:flex; width:100%; height:34px; align-items:center; gap:10px; border-radius:8px; padding:0 8px; color:#d2d2d6; font-size:13px; font-weight:450; text-align:left; transition:.13s ease; }
      .malik-sidebar-primary svg { flex-shrink:0; color:#a0a0aa; }
      .malik-sidebar-primary:hover { background:rgba(255,255,255,.055); color:#fff; }
      .malik-sidebar-primary.is-active { background:#202023; color:#fff; font-weight:520; }
      .malik-sidebar-primary.is-active svg { color:#fff; }
      .malik-sidebar-history { border-top:1px solid rgba(255,255,255,.055); border-bottom:1px solid rgba(255,255,255,.055); }
      .malik-sidebar-chat-group + .malik-sidebar-chat-group { margin-top:14px; }
      .malik-sidebar-group-title { margin:0 0 5px; padding:0 7px; color:#72727c; font-size:10.5px; font-weight:520; }
      .malik-sidebar-chat-row { position:relative; display:flex; height:34px; align-items:center; border-radius:8px; padding:0 4px 0 8px; color:#dedee3; }
      .malik-sidebar-chat-row:hover,.malik-sidebar-chat-row.is-menu-open { background:rgba(255,255,255,.05); }
      .malik-sidebar-chat-row.is-active { background:#202023; color:#fff; }
      .malik-sidebar-chat-title { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; font-size:12.5px; }
      .malik-sidebar-chat-more { width:26px; height:26px; display:grid; place-items:center; border-radius:7px; color:#7d7d86; opacity:0; }
      .malik-sidebar-chat-row:hover .malik-sidebar-chat-more,.malik-sidebar-chat-row.is-menu-open .malik-sidebar-chat-more { opacity:1; }
      .malik-sidebar-chat-menu { position:absolute; z-index:90; top:31px; right:0; width:170px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:#171719; padding:4px; box-shadow:0 18px 42px rgba(0,0,0,.7); }
      .malik-sidebar-chat-menu button,.malik-sidebar-profile-menu button { display:flex; width:100%; align-items:center; gap:8px; border-radius:7px; padding:7px 8px; color:#d4d4d8; font-size:12px; text-align:left; }
      .malik-sidebar-chat-menu button:hover,.malik-sidebar-profile-menu button:hover { background:rgba(255,255,255,.07); color:#fff; }
      .malik-sidebar-chat-menu .is-danger,.malik-sidebar-profile-menu .is-danger { color:#fca5a5; }
      .malik-sidebar-rename-input { min-width:0; flex:1; height:26px; border:1px solid rgba(255,255,255,.25); border-radius:6px; background:#111113; padding:0 7px; color:#fff; font-size:12.5px; outline:none; }
      .malik-sidebar-empty-history { display:flex; height:100%; min-height:88px; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#777780; }
      .malik-sidebar-empty-history span { font-size:12px; }.malik-sidebar-empty-history small { margin-top:3px; color:#505058; font-size:10.5px; }
      .malik-sidebar-tools { background:#050506; }
      .malik-sidebar-icon-btn { display:flex; height:30px; width:30px; align-items:center; justify-content:center; border-radius:8px; color:#797982; }
      .malik-sidebar-icon-btn:hover { background:rgba(255,255,255,.06); color:#fff; }
      .malik-sidebar-rail-btn { display:flex; height:36px; width:100%; align-items:center; justify-content:center; border-radius:8px; color:#777780; }
      .malik-sidebar-rail-btn:hover,.malik-sidebar-rail-btn.is-active { background:rgba(255,255,255,.065); color:#fff; }
      .malik-sidebar-tooltip { position:fixed; left:70px; z-index:120; transform:translateY(-50%); border:1px solid rgba(255,255,255,.09); border-radius:7px; background:#151517; padding:5px 9px; color:#e4e4e7; font-size:12px; white-space:nowrap; pointer-events:none; }
      .malik-sidebar-profile-menu { position:absolute; z-index:100; bottom:calc(100% + 6px); left:8px; right:8px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:#141416; padding:5px; box-shadow:0 20px 50px rgba(0,0,0,.7); }
      .malik-sidebar-profile-menu p { margin:0; padding:7px 9px; overflow:hidden; color:#686871; font-size:10.5px; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-menu-separator { height:1px; margin:4px; background:rgba(255,255,255,.07); }
      .malik-sidebar-user { display:flex; width:100%; align-items:center; gap:9px; border-radius:10px; padding:7px; text-align:left; }
      .malik-sidebar-user:hover { background:rgba(255,255,255,.04); }
      .malik-sidebar-user-avatar { position:relative; display:flex; width:30px; height:30px; align-items:center; justify-content:center; overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:#171719; color:#eee; font-size:10px; font-weight:700; }
      .malik-sidebar-user-avatar img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .malik-sidebar-user-name { display:block; overflow:hidden; color:#f0f0f2; font-size:12.5px; font-weight:520; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-user-role { display:block; margin-top:2px; overflow:hidden; color:#706f76; font-size:10.5px; text-overflow:ellipsis; white-space:nowrap; }
      .malik-sidebar-user-dot { width:7px; height:7px; border-radius:50%; background:#d5d5d7; }
      .malik-sidebar-premium { display:flex; width:100%; align-items:center; gap:9px; margin-top:5px; border:1px solid rgba(255,255,255,.09); border-radius:11px; background:#111113; padding:8px 9px; text-align:left; }
      .malik-sidebar-premium:hover { border-color:rgba(255,255,255,.16); background:#151517; }
      .malik-sidebar-premium-mark { display:grid; width:25px; height:25px; place-items:center; border-radius:7px; background:#f3f3f4; }
      .malik-sidebar-premium-mark svg { width:15px; height:15px; fill:#111; }
      .malik-sidebar-premium-title { display:block; color:#efeff1; font-size:11.5px; font-weight:620; }
      .malik-sidebar-premium-note { display:block; margin-top:2px; color:#777780; font-size:10.5px; }
      .malik-sidebar-premium > svg { color:#aaaab0; }
      .malik-sidebar-quickrow { display:flex; align-items:center; justify-content:space-between; gap:4px; margin-top:7px; border-top:1px solid rgba(255,255,255,.06); padding-top:7px; }
      @media (max-height:780px) { .malik-sidebar-primary{height:31px}.malik-sidebar-tools{padding-top:5px;padding-bottom:5px}.malik-sidebar-premium{display:none} }
      @media (prefers-reduced-motion:reduce) { .malik-sidebar *{transition:none!important} }
    `}</style>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
