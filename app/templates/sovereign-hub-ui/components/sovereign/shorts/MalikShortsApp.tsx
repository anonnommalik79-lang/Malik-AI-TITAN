"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  Bookmark,
  Camera,
  Check,
  Compass,
  Heart,
  Home,
  Library,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Share2,
  Sparkles,
  Upload,
  User,
  Users,
  Video,
  WandSparkles,
  X,
} from "lucide-react"
import { prefillPrompt } from "@/lib/malik-context"
import type { MalikShortComment, MalikShortFeedResponse, MalikShortInteractionAction, MalikShortItem } from "@/lib/shorts/types"
import styles from "./MalikShortsApp.module.css"

type ShortsProfile = {
  userKey: string
  username: string
  displayName: string
  avatarUrl?: string | null
  bio?: string
  verified?: boolean
  followerCount?: number
  followingCount?: number
  totalLikes?: number
  postCount?: number
}

type TikTokStatus = {
  connected: boolean
  account?: {
    displayName?: string
    avatarUrl?: string | null
    scopes?: string[]
    metadata?: Record<string, unknown>
  }
}

type ActiveDrawer = { type: "comments"; short: MalikShortItem } | null

function compact(value: number | undefined) {
  const count = Number(value || 0)
  if (count < 1000) return String(Math.max(0, Math.floor(count)))
  if (count < 1_000_000) return `${(count / 1000).toFixed(count >= 100_000 ? 0 : 1).replace(".0", "")}K`
  if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(count >= 100_000_000 ? 0 : 1).replace(".0", "")}M`
  return `${(count / 1_000_000_000).toFixed(1).replace(".0", "")}B`
}

function initials(value: string) {
  const clean = String(value || "M").trim()
  return clean.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "M"
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function externalSummary(item: MalikShortItem) {
  const external = item.metrics.external
  if (!external) return ""
  const chunks: string[] = []
  if (external.views) chunks.push(`${compact(external.views)} просмотров`)
  if (external.likes) chunks.push(`${compact(external.likes)} реакций`)
  if (external.comments) chunks.push(`${compact(external.comments)} комментариев`)
  return chunks.slice(0, 2).join(" · ")
}

function Avatar({ src, name, className }: { src?: string | null; name: string; className: string }) {
  return (
    <div className={className} aria-hidden="true">
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <span>{initials(name)}</span>}
    </div>
  )
}

function ShortPlayer({ item, active, muted, onToggleMuted }: {
  item: MalikShortItem
  active: boolean
  muted: boolean
  onToggleMuted: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (item.playback.kind !== "native") return
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    if (active) video.play().catch(() => {})
    else video.pause()
  }, [active, item.playback.kind, muted])

  const poster = item.posterUrl || (item.playback.kind === "youtube"
    ? `https://i.ytimg.com/vi/${encodeURIComponent(item.playback.videoId)}/hqdefault.jpg`
    : undefined)

  if (!active && poster) {
    return <img className={styles.poster} src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
  }

  if (item.playback.kind === "youtube") {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://malikaiworld.world"
    const params = new URLSearchParams({
      autoplay: active ? "1" : "0",
      mute: "1",
      playsinline: "1",
      controls: "1",
      rel: "0",
      loop: "1",
      playlist: item.playback.videoId,
      origin,
    })
    return (
      <iframe
        className={styles.videoFrame}
        src={`https://www.youtube.com/embed/${encodeURIComponent(item.playback.videoId)}?${params.toString()}`}
        title={item.caption || "Video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  if (item.playback.kind === "tiktok") {
    const params = new URLSearchParams({ autoplay: active ? "1" : "0", loop: "1" })
    return (
      <iframe
        className={styles.videoFrame}
        src={`https://www.tiktok.com/player/v1/${encodeURIComponent(item.playback.videoId)}?${params.toString()}`}
        title={item.caption || "Video"}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  return (
    <video
      ref={videoRef}
      className={styles.nativeVideo}
      src={item.playback.url}
      poster={item.playback.poster || item.posterUrl}
      muted={muted}
      playsInline
      loop
      preload={active ? "auto" : "metadata"}
      onClick={() => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) video.play().catch(() => {})
        else video.pause()
      }}
      onDoubleClick={onToggleMuted}
    />
  )
}

function Action({ icon, active, count, label, onClick }: {
  icon: React.ReactNode
  active?: boolean
  count?: number
  label: string
  onClick: () => void
}) {
  return (
    <div className={styles.actionGroup}>
      <button type="button" className={`${styles.actionButton} ${active ? styles.actionActive : ""}`} aria-label={label} onClick={onClick}>
        {icon}
      </button>
      {typeof count === "number" ? <span className={styles.actionCount}>{compact(count)}</span> : null}
    </div>
  )
}

export function MalikShortsApp() {
  const [feed, setFeed] = useState<MalikShortItem[]>([])
  const [profile, setProfile] = useState<ShortsProfile | null>(null)
  const [tiktok, setTikTok] = useState<TikTokStatus>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [feedMode, setFeedMode] = useState<"foryou" | "following">("foryou")
  const [language, setLanguage] = useState<"ru" | "kk" | "en">("ru")
  const [muted, setMuted] = useState(true)
  const [drawer, setDrawer] = useState<ActiveDrawer>(null)
  const [comments, setComments] = useState<MalikShortComment[]>([])
  const [commentText, setCommentText] = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCaption, setUploadCaption] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const seenRef = useRef(new Set<string>())
  const feedRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2400)
  }, [])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    try {
      const [feedResponse, meResponse, tiktokResponse] = await Promise.all([
        fetch(`/api/shorts/feed?limit=18&lang=${language}&region=KZ`, { cache: "no-store" }),
        fetch("/api/shorts/me", { cache: "no-store" }),
        fetch("/api/tiktok/status", { cache: "no-store" }),
      ])
      const feedJson = (await feedResponse.json().catch(() => ({ items: [] }))) as MalikShortFeedResponse
      const meJson = await meResponse.json().catch(() => null)
      const tiktokJson = await tiktokResponse.json().catch(() => ({ connected: false }))
      const next = Array.isArray(feedJson?.items) ? feedJson.items : []
      setFeed(next)
      setActiveId(next[0]?.id || null)
      setProfile(meJson?.profile || null)
      setTikTok(tiktokJson?.connected ? tiktokJson : { connected: false })
    } catch {
      notify("Не удалось обновить ленту")
    } finally {
      setLoading(false)
    }
  }, [language, notify])

  useEffect(() => { loadFeed() }, [loadFeed])

  useEffect(() => {
    const root = feedRef.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-short-id]"))
    if (!nodes.length) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!visible || visible.intersectionRatio < .62) return
      const id = (visible.target as HTMLElement).dataset.shortId
      if (id) setActiveId(id)
    }, { root, threshold: [.25, .62, .85] })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [feed])

  const interaction = useCallback(async (short: MalikShortItem, action: MalikShortInteractionAction) => {
    if (!isUuid(short.id)) {
      notify("Социальные действия включатся после подключения базы Malik Shorts")
      return null
    }
    try {
      const response = await fetch("/api/shorts/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: short.id, action, source: short.source, sessionId: "web" }),
      })
      if (response.status === 401) {
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)
        return null
      }
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(json?.error || "interaction")
      setFeed((items) => items.map((item) => item.id === short.id ? {
        ...item,
        metrics: json?.metrics ? { ...item.metrics, ...json.metrics } : item.metrics,
        viewer: json?.viewer ? { ...item.viewer, ...json.viewer } : item.viewer,
      } : item))
      return json
    } catch {
      notify("Действие не сохранилось")
      return null
    }
  }, [notify])

  useEffect(() => {
    const short = feed.find((item) => item.id === activeId)
    if (!short || seenRef.current.has(short.id) || !isUuid(short.id)) return
    const timer = window.setTimeout(() => {
      seenRef.current.add(short.id)
      interaction(short, "view")
    }, 850)
    return () => window.clearTimeout(timer)
  }, [activeId, feed, interaction])

  const filteredFeed = useMemo(() => {
    let items = feed
    if (feedMode === "following") items = items.filter((item) => item.viewer.following || item.creator.id === profile?.userKey)
    const q = search.trim().toLocaleLowerCase()
    if (q) items = items.filter((item) => `${item.caption} ${item.creator.displayName} ${item.creator.username} ${item.hashtags.join(" ")}`.toLocaleLowerCase().includes(q))
    return items
  }, [feed, feedMode, profile?.userKey, search])

  const toggleLike = async (short: MalikShortItem) => interaction(short, short.viewer.liked ? "unlike" : "like")
  const toggleSave = async (short: MalikShortItem) => interaction(short, short.viewer.saved ? "unsave" : "save")
  const toggleRepost = async (short: MalikShortItem) => interaction(short, short.viewer.reposted ? "unrepost" : "repost")
  const toggleFollow = async (short: MalikShortItem) => interaction(short, short.viewer.following ? "unfollow" : "follow")

  const shareShort = useCallback(async (short: MalikShortItem) => {
    const url = short.sourceUrl || `${window.location.origin}/shorts?short=${encodeURIComponent(short.id)}`
    try {
      if (navigator.share) await navigator.share({ title: short.caption || "Malik Shorts", text: short.caption, url })
      else {
        await navigator.clipboard.writeText(url)
        notify("Ссылка скопирована")
      }
      interaction(short, "share")
    } catch {}
  }, [interaction, notify])

  const askMalik = useCallback((short: MalikShortItem) => {
    const context = [
      "Ты получил контекст из Malik Shorts.",
      `Автор: @${short.creator.username} (${short.creator.displayName}).`,
      `Описание: ${short.caption || "без описания"}.`,
      short.sourceUrl ? `Ссылка на ролик: ${short.sourceUrl}.` : "",
      "Помоги мне разобраться с этим роликом: ",
    ].filter(Boolean).join("\n")
    prefillPrompt(context)
    window.location.assign("/dashboard")
  }, [])

  const openComments = useCallback(async (short: MalikShortItem) => {
    setDrawer({ type: "comments", short })
    setComments([])
    if (!isUuid(short.id)) return
    setCommentLoading(true)
    try {
      const response = await fetch(`/api/shorts/comments?shortId=${encodeURIComponent(short.id)}&limit=50`, { cache: "no-store" })
      const json = await response.json().catch(() => ({ items: [] }))
      setComments(Array.isArray(json.items) ? json.items : [])
    } finally {
      setCommentLoading(false)
    }
  }, [])

  const sendComment = useCallback(async () => {
    if (!drawer?.short || !commentText.trim() || !isUuid(drawer.short.id)) return
    const body = commentText.trim()
    setCommentText("")
    try {
      const response = await fetch("/api/shorts/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: drawer.short.id, body }),
      })
      if (response.status === 401) {
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)
        return
      }
      if (!response.ok) throw new Error("comment")
      await openComments(drawer.short)
      setFeed((items) => items.map((item) => item.id === drawer.short.id ? { ...item, metrics: { ...item.metrics, comments: item.metrics.comments + 1 } } : item))
    } catch {
      setCommentText(body)
      notify("Комментарий не отправлен")
    }
  }, [commentText, drawer, notify, openComments])

  const chooseFile = useCallback((file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      notify("Выбери видео или фото")
      return
    }
    setUploadFile(file)
    setCreateOpen(true)
  }, [notify])

  const publishUpload = useCallback(async () => {
    if (!uploadFile || publishing) return
    setPublishing(true)
    try {
      const presign = await fetch("/api/shorts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: uploadFile.name, mime: uploadFile.type, size: uploadFile.size }),
      })
      if (presign.status === 401) {
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)
        return
      }
      const signed = await presign.json().catch(() => null)
      if (!presign.ok || !signed?.uploadUrl || !signed?.key) throw new Error(signed?.error || "presign")
      const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": uploadFile.type }, body: uploadFile })
      if (!uploaded.ok) throw new Error("storage")
      const published = await fetch("/api/shorts/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: signed.key, caption: uploadCaption, language, region: "KZ", visibility: "public", canRemix: true }),
      })
      const result = await published.json().catch(() => null)
      if (!published.ok) throw new Error(result?.error || "publish")
      setUploadFile(null)
      setUploadCaption("")
      setCreateOpen(false)
      notify("Опубликовано в Malik AI")
      await loadFeed()
    } catch (error) {
      const reason = String(error instanceof Error ? error.message : error)
      notify(reason.includes("NOT_CONFIGURED") || reason.includes("not-configured") ? "Подключи хранилище Malik Shorts" : "Не удалось опубликовать")
    } finally {
      setPublishing(false)
    }
  }, [language, loadFeed, notify, publishing, uploadCaption, uploadFile])

  const createWithAI = useCallback(() => {
    prefillPrompt("Создай вертикальный ролик 9:16 для публикации в Malik Shorts. Сначала уточни тему только если без неё невозможно продолжить; иначе сразу подготовь лучший ролик и описание для публикации.")
    window.location.assign("/dashboard")
  }, [])

  const syncTikTok = useCallback(async () => {
    if (!tiktok.connected) {
      window.location.assign("/api/tiktok/connect")
      return
    }
    notify("Синхронизирую TikTok…")
    const response = await fetch("/api/tiktok/sync", { method: "POST" })
    if (response.ok) {
      notify("TikTok обновлён")
      await loadFeed()
    } else notify("Не удалось синхронизировать TikTok")
  }, [loadFeed, notify, tiktok.connected])

  const navItems = [
    { id: "foryou", label: "Для вас", icon: Home },
    { id: "following", label: "Подписки", icon: Users },
    { id: "explore", label: "Обзор", icon: Compass },
    { id: "inbox", label: "Входящие", icon: Bell },
    { id: "library", label: "Библиотека", icon: Library },
  ] as const

  const handleNav = (id: string) => {
    if (id === "foryou" || id === "following") {
      setFeedMode(id)
      feedRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    if (id === "explore") { notify("Обзор использует ту же персональную ленту; глобальный поиск уже сверху") }
    if (id === "inbox") notify("Входящие появятся здесь после первых реакций")
    if (id === "library") notify("Сохранённые ролики уже записываются в библиотеку Malik Shorts")
  }

  return (
    <div className={styles.root}>
      <aside className={styles.left} aria-label="Malik Shorts">
        <a className={styles.brand} href="/shorts" aria-label="Malik Shorts">
          <span className={styles.mark} />
          <span className={styles.brandText}>
            <span className={styles.brandMain}>MALIK</span>
            <span className={styles.brandSub}>SHORTS</span>
          </span>
        </a>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = (item.id === "foryou" && feedMode === "foryou") || (item.id === "following" && feedMode === "following")
            return (
              <button key={item.id} type="button" className={`${styles.navButton} ${active ? styles.navButtonActive : ""}`} onClick={() => handleNav(item.id)}>
                <Icon className={styles.navIcon} /> <span>{item.label}</span>
              </button>
            )
          })}
          <button type="button" className={`${styles.navButton} ${styles.createButton}`} onClick={() => setCreateOpen(true)}>
            <Plus className={styles.navIcon} /> <span>Создать</span>
          </button>
        </nav>

        <div className={styles.leftFooter}>
          <button type="button" className={styles.profileButton} onClick={() => notify("Это твой профиль Malik Shorts — отдельная регистрация не нужна") }>
            <Avatar src={profile?.avatarUrl} name={profile?.displayName || "Malik"} className={styles.avatar} />
            <span className={styles.profileMeta}>
              <span className={styles.profileName}>{profile?.displayName || "Malik AI"}</span>
              <span className={styles.profileHandle}>@{profile?.username || "malik"}</span>
            </span>
          </button>
        </div>
      </aside>

      <main className={styles.center}>
        <div className={styles.topbar}>
          <button type="button" className={`${styles.feedTab} ${feedMode === "following" ? styles.feedTabActive : ""}`} onClick={() => setFeedMode("following")}>Подписки</button>
          <button type="button" className={`${styles.feedTab} ${feedMode === "foryou" ? styles.feedTabActive : ""}`} onClick={() => setFeedMode("foryou")}>Для вас</button>
        </div>

        <div ref={feedRef} className={styles.feed}>
          {loading ? (
            <div className={styles.loading}><div className={styles.loader} /></div>
          ) : filteredFeed.length ? filteredFeed.map((short) => {
            const active = short.id === activeId
            const stats = externalSummary(short)
            return (
              <article key={short.id} className={styles.shortWrap} data-short-id={short.id}>
                <div className={styles.shortShell}>
                  <section className={styles.videoCard}>
                    <ShortPlayer item={short} active={active} muted={muted} onToggleMuted={() => setMuted((value) => !value)} />
                    <div className={styles.posterShade} />
                    {short.source === "malik" ? (
                      <div className={styles.videoTop}><span className={styles.malikBadge}><span className={styles.mark} style={{ width: 17, height: 17, flexBasis: 17, borderRadius: 5 }} /> ОПУБЛИКОВАНО В MALIK AI</span></div>
                    ) : null}
                    <div className={styles.videoMeta}>
                      <div className={styles.creatorLine}>
                        <strong className={styles.creatorName}>@{short.creator.username}</strong>
                        {short.creator.verified ? <span className={styles.verified}><Check size={10} /></span> : null}
                      </div>
                      <div className={styles.caption}>{short.caption}</div>
                      {short.hashtags.length ? <div className={styles.tags}>{short.hashtags.slice(0, 6).map((tag) => `#${tag}`).join(" ")}</div> : null}
                      {stats ? <div className={styles.externalStats}>{stats}</div> : null}
                    </div>
                  </section>

                  <aside className={styles.actions} aria-label="Действия с роликом">
                    <div className={styles.actionGroup}>
                      <button type="button" className={styles.actionButton} aria-label={`Профиль ${short.creator.displayName}`} onClick={() => interaction(short, "profile_view")}>
                        <Avatar src={short.creator.avatarUrl} name={short.creator.displayName} className={styles.avatarAction} />
                      </button>
                      {short.creator.id !== profile?.userKey ? <button type="button" className={styles.followMini} onClick={() => toggleFollow(short)} aria-label={short.viewer.following ? "Отписаться" : "Подписаться"}>{short.viewer.following ? <Check size={13} /> : "+"}</button> : null}
                    </div>
                    <Action icon={<Heart size={22} fill={short.viewer.liked ? "currentColor" : "none"} />} active={short.viewer.liked} count={short.metrics.likes} label="Нравится" onClick={() => toggleLike(short)} />
                    <Action icon={<MessageCircle size={22} />} count={short.metrics.comments} label="Комментарии" onClick={() => openComments(short)} />
                    <Action icon={<Repeat2 size={22} />} active={short.viewer.reposted} count={short.metrics.reposts} label="Репост" onClick={() => toggleRepost(short)} />
                    <Action icon={<Bookmark size={22} fill={short.viewer.saved ? "currentColor" : "none"} />} active={short.viewer.saved} count={short.metrics.saves} label="Сохранить" onClick={() => toggleSave(short)} />
                    <Action icon={<Share2 size={22} />} label="Поделиться" onClick={() => shareShort(short)} />
                    <Action icon={<Sparkles size={22} />} label="Спросить Malik" onClick={() => askMalik(short)} />
                  </aside>
                </div>
              </article>
            )
          }) : (
            <div className={styles.empty}>
              <div className={styles.emptyBox}>
                <div className={styles.emptyTitle}>{feedMode === "following" ? "Подпишись на авторов — и они появятся здесь" : "Лента готова к первому ролику"}</div>
                <div className={styles.emptyText}>Создай или загрузи видео. Malik Shorts не требует отдельной регистрации: используется твой аккаунт Malik AI.</div>
                <button type="button" className={styles.connectButton} onClick={() => setCreateOpen(true)}>Создать ролик</button>
              </div>
            </div>
          )}
        </div>

        <nav className={styles.mobileNav} aria-label="Навигация Malik Shorts">
          <button type="button" className={`${styles.mobileNavButton} ${feedMode === "foryou" ? styles.mobileNavActive : ""}`} onClick={() => setFeedMode("foryou")}><Home /><span>Главная</span></button>
          <button type="button" className={`${styles.mobileNavButton} ${feedMode === "following" ? styles.mobileNavActive : ""}`} onClick={() => setFeedMode("following")}><Users /><span>Подписки</span></button>
          <button type="button" className={styles.mobileNavButton} onClick={() => setCreateOpen(true)}><span className={styles.mobileCreate}><Plus size={21} /></span><span>Создать</span></button>
          <button type="button" className={styles.mobileNavButton} onClick={() => notify("Входящие появятся после первых реакций")}><Bell /><span>Входящие</span></button>
          <button type="button" className={styles.mobileNavButton} onClick={() => notify(`@${profile?.username || "malik"}`)}><User /><span>Профиль</span></button>
        </nav>
      </main>

      <aside className={styles.right}>
        <div className={styles.rightTitle}>Malik Shorts</div>
        <label className={styles.searchBox}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Видео, авторы, темы" /></label>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>Твоя лента</div>
          <div className={styles.sideCardText}>Персонализация строится на досмотрах, лайках, комментариях, сохранениях, репостах и подписках внутри Malik Shorts.</div>
          <div className={styles.pillRow}>
            {(["ru", "kk", "en"] as const).map((lang) => <button key={lang} type="button" className={`${styles.pill} ${language === lang ? styles.pillActive : ""}`} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}
          </div>
        </section>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>TikTok creator bridge</div>
          <div className={styles.sideCardText}>{tiktok.connected ? `Подключён: ${tiktok.account?.displayName || "TikTok"}. Ролики импортируются в твой профиль Malik Shorts, а профиль остаётся Malik-native.` : "Подключи TikTok, чтобы импортировать свои публичные ролики и их доступную статистику. Это не меняет твой профиль Malik Shorts."}</div>
          <button type="button" className={tiktok.connected ? styles.secondaryButton : styles.connectButton} onClick={syncTikTok}>{tiktok.connected ? <><RefreshCw size={13} style={{ display: "inline", marginRight: 6 }} />Синхронизировать</> : "Подключить TikTok"}</button>
        </section>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>Creator Studio</div>
          <div className={styles.sideCardText}>Загрузи готовое видео, сними новое или создай ролик через Malik AI. Публикация идёт прямо в Malik Shorts.</div>
          <button type="button" className={styles.connectButton} onClick={() => setCreateOpen(true)}>Открыть создание</button>
        </section>
      </aside>

      {drawer ? <>
        <button type="button" className={styles.scrim} aria-label="Закрыть" onClick={() => setDrawer(null)} />
        <aside className={styles.drawer}>
          <header className={styles.drawerHeader}><span>Комментарии · {compact(drawer.short.metrics.comments)}</span><button type="button" className={styles.iconPlain} onClick={() => setDrawer(null)}><X size={18} /></button></header>
          <div className={styles.commentList}>
            {commentLoading ? <div className={styles.loading} style={{ minHeight: 180 }}><div className={styles.loader} /></div> : comments.length ? comments.map((comment) => (
              <div key={comment.id} className={styles.comment}>
                <Avatar src={comment.user.avatarUrl} name={comment.user.displayName} className={styles.avatarSmall} />
                <div className={styles.commentBody}>
                  <div className={styles.commentName}>@{comment.user.username}</div>
                  <div className={styles.commentText}>{comment.body}</div>
                  <div className={styles.commentTime}>{new Date(comment.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            )) : <div className={styles.emptyText} style={{ padding: 20 }}>Первый комментарий может быть твоим.</div>}
          </div>
          <div className={styles.commentComposer}>
            <input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Напиши комментарий…" maxLength={2200} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendComment() } }} />
            <button type="button" className={styles.sendComment} onClick={sendComment}><Send size={15} /></button>
          </div>
        </aside>
      </> : null}

      {createOpen ? <>
        <button type="button" className={styles.scrim} aria-label="Закрыть" onClick={() => { if (!publishing) { setCreateOpen(false); setUploadFile(null) } }} />
        <section className={styles.createSheet}>
          <header className={styles.createHeader}><div className={styles.createTitle}>{uploadFile ? "Опубликовать в Malik Shorts" : "Создать"}</div><button type="button" className={styles.iconPlain} onClick={() => { if (!publishing) { setCreateOpen(false); setUploadFile(null) } }}><X size={18} /></button></header>
          {uploadFile ? <div style={{ marginTop: 18 }}>
            <div className={styles.sideCardText}><strong style={{ color: "#fff" }}>{uploadFile.name}</strong> · {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</div>
            <textarea value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} maxLength={2200} placeholder="Описание, #хэштеги" style={{ width: "100%", minHeight: 110, marginTop: 12, resize: "vertical", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, background: "#101010", color: "#fff", padding: 12, outline: 0 }} />
            <button type="button" className={styles.connectButton} disabled={publishing} onClick={publishUpload}>{publishing ? "Публикую…" : "Опубликовать"}</button>
            <button type="button" className={styles.secondaryButton} disabled={publishing} onClick={() => setUploadFile(null)}>Выбрать другой файл</button>
          </div> : <div className={styles.createGrid}>
            <button type="button" className={styles.createTile} onClick={() => fileInputRef.current?.click()}><Upload /><strong>Загрузить</strong><span>Видео или фото с устройства</span></button>
            <button type="button" className={styles.createTile} onClick={() => cameraInputRef.current?.click()}><Camera /><strong>Камера</strong><span>Снять и сразу опубликовать</span></button>
            <button type="button" className={styles.createTile} onClick={createWithAI}><WandSparkles /><strong>Malik AI</strong><span>Создать ролик из идеи</span></button>
          </div>}
          <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
          <input ref={cameraInputRef} type="file" accept="video/*" capture="environment" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
        </section>
      </> : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  )
}
