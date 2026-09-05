"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Radio, Send } from "lucide-react"
import styles from "./MalikShortsSections.module.css"

export function ShortsLiveRoom({ liveId }: { liveId: string }) {
  const [session, setSession] = useState<any>(null)
  const [chat, setChat] = useState<any[]>([])
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const bottom = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/shorts/live?liveId=${encodeURIComponent(liveId)}&limit=100`, { cache: "no-store" })
    const json = await response.json().catch(() => ({}))
    if (response.ok) { setSession(json.session || null); setChat(Array.isArray(json.chat) ? json.chat : []) }
    setLoading(false)
  }, [liveId])

  useEffect(() => { load(); const timer = window.setInterval(load, 3500); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }) }, [chat.length])

  const send = async () => {
    const text = body.trim(); if (!text) return
    setBody("")
    const response = await fetch("/api/shorts/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", liveId, body: text }) })
    if (!response.ok) setBody(text); else await load()
  }

  if (loading) return <div style={page}><div className={styles.loading}>Подключаю Malik Live…</div></div>
  if (!session) return <div style={page}><div style={inner}><Link href="/shorts/live" style={back}><ArrowLeft size={14} /> Malik Live</Link><div className={styles.empty}>Эфир не найден или уже недоступен.</div></div></div>

  return <div style={page}><div style={inner}><Link href="/shorts/live" style={back}><ArrowLeft size={14} /> Все эфиры</Link><div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 14px" }}><span style={{ background: session.status === "live" ? "#fff" : "#171717", color: session.status === "live" ? "#050505" : "#aaa", borderRadius: 8, padding: "6px 9px", fontSize: 10, fontWeight: 900 }}><Radio size={11} style={{ marginRight: 5, verticalAlign: "middle" }} />{session.status === "live" ? "LIVE" : session.status.toUpperCase()}</span><div><h1 style={{ margin: 0, fontSize: 23 }}>{session.title || "Malik Live"}</h1><div style={{ color: "#777", fontSize: 11 }}>@{session.malik_shorts_profiles?.username || "creator"} · {Number(session.viewer_count || 0)} зрителей</div></div></div><div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,360px)", gap: 12 }}><section style={{ minHeight: 520, borderRadius: 18, overflow: "hidden", background: "#090909", border: "1px solid rgba(255,255,255,.08)", display: "grid", placeItems: "center" }}>{session.playback_url ? <video src={session.playback_url} controls autoPlay playsInline style={{ width: "100%", height: "100%", maxHeight: "72vh", objectFit: "contain", background: "#000" }} /> : <div style={{ textAlign: "center", color: "#666", padding: 30 }}><Radio size={42} /><div style={{ marginTop: 10 }}>Live session создана. Playback появится после подключения RTMP/WebRTC ingest worker.</div></div>}</section><aside style={{ height: 520, borderRadius: 18, background: "#090909", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ padding: 13, borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 12, fontWeight: 800 }}>Live chat</div><div style={{ flex: 1, overflowY: "auto", padding: 12 }}>{chat.map((message) => <div key={message.id} style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.45 }}><strong>{message.malik_shorts_profiles?.display_name || message.malik_shorts_profiles?.username || "Malik user"}</strong> <span style={{ color: "#aaa" }}>{message.body}</span></div>)}<div ref={bottom} /></div><div style={{ display: "flex", gap: 7, padding: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}><input className={styles.search} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send() } }} placeholder="Напиши в эфир…" /><button className={styles.btn} onClick={send}><Send size={14} /></button></div></aside></div></div></div>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#050505", color: "#fff", padding: "22px max(12px,3vw)", fontFamily: "Inter,system-ui,sans-serif" }
const inner: React.CSSProperties = { maxWidth: 1250, margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", gap: 7, alignItems: "center", color: "#888", textDecoration: "none", fontSize: 12 }
