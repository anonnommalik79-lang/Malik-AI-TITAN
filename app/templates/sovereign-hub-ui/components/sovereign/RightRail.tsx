"use client"

import { memo, useMemo } from "react"
import { Code2, FileText, Image as ImageIcon, MessageSquare, Video } from "lucide-react"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

type RailChat = {
  id: string
  title: string
  timestamp: Date
  techStack?: string[]
  status?: string
}

interface RightRailProps {
  chats: RailChat[]
  onSelectChat: (id: string) => void
  onSeeAll: () => void
}

/** Pick an icon from the conversation title so the list reads at a glance. */
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

function RightRailInner({ chats, onSelectChat, onSeeAll }: RightRailProps) {
  const recent = useMemo(() => chats.slice(0, 6), [chats])

  return (
    <aside aria-label="Контекст" className="titan-rail">
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
      `}</style>
    </aside>
  )
}

export const RightRail = memo(RightRailInner)
export default RightRail
