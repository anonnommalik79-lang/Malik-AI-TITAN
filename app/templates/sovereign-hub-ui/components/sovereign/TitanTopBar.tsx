"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  Compass,
  FolderKanban,
  LayoutGrid,
  LibraryBig,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  CreditCard,
  Zap,
} from "lucide-react"
import type { AiModeId } from "./power-registry"
import { AI_MODES } from "./power-registry"
import { buildFallbackAvatar, getStoredAuthSnapshot, signOutMalik } from "@/lib/auth/client-session"
import { clientFetchWithTimeout } from "@/lib/api-client"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

type Tab = {
  id: string
  label: string
  icon: typeof MessageSquare
  /** Views that should light this tab up, beyond the primary one. */
  owns?: string[]
}

const TABS: Tab[] = [
  { id: "home", label: "Чат", icon: MessageSquare, owns: ["chats"] },
  {
    id: "command-center",
    label: "Рабочая область",
    icon: LayoutGrid,
    owns: ["final-intelligence", "unbreakable-ai", "capabilities", "business-command-center", "media-newsroom"],
  },
  { id: "projects", label: "Проекты", icon: FolderKanban },
  { id: "templates", label: "Библиотека", icon: LibraryBig },
  {
    id: "dashboard-generation",
    label: "Аналитика",
    icon: Compass,
    owns: ["code-generation", "website-generation", "landing-generation", "document-generation", "presentation-generation", "template-generation", "component-generation"],
  },
]

/** Only the modes worth reaching in one click; the full list lives in the composer. */
const QUICK_MODE_IDS: AiModeId[] = ["auto", "chat", "code", "website", "research", "deep"]

type RuntimeSignal = { label: string; value: string; ok: boolean }

interface TitanTopBarProps {
  activeView: string
  onViewChange: (view: string) => void
  onOpenSearch: () => void
  onMenuClick: () => void
  onLogout?: () => void
  currentMode?: AiModeId
  onModeChange?: (mode: AiModeId) => void
}

function useDismissable(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, close])

  return ref
}

function TitanTopBarInner({
  activeView,
  onViewChange,
  onOpenSearch,
  onMenuClick,
  onLogout,
  currentMode = "auto",
  onModeChange,
}: TitanTopBarProps) {
  const [profile, setProfile] = useState<ReturnType<typeof getStoredAuthSnapshot>>(null)
  const [modesOpen, setModesOpen] = useState(false)
  const [signalsOpen, setSignalsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [signals, setSignals] = useState<RuntimeSignal[] | null>(null)

  const modesRef = useDismissable(modesOpen, useCallback(() => setModesOpen(false), []))
  const signalsRef = useDismissable(signalsOpen, useCallback(() => setSignalsOpen(false), []))
  const userRef = useDismissable(userOpen, useCallback(() => setUserOpen(false), []))

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

  // Runtime state is read only when the panel is opened — no background polling.
  useEffect(() => {
    if (!signalsOpen || signals) return
    let cancelled = false

    clientFetchWithTimeout("/api/ai/status", { method: "GET" }, 6000)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setSignals([{ label: "Среда", value: "нет ответа", ok: false }])
          return
        }
        setSignals([
          { label: "Ядро", value: data.ok ? "онлайн" : "недоступно", ok: Boolean(data.ok) },
          { label: "Текстовые модели", value: data.groqConfigured || data.bedrockPrimaryConfigured ? "подключены" : "не настроены", ok: Boolean(data.groqConfigured || data.bedrockPrimaryConfigured) },
          { label: "Изображения", value: data.photoModelConfigured ? "подключены" : "не настроены", ok: Boolean(data.photoModelConfigured) },
          { label: "Видео", value: data.videoModelConfigured ? "подключены" : "не настроены", ok: Boolean(data.videoModelConfigured) },
          { label: "Возможности", value: data.capabilitiesLoaded ? `${data.capabilitiesCount}` : "не загружены", ok: Boolean(data.capabilitiesLoaded) },
        ])
      })
      .catch(() => {
        if (!cancelled) setSignals([{ label: "Среда", value: "нет связи", ok: false }])
      })

    return () => {
      cancelled = true
    }
  }, [signalsOpen, signals])

  const email = profile?.email || "guest@malik.ai"
  const name = profile?.name || "Гость"
  const avatar = profile?.avatar || buildFallbackAvatar(email)
  const initials = useMemo(() => (name || email).slice(0, 2).toUpperCase(), [name, email])

  const activeTab = useMemo(() => {
    const exact = TABS.find((tab) => tab.id === activeView)
    if (exact) return exact.id
    const owner = TABS.find((tab) => tab.owns?.includes(activeView))
    return owner?.id ?? null
  }, [activeView])

  const closeAll = () => {
    setModesOpen(false)
    setSignalsOpen(false)
    setUserOpen(false)
  }

  const go = (view: string) => {
    closeAll()
    onViewChange(view)
  }

  const handleLogout = async () => {
    closeAll()
    await signOutMalik()
    onLogout?.()
  }

  const failing = signals?.filter((signal) => !signal.ok).length ?? 0

  return (
    <header className="titan-topbar">
      <button type="button" onClick={onMenuClick} aria-label="Меню" className="titan-icon-btn lg:hidden">
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <nav aria-label="Разделы" className="titan-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => go(tab.id)}
              className={cn("titan-tab", isActive && "is-active")}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="titan-topbar-right">
        <button type="button" onClick={onOpenSearch} className="titan-search">
          <Search className="h-4 w-4" />
          <span>Поиск...</span>
          <kbd>⌘F</kbd>
        </button>

        <div ref={modesRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={modesOpen}
            aria-label="Режим ответа"
            onClick={() => {
              setSignalsOpen(false)
              setUserOpen(false)
              setModesOpen((open) => !open)
            }}
            className={cn("titan-icon-btn is-round", modesOpen && "is-open")}
          >
            <Zap className="h-[18px] w-[18px]" />
          </button>
          {modesOpen ? (
            <div role="menu" className="titan-popover w-56">
              <p className="titan-popover-title">Режим ответа</p>
              {QUICK_MODE_IDS.map((id) => {
                const mode = AI_MODES.find((entry) => entry.id === id)
                if (!mode) return null
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentMode === id}
                    onClick={() => {
                      onModeChange?.(id)
                      setModesOpen(false)
                    }}
                    className={cn("titan-popover-item", currentMode === id && "is-active")}
                  >
                    <span>{mode.label}</span>
                    {currentMode === id ? <span className="titan-dot" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div ref={signalsRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={signalsOpen}
            aria-label="Состояние среды"
            onClick={() => {
              setModesOpen(false)
              setUserOpen(false)
              setSignalsOpen((open) => !open)
            }}
            className={cn("titan-icon-btn is-round", signalsOpen && "is-open")}
          >
            <Bell className="h-[18px] w-[18px]" />
            {failing > 0 ? <span className="titan-badge-dot" /> : null}
          </button>
          {signalsOpen ? (
            <div role="menu" className="titan-popover w-72">
              <p className="titan-popover-title">Состояние среды</p>
              {signals ? (
                signals.map((signal) => (
                  <div key={signal.label} className="titan-signal-row">
                    <span className={cn("titan-signal-dot", signal.ok ? "is-ok" : "is-bad")} />
                    <span className="flex-1 truncate">{signal.label}</span>
                    <span className="titan-signal-value">{signal.value}</span>
                  </div>
                ))
              ) : (
                <p className="titan-popover-empty">Читаю /api/ai/status…</p>
              )}
            </div>
          ) : null}
        </div>

        <div ref={userRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            aria-label="Профиль"
            onClick={() => {
              setModesOpen(false)
              setSignalsOpen(false)
              setUserOpen((open) => !open)
            }}
            className="titan-avatar"
          >
            <img
              src={avatar}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none"
              }}
            />
            <span className="titan-avatar-initials">{initials}</span>
          </button>
          {userOpen ? (
            <div role="menu" className="titan-popover right-0 w-60">
              <p className="titan-popover-email">{email}</p>
              <div className="titan-popover-sep" />
              <button type="button" role="menuitem" onClick={() => go("settings")} className="titan-popover-item">
                <Settings className="h-4 w-4" />
                Настройки
              </button>
              <button type="button" role="menuitem" onClick={() => go("billing")} className="titan-popover-item">
                <CreditCard className="h-4 w-4" />
                Подписка
              </button>
              <div className="titan-popover-sep" />
              <button type="button" role="menuitem" onClick={handleLogout} className="titan-popover-item is-danger">
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        .titan-topbar {
          position: relative;
          z-index: 40;
          display: flex;
          height: 60px;
          flex-shrink: 0;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          background: var(--malik-surface, #0e0e10);
          padding: 0 14px;
          color: #fff;
          font-family: Inter, "Segoe UI", Arial, sans-serif;
        }

        .titan-tabs {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .titan-tabs::-webkit-scrollbar {
          display: none;
        }

        .titan-tab {
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          gap: 8px;
          height: 36px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid transparent;
          color: #f5f5f5;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
        }
        .titan-tab:hover {
          color: #fff;
          background: var(--malik-accent-4, rgba(212, 175, 55, 0.04));
        }
        .titan-tab:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }
        .titan-tab.is-active {
          color: #1b1405;
          background: var(--malik-gradient-gold, linear-gradient(135deg, #f3de96, #d9ae45 45%, #a87c22));
          border-color: rgba(255, 240, 200, 0.3);
          box-shadow: 0 6px 20px rgba(201, 152, 47, 0.22);
        }
        .titan-tab.is-active svg {
          color: #1b1405;
        }

        .titan-topbar-right {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 8px;
        }

        .titan-search {
          display: none;
          align-items: center;
          gap: 10px;
          height: 36px;
          width: 230px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          background: rgba(255, 255, 255, 0.02);
          color: #f5f5f5;
          font-size: 13px;
          transition: border-color 0.14s ease, color 0.14s ease;
        }
        @media (min-width: 1024px) {
          .titan-search {
            display: flex;
          }
        }
        .titan-search:hover {
          border-color: var(--malik-border-strong, rgba(212, 175, 55, 0.28));
          color: #fff;
        }
        .titan-search span {
          flex: 1;
          text-align: left;
        }
        .titan-search kbd {
          font-family: inherit;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.68);
        }

        .titan-icon-btn {
          position: relative;
          display: flex;
          height: 36px;
          width: 36px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid transparent;
          color: #f5f5f5;
          transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
        }
        .titan-icon-btn.is-round {
          border-radius: 999px;
          border-color: var(--malik-border, rgba(212, 175, 55, 0.14));
        }
        .titan-icon-btn:hover,
        .titan-icon-btn.is-open {
          color: var(--malik-accent-bright, #e8c56a);
          background: var(--malik-accent-8, rgba(212, 175, 55, 0.08));
          border-color: var(--malik-border-strong, rgba(212, 175, 55, 0.28));
        }
        .titan-icon-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }

        .titan-badge-dot {
          position: absolute;
          top: 7px;
          right: 8px;
          height: 6px;
          width: 6px;
          border-radius: 999px;
          background: #f87171;
        }

        .titan-avatar {
          position: relative;
          display: flex;
          height: 36px;
          width: 36px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
          background: var(--malik-gradient-gold, linear-gradient(135deg, #f3de96, #a87c22));
          color: #1b1405;
          font-size: 12px;
          font-weight: 700;
        }
        .titan-avatar img {
          position: absolute;
          inset: 0;
          height: 100%;
          width: 100%;
          object-fit: cover;
        }
        .titan-avatar:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }

        .titan-popover {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 60;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
          background: var(--malik-surface-raised, #121214);
          padding: 6px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
        }

        .titan-popover-title {
          padding: 6px 10px 8px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #6f695f;
        }

        .titan-popover-email {
          padding: 8px 10px;
          font-size: 11px;
          color: #8f887d;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .titan-popover-sep {
          height: 1px;
          margin: 4px 0;
          background: var(--malik-hairline, rgba(255, 255, 255, 0.06));
        }

        .titan-popover-item {
          display: flex;
          width: 100%;
          align-items: center;
          gap: 9px;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          color: #cfc7b8;
          text-align: left;
          transition: background-color 0.13s ease, color 0.13s ease;
        }
        .titan-popover-item:hover {
          background: var(--malik-accent-8, rgba(212, 175, 55, 0.08));
          color: #fff8ea;
        }
        .titan-popover-item:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }
        .titan-popover-item.is-active {
          color: var(--malik-accent-bright, #e8c56a);
        }
        .titan-popover-item.is-danger {
          color: #fca5a5;
        }
        .titan-popover-item.is-danger:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #fecaca;
        }

        .titan-popover-empty {
          padding: 10px;
          font-size: 12px;
          color: #6f695f;
        }

        .titan-dot {
          height: 6px;
          width: 6px;
          border-radius: 999px;
          background: var(--malik-accent-bright, #e8c56a);
        }

        .titan-signal-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 7px 10px;
          font-size: 13px;
          color: #cfc7b8;
        }
        .titan-signal-dot {
          height: 6px;
          width: 6px;
          flex-shrink: 0;
          border-radius: 999px;
        }
        .titan-signal-dot.is-ok {
          background: #34d399;
        }
        .titan-signal-dot.is-bad {
          background: #f87171;
        }
        .titan-signal-value {
          flex-shrink: 0;
          font-size: 12px;
          color: #8f887d;
        }

        @media (max-width: 1023px) {
          .titan-tabs {
            justify-content: flex-start;
          }
        }
      `}</style>
    </header>
  )
}

export const TitanTopBar = memo(TitanTopBarInner)
export default TitanTopBar
