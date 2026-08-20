"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Coins,
  Menu,
  Bell,
  Settings,
  LogOut,
  User,
  CreditCard,
  HelpCircle,
  Sparkles,
  ChevronDown,
  Crown,
  Zap,
  Code2,
  Search,
  PanelLeft,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ApiStatusPopover } from "./api-status-popover"
import { DeployMenu } from "./deploy-menu"
import { AI_MODES, type AiModeId, type PowerAction } from "./power-registry"
import { openTelegramUpgrade } from "./pro-upgrade-card"
import { resetUsage } from "@/lib/usage-limits"

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


type TitanHeaderSignal = {
  label: string
  value: string
  tone: "cyan" | "violet" | "emerald" | "amber"
}

const TITAN_HEADER_SIGNALS: TitanHeaderSignal[] = [
  { label: "Runtime", value: "Live", tone: "cyan" },
  { label: "Canvas", value: "Ready", tone: "cyan" },
  { label: "Codex", value: "Armed", tone: "violet" },
  { label: "Demo", value: "Stage", tone: "amber" },
]

const getSignalToneClass = (tone: TitanHeaderSignal["tone"]) => {
  if (tone === "emerald") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
  if (tone === "cyan") return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
  if (tone === "amber") return "border-amber-300/20 bg-amber-300/10 text-amber-100"
  return "border-violet-300/20 bg-violet-300/10 text-violet-100"
}

const inlineToolClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-bold text-zinc-200 transition hover:border-white/18 hover:bg-white/[0.08] hover:text-white"

function HeaderInner({ onMenuClick, isSidebarCollapsed, onOpenCodex, onOpenCanvas, onViewChange, onLogout, currentMode = "auto", onModeChange, isOwner, userEmail, homeMode, onOpenCommandCenter }: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [upgradeHovered, setUpgradeHovered] = useState(false)
  const [barStatus, setBarStatus] = useState("Core: Online · DB: Online · AI: fallback mode · Canvas: Ready")

  const activeModeLabel = useMemo(() => AI_MODES.find((mode) => mode.id === currentMode)?.label || currentMode, [currentMode])
  const ownerLabel = isOwner ? "Founder / Owner cockpit" : "Digital Bridge demo cockpit"
  const titanStatusText = `${ownerLabel} · ${activeModeLabel} · ${barStatus}`

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (event.altKey && key === "1") {
        event.preventDefault()
        onViewChange?.("final-intelligence")
      }
      if (event.altKey && key === "2") {
        event.preventDefault()
        onViewChange?.("ai-generator")
      }
      if (event.altKey && key === "3") {
        event.preventDefault()
        onOpenCanvas?.()
      }
      if (event.altKey && key === "4") {
        event.preventDefault()
        onOpenCodex?.()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onOpenCanvas, onOpenCodex, onViewChange])

  // A single palette instance is mounted at dashboard level so Ctrl+K works on every view.
  const openCommandPalette = () => window.dispatchEvent(new CustomEvent("malik-open-command-palette"))

  const notifications = [
    { id: 1, title: "Новая версия доступна", desc: "Malik Ai 2.0 с улучшенной генерацией", time: "2 мин" },
    { id: 2, title: "Проект опубликован", desc: "Лендинг успешно развернут", time: "1 час" },
    { id: 3, title: "Приглашение в команду", desc: "Вас пригласили в Team Alpha", time: "3 часа" },
  ]

  const runPowerAction = (action: PowerAction) => {
    const type = action.actionType
    if (type.startsWith("set-mode:")) {
      const mode = type.replace("set-mode:", "") as AiModeId
      onModeChange?.(mode)
      setBarStatus(`${action.title}: ${action.safeStatus}`)
      return
    }
    if (type === "open-home") {
      onViewChange?.("home")
      setBarStatus("Home opened")
      return
    }
    if (type === "open-photo") {
      onViewChange?.("photo-generation")
      setBarStatus("Photo Studio opened")
      return
    }
    if (type === "open-video") {
      onViewChange?.("video-generation")
      setBarStatus("Video Studio opened")
      return
    }
    if (type === "open-codex") {
      onOpenCodex?.()
      setBarStatus("Malik Codex opened")
      return
    }
    if (type === "open-canvas" || type === "prompt-canvas") {
      onOpenCanvas?.()
      setBarStatus(`${action.title}: canvas opened`)
      return
    }
    if (type === "open-pro") {
      openTelegramUpgrade()
      setBarStatus("Pro upgrade opened")
      return
    }
    if (type === "reset-usage") {
      resetUsage()
      setBarStatus("Local usage counters reset")
      return
    }
    if (type === "copy-build-command") {
      navigator.clipboard?.writeText("npm run build")
      setBarStatus("Build command copied")
      return
    }
    if (type === "open-notifications") {
      setNotificationsOpen(true)
      setBarStatus("Notifications opened")
      return
    }
    if (type === "open-templates") onViewChange?.("templates")
    else if (type === "open-projects") onViewChange?.("projects")
    else if (type === "open-chats") onViewChange?.("chats")
    else if (type === "open-design") onViewChange?.("component-generation")
    else if (type === "open-billing") onViewChange?.("billing")
    else if (type === "open-support") onViewChange?.("support")
    else if (type === "open-command-palette") openCommandPalette()
    else if (type === "open-api-status") setBarStatus("API drawer is available in the top bar")
    else if (type === "open-deploy") setBarStatus("Render Guard: run npm build before push/deploy")
    else if (type === "owner-tools") setBarStatus(isOwner ? "Owner tools ready" : "Owner tools hidden for this account")
    else setBarStatus(`${action.title}: ${action.safeStatus}`)
  }

  return (
    <header className="malik-titan-header relative z-30 flex shrink-0 flex-col overflow-hidden border-b border-cyan-300/10 bg-black text-white shadow-[0_18px_80px_rgba(0,0,0,.38)]">
      <style>{`
        .malik-titan-header {
          background:
            radial-gradient(circle at 16% 0%, rgba(34, 211, 238, .12), transparent 34%),
            radial-gradient(circle at 82% 0%, rgba(139, 92, 246, .14), transparent 38%),
            linear-gradient(180deg, rgba(2, 6, 18, .98), rgba(0, 0, 0, .96));
          backdrop-filter: blur(24px);
        }
        .malik-titan-header::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent, rgba(125, 211, 252, .08), transparent),
            linear-gradient(to right, rgba(255,255,255,.03) 1px, transparent 1px);
          background-size: 100% 100%, 44px 44px;
          mask-image: linear-gradient(180deg, black, transparent 96%);
        }
        .malik-titan-center-card {
          border: 1px solid rgba(125, 211, 252, .16);
          background:
            radial-gradient(circle at 14% 0%, rgba(34,211,238,.16), transparent 34%),
            radial-gradient(circle at 92% 100%, rgba(139,92,246,.16), transparent 38%),
            rgba(2, 8, 23, .62);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 18px 70px rgba(8, 47, 73, .14);
          backdrop-filter: blur(18px);
        }
        .malik-titan-launch-rail {
          background:
            linear-gradient(90deg, rgba(2, 8, 23, .84), rgba(10, 9, 27, .74), rgba(2, 8, 23, .84));
          border-top: 1px solid rgba(125, 211, 252, .09);
          border-bottom: 1px solid rgba(125, 211, 252, .09);
        }
        .malik-titan-action-chip {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.038);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 12px 42px rgba(0,0,0,.18);
        }
        .malik-titan-action-chip::after {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity .2s ease;
          background: radial-gradient(circle at 30% 0%, rgba(125,211,252,.18), transparent 38%);
        }
        .malik-titan-action-chip:hover::after { opacity: 1; }
      `}</style>
      <div className="flex h-12 w-full min-w-0 items-center gap-2 px-3 sm:h-14 sm:px-4">
      {/* Left Side - Mobile Menu */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-[#737373] transition-colors hover:bg-[#1F2937] hover:text-[#f5f5f5] lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {homeMode ? (
          <div className="hidden items-center gap-2.5 lg:flex">
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#e7ece9]">Malik AI</span>
          </div>
        ) : isSidebarCollapsed ? (
          <div className="hidden items-center gap-2 lg:flex">
            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center">
              <span className="text-black font-bold text-sm">S</span>
            </div>
            <span className="text-[#f5f5f5] font-semibold text-sm tracking-tight">
              MALIK AI V6.5 TITAN
            </span>
          </div>
        ) : null}
      </div>

      {homeMode ? (
        <div className="malik-mobile-header-sovereign flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white shadow-[0_0_16px_rgba(255,255,255,.1)]">
            <svg viewBox="0 0 44 44" className="h-6 w-6" aria-hidden="true">
              <rect width="44" height="44" rx="12" fill="white" />
              <path d="M9 29 L22 15 L22 29 Z" fill="#03040a" />
              <path d="M24 15 H38 L24 29 Z" fill="#03040a" />
            </svg>
          </div>
          <div className="malik-mobile-header-brand-copy min-w-0 max-w-[56vw] leading-none">
            <p className="truncate font-serif text-[13px] font-bold tracking-tight text-white">MALIK AI V6.5 TITAN</p>
          </div>
        </div>
      ) : null}

      {homeMode ? (
        <div className="malik-titan-home-center hidden min-w-0 flex-1 items-center justify-center gap-2 px-2 md:flex">
          <div className="malik-titan-home-center-card flex min-w-0 max-w-full items-center justify-center gap-3 rounded-2xl px-3 py-1.5">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/80">Sovereign Creator Hub</p>
          </div>
        </div>
      ) : (
        <div className="malik-titan-center-card hidden min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl px-4 py-2 xl:flex">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/75">Sovereign command layer</p>
            </div>
            <p className="mt-1 max-w-[560px] truncate text-xs font-bold text-zinc-400">{titanStatusText}</p>
          </div>
          <div className="hidden shrink-0 items-center gap-1 2xl:flex">
            {TITAN_HEADER_SIGNALS.map((signal) => (
              <span key={signal.label} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]", getSignalToneClass(signal.tone))}>
                {signal.label}: {signal.value}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={cn("malik-titan-inline-tools flex shrink-0 items-center justify-end gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", homeMode && "hidden lg:flex")}>
        <button
          type="button"
          onClick={() => (homeMode && onOpenCommandCenter ? onOpenCommandCenter() : openCommandPalette())}
          className={inlineToolClass}
        >
          <Search className="h-3.5 w-3.5 text-cyan-200" />
          <span>Поиск</span>
        </button>
        <button type="button" onClick={onOpenCanvas} className={inlineToolClass}>
          <PanelLeft className="h-3.5 w-3.5 text-sky-200" />
          <span>Canvas</span>
        </button>
        <button
          type="button"
          onClick={onOpenCodex}
          className={cn(inlineToolClass, "border-violet-400/25 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20")}
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Codex</span>
        </button>
        <ApiStatusPopover />
        <DeployMenu onOpenDeployGuide={() => onViewChange?.("support")} onStatus={setBarStatus} />
      </div>

      {/* Right Side */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Upgrade Button */}
        <button
          type="button"
          onClick={openTelegramUpgrade}
          onMouseEnter={() => setUpgradeHovered(true)}
          onMouseLeave={() => setUpgradeHovered(false)}
          className={cn(
            "relative hidden overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 sm:block group",
            upgradeHovered
              ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
              : "bg-[#1F2937] text-[#f5f5f5] hover:bg-[#374151]"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">
            {upgradeHovered && <Crown className="w-4 h-4" />}
            Модернизация
          </span>
          {upgradeHovered && (
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenCodex}
          className="hidden items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-sm font-black text-violet-100 transition hover:bg-violet-500/20 lg:flex"
        >
          <Code2 className="h-4 w-4" />
          Malik Codex
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setNotificationsOpen(!notificationsOpen)
              setUserMenuOpen(false)
            }}
            className="relative p-2 rounded-lg hover:bg-[#1F2937] transition-colors text-[#737373] hover:text-[#f5f5f5]"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#0a0a0a] border border-[#1F2937] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-[#1F2937] flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#f5f5f5]">Уведомления</h3>
                <button type="button" onClick={() => setNotificationsOpen(false)} className="text-xs text-violet-400 hover:text-violet-300">Прочитать все</button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((notif) => (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false)
                      onViewChange?.("support")
                    }}
                    className="w-full p-3 hover:bg-[#1F2937] transition-colors text-left border-b border-[#1F2937] last:border-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#f5f5f5] font-medium">{notif.title}</p>
                        <p className="text-xs text-[#737373] truncate">{notif.desc}</p>
                      </div>
                      <span className="text-xs text-[#737373] shrink-0">{notif.time}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Token Balance */}
        <button type="button" onClick={() => onViewChange?.("analytics")} className="hidden items-center gap-2 rounded-lg border border-[#1F2937] bg-[#0a0a0a] px-3 py-2 transition-colors hover:border-[#374151] sm:flex group">
          <div className="relative">
            <Coins className="w-4 h-4 text-amber-400" />
            <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-sm font-medium text-[#f5f5f5]">4.46</span>
          <Zap className="w-3 h-3 text-amber-400" />
        </button>

        <button
          type="button"
          onClick={() => {
            setUserMenuOpen(false)
            setNotificationsOpen(false)
            onLogout?.()
          }}
          className="hidden h-8 items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 text-xs font-black text-red-100 transition hover:border-red-300/45 hover:bg-red-500/20 hover:text-white md:flex"
          title="Выйти из аккаунта"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>

        {/* User Avatar with Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen)
              setNotificationsOpen(false)
            }}
            className={cn(
              "flex items-center gap-2 p-1 pr-2 rounded-lg transition-all",
              userMenuOpen ? "bg-[#1F2937]" : "hover:bg-[#1F2937]"
            )}
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold">
                M
              </AvatarFallback>
            </Avatar>
            <ChevronDown className={cn(
              "w-3.5 h-3.5 text-[#737373] transition-transform duration-200 hidden md:block",
              userMenuOpen && "rotate-180"
            )} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#0a0a0a] border border-[#1F2937] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-[#1F2937]">
                <p className="text-sm font-medium text-[#f5f5f5]">Malik</p>
                <p className="text-xs text-[#737373]">malik@sovereign.ai</p>
              </div>
              <div className="p-1.5">
                <button type="button" onClick={() => { setUserMenuOpen(false); onViewChange?.("profile") }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1F2937] transition-colors text-left">
                  <User className="w-4 h-4 text-[#737373]" />
                  <span className="text-sm text-[#f5f5f5]">Профиль</span>
                </button>
                <button type="button" onClick={() => { setUserMenuOpen(false); onViewChange?.("settings") }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1F2937] transition-colors text-left">
                  <Settings className="w-4 h-4 text-[#737373]" />
                  <span className="text-sm text-[#f5f5f5]">Настройки</span>
                </button>
                <button type="button" onClick={() => { setUserMenuOpen(false); openTelegramUpgrade() }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1F2937] transition-colors text-left">
                  <CreditCard className="w-4 h-4 text-[#737373]" />
                  <span className="text-sm text-[#f5f5f5]">Подписка</span>
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">Pro</span>
                </button>
                <button type="button" onClick={() => { setUserMenuOpen(false); onViewChange?.("support") }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1F2937] transition-colors text-left">
                  <HelpCircle className="w-4 h-4 text-[#737373]" />
                  <span className="text-sm text-[#f5f5f5]">Помощь</span>
                </button>
                <button type="button" onClick={() => { setUserMenuOpen(false); onOpenCodex?.() }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-violet-500/10 transition-colors text-left">
                  <Code2 className="w-4 h-4 text-violet-300" />
                  <span className="text-sm text-violet-100">Malik Codex</span>
                </button>
                <div className="h-px bg-[#1F2937] my-1" />
                <button type="button" onClick={() => { setUserMenuOpen(false); onLogout?.() }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left group">
                  <LogOut className="w-4 h-4 text-[#737373] group-hover:text-red-400" />
                  <span className="text-sm text-[#737373] group-hover:text-red-400">Выйти</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>


      {/* Click outside to close */}
      {(userMenuOpen || notificationsOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setUserMenuOpen(false)
            setNotificationsOpen(false)
          }}
        />
      )}
    </header>
  )
}

export const Header = memo(HeaderInner)

