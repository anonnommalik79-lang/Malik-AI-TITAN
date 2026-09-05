"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, MessageSquare, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react"
import { getStoredAuthSnapshot } from "@/lib/auth/client-session"
import { MALIK_OWNER_EMAIL } from "@/lib/auth/admin-policy"

type FounderUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  createdAt: string | null
  lastSignInAt: string | null
  activeToday?: boolean
}

type FounderMessageEntry = {
  id: string
  source: "chat" | "voice"
  userText: string
  assistantText: string
  createdAt: string
  provider?: string
  model?: string
}

type OverviewPayload = {
  ok?: boolean
  recentUsers?: FounderUser[]
  error?: string
}

type MessagesPayload = {
  ok?: boolean
  entries?: FounderMessageEntry[]
  count?: number
  storage?: string
  error?: string
}

function isFounderSnapshot() {
  const snapshot = getStoredAuthSnapshot()
  return Boolean(snapshot?.isAdmin === true && snapshot?.email?.trim().toLowerCase() === MALIK_OWNER_EMAIL)
}

function when(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function FounderMessageHistoryRuntime() {
  const [founder, setFounder] = useState(false)
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)
  const [layerLeft, setLayerLeft] = useState(0)
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<FounderUser[]>([])
  const [selected, setSelected] = useState<FounderUser | null>(null)
  const [entries, setEntries] = useState<FounderMessageEntry[]>([])
  const [query, setQuery] = useState("")
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState("")
  const [storage, setStorage] = useState("")

  useEffect(() => {
    const update = () => {
      const next = isFounderSnapshot()
      setFounder(next)
      if (!next) setOpen(false)
    }
    update()
    window.addEventListener("malik-auth-updated", update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener("malik-auth-updated", update)
      window.removeEventListener("storage", update)
    }
  }, [])

  useEffect(() => {
    if (!founder) {
      setActionTarget(null)
      return
    }

    let frame = 0
    const scan = () => {
      frame = 0
      const layer = document.querySelector<HTMLElement>(".malik-founder-layer")
      const target = layer?.querySelector<HTMLElement>(".malik-founder-header__actions") || null
      setActionTarget((current) => current === target ? current : target)
      setLayerLeft(layer?.getBoundingClientRect().left || 0)
      if (!layer) setOpen(false)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] })
    window.addEventListener("resize", schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [founder])

  const loadUsers = useCallback(async () => {
    if (!founder) return
    setLoadingUsers(true)
    setError("")
    try {
      const response = await fetch("/api/founder/overview", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as OverviewPayload
      if (!response.ok || !data.ok) throw new Error(data.error || `Founder API ${response.status}`)
      const next = Array.isArray(data.recentUsers) ? data.recentUsers : []
      setUsers(next)
      setSelected((current) => current ? next.find((item) => item.id === current.id) || current : null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить пользователей")
    } finally {
      setLoadingUsers(false)
    }
  }, [founder])

  const loadMessages = useCallback(async (user: FounderUser) => {
    setSelected(user)
    setLoadingMessages(true)
    setEntries([])
    setStorage("")
    setError("")
    try {
      const params = new URLSearchParams({ id: user.id || "", email: user.email || "" })
      const response = await fetch(`/api/founder/messages?${params.toString()}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as MessagesPayload
      if (!response.ok || !data.ok) throw new Error(data.error || `Messages API ${response.status}`)
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setStorage(String(data.storage || ""))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить историю")
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !founder) return
    void loadUsers()
  }, [open, founder, loadUsers])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) => `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(needle))
  }, [users, query])

  if (!founder || typeof document === "undefined") return null

  const button = actionTarget ? createPortal(
    <button
      type="button"
      data-founder-message-history
      title="История сообщений"
      aria-label="История сообщений пользователей"
      onClick={() => setOpen(true)}
    >
      <MessageSquare />
    </button>,
    actionTarget,
  ) : null

  const panel = open ? createPortal(
    <section className="malik-founder-messages-layer" style={{ left: layerLeft }} aria-label="История сообщений пользователей">
      <header className="malik-founder-messages-header">
        <div>
          <span><ShieldCheck /> FOUNDER PRIVATE</span>
          <h2>История сообщений</h2>
          <p>Запрос пользователя и ответ Malik AI. Доступ только owner-аккаунту.</p>
        </div>
        <div className="malik-founder-messages-actions">
          <button type="button" onClick={() => void loadUsers()} disabled={loadingUsers} title="Обновить"><RefreshCw className={loadingUsers ? "is-spinning" : ""} /></button>
          <button type="button" onClick={() => setOpen(false)} title="Закрыть"><X /></button>
        </div>
      </header>

      <div className="malik-founder-messages-body">
        <aside className="malik-founder-messages-users">
          <label>
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или email" aria-label="Поиск пользователя" />
            {query ? <button type="button" onClick={() => setQuery("")}><X /></button> : null}
          </label>
          <div className="malik-founder-messages-userlist">
            {visibleUsers.map((user) => (
              <button
                type="button"
                key={user.id || user.email}
                className={selected?.id === user.id ? "is-selected" : ""}
                onClick={() => void loadMessages(user)}
              >
                <span className="malik-founder-messages-avatar">{(user.name || user.email || "U").charAt(0).toUpperCase()}</span>
                <span className="malik-founder-messages-usercopy">
                  <strong>{user.name || "Пользователь"}{user.emailVerified ? <CheckCircle2 /> : null}</strong>
                  <small>{user.email}</small>
                </span>
                {user.activeToday ? <i title="Активен сегодня" /> : null}
              </button>
            ))}
            {!visibleUsers.length ? <div className="malik-founder-messages-empty">Пользователи не найдены.</div> : null}
          </div>
        </aside>

        <main className="malik-founder-messages-main">
          {selected ? (
            <>
              <div className="malik-founder-messages-person">
                <div>
                  <strong>{selected.name || "Пользователь"}</strong>
                  <span>{selected.email}</span>
                </div>
                <div>
                  <b>{entries.length}</b>
                  <small>диалогов</small>
                </div>
              </div>

              {error ? <div className="malik-founder-messages-error"><ShieldCheck /><span>{error}</span></div> : null}

              {loadingMessages ? (
                <div className="malik-founder-messages-loading"><RefreshCw className="is-spinning" /> Загружаю историю…</div>
              ) : entries.length ? (
                <div className="malik-founder-messages-feed">
                  {entries.map((entry) => (
                    <article key={`${entry.id}-${entry.createdAt}`} className="malik-founder-message-turn">
                      <div className="malik-founder-message-meta">
                        <span className={entry.source === "voice" ? "is-voice" : ""}>{entry.source === "voice" ? "VOICE" : "CHAT"}</span>
                        <time>{when(entry.createdAt)}</time>
                        {(entry.model || entry.provider) ? <small>{[entry.provider, entry.model].filter(Boolean).join(" · ")}</small> : null}
                      </div>
                      <div className="malik-founder-message-line is-user">
                        <b>Пользователь</b>
                        <p>{entry.userText || "—"}</p>
                      </div>
                      <div className="malik-founder-message-line is-assistant">
                        <b>Malik AI</b>
                        <p>{entry.assistantText || "—"}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="malik-founder-messages-zero">
                  <MessageSquare />
                  <strong>Сохранённого текста пока нет</strong>
                  <p>Старые счётчики запросов не содержат сам текст. Поэтому запросы, сделанные до включения журнала, из числа «Сообщения» восстановить нельзя.</p>
                </div>
              )}

              <footer className="malik-founder-messages-foot">
                <ShieldCheck />
                <span>{storage === "encrypted-object-storage" ? "История хранится зашифрованно в object storage." : "Сейчас история хранится только в текущем server runtime; для долговечности нужен настроенный storage."}</span>
              </footer>
            </>
          ) : (
            <div className="malik-founder-messages-zero is-start">
              <UserRound />
              <strong>Выбери пользователя слева</strong>
              <p>Откроются его текстовые и Voice-запросы вместе с ответами Malik AI.</p>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .malik-founder-messages-layer{position:fixed;z-index:96;top:0;right:0;bottom:0;display:flex;min-width:0;flex-direction:column;overflow:hidden;background:#050505;color:#f5f5f6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .malik-founder-messages-header{min-height:86px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 26px;border-bottom:1px solid rgba(255,255,255,.08);background:#080808}
        .malik-founder-messages-header>div:first-child{min-width:0}.malik-founder-messages-header span{display:flex;align-items:center;gap:7px;margin-bottom:5px;color:#c9aa61;font-size:9px;font-weight:850;letter-spacing:.16em}.malik-founder-messages-header span svg{width:13px;height:13px}.malik-founder-messages-header h2{margin:0;color:#fff;font-size:24px;line-height:1.1;font-weight:720;letter-spacing:-.035em}.malik-founder-messages-header p{margin:5px 0 0;color:#77777f;font-size:12px}
        .malik-founder-messages-actions{display:flex;gap:7px}.malik-founder-messages-actions button{width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#121212;color:#a9a9af}.malik-founder-messages-actions button:hover{background:#1a1a1a;color:#fff}.malik-founder-messages-actions svg{width:17px;height:17px}.is-spinning{animation:malik-founder-message-spin .8s linear infinite}
        .malik-founder-messages-body{min-height:0;flex:1;display:grid;grid-template-columns:300px minmax(0,1fr)}.malik-founder-messages-users{min-height:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.08);background:#080808}.malik-founder-messages-users>label{position:relative;display:block;margin:14px}.malik-founder-messages-users>label>svg{position:absolute;left:11px;top:50%;width:14px;height:14px;transform:translateY(-50%);color:#5e5e65}.malik-founder-messages-users input{width:100%;height:38px;border:1px solid rgba(255,255,255,.09);border-radius:10px;outline:0;background:#101010;padding:0 34px;color:#ddd;font-size:11px}.malik-founder-messages-users input:focus{border-color:rgba(255,255,255,.18)}.malik-founder-messages-users label button{position:absolute;right:6px;top:6px;width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:#666}.malik-founder-messages-users label button svg{width:12px;height:12px}
        .malik-founder-messages-userlist{min-height:0;flex:1;overflow:auto;padding:0 8px 12px;scrollbar-width:thin;scrollbar-color:#242424 transparent}.malik-founder-messages-userlist>button{position:relative;width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) 8px;gap:9px;align-items:center;min-height:56px;border:0;border-radius:10px;background:transparent;padding:7px 8px;color:inherit;text-align:left}.malik-founder-messages-userlist>button:hover,.malik-founder-messages-userlist>button.is-selected{background:#151515}.malik-founder-messages-avatar{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:#202020;color:#eee;font-size:11px;font-weight:800}.malik-founder-messages-usercopy{min-width:0;display:grid;gap:3px}.malik-founder-messages-usercopy strong{display:flex;align-items:center;gap:5px;overflow:hidden;color:#ddd;font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.malik-founder-messages-usercopy strong svg{width:11px;height:11px;color:#8fa78f}.malik-founder-messages-usercopy small{overflow:hidden;color:#68686f;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.malik-founder-messages-userlist>button>i{width:6px;height:6px;border-radius:999px;background:#69b77b;box-shadow:0 0 8px rgba(105,183,123,.45)}
        .malik-founder-messages-main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}.malik-founder-messages-person{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:15px 22px;border-bottom:1px solid rgba(255,255,255,.07);background:#090909}.malik-founder-messages-person>div:first-child{min-width:0;display:grid;gap:3px}.malik-founder-messages-person strong{overflow:hidden;color:#f0f0f1;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.malik-founder-messages-person span{overflow:hidden;color:#68686f;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.malik-founder-messages-person>div:last-child{display:grid;justify-items:end}.malik-founder-messages-person b{color:#fff;font-size:15px}.malik-founder-messages-person small{color:#606067;font-size:8.5px}.malik-founder-messages-feed{min-height:0;flex:1;overflow:auto;padding:18px 22px 32px;scrollbar-width:thin;scrollbar-color:#282828 transparent}.malik-founder-message-turn{max-width:980px;margin:0 auto 14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#0b0b0b;overflow:hidden}.malik-founder-message-meta{display:flex;align-items:center;gap:9px;min-height:34px;padding:0 13px;border-bottom:1px solid rgba(255,255,255,.06);color:#63636a;font-size:9px}.malik-founder-message-meta>span{margin:0;border:1px solid rgba(255,255,255,.09);border-radius:999px;padding:2px 6px;color:#85858b;font-size:7.5px;font-weight:800;letter-spacing:.08em}.malik-founder-message-meta>span.is-voice{border-color:rgba(201,170,97,.2);color:#bca15f}.malik-founder-message-meta small{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.malik-founder-message-line{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px;padding:13px}.malik-founder-message-line+.malik-founder-message-line{border-top:1px solid rgba(255,255,255,.05)}.malik-founder-message-line b{color:#77777f;font-size:9.5px}.malik-founder-message-line.is-user b{color:#cfcfd2}.malik-founder-message-line p{margin:0;color:#d8d8da;font-size:11.5px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.malik-founder-message-line.is-assistant p{color:#a9a9af}
        .malik-founder-messages-zero,.malik-founder-messages-loading{min-height:0;flex:1;display:grid;place-items:center;align-content:center;gap:9px;padding:30px;text-align:center;color:#6b6b72}.malik-founder-messages-zero svg,.malik-founder-messages-loading svg{width:24px;height:24px;color:#77777e}.malik-founder-messages-zero strong{color:#d2d2d5;font-size:12px}.malik-founder-messages-zero p{max-width:520px;margin:0;color:#696970;font-size:10.5px;line-height:1.6}.malik-founder-messages-loading{display:flex;font-size:11px}.malik-founder-messages-error{display:flex;align-items:center;gap:9px;margin:12px 22px 0;border:1px solid rgba(190,160,90,.18);border-radius:10px;background:#11100d;padding:9px 11px;color:#a99b79;font-size:9.5px}.malik-founder-messages-error svg{width:14px;height:14px}.malik-founder-messages-foot{display:flex;align-items:center;gap:8px;padding:10px 22px;border-top:1px solid rgba(255,255,255,.06);color:#5d5d64;font-size:9px}.malik-founder-messages-foot svg{width:13px;height:13px;color:#73737a}.malik-founder-messages-empty{padding:24px;color:#666;font-size:10px;text-align:center}
        @keyframes malik-founder-message-spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){.malik-founder-messages-layer{left:0!important}.malik-founder-messages-header{min-height:74px;padding:13px 14px}.malik-founder-messages-header h2{font-size:20px}.malik-founder-messages-header p{display:none}.malik-founder-messages-body{grid-template-columns:130px minmax(0,1fr)}.malik-founder-messages-users>label{margin:8px}.malik-founder-messages-users input{padding-left:30px;font-size:9px}.malik-founder-messages-userlist>button{grid-template-columns:28px minmax(0,1fr);gap:6px;padding:5px}.malik-founder-messages-avatar{width:27px;height:27px}.malik-founder-messages-usercopy strong{font-size:9px}.malik-founder-messages-usercopy small{font-size:7.5px}.malik-founder-messages-userlist>button>i{display:none}.malik-founder-messages-person{padding:10px 12px}.malik-founder-messages-feed{padding:10px}.malik-founder-message-line{grid-template-columns:1fr;gap:5px;padding:10px}.malik-founder-message-line p{font-size:10.5px}.malik-founder-message-meta small{display:none}}
      `}</style>
    </section>,
    document.body,
  ) : null

  return <>{button}{panel}</>
}

export default FounderMessageHistoryRuntime
