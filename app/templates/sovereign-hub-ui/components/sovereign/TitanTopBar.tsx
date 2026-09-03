"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  CarFront,
  CreditCard,
  FolderKanban,
  Languages,
  LibraryBig,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  Search,
  Settings,
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
  owns?: string[]
  href?: string
}

const TABS: Tab[] = [
  { id: "home", label: "Чат", icon: MessageSquare, owns: ["chats"] },
  { id: "taxi", label: "Taxi", icon: CarFront, href: "/taxi" },
  { id: "features", label: "Плагины", icon: Plug },
  { id: "projects", label: "Проекты", icon: FolderKanban },
  { id: "templates", label: "Библиотека", icon: LibraryBig },
  { id: "translator", label: "Переводчик", icon: Languages, href: "/translator" },
]

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
          { label: "Модели", value: data.groqConfigured || data.bedrockPrimaryConfigured ? "подключены" : "не настроены", ok: Boolean(data.groqConfigured || data.bedrockPrimaryConfigured) },
          { label: "Изображения", value: data.photoModelConfigured ? "подключены" : "не настроены", ok: Boolean(data.photoModelConfigured) },
          { label: "Видео", value: data.videoModelConfigured ? "подключены" : "не настроены", ok: Boolean(data.videoModelConfigured) },
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
    return TABS.find((tab) => tab.owns?.includes(activeView))?.id ?? null
  }, [activeView])

  const closeAll = () => {
    setModesOpen(false)
    setSignalsOpen(false)
    setUserOpen(false)
  }

  const go = (tab: Tab) => {
    closeAll()
    if (tab.href) {
      window.location.assign(tab.href)
      return
    }
    onViewChange(tab.id)
  }

  const goView = (view: string) => {
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

      <span className="titan-mobile-brand" aria-hidden="true">Malik AI</span>
      <nav aria-label="Разделы" className="titan-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => go(tab)}
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
              {signals ? signals.map((signal) => (
                <div key={signal.label} className="titan-signal-row">
                  <span className={cn("titan-signal-dot", signal.ok ? "is-ok" : "is-bad")} />
                  <span className="flex-1 truncate">{signal.label}</span>
                  <span className="titan-signal-value">{signal.value}</span>
                </div>
              )) : <p className="titan-popover-empty">Проверяю…</p>}
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
            <img src={avatar} alt="" onError={(event) => { event.currentTarget.style.display = "none" }} />
            <span className="titan-avatar-initials">{initials}</span>
          </button>
          {userOpen ? (
            <div role="menu" className="titan-popover right-0 w-60">
              <p className="titan-popover-email">{email}</p>
              <div className="titan-popover-sep" />
              <button type="button" role="menuitem" onClick={() => goView("settings")} className="titan-popover-item">
                <Settings className="h-4 w-4" /> Настройки
              </button>
              <button type="button" role="menuitem" onClick={() => goView("billing")} className="titan-popover-item">
                <CreditCard className="h-4 w-4" /> Подписка
              </button>
              <div className="titan-popover-sep" />
              <button type="button" role="menuitem" onClick={handleLogout} className="titan-popover-item is-danger">
                <LogOut className="h-4 w-4" /> Выйти
              </button>
            </div>
          ) : null}
        </div>

        {!profile ? (
          <a href="/sign-in" className="titan-mobile-signin" aria-label="Войти в Malik AI">Вход</a>
        ) : null}
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
          border-bottom: 1px solid var(--malik-border, rgba(212,175,55,.14));
          background: var(--malik-surface, #0e0e10);
          padding: 0 14px;
          color: #fff;
          font-family: Inter, "Segoe UI", Arial, sans-serif;
        }
        .titan-tabs {
          display: flex;
          min-width: 0;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .titan-tabs::-webkit-scrollbar { display: none; }
        .titan-tab {
          display: inline-flex;
          height: 36px;
          flex-shrink: 0;
          align-items: center;
          gap: 8px;
          border: 1px solid transparent;
          border-radius: 999px;
          padding: 0 14px;
          color: #f5f5f5;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          transition: color .14s ease, background-color .14s ease, border-color .14s ease;
        }
        .titan-tab:hover { background: rgba(255,255,255,.045); color: #fff; }
        .titan-tab:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(232,197,106,.45); }
        .titan-tab.is-active {
          border-color: rgba(255,240,200,.3);
          background: var(--malik-gradient-gold, linear-gradient(135deg,#f3de96,#d9ae45 45%,#a87c22));
          color: #1b1405;
          box-shadow: 0 6px 20px rgba(201,152,47,.22);
        }
        .titan-tab.is-active svg { color: #1b1405; }
        .titan-topbar-right { display: flex; flex-shrink: 0; align-items: center; gap: 8px; }
        .titan-search {
          display: none;
          height: 36px;
          width: 230px;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--malik-border, rgba(212,175,55,.14));
          border-radius: 10px;
          background: rgba(255,255,255,.02);
          padding: 0 12px;
          color: #d6d6d6;
          font-size: 12px;
          text-align: left;
        }
        .titan-search span { flex: 1; color: #f1f1f1; }
        .titan-search kbd { color: #8b8b8f; font-size: 10px; }
        .titan-icon-btn {
          display: inline-grid;
          height: 36px;
          width: 36px;
          place-items: center;
          border-radius: 10px;
          color: #d7d7d9;
          transition: background-color .14s ease, color .14s ease;
        }
        .titan-icon-btn:hover, .titan-icon-btn.is-open { background: rgba(255,255,255,.06); color: #fff; }
        .titan-icon-btn.is-round { border: 1px solid var(--malik-border, rgba(212,175,55,.14)); border-radius: 999px; }
        .titan-popover {
          position: absolute;
          right: 0;
          top: 44px;
          z-index: 80;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 14px;
          background: #171718;
          padding: 7px;
          box-shadow: 0 20px 55px rgba(0,0,0,.45);
        }
        .titan-popover-title, .titan-popover-email { padding: 8px 9px; color: #8f8f96; font-size: 11px; }
        .titan-popover-email { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .titan-popover-item {
          display: flex;
          min-height: 38px;
          width: 100%;
          align-items: center;
          gap: 9px;
          border-radius: 9px;
          padding: 0 10px;
          color: #d5d5d8;
          font-size: 12px;
          text-align: left;
        }
        .titan-popover-item:hover, .titan-popover-item.is-active { background: rgba(255,255,255,.06); color: #fff; }
        .titan-popover-item.is-danger { color: #f19a9a; }
        .titan-popover-sep { height: 1px; margin: 5px 3px; background: rgba(255,255,255,.07); }
        .titan-dot, .titan-badge-dot, .titan-signal-dot { display: inline-block; border-radius: 999px; }
        .titan-dot { margin-left: auto; height: 6px; width: 6px; background: #d9ae45; }
        .titan-badge-dot { position: absolute; right: 4px; top: 4px; height: 6px; width: 6px; background: #f87171; }
        .titan-signal-row { display: flex; min-height: 34px; align-items: center; gap: 8px; padding: 0 9px; color: #cfcfd3; font-size: 11px; }
        .titan-signal-dot { height: 7px; width: 7px; }
        .titan-signal-dot.is-ok { background: #34d399; }
        .titan-signal-dot.is-bad { background: #f87171; }
        .titan-signal-value { color: #8d8d94; }
        .titan-popover-empty { padding: 10px; color: #77777e; font-size: 11px; }
        .titan-avatar {
          position: relative;
          display: grid;
          height: 36px;
          width: 36px;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 999px;
          background: #1b1b1d;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
        }
        .titan-avatar img { position: absolute; inset: 0; height: 100%; width: 100%; object-fit: cover; z-index: 1; }
        .titan-avatar-initials { position: relative; z-index: 0; }
        .titan-mobile-signin { display: none; }
        @media (min-width: 1180px) { .titan-search { display: flex; } }
        @media (max-width: 900px) {
          .titan-topbar { padding: 0 8px; gap: 6px; }
          .titan-tab { padding: 0 10px; font-size: 12px; }
          .titan-tab span { display: none; }
          .titan-tab.is-active span { display: inline; }
        }
        @media (max-width: 767px) {
          .titan-mobile-signin {
            display: inline-flex !important;
            min-width: 64px;
            height: 34px;
            padding: 0 13px;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.72);
            border-radius: 7px;
            background: rgba(13,17,23,.96);
            color: #f0f6fc;
            text-decoration: none;
            font-size: 13px;
            line-height: 1;
            font-weight: 600;
            letter-spacing: -.01em;
            box-shadow: 0 1px 0 rgba(255,255,255,.08) inset, 0 6px 18px rgba(0,0,0,.32);
            -webkit-tap-highlight-color: transparent;
          }
          .titan-mobile-signin:active { transform: scale(.97); background: #161b22; }
        }
      `}</style>
    </header>
  )
}

export const TitanTopBar = memo(TitanTopBarInner)
export default TitanTopBar
