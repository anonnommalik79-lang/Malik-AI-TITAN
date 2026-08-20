"use client"

import { memo, useEffect, useMemo, useState } from "react"
import {
  Code2,
  FileText,
  Globe2,
  Image as ImageIcon,
  Languages,
  MessageSquare,
  Sparkles,
  SquareCode,
  Video,
} from "lucide-react"
import { estimateTokens, formatTokens, useContextEnabled } from "@/lib/malik-context"
import {
  PLACEHOLDER_SYSTEM_METRICS,
  USE_LIVE_SYSTEM_METRICS,
  readLiveSystemMetrics,
  readRuntimeHealth,
  type SystemMetric,
} from "@/lib/system-metrics"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

type RailChat = {
  id: string
  title: string
  timestamp: Date
}

interface RightRailProps {
  chats: RailChat[]
  onSelectChat: (id: string) => void
  onSeeAll: () => void
  /** Title of the conversation in view, used as the context project name. */
  projectName?: string
  /** Human label of the current answer mode. */
  modeLabel?: string
  /** Text of everything currently in the conversation, for the token estimate. */
  contextTexts?: string[]
  onOpenBilling?: () => void
}

function iconFor(title: string) {
  const value = (title || "").toLowerCase()
  if (/видео|ролик|клип|\bvideo\b/.test(value)) return Video
  if (/изображ|фото|картин|логотип|\bimage\b|\bphoto\b/.test(value)) return ImageIcon
  if (/код|компонент|\bcode\b|\breact\b|\bapi\b/.test(value)) return Code2
  if (/документ|бриф|отчёт|отчет|\bdoc\b/.test(value)) return FileText
  return MessageSquare
}

function formatWhen(value: Date) {
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    const now = new Date()
    const sameDay =
      date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    if (sameDay) return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    if (isYesterday) return "Вчера"

    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  } catch {
    return ""
  }
}

/** Browser locale, shown in the context panel. */
function readLanguageLabel(): string {
  if (typeof navigator === "undefined") return "Русский"
  const tag = (navigator.language || "ru").toLowerCase()
  if (tag.startsWith("kk")) return "Қазақша"
  if (tag.startsWith("en")) return "English"
  if (tag.startsWith("ru")) return tag.includes("kz") ? "Русский (KZ)" : "Русский"
  return tag
}

function RightRailInner({
  chats,
  onSelectChat,
  onSeeAll,
  projectName,
  modeLabel = "Create",
  contextTexts = [],
  onOpenBilling,
}: RightRailProps) {
  const [contextEnabled, setContextEnabled] = useContextEnabled()
  const [language, setLanguage] = useState("Русский")
  const [metrics, setMetrics] = useState<SystemMetric[]>(PLACEHOLDER_SYSTEM_METRICS)
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    setLanguage(readLanguageLabel())
  }, [])

  useEffect(() => {
    let cancelled = false

    readRuntimeHealth().then((health) => {
      if (!cancelled) setOnline(health ? health.online : false)
    })

    if (USE_LIVE_SYSTEM_METRICS) {
      readLiveSystemMetrics().then((live) => {
        if (!cancelled && live) setMetrics(live)
      })
    }

    return () => {
      cancelled = true
    }
  }, [])

  const recent = useMemo(() => chats.slice(0, 6), [chats])
  const tokens = useMemo(() => estimateTokens(contextTexts), [contextTexts])

  return (
    <aside aria-label="Контекст и статус" className="titan-rail">
      <section className="titan-rail-panel">
        <header className="titan-rail-head">
          <h2>Недавние чаты</h2>
          <button type="button" onClick={onSeeAll} className="titan-rail-link">
            Все
          </button>
        </header>

        {recent.length === 0 ? (
          <p className="titan-rail-empty">Пока пусто. Первый запрос появится здесь.</p>
        ) : (
          <ul className="titan-rail-list">
            {recent.map((chat) => {
              const Icon = iconFor(chat.title)
              return (
                <li key={chat.id}>
                  <button type="button" onClick={() => onSelectChat(chat.id)} className="titan-rail-item">
                    <span className="titan-rail-item-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="titan-rail-item-title">{chat.title}</span>
                      <span className="titan-rail-item-time">{formatWhen(chat.timestamp)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="titan-rail-panel">
        <header className="titan-rail-head">
          <h2>Контекст</h2>
          <button
            type="button"
            role="switch"
            aria-checked={contextEnabled}
            aria-label="Передавать историю диалога модели"
            onClick={() => setContextEnabled(!contextEnabled)}
            className={cn("titan-switch", contextEnabled && "is-on")}
          >
            <span className="titan-switch-knob" />
            <span className="titan-switch-label">{contextEnabled ? "Включен" : "Выключен"}</span>
          </button>
        </header>

        <dl className={cn("titan-context", !contextEnabled && "is-off")}>
          <div>
            <dt>
              <SquareCode className="h-[15px] w-[15px]" />
              Проект
            </dt>
            <dd>{projectName || "Malik Brand"}</dd>
          </div>
          <div>
            <dt>
              <Languages className="h-[15px] w-[15px]" />
              Язык
            </dt>
            <dd>{language}</dd>
          </div>
          <div>
            <dt>
              <Sparkles className="h-[15px] w-[15px]" />
              Режим
            </dt>
            <dd>{modeLabel}</dd>
          </div>
          <div>
            <dt>
              <Globe2 className="h-[15px] w-[15px]" />
              Память
            </dt>
            <dd>{contextEnabled ? `${formatTokens(tokens)} токенов` : "не передаётся"}</dd>
          </div>
        </dl>
      </section>

      <section className="titan-rail-panel">
        <header className="titan-rail-head">
          <h2>Статус системы</h2>
          <span className={cn("titan-status", online === false && "is-down")}>
            <span className="titan-status-dot" />
            {online === null ? "Проверка" : online ? "Онлайн" : "Недоступно"}
          </span>
        </header>

        <div className="titan-meters">
          {metrics.map((metric) => (
            <div key={metric.id} className="titan-meter">
              <span className="titan-meter-label">{metric.label}</span>
              <span className="titan-meter-track">
                <span className="titan-meter-fill" style={{ width: `${metric.value}%` }} />
              </span>
              <span className="titan-meter-value">{metric.display}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="titan-rail-promo">
        <span className="titan-promo-orbit" aria-hidden="true" />
        <h2>MALIK AI v6.5 TITAN</h2>
        <p>Сила. Скорость. Интеллект.</p>
        <button type="button" onClick={onOpenBilling} className="malik-gold-button titan-promo-cta">
          Подробнее
        </button>
      </section>

      <p className={cn("titan-rail-footnote", online === false && "is-down")}>
        <span className="titan-status-dot" />
        {online === false ? "Среда недоступна" : "Все системы работают стабильно"}
      </p>

      <style jsx global>{`
        .titan-rail {
          display: none;
          width: 320px;
          flex-shrink: 0;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          border-left: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          background: var(--malik-surface, #0e0e10);
          padding: 14px;
          scrollbar-width: thin;
          scrollbar-color: rgba(212, 175, 55, 0.22) transparent;
        }
        @media (min-width: 1280px) {
          .titan-rail {
            display: flex;
          }
        }

        .titan-rail-panel {
          border: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          border-radius: 16px;
          background: var(--malik-surface-raised, #121214);
          padding: 12px;
        }

        .titan-rail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 2px 4px 10px;
        }
        .titan-rail-head h2 {
          font-size: 13px;
          font-weight: 600;
          color: var(--malik-text, #f5f2ea);
        }

        .titan-rail-link {
          font-size: 12px;
          color: var(--malik-accent-bright, #e8c56a);
          transition: color 0.13s ease;
        }
        .titan-rail-link:hover {
          color: var(--malik-accent-pale, #f3de96);
        }
        .titan-rail-link:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
          border-radius: 4px;
        }

        .titan-rail-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .titan-rail-item {
          display: flex;
          width: 100%;
          align-items: center;
          gap: 10px;
          border-radius: 10px;
          padding: 8px;
          text-align: left;
          transition: background-color 0.13s ease;
        }
        .titan-rail-item:hover {
          background: var(--malik-accent-4, rgba(212, 175, 55, 0.04));
        }
        .titan-rail-item:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }

        .titan-rail-item-icon {
          display: flex;
          height: 32px;
          width: 32px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          border: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          background: var(--malik-accent-4, rgba(212, 175, 55, 0.04));
          color: var(--malik-accent-bright, #e8c56a);
        }

        .titan-rail-item-title {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          line-height: 1.25;
          color: #d8d1c4;
        }
        .titan-rail-item:hover .titan-rail-item-title {
          color: #fff8ea;
        }

        .titan-rail-item-time {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          line-height: 1.2;
          color: #6f695f;
        }

        .titan-rail-empty {
          padding: 6px 4px 4px;
          font-size: 12px;
          line-height: 1.5;
          color: #6f695f;
        }

        /* ---------------------------------------------------------- switch */

        .titan-switch {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-radius: 999px;
          border: 1px solid var(--malik-border, rgba(212, 175, 55, 0.14));
          background: rgba(255, 255, 255, 0.03);
          padding: 3px 9px 3px 4px;
          font-size: 11px;
          color: #8f887d;
          transition: border-color 0.14s ease, color 0.14s ease, background-color 0.14s ease;
        }
        .titan-switch:hover {
          border-color: var(--malik-border-strong, rgba(212, 175, 55, 0.28));
        }
        .titan-switch:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(232, 197, 106, 0.45);
        }
        .titan-switch.is-on {
          border-color: var(--malik-border-strong, rgba(212, 175, 55, 0.28));
          background: var(--malik-accent-8, rgba(212, 175, 55, 0.08));
          color: var(--malik-accent-pale, #f3de96);
        }
        .titan-switch-knob {
          position: relative;
          display: block;
          height: 14px;
          width: 26px;
          flex-shrink: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          transition: background-color 0.14s ease;
        }
        .titan-switch-knob::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          height: 10px;
          width: 10px;
          border-radius: 999px;
          background: #8f887d;
          transition: transform 0.16s ease, background-color 0.14s ease;
        }
        .titan-switch.is-on .titan-switch-knob {
          background: var(--malik-accent-deep, #a87c22);
        }
        .titan-switch.is-on .titan-switch-knob::after {
          transform: translateX(12px);
          background: #fff6df;
        }

        /* --------------------------------------------------------- context */

        .titan-context {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0;
          transition: opacity 0.15s ease;
        }
        .titan-context.is-off {
          opacity: 0.45;
        }
        .titan-context > div {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 4px;
        }
        .titan-context dt {
          display: flex;
          flex: 1;
          align-items: center;
          gap: 9px;
          font-size: 12.5px;
          color: #8f887d;
        }
        .titan-context dt svg {
          color: var(--malik-accent-bright, #e8c56a);
          opacity: 0.8;
        }
        .titan-context dd {
          margin: 0;
          max-width: 55%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12.5px;
          font-weight: 500;
          color: #d8d1c4;
        }

        /* ---------------------------------------------------------- status */

        .titan-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #34d399;
        }
        .titan-status.is-down {
          color: #f87171;
        }
        .titan-status-dot {
          height: 6px;
          width: 6px;
          border-radius: 999px;
          background: currentColor;
        }

        .titan-meters {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 2px 4px 4px;
        }
        .titan-meter {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .titan-meter-label {
          width: 44px;
          flex-shrink: 0;
          font-size: 12px;
          color: #8f887d;
        }
        .titan-meter-track {
          position: relative;
          height: 6px;
          flex: 1;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }
        .titan-meter-fill {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: var(--malik-gradient-gold, linear-gradient(90deg, #a87c22, #f3de96));
        }
        .titan-meter-value {
          width: 46px;
          flex-shrink: 0;
          text-align: right;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          color: #d8d1c4;
        }

        /* ----------------------------------------------------------- promo */

        .titan-rail-promo {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid var(--malik-border-strong, rgba(212, 175, 55, 0.28));
          background:
            radial-gradient(120% 100% at 100% 100%, rgba(201, 152, 47, 0.16), transparent 62%),
            var(--malik-surface-raised, #121214);
          padding: 14px;
        }
        .titan-rail-promo h2 {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.01em;
          color: var(--malik-text, #f5f2ea);
        }
        .titan-rail-promo p {
          margin: 5px 0 12px;
          font-size: 12.5px;
          color: #9a9186;
        }
        .titan-promo-cta {
          height: 34px;
          padding: 0 16px;
          border-radius: 10px;
          font-size: 13px;
        }
        /* Ringed planet from the design: lit sphere, soft halo, tilted ring. */
        .titan-promo-orbit {
          position: absolute;
          right: -26px;
          bottom: -34px;
          z-index: -1;
          height: 112px;
          width: 112px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 32% 28%, #fbeec2 0%, #e2b551 26%, #a87c22 58%, #4a3510 82%, #241a08 100%);
          box-shadow:
            0 0 26px rgba(232, 197, 106, 0.35),
            0 0 70px rgba(201, 152, 47, 0.22),
            inset -10px -12px 26px rgba(0, 0, 0, 0.55);
        }
        .titan-promo-orbit::before,
        .titan-promo-orbit::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          border-radius: 999px;
          transform: translate(-50%, -50%) rotate(-28deg);
        }
        .titan-promo-orbit::before {
          height: 46px;
          width: 210px;
          border: 2px solid rgba(243, 222, 150, 0.55);
          box-shadow: 0 0 18px rgba(232, 197, 106, 0.3);
        }
        .titan-promo-orbit::after {
          height: 74px;
          width: 250px;
          border: 1px solid rgba(232, 197, 106, 0.2);
        }

        .titan-rail-footnote {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 2px 0 6px;
          font-size: 11.5px;
          color: #34d399;
        }
        .titan-rail-footnote.is-down {
          color: #f87171;
        }
      `}</style>
    </aside>
  )
}

export const RightRail = memo(RightRailInner)
export default RightRail
