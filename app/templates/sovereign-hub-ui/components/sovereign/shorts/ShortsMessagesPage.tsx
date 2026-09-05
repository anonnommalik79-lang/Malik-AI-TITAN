"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, MessageCircle, Send } from "lucide-react"
import styles from "./MalikShortsSections.module.css"

export function ShortsMessagesPage({ conversationId }: { conversationId?: string }) {
  const [items, setItems] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    const [messageRes, meRes] = await Promise.all([
      fetch(`/api/shorts/messages${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}&limit=100` : "?limit=100"}`, { cache: "no-store" }),
      fetch("/api/shorts/me", { cache: "no-store" }),
    ])
    const [messageJson, meJson] = await Promise.all([messageRes.json().catch(() => ({ items: [] })), meRes.json().catch(() => null)])
    setItems(Array.isArray(messageJson?.items) ? messageJson.items : [])
    setMe(meJson?.profile || null)
    setLoading(false)
    if (conversationId && messageRes.ok) fetch("/api/shorts/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", conversationId }) }).catch(() => {})
  }, [conversationId])

  useEffect(() => { load(); const timer = conversationId ? window.setInterval(load, 5000) : 0; return () => { if (timer) window.clearInterval(timer) } }, [conversationId, load])
  useEffect(() => { if (conversationId) bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [conversationId, items.length])

  const send = async () => {
    const text = body.trim()
    if (!text || !conversationId) return
    setBody("")
    const response = await fetch("/api/shorts/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", conversationId, body: text }) })
    if (!response.ok) setBody(text)
    else await load()
  }

  if (!conversationId) return <div style={page}><div style={inner}><Link href="/shorts/inbox" style={back}><ArrowLeft size={14} /> Входящие</Link><h1 style={heading}><MessageCircle size={25} /> Сообщения</h1><p style={sub}>Direct и group conversations внутри Malik Shorts.</p>{loading ? <div className={styles.loading}>Загружаю чаты…</div> : items.length ? <div className={styles.noticeList}>{items.map((conversation) => <Link href={`/shorts/messages/chat?id=${encodeURIComponent(conversation.id)}`} key={conversation.id} className={styles.notice} style={{ textDecoration: "none", color: "inherit" }}><div className={styles.avatar}>M</div><div><div className={styles.noticeTitle}><strong>{conversation.title || (conversation.kind === "group" ? "Групповой чат" : "Личный чат")}</strong></div><div className={styles.noticeTime}>{conversation.updated_at ? new Date(conversation.updated_at).toLocaleString("ru-RU") : ""}</div></div><span className={styles.badge}>›</span></Link>)}</div> : <div className={styles.empty}>Чатов пока нет. Отправка Short пользователю создаст или использует conversation.</div>}</div></div>

  return <div style={page}><div style={{ ...inner, maxWidth: 850 }}><Link href="/shorts/messages" style={back}><ArrowLeft size={14} /> Все сообщения</Link><h1 style={{ ...heading, fontSize: 24 }}>Malik Shorts Chat</h1><div style={{ height: "calc(100vh - 230px)", minHeight: 420, overflowY: "auto", border: "1px solid rgba(255,255,255,.08)", background: "#080808", borderRadius: 18, padding: 16 }}>{loading ? <div className={styles.loading}>Загружаю сообщения…</div> : items.length ? items.map((message) => { const own = message.sender_key === me?.userKey; const author = message.malik_shorts_profiles || {}; return <div key={message.id} style={{ display: "flex", justifyContent: own ? "flex-end" : "flex-start", margin: "8px 0" }}><div style={{ maxWidth: "72%", background: own ? "#fff" : "#171717", color: own ? "#050505" : "#eee", borderRadius: own ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 12px", fontSize: 13, lineHeight: 1.45 }}><div style={{ fontSize: 10, opacity: .55, marginBottom: 4 }}>{own ? "Ты" : author.display_name || author.username || "Malik user"}</div>{message.body || (message.shared_post_id ? "Отправил(а) Malik Short" : "")}{message.shared_post_id ? <Link href={`/shorts/malik/${message.shared_post_id}`} style={{ display: "block", marginTop: 8, color: "inherit", fontSize: 11, fontWeight: 800 }}>Открыть Short →</Link> : null}<div style={{ fontSize: 9, opacity: .45, marginTop: 5 }}>{message.created_at ? new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}</div></div></div> }) : <div className={styles.empty}>Начни разговор.</div>}<div ref={bottomRef} /></div><div style={{ display: "flex", gap: 8, marginTop: 10 }}><input className={styles.search} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Сообщение…" /><button className={styles.btn} onClick={send}><Send size={14} /></button></div></div></div>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#050505", color: "#fff", padding: "26px max(14px,4vw)", fontFamily: "Inter,system-ui,sans-serif" }
const inner: React.CSSProperties = { maxWidth: 1000, margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", gap: 7, alignItems: "center", color: "#888", textDecoration: "none", fontSize: 12 }
const heading: React.CSSProperties = { fontSize: 31, letterSpacing: "-.04em", margin: "18px 0 5px", display: "flex", gap: 10, alignItems: "center" }
const sub: React.CSSProperties = { color: "#777", fontSize: 13, marginBottom: 22 }
