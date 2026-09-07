"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Eye, Heart, MessageCircle, Play, Users, Video, X } from "lucide-react"
import styles from "./ShortsAuthorProfileOverlay.module.css"

type AuthorProfile = {
  userKey: string
  username: string
  handle?: string | null
  displayName: string
  avatarUrl?: string | null
  bio?: string
  verified?: boolean
  followerCount?: number
  followingCount?: number
  totalLikes?: number
  postCount?: number
  source?: string
  channelId?: string
}

type AuthorVideo = {
  id: string
  source: string
  sourceId?: string | null
  sourceUrl?: string | null
  posterUrl?: string | null
  mediaUrl?: string | null
  caption?: string
  description?: string
  publishedAt?: string | null
  durationSeconds?: number
  embeddable?: boolean
  metrics: {
    views: number
    likes: number
    comments: number
    reposts?: number
    saves?: number
    shares?: number
  }
}

type AuthorResponse = {
  profile: AuthorProfile
  viewer?: { isSelf?: boolean; following?: boolean }
  private?: boolean
  videos: AuthorVideo[]
  nextCursor?: string | null
}

type Target = { shortId?: string; videoId?: string }

function compact(value: number | undefined) {
  const count = Math.max(0, Number(value || 0))
  if (count < 1000) return String(Math.floor(count))
  if (count < 1_000_000) return `${(count / 1000).toFixed(count >= 100_000 ? 0 : 1).replace(".0", "")}K`
  if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(count >= 100_000_000 ? 0 : 1).replace(".0", "")}M`
  return `${(count / 1_000_000_000).toFixed(1).replace(".0", "")}B`
}

function initials(value: string) {
  return String(value || "M").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "M"
}

function youtubeIdFromArticle(article: HTMLElement) {
  const frame = article.querySelector<HTMLIFrameElement>('iframe[src*="youtube.com/embed/"]')
  if (!frame?.src) return ""
  try {
    const match = new URL(frame.src).pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/)
    return match?.[1] || ""
  } catch {
    return ""
  }
}

function dedupeVideos(items: AuthorVideo[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.source}:${item.sourceId || item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function YouTubeBadge() {
  return (
    <span className={styles.youtubeBadge}>
      <svg viewBox="0 0 28 20" aria-hidden="true">
        <path d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9Z" fill="#ff0033" />
        <path d="M11.2 14.3 18.5 10l-7.3-4.3v8.6Z" fill="#fff" />
      </svg>
      YouTube
    </span>
  )
}

export function ShortsAuthorProfileOverlay() {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [data, setData] = useState<AuthorResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<AuthorVideo | null>(null)

  const close = useCallback(() => {
    setPlaying(null)
    setOpen(false)
    setTarget(null)
    setData(null)
    setError(null)
  }, [])

  const fetchAuthor = useCallback(async (nextTarget: Target) => {
    const query = new URLSearchParams()
    if (nextTarget.shortId) query.set("shortId", nextTarget.shortId)
    if (nextTarget.videoId) query.set("videoId", nextTarget.videoId)
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const response = await fetch(`/api/shorts/author?${query.toString()}`, { cache: "no-store" })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.profile) throw new Error(String(json?.error || "AUTHOR_UNAVAILABLE"))
      setData({
        profile: json.profile,
        viewer: json.viewer,
        private: Boolean(json.private),
        videos: dedupeVideos(Array.isArray(json.videos) ? json.videos : []),
        nextCursor: json.nextCursor || null,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AUTHOR_UNAVAILABLE")
    } finally {
      setLoading(false)
    }
  }, [])

  const openAuthor = useCallback((nextTarget: Target) => {
    setTarget(nextTarget)
    setOpen(true)
    setPlaying(null)
    void fetchAuthor(nextTarget)
  }, [fetchAuthor])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const node = event.target
      if (!(node instanceof Element)) return
      const button = node.closest<HTMLButtonElement>('button[aria-label^="Профиль "]')
      if (!button) return
      const article = button.closest<HTMLElement>("[data-short-id]")
      if (!article) return
      const shortId = String(article.dataset.shortId || "")
      const videoId = youtubeIdFromArticle(article)
      if (!shortId && !videoId) return
      // Do not stop propagation: MalikShortsApp still records profile_view.
      openAuthor({ shortId, videoId })
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [openAuthor])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (playing) setPlaying(null)
      else close()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [close, open, playing])

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || moreLoading) return
    const query = new URLSearchParams({ userKey: data.profile.userKey, cursor: data.nextCursor })
    setMoreLoading(true)
    try {
      const response = await fetch(`/api/shorts/author?${query.toString()}`, { cache: "no-store" })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(json?.error || "AUTHOR_UNAVAILABLE"))
      setData((current) => current ? {
        ...current,
        profile: json?.profile || current.profile,
        videos: dedupeVideos([...current.videos, ...(Array.isArray(json?.videos) ? json.videos : [])]),
        nextCursor: json?.nextCursor || null,
      } : current)
    } catch {
      setError("Не удалось загрузить следующую часть видео")
    } finally {
      setMoreLoading(false)
    }
  }, [data?.nextCursor, data?.profile.userKey, moreLoading])

  const handle = useMemo(() => {
    if (!data?.profile) return ""
    const value = String(data.profile.handle || "").trim().replace(/^@+/, "")
    return value ? `@${value}` : data.profile.username ? `@${data.profile.username}` : ""
  }, [data])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onScroll={(event) => {
        const node = event.currentTarget
        if (data?.nextCursor && !moreLoading && node.scrollHeight - node.scrollTop - node.clientHeight < 900) void loadMore()
      }}
    >
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={close}><ArrowLeft size={18} /> Назад в Malik Shorts</button>
        <button type="button" className={styles.close} onClick={close} aria-label="Закрыть профиль"><X size={20} /></button>
      </div>

      <div className={styles.shell}>
        {loading ? <div className={styles.state}>Загружаю реальный профиль автора…</div> : null}
        {!loading && error && !data ? <div className={styles.state}>Профиль сейчас недоступен: {error}</div> : null}

        {data ? (
          <>
            <section className={styles.profile}>
              <div className={styles.avatar}>
                {data.profile.avatarUrl ? <img src={data.profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{initials(data.profile.displayName)}</span>}
              </div>
              <div className={styles.profileBody}>
                <div className={styles.nameRow}>
                  <h1>{data.profile.displayName}</h1>
                  {data.profile.verified ? <span className={styles.verified}><Check size={12} /></span> : null}
                  {data.profile.source === "youtube" ? <YouTubeBadge /> : null}
                </div>
                {handle ? <div className={styles.handle}>{handle}</div> : null}
                <div className={styles.stats}>
                  <span><b>{compact(data.profile.postCount)}</b> видео</span>
                  {typeof data.profile.followerCount === "number" ? <span><b>{compact(data.profile.followerCount)}</b> подписчиков</span> : null}
                  {typeof data.profile.followingCount === "number" ? <span><b>{compact(data.profile.followingCount)}</b> подписок</span> : null}
                </div>
                {data.profile.bio ? <p className={styles.bio}>{data.profile.bio}</p> : null}
              </div>
            </section>

            <div className={styles.sectionHead}>
              <div><h2>Видео автора</h2><p>Реальные ролики автора, остаёшься внутри Malik Shorts.</p></div>
              <span>{data.videos.length}{data.nextCursor ? "+" : ""}</span>
            </div>

            {data.private ? <div className={styles.state}>Профиль закрытый.</div> : data.videos.length ? (
              <div className={styles.grid}>
                {data.videos.map((video) => (
                  <button key={`${video.source}:${video.sourceId || video.id}`} type="button" className={styles.card} onClick={() => setPlaying(video)}>
                    <span className={styles.thumb}>
                      {video.posterUrl ? <img src={video.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={styles.thumbFallback}><Video size={28} /></span>}
                      <span className={styles.play}><Play size={20} fill="currentColor" /></span>
                    </span>
                    <span className={styles.cardBody}>
                      <strong>{video.caption || "Без названия"}</strong>
                      <span className={styles.metrics}>
                        <span><Eye size={12} /> {compact(video.metrics.views)}</span>
                        <span><Heart size={12} /> {compact(video.metrics.likes)}</span>
                        <span><MessageCircle size={12} /> {compact(video.metrics.comments)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <div className={styles.state}>У автора пока нет доступных видео.</div>}

            {moreLoading ? <div className={styles.more}>Загружаю ещё видео…</div> : null}
            {data.nextCursor && !moreLoading ? <button type="button" className={styles.moreButton} onClick={() => void loadMore()}>Показать ещё видео</button> : null}
            {!data.nextCursor && data.videos.length ? <div className={styles.end}>Все доступные видео автора загружены.</div> : null}
            {error && data ? <div className={styles.softError}>{error}</div> : null}
          </>
        ) : null}
      </div>

      {playing ? (
        <div className={styles.playerBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setPlaying(null) }}>
          <div className={styles.playerModal}>
            <button type="button" className={styles.playerClose} onClick={() => setPlaying(null)} aria-label="Закрыть видео"><X size={20} /></button>
            <div className={styles.playerBox}>
              {playing.source === "youtube" && playing.sourceId && playing.embeddable !== false ? (
                <iframe
                  src={`https://www.youtube.com/embed/${encodeURIComponent(playing.sourceId)}?autoplay=1&playsinline=1&rel=0`}
                  title={playing.caption || "YouTube video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : playing.mediaUrl ? (
                <video src={playing.mediaUrl} controls autoPlay playsInline />
              ) : (
                <div className={styles.unavailable}>Этот ролик нельзя встроить в плеер.</div>
              )}
            </div>
            <div className={styles.playerMeta}>
              <strong>{playing.caption || "Без названия"}</strong>
              {playing.description ? <p>{playing.description}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
