"use client"

import { memo, useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  CircleHelp,
  Clock,
  Code2,
  Crown,
  CreditCard,
  Database,
  FolderKanban,
  Globe2,
  Home,
  Image,
  Layers,
  LayoutTemplate,
  LogOut,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Rocket,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Video,
  Workflow,
  Zap,
  Briefcase,
  Newspaper,
} from "lucide-react"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/supabase"
import { prefetchStudioChunks } from "@/lib/studio-prefetch"

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
  activeView?: string
  onViewChange?: (view: string) => void
  chats?: Chat[]
  onLogout?: () => void
  onOpenCodex?: () => void
}

type NavItem = {
  id: string
  icon: typeof Home
  label: string
  description?: string
  badge?: string | number
  hot?: boolean
  accent?: "cyan" | "violet" | "emerald" | "amber" | "rose" | "blue"
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "Рабочая область",
    items: [
      { id: "home", icon: Home, label: "Главная", description: "Новая задача", accent: "violet" },
      { id: "chats", icon: MessageSquare, label: "AI-диалоги", description: "История разговоров", accent: "blue" },
      { id: "projects", icon: FolderKanban, label: "Проекты", description: "Созданные работы", accent: "emerald" },
    ],
  },
  {
    title: "Создать",
    items: [
      { id: "photo-generation", icon: Image, label: "Фото", description: "Изображения и редактор", accent: "cyan" },
      { id: "video-generation", icon: Video, label: "Видео", description: "Генерация роликов", accent: "rose" },
      { id: "code-generation", icon: Code2, label: "Код", description: "Сайты и приложения", accent: "amber" },
    ],
  },
]

const premiumSystemActions: NavItem[] = [
  { id: "settings", icon: Settings, label: "Настройки профиля", description: "Аккаунт и доступ", accent: "violet" },
  { id: "billing", icon: CreditCard, label: "Подписка и биллинг", description: "План, лимиты, оплата", accent: "blue" },
  { id: "support", icon: CircleHelp, label: "Поддержка 24/7", description: "Помощь и статус", accent: "emerald" },
]

const accentClass = (accent?: NavItem["accent"]) => {
  if (accent === "cyan") return "from-cyan-300/20 via-sky-400/10 to-transparent border-cyan-300/25 text-cyan-100"
  if (accent === "emerald") return "from-emerald-300/20 via-cyan-400/10 to-transparent border-emerald-300/25 text-emerald-100"
  if (accent === "amber") return "from-amber-300/20 via-orange-400/10 to-transparent border-amber-300/25 text-amber-100"
  if (accent === "rose") return "from-rose-300/20 via-fuchsia-400/10 to-transparent border-rose-300/25 text-rose-100"
  if (accent === "blue") return "from-blue-300/20 via-cyan-400/10 to-transparent border-blue-300/25 text-blue-100"
  return "from-violet-300/20 via-fuchsia-400/10 to-transparent border-violet-300/25 text-violet-100"
}

function formatChatTime(value: Date) {
  try {
    const date = value instanceof Date ? value : new Date(value)
    const diff = Date.now() - date.getTime()
    const minutes = Math.max(0, Math.floor(diff / 60000))
    if (minutes < 1) return "now"
    if (minutes < 60) return `${minutes}м`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}ч`
    return `${Math.floor(hours / 24)}д`
  } catch {
    return "—"
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
}: SidebarProps) {
  const [profile, setProfile] = useState<ReturnType<typeof getStoredAuthSnapshot>>(null)

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

  const email = profile?.email || "guest@malik.ai"
  const name = profile?.name || "Гость"
  const avatar = profile?.avatar || buildFallbackAvatar(email)
  const initials = useMemo(() => (name || email).slice(0, 2).toUpperCase(), [name, email])
  const fallbackRecentItems = useMemo(() => {
    const now = Date.now()
    return [
      { id: "recent-1", title: "Интерфейс Sovereign Hub", timestamp: new Date(now - 1000 * 60 * 60) },
      { id: "recent-2", title: "Дашборд аналитики AI", timestamp: new Date(now - 1000 * 60 * 60 * 2) },
      { id: "recent-3", title: "Quantum E-commerce", timestamp: new Date(now - 1000 * 60 * 60 * 24) },
      { id: "recent-4", title: "Neural Network Landing", timestamp: new Date(now - 1000 * 60 * 60 * 48) },
    ]
  }, [])
  const recentItems = chats.length > 0 ? chats : fallbackRecentItems
  const isGuest = /guest|anonymous/i.test(email)
  const displayName = isGuest ? "anonymous#guest" : name
  const planLabel = isGuest ? "Free plan" : "Pro workspace"

  const openView = (view: string) => {
    onViewChange?.(view)
  }

  const handleLogout = async () => {
    await signOutMalik()
    onLogout?.()
  }

  const renderNavButton = (item: NavItem, compact = false) => {
    const isActive = activeView === item.id
    const Icon = item.icon

    return (
      <button
        key={item.id}
        type="button"
        title={compact ? item.label : undefined}
        onClick={() => openView(item.id)}
        onMouseEnter={prefetchStudioChunks}
        onFocus={prefetchStudioChunks}
        data-accent={item.accent || "violet"}
        data-active={isActive ? "true" : "false"}
        className={cn(
          "malik-sidebar-nav-button group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border text-left transition duration-200",
          compact ? "h-12 justify-center px-0" : "px-3.5 py-3",
          isActive
            ? cn("border-white/15 bg-gradient-to-r text-white shadow-[0_18px_55px_rgba(0,0,0,.42)]", accentClass(item.accent))
            : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.045] hover:text-white",
        )}
      >
        {item.hot && <span className="malik-sidebar-hot-rail pointer-events-none absolute inset-y-2 left-0 w-1 rounded-r-full bg-cyan-300/80" />}
        <span
          className={cn(
            "malik-sidebar-nav-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
            isActive ? "border-white/15 bg-white/10 text-white" : "border-white/5 bg-white/[0.035] text-zinc-400 group-hover:text-white",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {!compact && (
          <>
            <span className="malik-sidebar-item-copy min-w-0 flex-1">
              <span className="malik-sidebar-item-label block text-sm font-black">{item.label}</span>
              {item.description ? <span className="malik-sidebar-item-desc mt-0.5 block text-[11px] font-medium text-zinc-500 group-hover:text-zinc-400">{item.description}</span> : null}
            </span>
            {item.badge ? (
              <span className={cn(
                "malik-sidebar-badge shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black",
                item.hot ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.055] text-zinc-300",
              )}>
                {item.badge}
              </span>
            ) : null}
          </>
        )}
      </button>
    )
  }

  if (isCollapsed) {
    return (
      <aside className="malik-sovereign-sidebar malik-sovereign-sidebar-collapsed flex h-[100dvh] w-[78px] flex-col border-r border-white/10 bg-[#030303] text-white shadow-[18px_0_70px_rgba(0,0,0,.35)]">
        <div className="flex h-16 items-center justify-center border-b border-white/10">
          <button type="button" onClick={onToggle} className="rounded-2xl border border-white/10 bg-white/[0.035] p-2.5 hover:bg-white/10">
            <PanelLeft className="h-5 w-5" />
          </button>
        </div>
        <button type="button" onClick={onNewChat} className="m-3 rounded-2xl bg-white p-3 text-black shadow-[0_12px_35px_rgba(255,255,255,.12)]">
          <Plus className="h-5 w-5" />
        </button>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {navSections.flatMap((section) => section.items).slice(0, 18).map((item) => renderNavButton(item, true))}
        </div>
        <div className="border-t border-white/10 p-3">
          <button type="button" onClick={onToggle} className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.035] p-2 text-zinc-400 hover:text-white">
            <PanelLeftClose className="mx-auto h-4 w-4" />
          </button>
          <img src={avatar} alt={name} className="h-11 w-11 rounded-2xl object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="malik-sovereign-sidebar relative flex h-[100dvh] w-[342px] max-w-[90vw] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#030303] text-white shadow-[22px_0_90px_rgba(0,0,0,.45)]">
      <div className="malik-sidebar-aurora pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(34,211,238,.12),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(139,92,246,.12),transparent_32%)]" />
      <div className="malik-sidebar-header relative flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_0_35px_rgba(255,255,255,.12)]">
            <svg viewBox="0 0 44 44" className="h-7 w-7" aria-hidden="true">
              <rect width="44" height="44" rx="12" fill="white" />
              <path d="M9 29 L22 15 L22 29 Z" fill="#03040a" />
              <path d="M24 15 H38 L24 29 Z" fill="#03040a" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block truncate text-lg font-black">MALIK AI</span>
            <span className="block truncate text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">V6.5 TITAN</span>
          </div>
        </div>
        <button type="button" onClick={onToggle} className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-zinc-500 hover:bg-white/10 hover:text-white">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="sovereign-sidebar-scroll relative min-h-0 flex-1 overflow-y-auto p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="malik-sidebar-create mb-4 flex w-full items-center justify-between rounded-[1.35rem] bg-white px-5 py-4 font-black text-black shadow-[0_18px_60px_rgba(255,255,255,.12)] transition hover:scale-[1.01]"
        >
          <span className="flex items-center gap-3"><Plus className="h-5 w-5" />Создать</span>
          <ChevronDown className="h-4 w-4" />
        </button>

        <div className="malik-sidebar-titan mb-5 rounded-[1.35rem] border border-cyan-300/15 bg-cyan-300/[0.055] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100/70"><Crown className="h-3.5 w-3.5" />Titan Packs</p>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">LIVE</span>
          </div>
        </div>

        <nav className="malik-sidebar-sections space-y-6">
          {navSections.map((section) => (
            <div key={section.title} className="malik-sidebar-section">
              <p className="malik-sidebar-section-title mb-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">{section.title}</p>
              <div className="space-y-1.5">{section.items.map((item) => renderNavButton(item))}</div>
            </div>
          ))}
        </nav>

        <div className="sidebar-system-actions mt-6 space-y-2 rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-3">
          {premiumSystemActions.map((item) => renderNavButton(item))}
          {profile?.isAdmin && (
            <button type="button" onClick={() => openView("analytics")} className="malik-sidebar-plain-action flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-black text-red-300 hover:bg-red-500/10">
              <Shield className="h-5 w-5" />Админ консоль
            </button>
          )}
          <button type="button" onClick={onOpenCodex} className="malik-sidebar-plain-action flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-black text-violet-200 hover:bg-violet-500/10">
            <Code2 className="h-5 w-5" />Malik Codex
          </button>
          <button type="button" onClick={handleLogout} className="malik-sidebar-plain-action flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-black text-zinc-300 hover:bg-white/5 hover:text-white">
            <LogOut className="h-5 w-5" />Завершить сеанс
          </button>
        </div>

        <div className="malik-sidebar-favorites mt-6">
          <p className="malik-sidebar-section-title mb-2 flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600"><Star className="h-4 w-4" />Избранное</p>
          <button type="button" onClick={() => openView("final-intelligence")} className="malik-sidebar-favorite-card w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left text-sm text-zinc-300 hover:bg-white/[0.06]">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-cyan-300" />Final Intelligence Cockpit
          </button>
        </div>

        <div className="malik-sidebar-recent mt-6">
            <div className="sidebar-recent-label malik-sidebar-section-title mb-2 flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600"><Clock className="h-4 w-4" />Последние</div>
            <div className="space-y-1">
              {recentItems.slice(0, 8).map((chat) => (
                <div key={chat.id} className="malik-sidebar-recent-item group flex items-center gap-2 rounded-2xl px-3 py-2 hover:bg-white/[0.045]">
                  <button type="button" onClick={() => onSelectChat?.(chat.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-zinc-400 group-hover:text-white">{chat.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600">{formatChatTime(chat.timestamp)}</span>
                  </button>
                  {onDeleteChat ? (
                    <button type="button" onClick={() => onDeleteChat(chat.id)} className="rounded-lg p-1.5 text-zinc-700 opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
        </div>
      </div>

      <div className="malik-sidebar-profile relative shrink-0 border-t border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 text-sm font-black">
            <img src={avatar} alt={name} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />
            <span className="hidden">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{displayName}</p>
            <p className="truncate text-[11px] text-zinc-500">{planLabel}</p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .malik-sovereign-sidebar {
          contain: layout paint;
        }
        .sovereign-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(103,232,249,.28) transparent;
        }
        .sovereign-sidebar-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .sovereign-sidebar-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(103,232,249,.34), rgba(167,139,250,.32));
        }
        .malik-sidebar-titan,
        .sidebar-system-actions,
        .malik-sidebar-profile > div {
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 55px rgba(0,0,0,.24);
        }
        .malik-sidebar-nav-button::after {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0;
          background: linear-gradient(115deg, transparent 0%, rgba(255,255,255,.12) 45%, transparent 72%);
          transform: translateX(-120%);
          transition: opacity .2s ease;
        }
        .malik-sidebar-nav-button:hover::after,
        .malik-sidebar-nav-button[data-active="true"]::after {
          opacity: 1;
          animation: malikSidebarSweep 1.8s ease-in-out;
        }
        .malik-provider-card {
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }
        .malik-provider-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,.18);
          background: rgba(255,255,255,.055);
        }
        @keyframes malikSidebarSweep {
          0% { transform: translateX(-120%); }
          55%, 100% { transform: translateX(120%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .malik-sidebar-nav-button::after,
          .malik-provider-card {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
