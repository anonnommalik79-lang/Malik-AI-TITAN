"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, Bookmark, Camera, Check, Compass, Heart, Home, Library, MessageCircle, Plus, RefreshCw, Repeat2, Search, Send, Share2, Sparkles, Upload, User, Users, WandSparkles, X } from "lucide-react"
import { prefillPrompt } from "@/lib/malik-context"
import type { MalikShortFeedResponse, MalikShortInteractionAction, MalikShortItem } from "@/lib/shorts/types"
import styles from "./MalikShortsApp.module.css"

type Profile = { userKey: string; username: string; displayName: string; avatarUrl?: string | null; bio?: string; verified?: boolean; followerCount?: number; followingCount?: number; totalLikes?: number; postCount?: number }
type Bridge = { connected: boolean; account?: { channelId?: string; displayName?: string; username?: string; avatarUrl?: string | null; metadata?: Record<string, any> } }
type CommentRow = { id: string; body: string; likes: number; createdAt: string; origin: "malik" | "youtube"; parentId?: string; threadId?: string; totalReplyCount?: number; viewerLiked?: boolean; user: { id: string; username: string; displayName: string; avatarUrl?: string }; replies?: CommentRow[] }
type CreatorPanel = { short: MalikShortItem; loading: boolean; profile?: any; posts?: any[]; error?: string } | null

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)
const sourceLabel = (source: MalikShortItem["source"]) => source === "youtube" ? "Опубликовано в YouTube" : source === "tiktok" ? "Опубликовано в TikTok" : "Опубликовано в Malik AI"
const compact = (value?: number) => { const n = Number(value || 0); if (n < 1000) return String(Math.max(0, Math.floor(n))); if (n < 1e6) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(".0", "")}K`; if (n < 1e9) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(".0", "")}M`; return `${(n / 1e9).toFixed(1).replace(".0", "")}B` }
const initials = (value: string) => String(value || "M").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "M"

function Avatar({ src, name, className }: { src?: string | null; name: string; className: string }) {
  return <div className={className}>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <span>{initials(name)}</span>}</div>
}

function Player({ item, active, muted, onEvent }: { item: MalikShortItem; active: boolean; muted: boolean; onEvent: (type: string, positionMs?: number, durationMs?: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const milestones = useRef(new Set<string>())
  useEffect(() => {
    if (!active) milestones.current.clear()
    if (item.playback.kind !== "native") return
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    if (active) video.play().catch(() => {})
    else video.pause()
  }, [active, item.playback.kind, muted])

  const poster = item.posterUrl || (item.playback.kind === "youtube" ? `https://i.ytimg.com/vi/${encodeURIComponent(item.playback.videoId)}/hqdefault.jpg` : undefined)
  if (!active && poster) return <img className={styles.poster} src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
  if (item.playback.kind === "youtube") {
    const params = new URLSearchParams({ autoplay: active ? "1" : "0", mute: "1", playsinline: "1", controls: "1", rel: "0", loop: "1", playlist: item.playback.videoId, origin: typeof window !== "undefined" ? window.location.origin : "https://malikaiworld.world" })
    return <iframe className={styles.videoFrame} src={`https://www.youtube.com/embed/${encodeURIComponent(item.playback.videoId)}?${params}`} title={item.caption || "YouTube Short"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  }
  if (item.playback.kind === "tiktok") {
    const params = new URLSearchParams({ autoplay: active ? "1" : "0", loop: "1" })
    return <iframe className={styles.videoFrame} src={`https://www.tiktok.com/player/v1/${encodeURIComponent(item.playback.videoId)}?${params}`} title={item.caption || "TikTok"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  }
  return <video ref={videoRef} className={styles.nativeVideo} src={item.playback.url} poster={item.playback.poster || item.posterUrl} muted={muted} playsInline loop preload={active ? "auto" : "metadata"}
    onPlay={(e) => onEvent("start", e.currentTarget.currentTime * 1000, (e.currentTarget.duration || 0) * 1000)}
    onPause={(e) => { if (!e.currentTarget.ended) onEvent("pause", e.currentTarget.currentTime * 1000, (e.currentTarget.duration || 0) * 1000) }}
    onEnded={(e) => onEvent("complete", e.currentTarget.currentTime * 1000, (e.currentTarget.duration || 0) * 1000)}
    onTimeUpdate={(e) => { const v = e.currentTarget; if (!v.duration) return; const ratio = v.currentTime / v.duration; for (const [threshold, label] of [[.25, "25"], [.5, "50"], [.75, "75"]] as const) if (ratio >= threshold && !milestones.current.has(label)) { milestones.current.add(label); onEvent(label, v.currentTime * 1000, v.duration * 1000) } }}
    onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause() }} />
}

function Action({ icon, active, count, label, onClick }: { icon: React.ReactNode; active?: boolean; count?: number; label: string; onClick: () => void }) {
  return <div className={styles.actionGroup}><button type="button" className={`${styles.actionButton} ${active ? styles.actionActive : ""}`} aria-label={label} onClick={onClick}>{icon}</button>{typeof count === "number" ? <span className={styles.actionCount}>{compact(count)}</span> : null}</div>
}

function mapYouTubeComment(raw: any): CommentRow {
  return { id: String(raw.id || raw.threadId || crypto.randomUUID()), body: String(raw.body || ""), likes: Number(raw.likes || 0), createdAt: raw.createdAt || new Date().toISOString(), origin: "youtube", parentId: raw.parentId || undefined, threadId: raw.threadId || undefined, totalReplyCount: Number(raw.totalReplyCount || 0), user: raw.user || { id: "youtube", username: "youtube", displayName: "YouTube" }, replies: Array.isArray(raw.replies) ? raw.replies.map(mapYouTubeComment) : [] }
}

export function MalikShortsAppV2() {
  const [feed, setFeed] = useState<MalikShortItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [youtube, setYouTube] = useState<Bridge>({ connected: false })
  const [tiktok, setTikTok] = useState<Bridge>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [feedMode, setFeedMode] = useState<"foryou" | "following">("foryou")
  const [language, setLanguage] = useState<"ru" | "kk" | "en">("ru")
  const [muted] = useState(true)
  const [search, setSearch] = useState("")
  const [commentsOpen, setCommentsOpen] = useState<MalikShortItem | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentText, setCommentText] = useState("")
  const [replyTarget, setReplyTarget] = useState<CommentRow | null>(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const [youtubeNext, setYouTubeNext] = useState<string | null>(null)
  const [creatorPanel, setCreatorPanel] = useState<CreatorPanel>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCaption, setUploadCaption] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const seen = useRef(new Set<string>())
  const sessionId = useRef(`shorts-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast((current) => current === message ? null : current), 2400) }, [])
  const canonical = useCallback((short: MalikShortItem) => `${window.location.origin}/shorts/${short.source}/${encodeURIComponent(short.source === "malik" ? short.id : (short.sourceId || short.id))}`, [])

  const emit = useCallback((short: MalikShortItem, eventType: string, positionMs?: number, durationMs?: number) => {
    fetch("/api/shorts/events", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType, postId: isUuid(short.id) ? short.id : undefined, creatorKey: short.creator.id, source: short.source, positionMs: positionMs ? Math.round(positionMs) : undefined, durationMs: durationMs ? Math.round(durationMs) : undefined, sessionId: sessionId.current, locale: language, region: "KZ" }) }).catch(() => {})
  }, [language])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    try {
      const [f, m, y, t] = await Promise.all([
        fetch(`/api/shorts/feed?limit=24&lang=${language}&region=KZ&sessionId=${encodeURIComponent(sessionId.current)}`, { cache: "no-store" }),
        fetch("/api/shorts/me", { cache: "no-store" }), fetch("/api/youtube/status", { cache: "no-store" }), fetch("/api/tiktok/status", { cache: "no-store" }),
      ])
      const fj = (await f.json().catch(() => ({ items: [] }))) as MalikShortFeedResponse
      const mj = await m.json().catch(() => null); const yj = await y.json().catch(() => ({ connected: false })); const tj = await t.json().catch(() => ({ connected: false }))
      const items = Array.isArray(fj.items) ? fj.items : []
      setFeed(items); setActiveId(items[0]?.id || null); setProfile(mj?.profile || null); setYouTube(yj?.connected ? yj : { connected: false }); setTikTok(tj?.connected ? tj : { connected: false })
    } catch { notify("Не удалось обновить ленту") } finally { setLoading(false) }
  }, [language, notify])

  useEffect(() => { loadFeed() }, [loadFeed])
  useEffect(() => {
    const root = feedRef.current; if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-short-id]")); if (!nodes.length) return
    const observer = new IntersectionObserver((entries) => { const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible?.intersectionRatio >= .62) { const id = (visible.target as HTMLElement).dataset.shortId; if (id) setActiveId(id) } }, { root, threshold: [.25, .62, .85] })
    nodes.forEach((node) => observer.observe(node)); return () => observer.disconnect()
  }, [feed])

  const interact = useCallback(async (short: MalikShortItem, action: MalikShortInteractionAction) => {
    if (!isUuid(short.id)) { notify("Ролик ещё материализуется в Malik Shorts"); return null }
    const response = await fetch("/api/shorts/interactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shortId: short.id, action, source: short.source, sessionId: sessionId.current }) })
    if (response.status === 401) { window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`); return null }
    const json = await response.json().catch(() => null)
    if (!response.ok) { notify("Действие не сохранилось"); return null }
    setFeed((items) => items.map((item) => item.id === short.id ? { ...item, metrics: json?.metrics ? { ...item.metrics, ...json.metrics } : item.metrics, viewer: json?.viewer ? { ...item.viewer, ...json.viewer } : item.viewer } : item))
    emit(short, action); return json
  }, [emit, notify])

  useEffect(() => {
    const short = feed.find((item) => item.id === activeId); if (!short) return
    emit(short, "impression")
    if (!isUuid(short.id) || seen.current.has(short.id)) return
    const timer = window.setTimeout(() => { seen.current.add(short.id); interact(short, "view") }, 850)
    return () => window.clearTimeout(timer)
  }, [activeId, emit, feed, interact])

  const filteredFeed = useMemo(() => {
    let items = feedMode === "following" ? feed.filter((item) => item.viewer.following || item.creator.id === profile?.userKey) : feed
    const q = search.trim().toLowerCase(); if (q) items = items.filter((item) => `${item.caption} ${item.creator.displayName} ${item.creator.username} ${item.hashtags.join(" ")}`.toLowerCase().includes(q))
    return items
  }, [feed, feedMode, profile?.userKey, search])

  const toggleLike = useCallback(async (short: MalikShortItem) => {
    const liked = !short.viewer.liked; await interact(short, liked ? "like" : "unlike")
    if (short.source === "youtube" && youtube.connected && short.sourceId) fetch("/api/youtube/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "rating", action: liked ? "like" : "none", videoId: short.sourceId }) }).catch(() => {})
  }, [interact, youtube.connected])

  const toggleFollow = useCallback(async (short: MalikShortItem) => {
    const following = !short.viewer.following; await interact(short, following ? "follow" : "unfollow")
    if (short.source === "youtube" && youtube.connected && short.creator.id.startsWith("youtube:")) fetch("/api/youtube/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "subscription", action: following ? "subscribe" : "unsubscribe", channelId: short.creator.id.slice(8) }) }).catch(() => {})
  }, [interact, youtube.connected])

  const share = useCallback(async (short: MalikShortItem) => { const url = canonical(short); try { if (navigator.share) await navigator.share({ title: short.caption || "Malik Shorts", text: short.caption, url }); else { await navigator.clipboard.writeText(url); notify("Malik Shorts ссылка скопирована") }; interact(short, "share") } catch {} }, [canonical, interact, notify])
  const askMalik = useCallback((short: MalikShortItem) => { prefillPrompt(`Ты получил контекст из Malik Shorts.\nАвтор: @${short.creator.username} (${short.creator.displayName}).\nОписание: ${short.caption || "без описания"}.\nСсылка: ${canonical(short)}.\nРазбери ролик и помоги мне с ним:`); window.location.assign("/dashboard") }, [canonical])

  const loadYouTubeComments = useCallback(async (short: MalikShortItem, append = false, pageToken?: string | null) => {
    if (short.source !== "youtube" || !short.sourceId) return [] as CommentRow[]
    const q = new URLSearchParams({ videoId: short.sourceId }); if (pageToken) q.set("pageToken", pageToken)
    const r = await fetch(`/api/youtube/comments?${q}`, { cache: "no-store" }); const j = await r.json().catch(() => ({ items: [] })); const mapped = (Array.isArray(j.items) ? j.items : []).map(mapYouTubeComment)
    setYouTubeNext(j.nextPageToken || null); if (append) setComments((items) => [...items, ...mapped]); return mapped
  }, [])

  const openComments = useCallback(async (short: MalikShortItem) => {
    setCommentsOpen(short); setComments([]); setReplyTarget(null); setCommentLoading(true); setYouTubeNext(null)
    try {
      const [malik, external] = await Promise.all([
        isUuid(short.id) ? fetch(`/api/shorts/comments?shortId=${encodeURIComponent(short.id)}&limit=100`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        short.source === "youtube" ? loadYouTubeComments(short).catch(() => []) : Promise.resolve([]),
      ])
      setComments([...(external as CommentRow[]), ...((Array.isArray(malik?.items) ? malik.items : []).map((c: any) => ({ ...c, origin: "malik" as const })))])
    } finally { setCommentLoading(false) }
  }, [loadYouTubeComments])

  const sendComment = useCallback(async () => {
    const short = commentsOpen; const body = commentText.trim(); if (!short || !body) return; setCommentText("")
    try {
      if (short.source === "youtube" && youtube.connected && (!replyTarget || replyTarget.origin === "youtube")) {
        const r = await fetch("/api/youtube/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: short.sourceId, parentId: replyTarget?.id, body }) }); if (!r.ok) throw new Error("yt")
      } else {
        if (!isUuid(short.id)) throw new Error("materialize")
        const r = await fetch("/api/shorts/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shortId: short.id, parentId: replyTarget?.origin === "malik" ? replyTarget.id : undefined, body }) }); if (!r.ok) throw new Error("malik")
      }
      setReplyTarget(null); await openComments(short)
    } catch { setCommentText(body); notify(short.source === "youtube" && !youtube.connected ? "Подключи YouTube, чтобы писать туда от своего аккаунта" : "Комментарий не отправлен") }
  }, [commentText, commentsOpen, notify, openComments, replyTarget, youtube.connected])

  const likeComment = useCallback(async (comment: CommentRow) => { if (comment.origin !== "malik") return; const r = await fetch("/api/shorts/comment-likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: comment.id, liked: !comment.viewerLiked }) }); const j = await r.json().catch(() => null); if (r.ok) setComments((items) => items.map((item) => item.id === comment.id ? { ...item, viewerLiked: Boolean(j.liked), likes: Number(j.likes || 0) } : item)) }, [])

  const loadReplies = useCallback(async (comment: CommentRow) => {
    if (!commentsOpen?.sourceId || comment.origin !== "youtube") return
    const r = await fetch(`/api/youtube/comments?videoId=${encodeURIComponent(commentsOpen.sourceId)}&parentId=${encodeURIComponent(comment.id)}`, { cache: "no-store" }); const j = await r.json().catch(() => ({ items: [] })); const replies = (Array.isArray(j.items) ? j.items : []).map(mapYouTubeComment)
    setComments((items) => items.map((item) => item.id === comment.id ? { ...item, replies } : item))
  }, [commentsOpen])

  const openCreator = useCallback(async (short: MalikShortItem) => {
    setCreatorPanel({ short, loading: true })
    try {
      if (short.source === "youtube" && short.creator.id.startsWith("youtube:")) {
        const r = await fetch(`/api/youtube/profile?channelId=${encodeURIComponent(short.creator.id.slice(8))}`, { cache: "no-store" }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error("profile"); setCreatorPanel({ short, loading: false, profile: j.profile, posts: j.videos || [] })
      } else {
        const r = await fetch(`/api/shorts/profile?userKey=${encodeURIComponent(short.creator.id)}`, { cache: "no-store" }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error("profile"); setCreatorPanel({ short, loading: false, profile: j.profile, posts: j.posts || [] })
      }
      interact(short, "profile_view")
    } catch { setCreatorPanel({ short, loading: false, error: "Профиль пока недоступен" }) }
  }, [interact])

  const syncBridge = useCallback(async (provider: "youtube" | "tiktok") => {
    const bridge = provider === "youtube" ? youtube : tiktok
    if (!bridge.connected) { window.location.assign(`/api/${provider}/connect`); return }
    notify(`Синхронизирую ${provider === "youtube" ? "YouTube" : "TikTok"}…`)
    const r = await fetch(`/api/${provider}/sync`, { method: "POST" }); if (r.ok) { const j = await r.json().catch(() => ({})); notify(`${provider === "youtube" ? "YouTube" : "TikTok"} обновлён${j.imported != null ? ` · ${j.imported} видео` : ""}`); await loadFeed() } else notify("Синхронизация не удалась")
  }, [loadFeed, notify, tiktok, youtube])

  const chooseFile = useCallback((file?: File | null) => { if (!file) return; if (!file.type.startsWith("video/")) { notify("Выбери видео для Malik Shorts"); return }; setUploadFile(file); setCreateOpen(true) }, [notify])
  const publish = useCallback(async () => {
    if (!uploadFile || publishing) return; setPublishing(true)
    try {
      const p = await fetch("/api/shorts/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: uploadFile.name, mime: uploadFile.type, size: uploadFile.size }) }); if (p.status === 401) { window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`); return }; const signed = await p.json(); if (!p.ok) throw new Error("presign")
      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": uploadFile.type }, body: uploadFile }); if (!put.ok) throw new Error("storage")
      const post = await fetch("/api/shorts/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: signed.key, caption: uploadCaption, language, region: "KZ", visibility: "public", canRemix: true }) }); if (!post.ok) throw new Error("publish")
      setUploadFile(null); setUploadCaption(""); setCreateOpen(false); notify("Опубликовано в Malik AI"); await loadFeed()
    } catch { notify("Не удалось опубликовать") } finally { setPublishing(false) }
  }, [language, loadFeed, notify, publishing, uploadCaption, uploadFile])

  const nav = [{ id: "foryou", label: "Для вас", icon: Home }, { id: "following", label: "Подписки", icon: Users }, { id: "explore", label: "Обзор", icon: Compass }, { id: "inbox", label: "Входящие", icon: Bell }, { id: "library", label: "Библиотека", icon: Library }] as const

  const commentNode = (comment: CommentRow, nested = false): React.ReactNode => <div key={comment.id} className={styles.comment} style={nested ? { marginLeft: 34, marginTop: 10 } : undefined}><Avatar src={comment.user.avatarUrl} name={comment.user.displayName} className={styles.avatarSmall} /><div className={styles.commentBody}><div className={styles.commentName}>@{comment.user.username} <span style={{ opacity: .45 }}>· {comment.origin === "youtube" ? "YouTube" : "Malik"}</span></div><div className={styles.commentText}>{comment.body}</div><div className={styles.commentTime} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><span>{new Date(comment.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><button type="button" onClick={() => setReplyTarget(comment)} style={{ border: 0, background: "transparent", color: "inherit", padding: 0, cursor: "pointer" }}>Ответить</button>{comment.origin === "malik" ? <button type="button" onClick={() => likeComment(comment)} style={{ border: 0, background: "transparent", color: "inherit", padding: 0, cursor: "pointer" }}>♥ {compact(comment.likes)}</button> : <span>♥ {compact(comment.likes)}</span>}</div>{comment.replies?.map((reply) => commentNode(reply, true))}{comment.origin === "youtube" && Number(comment.totalReplyCount || 0) > Number(comment.replies?.length || 0) ? <button type="button" className={styles.secondaryButton} style={{ marginTop: 8 }} onClick={() => loadReplies(comment)}>Все ответы · {comment.totalReplyCount}</button> : null}</div></div>

  return <div className={styles.root}>
    <aside className={styles.left}><a className={styles.brand} href="/shorts"><span className={styles.mark} /><span className={styles.brandText}><span className={styles.brandMain}>MALIK</span><span className={styles.brandSub}>SHORTS</span></span></a><nav className={styles.nav}>{nav.map((item) => { const Icon = item.icon; const active = (item.id === "foryou" && feedMode === "foryou") || (item.id === "following" && feedMode === "following"); return <button key={item.id} type="button" className={`${styles.navButton} ${active ? styles.navButtonActive : ""}`} onClick={() => { if (item.id === "foryou" || item.id === "following") setFeedMode(item.id); else notify(item.id === "explore" ? "Обзор и Topic Graph подключены" : item.id === "inbox" ? "Messaging backend подключён" : "Библиотека сохраняет Malik-социальные действия") }}><Icon className={styles.navIcon} /><span>{item.label}</span></button> })}<button type="button" className={`${styles.navButton} ${styles.createButton}`} onClick={() => setCreateOpen(true)}><Plus className={styles.navIcon} /><span>Создать</span></button></nav><div className={styles.leftFooter}><button type="button" className={styles.profileButton}><Avatar src={profile?.avatarUrl} name={profile?.displayName || "Malik"} className={styles.avatar} /><span className={styles.profileMeta}><span className={styles.profileName}>{profile?.displayName || "Malik AI"}</span><span className={styles.profileHandle}>@{profile?.username || "malik"}</span></span></button></div></aside>

    <main className={styles.center}><div className={styles.topbar}><button type="button" className={`${styles.feedTab} ${feedMode === "following" ? styles.feedTabActive : ""}`} onClick={() => setFeedMode("following")}>Подписки</button><button type="button" className={`${styles.feedTab} ${feedMode === "foryou" ? styles.feedTabActive : ""}`} onClick={() => setFeedMode("foryou")}>Для вас</button></div><div ref={feedRef} className={styles.feed}>{loading ? <div className={styles.loading}><div className={styles.loader} /></div> : filteredFeed.length ? filteredFeed.map((short) => <article key={short.id} className={styles.shortWrap} data-short-id={short.id}><div className={styles.shortShell}><section className={styles.videoCard}><Player item={short} active={short.id === activeId} muted={muted} onEvent={(type, pos, dur) => emit(short, type, pos, dur)} /><div className={styles.posterShade} /><div className={styles.videoTop}><span className={styles.malikBadge}><span className={styles.mark} style={{ width: 17, height: 17, flexBasis: 17, borderRadius: 5 }} /> {sourceLabel(short.source).toUpperCase()}</span></div><div className={styles.videoMeta}><div className={styles.creatorLine}><strong className={styles.creatorName}>@{short.creator.username}</strong>{short.creator.verified ? <span className={styles.verified}><Check size={10} /></span> : null}</div><div className={styles.caption}>{short.caption}</div>{short.hashtags.length ? <div className={styles.tags}>{short.hashtags.slice(0, 6).map((tag) => `#${tag}`).join(" ")}</div> : null}<div className={styles.externalStats}>{sourceLabel(short.source)}{short.metrics.external?.views ? ` · ${compact(short.metrics.external.views)} просмотров` : ""}</div></div></section><aside className={styles.actions}><div className={styles.actionGroup}><button type="button" className={styles.actionButton} onClick={() => openCreator(short)}><Avatar src={short.creator.avatarUrl} name={short.creator.displayName} className={styles.avatarAction} /></button>{short.creator.id !== profile?.userKey ? <button type="button" className={styles.followMini} onClick={() => toggleFollow(short)}>{short.viewer.following ? <Check size={13} /> : "+"}</button> : null}</div><Action icon={<Heart size={22} fill={short.viewer.liked ? "currentColor" : "none"} />} active={short.viewer.liked} count={short.metrics.likes} label="Нравится" onClick={() => toggleLike(short)} /><Action icon={<MessageCircle size={22} />} count={Number(short.metrics.comments || 0) + Number(short.metrics.external?.comments || 0)} label="Комментарии" onClick={() => openComments(short)} /><Action icon={<Repeat2 size={22} />} active={short.viewer.reposted} count={short.metrics.reposts} label="Репост" onClick={() => interact(short, short.viewer.reposted ? "unrepost" : "repost")} /><Action icon={<Bookmark size={22} fill={short.viewer.saved ? "currentColor" : "none"} />} active={short.viewer.saved} count={short.metrics.saves} label="Сохранить" onClick={() => interact(short, short.viewer.saved ? "unsave" : "save")} /><Action icon={<Share2 size={22} />} label="Поделиться" onClick={() => share(short)} /><Action icon={<Sparkles size={22} />} label="Спросить Malik" onClick={() => askMalik(short)} /></aside></div></article>) : <div className={styles.empty}><div className={styles.emptyBox}><div className={styles.emptyTitle}>Лента готова</div><div className={styles.emptyText}>Подключи YouTube/TikTok или опубликуй первый Malik Short.</div><button type="button" className={styles.connectButton} onClick={() => setCreateOpen(true)}>Создать ролик</button></div></div>}</div><nav className={styles.mobileNav}><button type="button" className={`${styles.mobileNavButton} ${feedMode === "foryou" ? styles.mobileNavActive : ""}`} onClick={() => setFeedMode("foryou")}><Home /><span>Главная</span></button><button type="button" className={`${styles.mobileNavButton} ${feedMode === "following" ? styles.mobileNavActive : ""}`} onClick={() => setFeedMode("following")}><Users /><span>Подписки</span></button><button type="button" className={styles.mobileNavButton} onClick={() => setCreateOpen(true)}><span className={styles.mobileCreate}><Plus size={21} /></span><span>Создать</span></button><button type="button" className={styles.mobileNavButton}><Bell /><span>Входящие</span></button><button type="button" className={styles.mobileNavButton}><User /><span>Профиль</span></button></nav></main>

    <aside className={styles.right}><div className={styles.rightTitle}>Malik Shorts</div><label className={styles.searchBox}><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Видео, авторы, темы" /></label><section className={styles.sideCard}><div className={styles.sideCardTitle}>YouTube Creator</div><div className={styles.sideCardText}>{youtube.connected ? `Подключён: ${youtube.account?.displayName || "YouTube"}. Malik Shorts может синхронизировать твой канал, ролики, комментарии и действия.` : "Войди с YouTube, чтобы видеть свой канал и действовать в YouTube от своего аккаунта прямо из Malik Shorts."}</div><button type="button" className={youtube.connected ? styles.secondaryButton : styles.connectButton} onClick={() => syncBridge("youtube")}>{youtube.connected ? <><RefreshCw size={13} style={{ display: "inline", marginRight: 6 }} />Синхронизировать</> : "Войти с YouTube"}</button></section><section className={styles.sideCard}><div className={styles.sideCardTitle}>TikTok creator bridge</div><div className={styles.sideCardText}>{tiktok.connected ? `Подключён: ${tiktok.account?.displayName || "TikTok"}. Публичные ролики синхронизируются в Malik Shorts.` : "Подключи TikTok Sandbox/Production через официальный OAuth."}</div><button type="button" className={tiktok.connected ? styles.secondaryButton : styles.connectButton} onClick={() => syncBridge("tiktok")}>{tiktok.connected ? "Синхронизировать" : "Подключить TikTok"}</button></section><section className={styles.sideCard}><div className={styles.sideCardTitle}>Персонализация</div><div className={styles.sideCardText}>Malik Ranker учитывает досмотры, пропуски, лайки, комментарии, сохранения, репосты, подписки, темы, язык и регион.</div><div className={styles.pillRow}>{(["ru", "kk", "en"] as const).map((lang) => <button key={lang} type="button" className={`${styles.pill} ${language === lang ? styles.pillActive : ""}`} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}</div></section></aside>

    {commentsOpen ? <><button type="button" className={styles.scrim} onClick={() => setCommentsOpen(null)} /><aside className={styles.drawer}><header className={styles.drawerHeader}><span>Комментарии · Malik + {commentsOpen.source === "youtube" ? "YouTube" : sourceLabel(commentsOpen.source)}</span><button type="button" className={styles.iconPlain} onClick={() => setCommentsOpen(null)}><X size={18} /></button></header><div className={styles.commentList}>{commentLoading ? <div className={styles.loading}><div className={styles.loader} /></div> : comments.length ? comments.map((comment) => commentNode(comment)) : <div className={styles.emptyText} style={{ padding: 20 }}>Комментариев пока нет.</div>}{youtubeNext ? <button type="button" className={styles.secondaryButton} style={{ margin: 14 }} onClick={() => loadYouTubeComments(commentsOpen, true, youtubeNext)}>Загрузить ещё 100 YouTube комментариев</button> : null}</div><div className={styles.commentComposer}>{replyTarget ? <div style={{ position: "absolute", bottom: 62, left: 14, right: 14, background: "#171717", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 8, fontSize: 12 }}>Ответ для @{replyTarget.user.username} <button type="button" onClick={() => setReplyTarget(null)} style={{ float: "right", background: "transparent", border: 0, color: "#fff" }}>×</button></div> : null}<input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Напиши комментарий…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment() } }} /><button type="button" className={styles.sendComment} onClick={sendComment}><Send size={15} /></button></div></aside></> : null}

    {creatorPanel ? <><button type="button" className={styles.scrim} onClick={() => setCreatorPanel(null)} /><aside className={styles.drawer} style={{ width: "min(520px,100vw)" }}><header className={styles.drawerHeader}><span>Профиль автора</span><button type="button" className={styles.iconPlain} onClick={() => setCreatorPanel(null)}><X size={18} /></button></header>{creatorPanel.loading ? <div className={styles.loading}><div className={styles.loader} /></div> : creatorPanel.error ? <div className={styles.emptyText} style={{ padding: 20 }}>{creatorPanel.error}</div> : <div style={{ padding: 20, overflow: "auto" }}><div style={{ display: "flex", gap: 14, alignItems: "center" }}><Avatar src={creatorPanel.profile?.avatarUrl || creatorPanel.short.creator.avatarUrl} name={creatorPanel.profile?.displayName || creatorPanel.short.creator.displayName} className={styles.avatarAction} /><div><div style={{ fontSize: 21, fontWeight: 800 }}>{creatorPanel.profile?.displayName || creatorPanel.short.creator.displayName}</div><div style={{ opacity: .55 }}>@{creatorPanel.profile?.username || creatorPanel.short.creator.username}</div></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 18, textAlign: "center" }}><div><b>{compact(creatorPanel.profile?.subscriberCount ?? creatorPanel.profile?.followerCount)}</b><div style={{ opacity: .5, fontSize: 12 }}>подписчиков</div></div><div><b>{compact(creatorPanel.profile?.videoCount ?? creatorPanel.profile?.postCount ?? creatorPanel.posts?.length)}</b><div style={{ opacity: .5, fontSize: 12 }}>видео</div></div><div><b>{compact(creatorPanel.profile?.viewCount ?? creatorPanel.profile?.totalLikes)}</b><div style={{ opacity: .5, fontSize: 12 }}>просмотров/лайков</div></div></div><p style={{ lineHeight: 1.45, opacity: .8 }}>{creatorPanel.profile?.bio || creatorPanel.short.creator.bio || ""}</p><button type="button" className={styles.connectButton} onClick={() => toggleFollow(creatorPanel.short)}>{creatorPanel.short.viewer.following ? "Вы подписаны" : "Подписаться"}</button><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 18 }}>{(creatorPanel.posts || []).slice(0, 60).map((post: any) => <button type="button" key={post.id} onClick={() => { const id = post.id || post.sourceId; if (id) window.location.assign(`/shorts/${creatorPanel.short.source}/${encodeURIComponent(id)}`) }} style={{ aspectRatio: "9/16", border: 0, padding: 0, overflow: "hidden", background: "#111", borderRadius: 6, cursor: "pointer" }}>{post.posterUrl ? <img src={post.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</button>)}</div></div>}</aside></> : null}

    {createOpen ? <><button type="button" className={styles.scrim} onClick={() => { if (!publishing) { setCreateOpen(false); setUploadFile(null) } }} /><section className={styles.createSheet}><header className={styles.createHeader}><div className={styles.createTitle}>{uploadFile ? "Опубликовать в Malik Shorts" : "Создать"}</div><button type="button" className={styles.iconPlain} onClick={() => setCreateOpen(false)}><X size={18} /></button></header>{uploadFile ? <div style={{ marginTop: 18 }}><div className={styles.sideCardText}><strong style={{ color: "#fff" }}>{uploadFile.name}</strong> · {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</div><textarea value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="Описание, #хэштеги" style={{ width: "100%", minHeight: 110, marginTop: 12, border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, background: "#101010", color: "#fff", padding: 12 }} /><button type="button" className={styles.connectButton} disabled={publishing} onClick={publish}>{publishing ? "Публикую…" : "Опубликовать"}</button></div> : <div className={styles.createGrid}><button type="button" className={styles.createTile} onClick={() => fileRef.current?.click()}><Upload /><strong>Загрузить</strong><span>Видео с устройства</span></button><button type="button" className={styles.createTile} onClick={() => cameraRef.current?.click()}><Camera /><strong>Камера</strong><span>Снять ролик</span></button><button type="button" className={styles.createTile} onClick={() => { prefillPrompt("Создай вертикальный ролик 9:16 для Malik Shorts с сильным hook, монтажом и субтитрами RU/KZ/EN."); window.location.assign("/dashboard") }}><WandSparkles /><strong>Malik AI</strong><span>Создать через AI</span></button></div>}<input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => chooseFile(e.target.files?.[0])} /><input ref={cameraRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => chooseFile(e.target.files?.[0])} /></section></> : null}
    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </div>
}
