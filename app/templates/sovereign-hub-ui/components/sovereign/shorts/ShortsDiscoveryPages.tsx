"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft, Music2, Play, TrendingUp } from "lucide-react"
import styles from "./MalikShortsSections.module.css"

const compact = (value: unknown) => { const n = Math.max(0, Number(value || 0)); if (n < 1000) return String(Math.floor(n)); if (n < 1e6) return `${(n / 1e3).toFixed(1).replace(".0", "")}K`; if (n < 1e9) return `${(n / 1e6).toFixed(1).replace(".0", "")}M`; return `${(n / 1e9).toFixed(1).replace(".0", "")}B` }
const poster = (item: any) => item.posterUrl || (item.source === "youtube" && item.sourceId ? `https://i.ytimg.com/vi/${encodeURIComponent(item.sourceId)}/hqdefault.jpg` : "")

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "26px max(14px,4vw) 70px", fontFamily: "Inter,system-ui,sans-serif" }}><div style={{ maxWidth: 1180, margin: "0 auto" }}><Link href="/shorts/explore" style={{ display: "inline-flex", gap: 7, alignItems: "center", color: "#888", textDecoration: "none", fontSize: 12 }}><ArrowLeft size={14} /> Malik Shorts</Link><h1 style={{ fontSize: 32, letterSpacing: "-.04em", margin: "18px 0 6px" }}>{title}</h1><p style={{ color: "#777", margin: "0 0 24px", fontSize: 13 }}>{subtitle}</p>{children}</div></div>
}

function Cards({ items }: { items: any[] }) {
  if (!items.length) return <div className={styles.empty}>Публикаций пока нет.</div>
  return <div className={styles.grid}>{items.map((item) => <Link href={`/shorts/${item.source || "malik"}/${encodeURIComponent(item.source === "malik" ? item.id : (item.sourceId || item.id))}`} key={item.id} className={styles.card} style={{ textDecoration: "none", color: "inherit" }}><div className={styles.posterWrap}>{poster(item) ? <img className={styles.poster} src={poster(item)} alt="" loading="lazy" /> : <div className={styles.posterFallback}><Play size={26} /></div>}<span className={styles.source}>{item.source === "youtube" ? "YouTube" : item.source === "tiktok" ? "TikTok" : "Malik AI"}</span></div><div className={styles.cardBody}><div className={styles.caption}>{item.caption || "Без описания"}</div><div className={styles.meta}><span>{compact(item.metrics?.views)} просмотров</span><span>♥ {compact(item.metrics?.likes)}</span></div></div></Link>)}</div>
}

export function TrendingPage() {
  const [data, setData] = useState<any>({ posts: [], topics: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch("/api/shorts/trending?region=KZ&lang=ru&limit=28", { cache: "no-store" }).then((r) => r.json()).then(setData).finally(() => setLoading(false)) }, [])
  return <Shell title="В тренде" subtitle="Сигналы последних 24 часов: досмотры, повторы, комментарии, сохранения, репосты, шеры и подписки. Казахстан · RU.">{loading ? <div className={styles.loading}>Считаю тренды…</div> : <><div className={styles.topicRow}>{(data.topics || []).map((topic: any) => <Link key={topic.id} href={`/shorts/explore?q=${encodeURIComponent(topic.name || topic.slug)}`} className={styles.topic} style={{ textDecoration: "none" }}><TrendingUp size={11} style={{ marginRight: 5 }} />{topic.name || topic.slug} · {compact(topic.trendScore)}</Link>)}</div><Cards items={data.posts || []} /></>}</Shell>
}

export function HashtagPage({ tag }: { tag: string }) {
  const [data, setData] = useState<any>({ items: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`/api/shorts/hashtags/${encodeURIComponent(tag)}?limit=60`, { cache: "no-store" }).then((r) => r.json()).then(setData).finally(() => setLoading(false)) }, [tag])
  return <Shell title={`#${tag}`} subtitle={`${compact(data.count)} доступных публикаций с этим хэштегом.`}>{loading ? <div className={styles.loading}>Загружаю #тему…</div> : <Cards items={data.items || []} />}</Shell>
}

export function SoundPage({ soundId }: { soundId: string }) {
  const [data, setData] = useState<any>({ sound: null, posts: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`/api/shorts/sounds?soundId=${encodeURIComponent(soundId)}&limit=60`, { cache: "no-store" }).then((r) => r.json()).then(setData).finally(() => setLoading(false)) }, [soundId])
  const sound = data.sound
  const items = (data.posts || []).map((link: any) => ({ ...(link.malik_shorts_posts || {}), id: link.malik_shorts_posts?.id || link.post_id }))
  return <Shell title={sound?.title || "Звук"} subtitle={`${sound?.artist || "Original sound"} · используется ${compact(sound?.usage_count)} раз`}>{sound ? <div className={styles.insight} style={{ marginBottom: 18 }}><Music2 size={18} style={{ marginRight: 8, verticalAlign: "middle" }} /><strong>{sound.title || "Original sound"}</strong> · {sound.source || "malik"} · права: {sound.rights_status || "unknown"}</div> : null}{loading ? <div className={styles.loading}>Загружаю звук…</div> : <Cards items={items} />}</Shell>
}
