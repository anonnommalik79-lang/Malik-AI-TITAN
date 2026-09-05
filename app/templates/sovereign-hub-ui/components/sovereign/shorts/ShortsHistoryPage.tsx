"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft, History, Play } from "lucide-react"
import styles from "./MalikShortsSections.module.css"

const compact = (value: unknown) => { const n = Math.max(0, Number(value || 0)); if (n < 1000) return String(Math.floor(n)); if (n < 1e6) return `${(n / 1000).toFixed(1).replace(".0", "")}K`; return `${(n / 1e6).toFixed(1).replace(".0", "")}M` }

export function ShortsHistoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch("/api/shorts/library?kind=history", { cache: "no-store" }).then((r) => r.json()).then((json) => setItems(Array.isArray(json?.items) ? json.items : [])).finally(() => setLoading(false)) }, [])
  return <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "26px max(14px,4vw) 70px", fontFamily: "Inter,system-ui,sans-serif" }}><div style={{ maxWidth: 1180, margin: "0 auto" }}><Link href="/shorts/library" style={{ display: "inline-flex", gap: 7, alignItems: "center", color: "#888", textDecoration: "none", fontSize: 12 }}><ArrowLeft size={14} /> Библиотека</Link><h1 style={{ fontSize: 31, letterSpacing: "-.04em", margin: "18px 0 5px", display: "flex", gap: 10, alignItems: "center" }}><History size={25} /> История просмотров</h1><p style={{ color: "#777", margin: "0 0 22px", fontSize: 13 }}>Последние просмотренные Malik Shorts — на основе реальных событий view / complete / rewatch.</p>{loading ? <div className={styles.loading}>Загружаю историю…</div> : items.length ? <div className={styles.grid}>{items.map((item) => { const poster = item.posterUrl || (item.source === "youtube" && item.sourceId ? `https://i.ytimg.com/vi/${encodeURIComponent(item.sourceId)}/hqdefault.jpg` : ""); return <Link href={`/shorts/${item.source}/${encodeURIComponent(item.source === "malik" ? item.id : (item.sourceId || item.id))}`} key={item.id} className={styles.card} style={{ textDecoration: "none", color: "inherit" }}><div className={styles.posterWrap}>{poster ? <img className={styles.poster} src={poster} alt="" /> : <div className={styles.posterFallback}><Play size={25} /></div>}</div><div className={styles.cardBody}><div className={styles.caption}>{item.caption || "Без описания"}</div><div className={styles.meta}><span>{compact(item.metrics?.views)} просмотров</span><span>♥ {compact(item.metrics?.likes)}</span></div></div></Link> })}</div> : <div className={styles.empty}>Ты ещё ничего не смотрел.</div>}</div></div>
}
