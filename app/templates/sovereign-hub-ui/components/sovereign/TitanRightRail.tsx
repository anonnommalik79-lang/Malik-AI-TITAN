"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bot,
  ChevronRight,
  CircleDot,
  Clock3,
  FolderKanban,
  Gauge,
  Globe2,
  Image as ImageIcon,
  Languages,
  MessageSquare,
  Network,
  Orbit,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react"
import type { AiModeId } from "./power-registry"

type RailChat = {
  id: string
  title: string
  timestamp: Date
}

type TitanRightRailProps = {
  chats: RailChat[]
  activeAiMode: AiModeId
  username: string
  onOpenChats: () => void
  onSelectChat?: (chatId: string) => void
}

type AIStatus = {
  ok?: boolean
  buildReady?: boolean
  capabilitiesCount?: number
  modelsConfigured?: number | string[]
  product?: string
}

type UsageStatus = {
  plan?: string
  usage?: { chat?: number; image?: number; video?: number; project?: number }
  limits?: { chat?: number; image?: number; video?: number; project?: number }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatChatTime(value: Date) {
  try {
    const date = value instanceof Date ? value : new Date(value)
    const now = Date.now()
    const diff = Math.max(0, now - date.getTime())
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "сейчас"
    if (minutes < 60) return `${minutes} мин`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ч`
    if (hours < 48) return "Вчера"
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  } catch {
    return ""
  }
}

function iconForChat(title: string) {
  const value = title.toLowerCase()
  if (/изображ|photo|image|картин/.test(value)) return ImageIcon
  if (/видео|video/.test(value)) return Video
  if (/рынок|анализ|analytics/.test(value)) return BarChart3
  if (/проект|crm|сайт|app/.test(value)) return FolderKanban
  return MessageSquare
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[18px] border border-[#d9a928]/14 bg-[#060706] shadow-[inset_0_1px_0_rgba(255,255,255,.025),0_16px_40px_rgba(0,0,0,.18)] ${className}`}
    >
      {children}
    </section>
  )
}

function StatusBar({ label, value }: { label: string; value: number }) {
  const safe = clampPercent(value)
  return (
    <div className="grid grid-cols-[58px_1fr_36px] items-center gap-2.5 text-[11px]">
      <span className="text-zinc-400">{label}</span>
      <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.065]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#8f6a12] via-[#e6b832] to-[#ffd65a] shadow-[0_0_12px_rgba(229,183,48,.25)]"
          style={{ width: `${safe}%` }}
        />
      </div>
      <span className="text-right font-medium text-zinc-300">{safe}%</span>
    </div>
  )
}

export function TitanRightRail({ chats, activeAiMode, username, onOpenChats, onSelectChat }: TitanRightRailProps) {
  const [status, setStatus] = useState<AIStatus>({})
  const [usage, setUsage] = useState<UsageStatus>({})
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const syncNetwork = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine)
    syncNetwork()
    window.addEventListener("online", syncNetwork)
    window.addEventListener("offline", syncNetwork)

    let cancelled = false
    Promise.allSettled([
      fetch("/api/ai/status", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/ai/usage", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([statusResult, usageResult]) => {
      if (cancelled) return
      if (statusResult.status === "fulfilled") setStatus(statusResult.value || {})
      if (usageResult.status === "fulfilled") setUsage(usageResult.value || {})
    })

    return () => {
      cancelled = true
      window.removeEventListener("online", syncNetwork)
      window.removeEventListener("offline", syncNetwork)
    }
  }, [])

  const recentChats = useMemo(() => chats.slice(0, 4), [chats])
  const modelCount = Array.isArray(status.modelsConfigured)
    ? status.modelsConfigured.length
    : Number(status.modelsConfigured || 0)
  const corePercent = status.ok ? 100 : 0
  const modelsPercent = modelCount > 0 ? clampPercent(Math.min(100, 34 + modelCount * 11)) : 0
  const networkPercent = online ? 100 : 0
  const stable = Boolean(status.ok && online)

  const chatUsage = Number(usage.usage?.chat || 0)
  const chatLimit = Number(usage.limits?.chat || 0)
  const usageLabel = chatLimit > 0 ? `${chatUsage}/${chatLimit}` : usage.plan || "готово"
  const language = typeof navigator !== "undefined" ? navigator.language || "ru-KZ" : "ru-KZ"

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#d9a928]/10 bg-[#020303] px-3 py-4 text-white min-[1280px]:flex 2xl:w-[314px]">
      <div className="flex justify-end">
        <div className="flex min-w-[128px] items-center gap-2 rounded-[14px] border border-[#d9a928]/18 bg-[#090a08] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
          <span className={`h-2 w-2 rounded-full ${stable ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.75)]" : "bg-amber-400"}`} />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-zinc-100">MalikLLM75B</p>
            <p className={`mt-0.5 text-[10px] ${stable ? "text-emerald-400" : "text-amber-300"}`}>{stable ? "Online" : "Проверка"}</p>
          </div>
        </div>
      </div>

      <Panel>
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h3 className="text-[13px] font-semibold tracking-tight text-zinc-100">Недавние чаты</h3>
          <button type="button" onClick={onOpenChats} className="text-[11px] font-semibold text-[#e3b72f] transition hover:text-[#ffd966]">
            Все
          </button>
        </div>
        <div className="px-3 pb-3">
          {recentChats.length > 0 ? (
            recentChats.map((chat) => {
              const Icon = iconForChat(chat.title)
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat?.(chat.id)}
                  className="group flex w-full items-center gap-3 border-b border-white/[0.055] px-1 py-3 text-left last:border-b-0"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[#d9a928]/20 bg-[#0b0c09] text-[#e1b52e] transition group-hover:border-[#e1b52e]/45 group-hover:bg-[#151208]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-zinc-200">{chat.title}</span>
                    <span className="mt-1 flex items-center gap-1 text-[9.5px] text-zinc-600">
                      <Clock3 className="h-3 w-3" />
                      {formatChatTime(chat.timestamp)}
                    </span>
                  </span>
                </button>
              )
            })
          ) : (
            <div className="px-2 py-5 text-[11px] leading-5 text-zinc-600">История появится здесь после первого диалога.</div>
          )}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h3 className="text-[13px] font-semibold text-zinc-100">Контекст</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e0b52e]/20 bg-[#b88a12]/10 px-2 py-1 text-[9px] font-semibold text-[#e7bc35]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f0c94a]" />
            Включен
          </span>
        </div>
        <div className="space-y-3 px-4 pb-4 pt-2 text-[10.5px]">
          <div className="flex items-center gap-2.5"><FolderKanban className="h-3.5 w-3.5 text-sky-300" /><span className="text-zinc-500">Проект:</span><span className="ml-auto truncate text-zinc-200">MALIK AI</span></div>
          <div className="flex items-center gap-2.5"><Languages className="h-3.5 w-3.5 text-[#d7b23c]" /><span className="text-zinc-500">Язык:</span><span className="ml-auto text-zinc-200">{language}</span></div>
          <div className="flex items-center gap-2.5"><Sparkles className="h-3.5 w-3.5 text-[#d7b23c]" /><span className="text-zinc-500">Режим:</span><span className="ml-auto capitalize text-zinc-200">{String(activeAiMode)}</span></div>
          <div className="flex items-center gap-2.5"><Gauge className="h-3.5 w-3.5 text-[#d7b23c]" /><span className="text-zinc-500">Лимит чата:</span><span className="ml-auto text-zinc-200">{usageLabel}</span></div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <h3 className="text-[13px] font-semibold text-zinc-100">Статус системы</h3>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${stable ? "text-emerald-400" : "text-amber-300"}`}>
            <CircleDot className="h-3 w-3" />
            {stable ? "Онлайн" : "Проверка"}
          </span>
        </div>
        <div className="space-y-3.5 px-4 pb-4">
          <StatusBar label="Ядро" value={corePercent} />
          <StatusBar label="Модели" value={modelsPercent} />
          <StatusBar label="Сеть" value={networkPercent} />
        </div>
      </Panel>

      <Panel className="relative min-h-[150px] overflow-hidden">
        <div className="relative z-10 max-w-[170px] px-4 py-4">
          <p className="text-[12px] font-semibold tracking-[.03em] text-zinc-100">MALIK AI v6.5 TITAN</p>
          <p className="mt-2 text-[10px] leading-4 text-zinc-500">Сила. Скорость. Интеллект.</p>
          <button type="button" className="mt-5 inline-flex h-8 items-center gap-1 rounded-[9px] border border-[#d9a928]/20 bg-[#171208] px-3 text-[10px] font-semibold text-[#e4ba39] transition hover:border-[#e4ba39]/45 hover:bg-[#211a0a]">
            Подробнее
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="pointer-events-none absolute -bottom-7 -right-4 h-40 w-40 opacity-90">
          <div className="absolute inset-[34px] rounded-full bg-[#d49c13]/15 blur-2xl" />
          <div className="absolute inset-[48px] rounded-full border border-[#e8b62b]/60 shadow-[0_0_30px_rgba(226,170,34,.28)]" />
          <div className="absolute left-[14px] top-[66px] h-[42px] w-[116px] rotate-[18deg] rounded-[50%] border border-[#e8b62b]/35" />
          <div className="absolute left-[28px] top-[52px] h-[40px] w-[100px] -rotate-[28deg] rounded-[50%] border border-[#e8b62b]/25" />
          <Orbit className="absolute right-12 top-12 h-8 w-8 text-[#e2b32e]" />
        </div>
      </Panel>

      <div className="mt-auto flex items-center justify-end gap-2 px-1 pb-1 pt-1 text-[9.5px] text-zinc-600">
        <span className={`h-1.5 w-1.5 rounded-full ${stable ? "bg-emerald-400" : "bg-amber-400"}`} />
        <span>{stable ? "Все системы работают стабильно" : "Система выполняет проверку"}</span>
      </div>

      <span className="sr-only">{username}</span>
    </aside>
  )
}

export default TitanRightRail
