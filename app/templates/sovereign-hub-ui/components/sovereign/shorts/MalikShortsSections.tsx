"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bell,
  Bookmark,
  Compass,
  Heart,
  Home,
  Library,
  MessageCircle,
  Play,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Sparkles,
  User,
  Users,
  Video,
} from "lucide-react"
import { prefillPrompt } from "@/lib/malik-context"
import styles from "./MalikShortsSections.module.css"

export type MalikShortsSection = "explore" | "following" | "library" | "inbox" | "profile" | "analytics" | "live" | "remix"

type LibraryKind = "saved" | "liked" | "reposted" | "mine"

const sectionMeta: Record<MalikShortsSection, { title: string; subtitle: string }> = {
  explore: { title: "Обзор", subtitle: "Видео, авторы и темы из Malik Shorts и доступного YouTube-каталога." },
  following: { title: "Подписки", subtitle: "Лента авторов, на которых ты подписан внутри Malik Shorts." },
  library: { title: "Библиотека", subtitle: "Сохранённые, понравившиеся, репосты и твои публикации." },
  inbox: { title: "Входящие", subtitle: "Реальные реакции, ответы, подписки и разговоры Malik Shorts." },
  profile: { title: "Профиль", subtitle: "Профиль автора, статистика и все его публикации в одном месте." },
  analytics: { title: "Creator Analytics", subtitle: "Просмотры, досмотры, возвраты, вовлечение и подсказки Malik." },
  live: { title: "Malik Live", subtitle: "Прямые эфиры, расписание и live-chat поверх Malik social graph." },
  remix: { title: "AI Remix", subtitle: "Выбери Short и отправь его контекст в Malik AI для нового ролика." },
}

const nav = [
  ["/shorts", "Для вас", Home],
  ["/shorts/following", "Подписки", Users],
  ["/shorts/explore", "Обзор", Compass],
  ["/shorts/remix", "AI Remix", Sparkles],
  ["/shorts/live", "Malik Live", Radio],
  ["/shorts/library", "Библиотека", Library],
  ["/shorts/inbox", "Входящие", Bell],
  ["/shorts/analytics", "Аналитика", BarChart3],
  ["/shorts/profile", "Профиль", User],
] as const

function compact(value: unknown) {
  const n = Math.max(0, Number(value || 0))
  if (n < 1000) return String(Math.floor(n))
  if (n < 1e6) return `${(n / 1e3).toFixed(n >= 100_000 ? 0 : 1).replace(".0", "")}K`
  if (n < 1e9) return `${(n / 1e6).toFixed(n >= 100_000_000 ? 0 : 1).replace(".0", "")}M`
  return `${(n / 1e9).toFixed(1).replace(".0", "")}B`
}

function initials(value: string) {
  return String(value || "M").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "M"
}

function sourceLabel(source?: string) {
  return source === "youtube" ? "Опубликовано в YouTube" : source === "tiktok" ? "Опубликовано в TikTok" : "Опубликовано в Malik AI"
}

function posterFor(item: any) {
  if (item?.posterUrl) return item.posterUrl
  if (item?.source === "youtube" && item?.sourceId) return `https://i.ytimg.com/vi/${encodeURIComponent(item.sourceId)}/hqdefault.jpg`
  return ""
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(String(json?.error || `HTTP_${response.status}`)) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return json
}

function Avatar({ src, name, large = false }: { src?: string | null; name: string; large?: boolean }) {
  return <div className={large ? styles.profileAvatar : styles.avatar}>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name)}</div>
}

function VideoGrid({ items, onSelect }: { items: any[]; onSelect?: (item: any) => void }) {
  if (!items.length) return <div className={styles.empty}>Здесь пока нет роликов.</div>
  return <div className={styles.grid}>{items.map((item) => {
    const poster = posterFor(item)
    const creator = item.creator || {}
    const metrics = item.metrics || {}
    return <article key={String(item.id || `${item.source}:${item.sourceId}`)} className={styles.card} onClick={() => onSelect?.(item)} style={onSelect ? { cursor: "pointer" } : undefined}>
      <div className={styles.posterWrap}>
        {poster ? <img className={styles.poster} src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className={styles.posterFallback}><Play size={26} /></div>}
        <div className={styles.source}>{sourceLabel(item.source)}</div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.caption}>{item.caption || "Без описания"}</div>
        {creator.displayName || creator.username ? <div className={styles.creatorRow}><Avatar src={creator.avatarUrl} name={creator.displayName || creator.username || "M"} /><span>@{creator.username || creator.displayName}</span></div> : null}
        <div className={styles.meta}><span>{compact(metrics.views)} просмотров</span><span>♥ {compact(metrics.likes)}</span></div>
      </div>
    </article>
  })}</div>
}

function SideConnections({ connections }: { connections: any }) {
  return <>
    <section className={styles.sideCard}>
      <div className={styles.sideTitle}>Malik Shorts Social Graph</div>
      <div className={styles.sideText}>Лайки, комментарии, репосты, сохранения и подписки живут в Malik и видны другим пользователям.</div>
    </section>
    <section className={styles.sideCard}>
      <div className={styles.sideTitle}>YouTube</div>
      <div className={styles.sideText}>{connections.youtube?.connected ? `Подключён: ${connections.youtube.account?.displayName || "канал"}` : "Подключи канал, чтобы синхронизировать профиль, видео и доступные действия от своего аккаунта."}</div>
      <div className={styles.actions}><a className={styles.btn} href={connections.youtube?.connected ? "/api/youtube/sync" : "/api/youtube/connect"}>{connections.youtube?.connected ? "Синхронизировать" : "Подключить YouTube"}</a></div>
    </section>
    <section className={styles.sideCard}>
      <div className={styles.sideTitle}>TikTok</div>
      <div className={styles.sideText}>{connections.tiktok?.connected ? `Подключён: ${connections.tiktok.account?.displayName || "TikTok"}` : "TikTok остаётся внешним источником, а социальный граф — Malik-native."}</div>
      <div className={styles.actions}><a className={styles.btnGhost} href={connections.tiktok?.connected ? "/api/tiktok/sync" : "/api/tiktok/connect"}>{connections.tiktok?.connected ? "Синхронизировать" : "Подключить TikTok"}</a></div>
    </section>
  </>
}

export function MalikShortsSectionPage({ section }: { section: MalikShortsSection }) {
  const searchParams = useSearchParams()
  const username = searchParams.get("username") || ""
  const meta = sectionMeta[section]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<any>(null)
  const [libraryKind, setLibraryKind] = useState<LibraryKind>("saved")
  const [query, setQuery] = useState(section === "explore" ? "Казахстан" : "")
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [liveTitle, setLiveTitle] = useState("")
  const [connections, setConnections] = useState<any>({ youtube: { connected: false }, tiktok: { connected: false } })

  useEffect(() => {
    Promise.all([
      fetch("/api/youtube/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ connected: false })),
      fetch("/api/tiktok/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ connected: false })),
    ]).then(([youtube, tiktok]) => setConnections({ youtube, tiktok }))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (section === "library") setData(await jsonFetch(`/api/shorts/library?kind=${libraryKind}`))
      else if (section === "inbox") {
        const [notifications, conversations] = await Promise.all([jsonFetch("/api/shorts/notifications?limit=100"), jsonFetch("/api/shorts/messages?limit=100").catch(() => ({ items: [] }))])
        setData({ notifications, conversations })
      } else if (section === "profile") setData(await jsonFetch(`/api/shorts/profile${username ? `?username=${encodeURIComponent(username)}` : ""}`))
      else if (section === "live") setData(await jsonFetch("/api/shorts/live?limit=60"))
      else if (section === "following") {
        const feed = await jsonFetch("/api/shorts/feed?limit=30&lang=ru&region=KZ")
        setData({ items: (feed.items || []).filter((item: any) => item?.viewer?.following) })
      } else if (section === "analytics") {
        const mine = await jsonFetch("/api/shorts/library?kind=mine")
        setData(mine)
        if (!selectedPost && mine.items?.[0]) setSelectedPost(mine.items[0])
      } else if (section === "remix") {
        const [mine, saved] = await Promise.all([jsonFetch("/api/shorts/library?kind=mine"), jsonFetch("/api/shorts/library?kind=saved")])
        const items = [...(mine.items || []), ...(saved.items || [])]
        const unique = Array.from(new Map(items.map((item: any) => [item.id, item])).values())
        setData({ items: unique })
        if (!selectedPost && unique[0]) setSelectedPost(unique[0])
      } else if (section === "explore") {
        setData(await jsonFetch(`/api/shorts/search?q=${encodeURIComponent(query || "Казахстан")}&limit=16&lang=ru&region=KZ`))
      }
    } catch (cause) {
      const status = Number((cause as any)?.status || 0)
      setError(status === 401 ? "Войди в Malik AI, чтобы открыть этот раздел." : `Не удалось загрузить раздел: ${String((cause as Error)?.message || cause)}`)
    } finally {
      setLoading(false)
    }
  }, [libraryKind, query, section, selectedPost, username])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (section !== "analytics" || !selectedPost?.id) { setAnalytics(null); return }
    jsonFetch(`/api/shorts/analytics?shortId=${encodeURIComponent(selectedPost.id)}`).then(setAnalytics).catch(() => setAnalytics(null))
  }, [section, selectedPost?.id])

  const markAllRead = async () => {
    await jsonFetch("/api/shorts/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) })
    await load()
  }

  const searchNow = async () => {
    setLoading(true); setError("")
    try { setData(await jsonFetch(`/api/shorts/search?q=${encodeURIComponent(query)}&limit=16&lang=ru&region=KZ`)) } catch (cause) { setError(String((cause as Error)?.message || cause)) } finally { setLoading(false) }
  }

  const createLive = async () => {
    if (!liveTitle.trim()) return
    await jsonFetch("/api/shorts/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title: liveTitle.trim() }) })
    setLiveTitle("")
    await load()
  }

  const startRemix = () => {
    if (!selectedPost) return
    const source = sourceLabel(selectedPost.source)
    prefillPrompt(`Сделай AI Remix этого Malik Short.\nИсточник: ${source}.\nАвтор: ${selectedPost.creator?.displayName || selectedPost.creator?.username || "неизвестно"}.\nОписание: ${selectedPost.caption || "без описания"}.\nСохрани смысл, но создай новый оригинальный вертикальный ролик 9:16, сильный хук в первые 2 секунды, субтитры RU/KZ/EN и готовое описание для Malik Shorts.`)
    window.location.assign("/dashboard")
  }

  const content = useMemo(() => {
    if (loading) return <div className={styles.loading}>Загружаю реальные данные…</div>
    if (error) return <div className={styles.empty}>{error}</div>

    if (section === "explore") return <>
      <div className={styles.toolbar}><input className={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchNow() }} placeholder="Видео, авторы, темы" /><button className={styles.btn} onClick={searchNow}><Search size={14} /> Найти</button></div>
      {(data?.topics || []).length ? <div className={styles.topicRow}>{data.topics.map((topic: any) => <span className={styles.topic} key={topic.id}>#{topic.name || topic.slug} · {compact(topic.postCount)}</span>)}</div> : null}
      {(data?.creators || []).length ? <div className={styles.creatorList}>{data.creators.map((creator: any) => <Link className={styles.creatorCard} href={`/shorts/profile?username=${encodeURIComponent(creator.username)}`} key={creator.userKey}><Avatar src={creator.avatarUrl} name={creator.displayName} /><div className={styles.creatorCopy}><div className={styles.creatorName}>{creator.displayName} {creator.verified ? "✓" : ""}</div><div className={styles.creatorBio}>@{creator.username} · {compact(creator.followerCount)} подписчиков</div></div></Link>)}</div> : null}
      <VideoGrid items={data?.videos || []} />
    </>

    if (section === "following") return <VideoGrid items={data?.items || []} />

    if (section === "library") return <>
      <div className={styles.toolbar}><div className={styles.tabs}>{(["saved", "liked", "reposted", "mine"] as LibraryKind[]).map((kind) => <button key={kind} className={`${styles.tab} ${libraryKind === kind ? styles.tabActive : ""}`} onClick={() => setLibraryKind(kind)}>{kind === "saved" ? "Сохранённые" : kind === "liked" ? "Понравившиеся" : kind === "reposted" ? "Репосты" : "Мои"}</button>)}</div><button className={styles.btnGhost} onClick={load}><RefreshCw size={13} /> Обновить</button></div>
      <VideoGrid items={data?.items || []} />
    </>

    if (section === "inbox") {
      const notifications = data?.notifications?.items || []
      const conversations = data?.conversations?.items || []
      return <>
        <div className={styles.toolbar}><div className={styles.tabs}><span className={styles.tabActive + " " + styles.tab}>Уведомления {data?.notifications?.unread ? `· ${data.notifications.unread}` : ""}</span><span className={styles.tab}>Чаты · {conversations.length}</span></div>{data?.notifications?.unread ? <button className={styles.btnGhost} onClick={markAllRead}>Прочитать всё</button> : null}</div>
        <div className={styles.noticeList}>{notifications.length ? notifications.map((item: any) => <div className={`${styles.notice} ${!item.read ? styles.noticeUnread : ""}`} key={item.id}><Avatar src={item.actor?.avatarUrl} name={item.actor?.displayName || "Malik"} /><div><div className={styles.noticeTitle}><strong>{item.actor?.displayName || "Malik Shorts"}</strong> · {String(item.type || "activity").replaceAll("_", " ")}</div><div className={styles.noticeTime}>{item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : ""}</div></div>{!item.read ? <span className={styles.badge}>•</span> : null}</div>) : <div className={styles.empty}>Новых уведомлений пока нет.</div>}</div>
      </>
    }

    if (section === "profile") {
      const profile = data?.profile
      if (!profile) return <div className={styles.empty}>Профиль не найден.</div>
      return <>
        <div className={styles.profileHero}><div className={styles.cover} /><div className={styles.profileInner}><Avatar src={profile.avatarUrl} name={profile.displayName} large /><div className={styles.profileInfo}><div className={styles.profileName}>{profile.displayName} {profile.verified ? "✓" : ""}</div><div className={styles.handle}>@{profile.username}</div><div className={styles.bio}>{profile.bio || "Автор Malik Shorts"}</div><div className={styles.stats}><div className={styles.stat}><strong>{compact(profile.followerCount)}</strong><span>подписчиков</span></div><div className={styles.stat}><strong>{compact(profile.followingCount)}</strong><span>подписок</span></div><div className={styles.stat}><strong>{compact(profile.totalLikes)}</strong><span>лайков</span></div><div className={styles.stat}><strong>{compact(profile.postCount)}</strong><span>Shorts</span></div></div></div><div className={styles.profileActions}>{data?.viewer?.isSelf ? <Link href="/shorts/analytics" className={styles.btn}>Аналитика</Link> : null}</div></div></div>
        {data?.private ? <div className={styles.empty}>Это закрытый профиль.</div> : <VideoGrid items={data?.posts || []} />}
      </>
    }

    if (section === "analytics") {
      const overview = analytics?.overview || {}
      const hours = analytics?.activity?.hours || []
      return <>
        <div className={styles.toolbar}><div className={styles.muted}>Выбери свой Short ниже — метрики обновятся автоматически.</div></div>
        {selectedPost ? <><div className={styles.analyticsGrid}><div className={styles.metric}><div className={styles.metricLabel}>Просмотры</div><div className={styles.metricValue}>{compact(overview.views)}</div><div className={styles.metricHint}>{compact(overview.uniqueViewers)} уникальных</div></div><div className={styles.metric}><div className={styles.metricLabel}>Досмотр</div><div className={styles.metricValue}>{Math.round(Number(overview.completionRate || 0) * 100)}%</div><div className={styles.metricHint}>completion rate</div></div><div className={styles.metric}><div className={styles.metricLabel}>Средний просмотр</div><div className={styles.metricValue}>{Math.round(Number(overview.averageWatchMs || 0) / 1000)}с</div><div className={styles.metricHint}>на просмотр</div></div><div className={styles.metric}><div className={styles.metricLabel}>Engagement</div><div className={styles.metricValue}>{Number(overview.engagementScore || 0).toFixed(2)}</div><div className={styles.metricHint}>Malik score</div></div></div>{hours.length ? <div className={styles.chart}>{hours.map((hour: any) => { const max = Math.max(1, ...hours.map((x: any) => Number(x.views || 0))); return <div key={hour.hour} className={styles.bar} title={`${hour.hour}:00 · ${hour.views}`} style={{ height: `${Math.max(3, Number(hour.views || 0) / max * 100)}%` }} /> })}</div> : null}<div className={styles.insight}><strong>Malik Insight:</strong> {analytics?.malikInsight || "Собираю сигналы удержания и вовлечения."}</div></> : null}
        <div style={{ marginTop: 18 }}><VideoGrid items={data?.items || []} onSelect={setSelectedPost} /></div>
      </>
    }

    if (section === "live") return <>
      <div className={styles.composer}><div className={styles.sideTitle}>Запланировать эфир</div><div className={styles.toolbar} style={{ marginTop: 10, marginBottom: 0 }}><input className={styles.search} value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} placeholder="Название эфира" /><button className={styles.btn} onClick={createLive}>Создать Live</button></div></div>
      <div className={styles.liveGrid}>{(data?.items || []).length ? data.items.map((item: any) => <div className={styles.liveCard} key={item.id}><div className={styles.livePreview}><Radio size={30} /><span className={styles.liveTag}>{item.status === "live" ? "LIVE" : "СКОРО"}</span></div><div className={styles.liveBody}><div className={styles.liveTitle}>{item.title || "Malik Live"}</div><div className={styles.liveMeta}>{compact(item.viewer_count)} зрителей · @{item.malik_shorts_profiles?.username || "creator"}</div></div></div>) : <div className={styles.empty}>Активных эфиров пока нет. Создай первый.</div>}</div>
    </>

    if (section === "remix") return <><div className={styles.remixBox}><div className={styles.remixPreview}>{selectedPost && posterFor(selectedPost) ? <img className={styles.poster} src={posterFor(selectedPost)} alt="" /> : <div className={styles.posterFallback}><Video size={28} /></div>}</div><div className={styles.remixForm}><div className={styles.sideTitle}>AI Remix Engine</div><div className={styles.sideText}>Malik получит автора, описание и источник выбранного Short и создаст новый оригинальный ролик, а не копию.</div>{selectedPost ? <><div className={styles.insight} style={{ marginTop: 14 }}>{selectedPost.caption || "Без описания"}<div className={styles.muted} style={{ marginTop: 7 }}>{sourceLabel(selectedPost.source)}</div></div><div className={styles.actions}><button className={styles.btn} onClick={startRemix}><Sparkles size={14} /> Сделать Remix в Malik AI</button></div></> : null}</div></div><div style={{ marginTop: 18 }}><VideoGrid items={data?.items || []} onSelect={setSelectedPost} /></div></>

    return null
  }, [analytics, data, error, libraryKind, liveTitle, loading, query, section, selectedPost])

  return <div className={styles.root}>
    <aside className={styles.left}>
      <Link href="/shorts" className={styles.brand}><span className={styles.mark}><i /></span><span className={styles.brandText}><strong>MALIK</strong><span>SHORTS</span></span></Link>
      <nav className={styles.nav}>{nav.map(([href, label, Icon]) => <Link key={href} className={`${styles.navLink} ${href.endsWith(`/${section}`) ? styles.navActive : ""}`} href={href}><Icon />{label}</Link>)}</nav>
      <div className={styles.leftFoot}>Malik ID — главный аккаунт. YouTube и TikTok подключаются как creator bridges, не заменяя Malik social graph.</div>
    </aside>
    <main className={styles.main}>
      <div className={styles.mobileTop}><Link href="/shorts" className={styles.brand}><span className={styles.mark}><i /></span><span className={styles.brandText}><strong>MALIK</strong><span>SHORTS</span></span></Link></div>
      <header className={styles.header}><div className={styles.eyebrow}>Malik Shorts Platform</div><h1 className={styles.title}>{meta.title}</h1><div className={styles.subtitle}>{meta.subtitle}</div></header>
      <section className={styles.panel}>{content}</section>
    </main>
    <aside className={styles.right}><SideConnections connections={connections} /></aside>
    <details className={styles.fabNav}><summary>≡</summary><div className={styles.fabMenu}>{nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div></details>
  </div>
}
