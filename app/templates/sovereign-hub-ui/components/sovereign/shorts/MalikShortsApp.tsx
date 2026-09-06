"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Home,
  Images,
  Library,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Maximize2,
  Music,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Upload,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react"
import { prefillPrompt } from "@/lib/malik-context"
import type { MalikShortComment, MalikShortFeedResponse, MalikShortInteractionAction, MalikShortItem, MalikShortSource } from "@/lib/shorts/types"
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

/**
 * The eight destinations in the left rail.
 *
 * Every one of them opens something real. The rail used to hold five, and three
 * of those answered a click with a toast explaining why nothing had happened -
 * "Обзор использует ту же ленту", "Сохранённые уже записываются в библиотеку" -
 * while /api/shorts/library, /profile and /notifications sat there unused.
 */
type ShortsView = "foryou" | "explore" | "following" | "remix" | "live" | "library" | "profile"

type LibraryKind = "saved" | "liked" | "reposted" | "mine"

/** The flattened row shape /api/shorts/library and /api/shorts/profile return. */
type ShortCard = {
  id: string
  source: MalikShortSource
  sourceUrl?: string
  posterUrl?: string | null
  mediaUrl?: string | null
  caption?: string
  publishedAt?: string
  creator?: { userKey?: string; username?: string; displayName?: string; avatarUrl?: string | null; verified?: boolean }
  metrics: { views: number; likes: number; comments: number; reposts?: number; saves?: number; shares?: number }
}

type CreatorPanel = {
  profile: {
    userKey: string
    username: string
    displayName: string
    avatarUrl?: string | null
    bio?: string
    verified?: boolean
    followerCount?: number
    followingCount?: number
    postCount?: number
  }
  viewer?: { isSelf: boolean; following: boolean }
  posts: ShortCard[]
}

type ShortsNotification = {
  id: string
  type: string
  postId?: string | null
  read: boolean
  createdAt: string
  actor?: { username: string; displayName: string; avatarUrl?: string | null; verified?: boolean } | null
}

const NOTIFICATION_TEXT: Record<string, string> = {
  like: "лайкнул твой ролик",
  comment: "оставил комментарий",
  reply: "ответил на твой комментарий",
  follow: "подписался на тебя",
  repost: "сделал репост",
  save: "сохранил твой ролик",
  mention: "упомянул тебя",
}

const SOURCE_LABEL: Record<MalikShortSource, string> = {
  malik: "Malik Shorts",
  youtube: "YouTube",
  tiktok: "TikTok",
}

const SOURCE_NOTE: Record<MalikShortSource, string> = {
  malik: "Опубликовано в Malik Shorts",
  youtube: "Опубликовано в YouTube",
  tiktok: "Импортировано из TikTok",
}

/** The four tools beside the player, in the reference's own wording. */
const AI_TOOLS = [
  { id: "remix" as const, title: "AI Remix", note: "Создать ремикс этого видео", icon: Sparkles },
  { id: "describe" as const, title: "Генерация описания", note: "Пусть AI напишет за вас", icon: FileText },
  { id: "audio" as const, title: "Извлечь аудио", note: "Скачать трек из видео", icon: Music },
  { id: "similar" as const, title: "Создать похожее", note: "Сгенерировать новый ролик", icon: Images },
]

/**
 * Writes decoded PCM out as a WAV file.
 *
 * The audio is pulled off a Malik-hosted MP4 in the browser: fetch the file,
 * hand it to WebAudio's decodeAudioData - which decodes the audio track of a
 * container it understands - and re-encode the samples. No server, no ffmpeg,
 * and nothing leaves the machine. YouTube and TikTok are not touched by this:
 * taking their audio is against their terms, and the button says so instead of
 * failing quietly.
 */
function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const frames = buffer.length
  const bytes = 44 + frames * channels * 2
  const view = new DataView(new ArrayBuffer(bytes))

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, "RIFF")
  view.setUint32(4, bytes - 8, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, frames * channels * 2, true)

  const tracks = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index))
  let offset = 44
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      // Clamped before scaling: a sample above 1.0 would wrap to the opposite
      // extreme once it is written as a signed 16-bit integer, which is heard as
      // a click rather than as clipping.
      const sample = Math.max(-1, Math.min(1, tracks[channel][frame]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([view], { type: "audio/wav" })
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

type ToolId = (typeof AI_TOOLS)[number]["id"]

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

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/**
 * The player and its own control bar.
 *
 * The bar is real for both kinds of video, which is the only reason it exists:
 * a progress line that does not follow the video is worse than no progress line.
 * A Malik-hosted file is an ordinary <video>, so time comes from `timeupdate`.
 * A YouTube embed is driven through its IFrame API over postMessage - the
 * `listening` handshake makes the player send `infoDelivery` events carrying
 * currentTime and duration, and the same channel takes playVideo/pauseVideo/
 * seekTo back. YouTube's own controls are turned off because this bar replaces
 * them rather than sitting under them.
 */
function ShortPlayer({ item, active, muted, onToggleMuted }: {
  item: MalikShortItem
  active: boolean
  muted: boolean
  onToggleMuted: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(item.durationSeconds || 0)

  const isYouTube = item.playback.kind === "youtube"

  const post = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "https://www.youtube.com",
    )
  }, [])

  // ---- native ------------------------------------------------------------
  useEffect(() => {
    if (item.playback.kind !== "native") return
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    if (active) video.play().catch(() => {})
    else video.pause()
  }, [active, item.playback.kind, muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => { setCurrent(video.currentTime); setDuration(video.duration || 0) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener("timeupdate", onTime)
    video.addEventListener("durationchange", onTime)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    return () => {
      video.removeEventListener("timeupdate", onTime)
      video.removeEventListener("durationchange", onTime)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
    }
  }, [item.id, active])

  // ---- youtube -----------------------------------------------------------
  useEffect(() => {
    if (!isYouTube || !active) return
    const frame = frameRef.current
    if (!frame) return

    const handshake = () => frame.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: item.id, channel: "widget" }),
      "https://www.youtube.com",
    )
    const timer = window.setInterval(handshake, 1000)
    handshake()

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("youtube.com")) return
      let payload: any
      try { payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data } catch { return }
      const info = payload?.info
      if (!info) return
      if (typeof info.currentTime === "number") setCurrent(info.currentTime)
      if (typeof info.duration === "number" && info.duration > 0) setDuration(info.duration)
      // 1 is PLAYING in the IFrame API's state enum.
      if (typeof info.playerState === "number") setPlaying(info.playerState === 1)
    }
    window.addEventListener("message", onMessage)
    return () => { window.clearInterval(timer); window.removeEventListener("message", onMessage) }
  }, [isYouTube, active, item.id])

  useEffect(() => {
    if (!isYouTube) return
    post(muted ? "mute" : "unMute")
  }, [isYouTube, muted, post])

  const toggle = useCallback(() => {
    if (isYouTube) { post(playing ? "pauseVideo" : "playVideo"); setPlaying(!playing); return }
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [isYouTube, playing, post])

  const seek = useCallback((ratio: number) => {
    if (!duration) return
    const target = Math.max(0, Math.min(duration, ratio * duration))
    if (isYouTube) { post("seekTo", [target, true]); setCurrent(target); return }
    const video = videoRef.current
    if (video) video.currentTime = target
  }, [duration, isYouTube, post])

  const fullscreen = useCallback(() => {
    const node: HTMLElement | null = isYouTube ? frameRef.current : videoRef.current
    node?.requestFullscreen?.().catch(() => {})
  }, [isYouTube])

  const poster = item.posterUrl || (item.playback.kind === "youtube"
    ? `https://i.ytimg.com/vi/${encodeURIComponent(item.playback.videoId)}/hqdefault.jpg`
    : item.playback.kind === "native" ? item.playback.poster : undefined)

  const bar = (
    <div className={styles.playerBar}>
      <button type="button" className={styles.playerButton} aria-label={playing ? "Пауза" : "Воспроизвести"} onClick={toggle}>
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <div
        className={styles.progressTrack}
        role="slider"
        tabIndex={0}
        aria-label="Позиция в видео"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(current)}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          seek((event.clientX - box.left) / Math.max(1, box.width))
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") seek(Math.min(1, (current + 5) / Math.max(1, duration)))
          if (event.key === "ArrowLeft") seek(Math.max(0, (current - 5) / Math.max(1, duration)))
        }}
      >
        <span className={styles.progressFill} style={{ width: `${duration ? Math.min(100, (current / duration) * 100) : 0}%` }} />
      </div>
      <span className={styles.playerTime}>{formatTime(current)} / {formatTime(duration)}</span>
      <button type="button" className={styles.playerButton} aria-label="Во весь экран" onClick={fullscreen}>
        <Maximize2 size={14} />
      </button>
    </div>
  )

  if (!active && poster) {
    return <><img className={styles.poster} src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" />{bar}</>
  }

  if (item.playback.kind === "youtube") {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://malikaiworld.world"
    const params = new URLSearchParams({
      autoplay: active ? "1" : "0",
      mute: "1",
      playsinline: "1",
      // Off on purpose: the bar below replaces them, and two sets of controls
      // stacked on one video is how a player stops feeling like one product.
      controls: "0",
      enablejsapi: "1",
      rel: "0",
      loop: "1",
      playlist: item.playback.videoId,
      origin,
    })
    return (
      <>
        <iframe
          ref={frameRef}
          className={styles.videoFrame}
          src={`https://www.youtube.com/embed/${encodeURIComponent(item.playback.videoId)}?${params.toString()}`}
          title={item.caption || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {bar}
      </>
    )
  }

  return (
    <>
      <video
        ref={videoRef}
        className={styles.nativeVideo}
        src={item.playback.kind === "native" ? item.playback.url : undefined}
        poster={poster}
        muted={muted}
        playsInline
        loop
        preload={active ? "auto" : "metadata"}
        onClick={toggle}
        onDoubleClick={onToggleMuted}
      />
      {bar}
    </>
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

/**
 * A grid of shorts. Explore, Library and Profile all show the same thing - a
 * wall of videos with their real counts - so they share one renderer rather
 * than three that drift apart.
 */
/** The feed's rich item, flattened to the card shape the grids take. */
function toCard(item: MalikShortItem): ShortCard {
  return {
    id: item.id,
    source: item.source,
    sourceUrl: item.sourceUrl,
    posterUrl: item.posterUrl || (item.playback.kind === "youtube"
      ? `https://i.ytimg.com/vi/${encodeURIComponent(item.playback.videoId)}/hqdefault.jpg`
      : item.playback.kind === "native" ? item.playback.poster : undefined),
    caption: item.caption,
    publishedAt: item.publishedAt,
    creator: {
      userKey: item.creator.id,
      username: item.creator.username,
      displayName: item.creator.displayName,
      avatarUrl: item.creator.avatarUrl,
      verified: item.creator.verified,
    },
    metrics: item.metrics,
  }
}

function ShortGrid({ items, empty, onOpen }: {
  items: ShortCard[]
  empty: React.ReactNode
  onOpen: (item: ShortCard) => void
}) {
  if (!items.length) return <div className={styles.gridEmpty}>{empty}</div>
  return (
    <div className={styles.cardGrid}>
      {items.map((item) => (
        <button key={item.id} type="button" className={styles.card} onClick={() => onOpen(item)}>
          <span className={styles.cardMedia}>
            {item.posterUrl
              ? <img src={item.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              : <span className={styles.cardBlank}><Video size={20} /></span>}
            <span className={styles.cardViews}><Play size={10} fill="currentColor" />{compact(item.metrics.views)}</span>
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardCaption}>{item.caption || "Без описания"}</span>
            <span className={styles.cardMeta}>
              @{item.creator?.username || "malik"} · <Heart size={10} /> {compact(item.metrics.likes)}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The platform marks, drawn.
 *
 * These were the letters "YT" and "TT" in a coloured square, which is a
 * placeholder wearing a logo's clothes: at a glance it reads as a bug, not as
 * YouTube. The real shapes are two paths and they are what people recognise.
 */
function MalikMark() {
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label="Malik Shorts" focusable="false">
      <rect width="512" height="512" rx="112" fill="#f7f7f7" />
      <path d="M100 324 233 137v187H100Z" fill="#050505" />
      <path d="M263 137h128L263 327V137Z" fill="#050505" />
    </svg>
  )
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 28 20" role="img" aria-label="YouTube" focusable="false">
      <path
        d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9Z"
        fill="#fb0219"
      />
      <path d="M11.2 14.3 18.5 10l-7.3-4.3v8.6Z" fill="#fff" />
    </svg>
  )
}

function TikTokMark() {
  return (
    <svg viewBox="0 0 24 28" role="img" aria-label="TikTok" focusable="false">
      <path d="M16.6 0h4.5a7.5 7.5 0 0 0 6.9 6.7v4.5a12 12 0 0 1-6.9-2.3v9.4A9.9 9.9 0 1 1 11.2 8.4v4.7a5.3 5.3 0 1 0 5.4 5.3V0Z" fill="currentColor" transform="translate(-2)" />
    </svg>
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

  // ---- the seven real destinations -------------------------------------
  const [view, setView] = useState<ShortsView>("foryou")
  const [libraryKind, setLibraryKind] = useState<LibraryKind>("saved")
  const [libraryItems, setLibraryItems] = useState<ShortCard[]>([])
  const [libraryState, setLibraryState] = useState<"idle" | "loading" | "auth" | "nodb" | "ready">("idle")
  const [me, setMe] = useState<CreatorPanel | null>(null)
  const [meState, setMeState] = useState<"idle" | "loading" | "auth" | "nodb" | "ready">("idle")
  const [notifications, setNotifications] = useState<ShortsNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [creator, setCreator] = useState<CreatorPanel | null>(null)
  const [creatorBusy, setCreatorBusy] = useState(false)
  const [tool, setTool] = useState<{ title: string; body: string; busy: boolean } | null>(null)
  const [liveReady, setLiveReady] = useState<boolean | null>(null)
  const [liveRooms, setLiveRooms] = useState<Array<{ id: string; title?: string; host?: string; viewers?: number; status?: string }>>([])
  const [remix, setRemix] = useState<{ busy: boolean; body: string; error: string | null }>({ busy: false, body: "", error: null })
  const [following, setFollowing] = useState<Array<{ userKey: string; username: string; displayName: string; avatarUrl?: string | null; verified?: boolean }>>([])

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

  /* ------------------------------------------------ the real destinations */

  const loadLibrary = useCallback(async (kind: LibraryKind) => {
    setLibraryState("loading")
    try {
      const response = await fetch(`/api/shorts/library?kind=${kind}`, { cache: "no-store" })
      if (response.status === 401) { setLibraryState("auth"); setLibraryItems([]); return }
      if (response.status === 503) { setLibraryState("nodb"); setLibraryItems([]); return }
      const json = await response.json().catch(() => null)
      setLibraryItems(Array.isArray(json?.items) ? json.items : [])
      setLibraryState("ready")
    } catch {
      setLibraryItems([])
      setLibraryState("ready")
      notify("Библиотека сейчас недоступна")
    }
  }, [notify])

  const loadMe = useCallback(async () => {
    setMeState("loading")
    try {
      const response = await fetch("/api/shorts/profile", { cache: "no-store" })
      if (response.status === 401) { setMeState("auth"); return }
      if (response.status === 503) { setMeState("nodb"); return }
      const json = await response.json().catch(() => null)
      if (!json?.profile) { setMeState("nodb"); return }
      setMe({ profile: json.profile, viewer: json.viewer, posts: Array.isArray(json.posts) ? json.posts : [] })
      setMeState("ready")
    } catch {
      setMeState("nodb")
    }
  }, [])

  /**
   * Notifications, polled.
   *
   * Sixty seconds, and only while the tab is visible: a shorts feed is left open
   * in a background tab for hours, and a badge nobody is looking at is not worth
   * a request a second. `document.hidden` is checked at fire time rather than
   * subscribed to, so the interval survives tab switching without being torn
   * down and rebuilt.
   */
  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/shorts/notifications?limit=40", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json().catch(() => null)
      if (!json) return
      setNotifications(Array.isArray(json.items) ? json.items : [])
      setUnread(Number(json.unread || 0))
    } catch {
      /* a failed poll is not worth a toast; the next one will do */
    }
  }, [])

  useEffect(() => {
    loadNotifications()
    const timer = window.setInterval(() => {
      if (!document.hidden) loadNotifications()
    }, 60_000)
    const onVisible = () => { if (!document.hidden) loadNotifications() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loadNotifications])

  const loadFollowing = useCallback(async () => {
    try {
      const response = await fetch("/api/shorts/following?limit=24", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json().catch(() => null)
      setFollowing(Array.isArray(json?.items) ? json.items : [])
    } catch {
      /* the rail simply stays as it is */
    }
  }, [])

  useEffect(() => { loadFollowing() }, [loadFollowing])

  /**
   * Live is only offered when the server says it can actually carry an
   * broadcast. The endpoint reports whether segment storage and the transport
   * tables are configured, so the screen states the missing piece by name
   * instead of letting someone press "go live" into nothing.
   */
  useEffect(() => {
    // Also on mount, not only inside the Live view: the rail marks a followed
    // author who is broadcasting, and it cannot do that without the list.
    let cancelled = false
    fetch("/api/shorts/live", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((json) => {
        if (cancelled) return
        // The route reports `persistence: false` when the Shorts tables are not
        // reachable; a live session cannot be recorded without them.
        setLiveReady(json?.persistence !== false)
        setLiveRooms((Array.isArray(json?.items) ? json.items : []).map((row: any) => ({
          id: String(row.id),
          title: row.title || "",
          host: row.malik_shorts_profiles?.username || "",
          viewers: Number(row.viewer_count || 0),
          status: row.status,
        })))
      })
      .catch(() => { if (!cancelled) { setLiveReady(false); setLiveRooms([]) } })
    return () => { cancelled = true }
  }, [view])

  const markInboxRead = useCallback(async () => {
    if (!unread) return
    setUnread(0)
    setNotifications((items) => items.map((item) => ({ ...item, read: true })))
    await fetch("/api/shorts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null)
  }, [unread])

  useEffect(() => { if (view === "library") loadLibrary(libraryKind) }, [view, libraryKind, loadLibrary])
  useEffect(() => { if (view === "profile" && meState === "idle") loadMe() }, [view, meState, loadMe])

  const goto = useCallback((next: ShortsView) => {
    setView(next)
    if (next === "foryou" || next === "following") {
      setFeedMode(next)
      window.setTimeout(() => feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0)
    }
  }, [])

  useEffect(() => {
    const short = feed.find((item) => item.id === activeId)
    if (!short || seenRef.current.has(short.id) || !isUuid(short.id)) return
    const timer = window.setTimeout(() => {
      seenRef.current.add(short.id)
      interaction(short, "view")
    }, 850)
    return () => window.clearTimeout(timer)
  }, [activeId, feed, interaction])

  const matchesSearch = useCallback((item: MalikShortItem) => {
    const q = search.trim().toLocaleLowerCase()
    if (!q) return true
    return `${item.caption} ${item.creator.displayName} ${item.creator.username} ${item.hashtags.join(" ")}`
      .toLocaleLowerCase().includes(q)
  }, [search])

  const filteredFeed = useMemo(() => {
    let items = feed
    if (feedMode === "following") items = items.filter((item) => item.viewer.following || item.creator.id === profile?.userKey)
    return items.filter(matchesSearch)
  }, [feed, feedMode, matchesSearch, profile?.userKey])

  // Explore is the whole catalogue, not the current tab's slice: arriving there
  // from "Подписки" and seeing only followed authors would make it a second copy
  // of the tab you just left.
  const exploreItems = useMemo(() => feed.filter(matchesSearch), [feed, matchesSearch])

  const toggleLike = async (short: MalikShortItem) => interaction(short, short.viewer.liked ? "unlike" : "like")
  const toggleSave = async (short: MalikShortItem) => interaction(short, short.viewer.saved ? "unsave" : "save")
  const toggleRepost = async (short: MalikShortItem) => interaction(short, short.viewer.reposted ? "unrepost" : "repost")
  // Following changes the rail, so the rail is reloaded rather than left showing
  // an author the viewer has just dropped.
  const toggleFollow = useCallback(async (short: MalikShortItem) => {
    const result = await interaction(short, short.viewer.following ? "unfollow" : "follow")
    if (result) loadFollowing()
    return result
  }, [interaction, loadFollowing])

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

  const activeShort = useMemo(() => feed.find((item) => item.id === activeId) || null, [feed, activeId])

  /**
   * Who to draw on the profile screen.
   *
   * /api/shorts/profile answers 503 when the Shorts tables are not configured,
   * and the screen printed that as a sentence about a database - to a signed-in
   * user looking at their own page. But identity never came from those tables:
   * /api/shorts/me already returns the WorkOS name, handle and avatar with
   * `persistence: false`, and the right rail has been drawing it all along. So
   * the profile falls back to the same object the rail uses, and only the parts
   * that genuinely need storage - published videos, counters - stay empty.
   */
  const profileView = me?.profile || profile

  /**
   * The author of whatever is on screen, loaded as it changes.
   *
   * No new endpoint was needed: the feed already materialises every YouTube
   * channel it shows into malik_shorts_profiles under `youtube:<channelId>`, so
   * /api/shorts/profile?userKey= answers for an imported creator exactly as it
   * does for a Malik one.
   */
  useEffect(() => {
    const key = activeShort?.creator.id
    if (!key) { setCreator(null); return }
    let cancelled = false
    setCreatorBusy(true)
    fetch(`/api/shorts/profile?userKey=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (cancelled) return
        setCreator(json?.profile
          ? { profile: json.profile, viewer: json.viewer, posts: Array.isArray(json.posts) ? json.posts : [] }
          : null)
      })
      .catch(() => { if (!cancelled) setCreator(null) })
      .finally(() => { if (!cancelled) setCreatorBusy(false) })
    return () => { cancelled = true }
  }, [activeShort?.creator.id])

  /**
   * AI Remix: a real plan for a real video, written against the one on screen.
   *
   * It goes to /api/ai/chat - the same model router the rest of Malik AI uses -
   * and shows what came back. Rights are checked first: a source that forbids
   * derivative work is told so rather than quietly remixed.
   */
  const runRemix = useCallback(async (short: MalikShortItem) => {
    if (!short.rights.canRemix) {
      setRemix({ busy: false, body: "", error: `Автор или площадка ${SOURCE_LABEL[short.source]} не разрешают ремиксы этого ролика.` })
      return
    }
    setRemix({ busy: true, body: "", error: null })
    const prompt = [
      `Исходный ролик: «${short.caption || "без описания"}»`,
      `Автор: ${short.creator.displayName} (@${short.creator.username})`,
      short.hashtags.length ? `Хэштеги: ${short.hashtags.map((tag) => `#${tag}`).join(" ")}` : "",
      "",
      "Сделай план ремикса этого вертикального ролика для Malik Shorts:",
      "1. Идея в одну строку — чем твой ремикс отличается от оригинала.",
      "2. Первая фраза, которая удержит зрителя в первые 2 секунды.",
      "3. Раскадровка: 3–4 сцены с таймингом, укладывающиеся в 30 секунд.",
      "4. Текст озвучки целиком.",
      "5. 6 хэштегов.",
      "Пиши по-русски, коротко и конкретно. Не выдумывай фактов, которых нет в описании выше, и не обещай того, чего в кадре не будет.",
    ].filter(Boolean).join("\n")

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, message: prompt }),
      })
      if (response.status === 401) { window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`); return }
      const json = await response.json().catch(() => null)
      const content = String(json?.content || json?.text || "").trim()
      if (!response.ok || !content) throw new Error(json?.error || json?.message || "Пустой ответ модели")
      setRemix({ busy: false, body: content, error: null })
    } catch (error) {
      setRemix({ busy: false, body: "", error: error instanceof Error ? error.message : "Не удалось получить ремикс" })
    }
  }, [])

  /**
   * The tools run against the real model router, the same one the rest of the
   * app uses, and show what it actually returned. Nothing here pretends to have
   * done work the server did not do.
   */
  const runTool = useCallback(async (id: ToolId, short: MalikShortItem) => {
    if (id === "remix") { goto("remix"); void runRemix(short); return }

    if (id === "audio") {
      if (short.playback.kind !== "native") {
        notify(`Правила ${SOURCE_LABEL[short.source]} запрещают выгружать звук из чужих роликов. Работает для видео, опубликованных в Malik Shorts.`)
        return
      }
      if (!short.rights.canDownload) {
        notify("Автор не разрешил выгрузку этого ролика")
        return
      }
      setTool({ title: "Извлечь аудио", body: "Достаю звук из видео…", busy: true })
      try {
        const response = await fetch(short.playback.url)
        if (!response.ok) throw new Error(`Видео недоступно (HTTP ${response.status})`)
        const bytes = await response.arrayBuffer()
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) throw new Error("Браузер не умеет декодировать аудио")
        const context = new AudioCtx()
        const decoded = await context.decodeAudioData(bytes)
        await context.close().catch(() => {})
        saveBlob(encodeWav(decoded), `malik-shorts-${short.id}.wav`)
        const seconds = Math.round(decoded.duration)
        setTool({ title: "Извлечь аудио", body: `Готово. Трек ${seconds} сек., ${decoded.sampleRate} Гц — файл сохранён на устройство.`, busy: false })
      } catch (error) {
        setTool({
          title: "Извлечь аудио",
          body: error instanceof Error ? `Не получилось: ${error.message}` : "Не удалось извлечь звук",
          busy: false,
        })
      }
      return
    }

    const title = id === "describe" ? "Описание для ролика" : "Идея похожего ролика"
    const context = [
      `Автор: ${short.creator.displayName} (@${short.creator.username})`,
      short.caption ? `Текущее описание: ${short.caption}` : "",
      short.hashtags.length ? `Хэштеги: ${short.hashtags.map((tag) => `#${tag}`).join(" ")}` : "",
      `Площадка: ${SOURCE_LABEL[short.source]}`,
    ].filter(Boolean).join("\n")

    const prompt = id === "describe"
      ? `${context}\n\nНапиши для этого вертикального ролика короткое описание на русском: 1–2 живые строки без канцелярита и без обещаний, которых в видео нет, затем 5–8 релевантных хэштегов отдельной строкой. Не выдумывай факты, которых нет в описании выше.`
      : `${context}\n\nПридумай похожий вертикальный ролик для этого автора: одна строка идеи, раскадровка на 3 сцены с таймингом до 30 секунд, первая фраза для захвата внимания и 5 хэштегов. Коротко и конкретно.`

    setTool({ title, body: "", busy: true })
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, message: prompt }),
      })
      if (response.status === 401) {
        setTool(null)
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)
        return
      }
      const json = await response.json().catch(() => null)
      const content = String(json?.content || json?.text || "").trim()
      if (!response.ok || !content) throw new Error(json?.error || json?.message || "Пустой ответ")
      setTool({ title, body: content, busy: false })
    } catch (error) {
      setTool({ title, body: error instanceof Error ? error.message : "Не удалось получить ответ", busy: false })
    }
  }, [goto, notify, runRemix])

  /** The rail from the reference, in its order. Every entry goes somewhere. */
  const navItems = [
    { id: "foryou", label: "Для вас", icon: Home },
    { id: "explore", label: "Обзор", icon: Compass },
    { id: "following", label: "Подписки", icon: Users },
    { id: "remix", label: "AI Remix", icon: Sparkles, badge: "New" },
    { id: "live", label: "Malik Live", icon: Radio },
    { id: "create", label: "Создать", icon: Plus },
    { id: "library", label: "Библиотека", icon: Library },
    { id: "profile", label: "Профиль", icon: User },
  ] as const

  const handleNav = (id: string) => {
    if (id === "create") { setCreateOpen(true); return }
    goto(id as ShortsView)
  }

  return (
    <div className={styles.root}>
      <aside className={styles.left} aria-label="Malik Shorts">
        {/* Shorts takes the whole screen — it is fixed and covers the dashboard —
            so without this there is no way back to the rest of Malik AI except
            the browser's own back button. It sits above the brand and is styled
            to be seen rather than found. */}
        <a className={styles.backHome} href="/dashboard">
          <ArrowLeft size={15} />
          <span>Вернуться в Malik AI</span>
        </a>

        <div className={styles.brandRow}>
          <a className={styles.brand} href="/shorts" aria-label="Malik Shorts">
            <span className={styles.mark} />
            <span className={styles.brandText}>
              <span className={styles.brandMain}>Malik Shorts</span>
              <span className={styles.brandSub}>Больше, чем короткие видео</span>
            </span>
          </a>
          <button
            type="button"
            className={styles.iconPill}
            aria-label={unread ? `Уведомления, непрочитанных ${unread}` : "Уведомления"}
            onClick={() => { setInboxOpen(true); markInboxRead() }}
          >
            <Bell size={15} />
            {unread ? <span className={styles.dot} data-preserve-brand-color="true" /> : null}
          </button>
        </div>

        <label className={styles.railSearch}>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim()) setView("explore") }}
            placeholder="Поиск видео, авторов, тем…"
            aria-label="Поиск в Malik Shorts"
          />
          <kbd>⌘K</kbd>
        </label>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.id !== "create" && view === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navButton} ${active ? styles.navButtonActive : ""}`}
                onClick={() => handleNav(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={styles.navIcon} /> <span>{item.label}</span>
                {"badge" in item && item.badge ? <em className={styles.navBadge} data-preserve-brand-color="true">{item.badge}</em> : null}
              </button>
            )
          })}
        </nav>

        <button type="button" className={styles.proCard} onClick={() => notify("Malik AI Pro открывает все модели и снимает дневные лимиты")}>
          <span className={styles.proIcon} data-preserve-brand-color="true"><Crown size={16} className={styles.crown} fill="currentColor" strokeWidth={1.2} /></span>
          <span>
            <strong>Malik AI Pro</strong>
            <small>Больше возможностей для твоего контента</small>
          </span>
          <ChevronRight size={16} />
        </button>

        <div className={styles.railSection}>
          <span>Подписки</span>
          <button type="button" onClick={() => goto("following")}>Все</button>
        </div>

        <div className={styles.subsList}>
          {following.slice(0, 6).map((item) => (
            <button
              key={item.userKey}
              type="button"
              className={styles.subsItem}
              onClick={() => { goto("foryou"); const match = feed.find((short) => short.creator.id === item.userKey); if (match) setActiveId(match.id) }}
            >
              <Avatar src={item.avatarUrl} name={item.displayName} className={styles.avatarSmall} />
              <span className={styles.subsName}>{item.displayName}</span>
              {item.verified ? <span className={styles.verified} data-preserve-brand-color="true"><Check size={9} /></span> : null}
              {liveRooms.some((room) => room.host === item.username) ? <span className={styles.liveDot} data-preserve-brand-color="true" title="В эфире" /> : null}
            </button>
          ))}
          {following.length > 6 ? (
            <button type="button" className={styles.subsItem} onClick={() => goto("following")}>
              <span className={styles.subsMore}><MoreHorizontal size={15} /></span>
              <span className={styles.subsName}>Ещё каналы</span>
            </button>
          ) : null}
          {!following.length ? <span className={styles.subsEmpty}>Подписки появятся здесь, как только подпишешься на автора.</span> : null}
        </div>

        <div className={styles.leftFooter}>
          <button type="button" className={styles.profileButton} onClick={() => goto("profile")}>
            <Avatar src={profile?.avatarUrl} name={profile?.displayName || "Malik"} className={styles.avatar} />
            <span className={styles.profileMeta}>
              <span className={styles.profileName}>{profile?.displayName || "Malik AI"}</span>
              <span className={styles.profileHandle}>@{profile?.username || "malik"}</span>
            </span>
          </button>
        </div>
      </aside>

      <main className={styles.center}>
        {view === "foryou" || view === "following" ? (
          <div className={styles.topbar}>
            <button type="button" className={`${styles.feedTab} ${view === "following" ? styles.feedTabActive : ""}`} onClick={() => goto("following")}>Подписки</button>
            <button type="button" className={`${styles.feedTab} ${view === "foryou" ? styles.feedTabActive : ""}`} onClick={() => goto("foryou")}>Для вас</button>
          </div>
        ) : null}

        <div ref={feedRef} className={styles.feed} hidden={view !== "foryou" && view !== "following"}>
          {loading ? (
            <div className={styles.loading}><div className={styles.loader} /></div>
          ) : filteredFeed.length ? filteredFeed.map((short) => {
            const active = short.id === activeId
            const stats = externalSummary(short)
            return (
              <article key={short.id} className={styles.shortWrap} data-short-id={short.id}>
                <div className={styles.shortShell}>
                  <section className={styles.videoCard}>
                    {/* The action rail sits inside the frame, over the video, the
                        way the reference has it - beside the card it read as a
                        toolbar for the page rather than for this video. */}
                    <ShortPlayer item={short} active={active} muted={muted} onToggleMuted={() => setMuted((value) => !value)} />
                    <div className={styles.posterShade} />
                    <div className={styles.videoTop}>
                      <span className={styles.malikBadge} data-source={short.source}>
                        <span className={styles.sourceDot} data-source={short.source} data-preserve-brand-color="true">
                          {short.source === "youtube" ? <YouTubeMark /> : short.source === "tiktok" ? <TikTokMark /> : <MalikMark />}
                        </span>
                        {SOURCE_NOTE[short.source]}
                      </span>
                      <button
                        type="button"
                        className={styles.muteButton}
                        aria-label={muted ? "Включить звук" : "Выключить звук"}
                        onClick={() => setMuted((value) => !value)}
                      >
                        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                    </div>
                    <div className={styles.videoMeta}>
                      <div className={styles.creatorLine}>
                        <Avatar src={short.creator.avatarUrl} name={short.creator.displayName} className={styles.metaAvatar} />
                        <span className={styles.creatorBlock}>
                          <span className={styles.creatorTop}>
                            <strong className={styles.creatorName}>{short.creator.displayName}</strong>
                            {short.creator.verified ? <span className={styles.verified} data-preserve-brand-color="true"><Check size={9} /></span> : null}
                          </span>
                          <span className={styles.creatorHandle}>@{short.creator.username}</span>
                        </span>
                        {short.creator.id !== profile?.userKey ? (
                          <button type="button" className={styles.subscribeBtn} onClick={() => toggleFollow(short)}>
                            {short.viewer.following ? "Вы подписаны" : "Подписаться"}
                          </button>
                        ) : null}
                      </div>
                      <div className={styles.caption}>{short.caption}</div>
                      {short.hashtags.length ? (
                        <div className={styles.tags} data-preserve-brand-color="true">
                          {short.hashtags.slice(0, 6).map((tag) => <span key={tag}>#{tag}</span>)}
                        </div>
                      ) : null}
                      {stats ? <div className={styles.externalStats}>{stats}</div> : null}
                      <div className={styles.soundRow}>
                        <Music size={12} />
                        <span>Оригинальный звук — {short.creator.displayName}</span>
                      </div>
                    </div>
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
                    <Action icon={<MoreHorizontal size={22} />} label="Ещё" onClick={() => askMalik(short)} />
                  </aside>
                  </section>
                </div>
                <div className={styles.runtimeNote}>
                  <span className={styles.runtimeDot} /> Malik Shorts · Desktop · Runtime
                </div>
              </article>
            )
          }) : (
            /* An empty feed has two different causes and they need different
               sentences. With storage connected it means nobody has posted yet,
               and «Создать ролик» is the answer. Without it the upload dialog
               would fail on submit, so offering that button is a dead end - the
               honest line is that no video source is connected, which is a
               deployment setting and not something the viewer can fix here. */
            <div className={styles.empty}>
              <div className={styles.emptyBox}>
                <div className={styles.emptyTitle}>{feedMode === "following"
                  ? "Подпишись на авторов — и они появятся здесь"
                  : liveReady === false ? "Источник видео не подключён" : "Лента готова к первому ролику"}</div>
                <div className={styles.emptyText}>{liveReady === false
                  ? "Лента наполняется из подключённых источников. Пока ни один не настроен, показывать нечего — интерфейс при этом работает целиком."
                  : "Создай или загрузи видео. Malik Shorts не требует отдельной регистрации: используется твой аккаунт Malik AI."}</div>
                {liveReady === false ? (
                  <button type="button" className={styles.connectButton} onClick={() => loadFeed()}>Обновить ленту</button>
                ) : (
                  <button type="button" className={styles.connectButton} onClick={() => setCreateOpen(true)}>Создать ролик</button>
                )}
              </div>
            </div>
          )}
        </div>

        {view === "explore" ? (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2>Обзор</h2>
                <p>{search.trim()
                  ? `Найдено по запросу «${search.trim()}»`
                  : "Всё, что сейчас в ленте Malik Shorts — сеткой, а не по одному ролику."}</p>
              </div>
              <span className={styles.panelCount}>{exploreItems.length}</span>
            </header>
            <ShortGrid
              items={exploreItems.map(toCard)}
              empty={search.trim()
                ? <>По запросу «{search.trim()}» ничего не нашлось. Попробуй имя автора или хэштег.</>
                : <>Лента пуста. Загрузи первый ролик — он появится и здесь.</>}
              onOpen={(item) => { goto("foryou"); setActiveId(item.id) }}
            />
          </section>
        ) : null}

        {view === "remix" ? (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2>AI Remix</h2>
                <p>{activeShort
                  ? `Ремикс ролика @${activeShort.creator.username} — идея, крючок, раскадровка и озвучка.`
                  : "Открой ленту и выбери ролик — ремикс делается для конкретного видео."}</p>
              </div>
              {activeShort ? (
                <button type="button" className={styles.connectButton} style={{ width: "auto", marginTop: 0 }} disabled={remix.busy} onClick={() => runRemix(activeShort)}>
                  {remix.busy ? "Думаю…" : remix.body ? "Другой вариант" : "Сделать ремикс"}
                </button>
              ) : null}
            </header>

            {activeShort ? (
              <div className={styles.remixSource}>
                <span className={styles.sourceMark} data-source={activeShort.source} data-preserve-brand-color="true">
                  {activeShort.source === "youtube" ? <YouTubeMark /> : activeShort.source === "tiktok" ? <TikTokMark /> : <MalikMark />}
                </span>
                <span>
                  <b>{activeShort.caption || "Без описания"}</b>
                  <small>@{activeShort.creator.username} · {SOURCE_LABEL[activeShort.source]}</small>
                </span>
              </div>
            ) : null}

            {remix.busy ? <div className={styles.loading} style={{ minHeight: 200 }}><div className={styles.loader} /></div>
              : remix.error ? <div className={styles.gridEmpty}>{remix.error}</div>
                : remix.body ? (
                  <>
                    <div className={styles.remixBody}>{remix.body}</div>
                    <div className={styles.remixActions}>
                      <button type="button" className={styles.connectButton} style={{ width: "auto", marginTop: 0 }} onClick={() => { prefillPrompt(remix.body); setCreateOpen(true) }}>
                        Снять по этому плану
                      </button>
                      <button type="button" className={styles.secondaryButton} style={{ width: "auto", marginTop: 0 }} onClick={() => {
                        navigator.clipboard?.writeText(remix.body).then(() => notify("Скопировано"), () => notify("Буфер обмена недоступен"))
                      }}>Скопировать</button>
                    </div>
                  </>
                ) : !activeShort ? (
                  <div className={styles.gridEmpty}>Ремикс строится по конкретному ролику. Вернись в ленту, выбери видео и нажми «AI Remix».</div>
                ) : null}
          </section>
        ) : null}

        {view === "live" ? (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2>Malik Live</h2>
                <p>Прямые эфиры Malik Shorts: камера пишется сегментами и раздаётся зрителям через твой CDN.</p>
              </div>
              <span className={`${styles.liveState} ${liveReady ? styles.liveOn : ""}`}>
                {liveReady === null ? "проверяю" : liveReady ? "готово" : "не настроено"}
              </span>
            </header>

            {liveReady === false ? (
              <div className={styles.gridEmpty}>
                Прямые эфиры требуют хранилища для сегментов. В Render нужны{" "}
                <code>MALIK_SHORTS_S3_*</code> и <code>MALIK_SHORTS_PUBLIC_CDN_URL</code>, а также применённая
                миграция <code>malik_shorts_live_transport_v3.sql</code>. Вход остаётся через WorkOS — отдельная регистрация не нужна.
              </div>
            ) : (
              <>
                <div className={styles.liveGrid}>
                  <a className={styles.liveTile} href="/shorts/live/room">
                    <span className={styles.toolIcon}><Camera size={18} /></span>
                    <span><strong>Выйти в эфир</strong><small>Камера, микрофон и запись сегментами</small></span>
                    <ChevronRight size={15} />
                  </a>
                  <div className={styles.liveTile}>
                    <span className={styles.toolIcon}><Radio size={18} /></span>
                    <span><strong>Идущие эфиры</strong><small>{liveRooms.length ? `Сейчас в эфире: ${liveRooms.length}` : "Сейчас никого нет в эфире"}</small></span>
                  </div>
                </div>
                {liveRooms.length ? (
                  <div className={styles.cardGrid} style={{ marginTop: 18 }}>
                    {liveRooms.map((room) => (
                      <a key={room.id} className={styles.card} href={`/shorts/live/room?id=${encodeURIComponent(room.id)}`}>
                        <span className={styles.cardMedia}>
                          <span className={styles.cardBlank}><Radio size={20} /></span>
                          <span className={styles.cardViews}><Radio size={9} />{compact(room.viewers)}</span>
                        </span>
                        <span className={styles.cardBody}>
                          <span className={styles.cardCaption}>{room.title || "Эфир"}</span>
                          <span className={styles.cardMeta}>@{room.host || "malik"}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                ) : liveReady ? <div className={styles.gridEmpty}>Сейчас никто не в эфире. Нажми «Выйти в эфир» — и ты будешь первым.</div> : null}
              </>
            )}
          </section>
        ) : null}

        {view === "library" ? (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <h2>Библиотека</h2>
                <p>Всё, что ты сохранил, лайкнул, репостнул и опубликовал.</p>
              </div>
            </header>
            <div className={styles.tabRow}>
              {([["saved", "Сохранённые"], ["liked", "Понравившиеся"], ["reposted", "Репосты"], ["mine", "Мои ролики"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.tab} ${libraryKind === id ? styles.tabActive : ""}`}
                  onClick={() => setLibraryKind(id)}
                >{label}</button>
              ))}
            </div>
            {libraryState === "loading" ? <div className={styles.loading}><div className={styles.loader} /></div>
              : libraryState === "auth" ? (
                <div className={styles.gridEmpty}>
                  Библиотека привязана к аккаунту.{" "}
                  <button type="button" className={styles.linkButton} onClick={() => window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)}>Войти</button>
                </div>
              ) : libraryState === "nodb" ? (
                <div className={styles.gridEmpty}>База Malik Shorts не подключена, поэтому сохранять пока некуда.</div>
              ) : (
                <ShortGrid
                  items={libraryItems}
                  empty={libraryKind === "mine"
                    ? <>Ты ещё ничего не опубликовал. Нажми «Создать».</>
                    : <>Здесь пусто. Сохраняй ролики закладкой — они появятся тут.</>}
                  onOpen={(item) => { goto("foryou"); setActiveId(item.id) }}
                />
              )}
          </section>
        ) : null}

        {view === "profile" ? (
          <section className={styles.panel}>
            {meState === "loading" ? <div className={styles.loading}><div className={styles.loader} /></div>
              : meState === "auth" ? (
                <div className={styles.gridEmpty}>
                  Профиль привязан к аккаунту Malik AI.{" "}
                  <button type="button" className={styles.linkButton} onClick={() => window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/shorts")}`)}>Войти</button>
                </div>
              ) : !profileView ? (
                <div className={styles.gridEmpty}>Профиль не загрузился. Обнови страницу.</div>
              ) : (
                <>
                  <header className={styles.profileHead}>
                    <Avatar src={profileView.avatarUrl} name={profileView.displayName} className={styles.profileBig} />
                    <div className={styles.profileHeadBody}>
                      <div className={styles.profileHeadName}>
                        <h2>{profileView.displayName}</h2>
                        {profileView.verified ? <span className={styles.verified} data-preserve-brand-color="true"><Check size={11} /></span> : null}
                      </div>
                      <div className={styles.profileHandle}>@{profileView.username}</div>
                      <div className={styles.statRow}>
                        <span><b>{compact(profileView.postCount)}</b>Видео</span>
                        <span><b>{compact(profileView.followerCount)}</b>Подписчики</span>
                        <span><b>{compact(profileView.followingCount)}</b>Подписки</span>
                      </div>
                      {profileView.bio ? <p className={styles.profileBio}>{profileView.bio}</p> : null}
                    </div>
                  </header>
                  <ShortGrid
                    items={me?.posts || []}
                    empty={me
                      ? <>Ты ещё ничего не опубликовал. Нажми «Создать» — ролик появится здесь.</>
                      : <>Публикация роликов включится, когда будет подключено хранилище Malik Shorts. Профиль и лента работают уже сейчас.</>}
                    onOpen={(item) => { goto("foryou"); setActiveId(item.id) }}
                  />
                </>
              )}
          </section>
        ) : null}

        <a className={styles.backHomeMobile} href="/dashboard" aria-label="Вернуться в Malik AI">
          <ArrowLeft size={15} /> Malik AI
        </a>

        <nav className={styles.mobileNav} aria-label="Навигация Malik Shorts">
          <button type="button" className={`${styles.mobileNavButton} ${view === "foryou" ? styles.mobileNavActive : ""}`} onClick={() => goto("foryou")}><Home /><span>Главная</span></button>
          <button type="button" className={`${styles.mobileNavButton} ${view === "following" ? styles.mobileNavActive : ""}`} onClick={() => goto("following")}><Users /><span>Подписки</span></button>
          <button type="button" className={styles.mobileNavButton} onClick={() => setCreateOpen(true)}><span className={styles.mobileCreate}><Plus size={21} /></span><span>Создать</span></button>
          <button type="button" className={styles.mobileNavButton} onClick={() => { setInboxOpen(true); markInboxRead() }}><Bell />{unread ? <em className={styles.mobileDot} /> : null}<span>Входящие</span></button>
          <button type="button" className={`${styles.mobileNavButton} ${view === "profile" ? styles.mobileNavActive : ""}`} onClick={() => goto("profile")}><User /><span>Профиль</span></button>
        </nav>
      </main>

      <aside className={styles.right}>
        {/* Everything here follows whatever is on screen. Scroll the feed and the
            author card, the source and the quick actions change with it - that is
            the whole point of a rail beside a player rather than under it. */}
        <div className={styles.rightTop}>
          <button type="button" className={styles.proPill} data-preserve-brand-color="true" onClick={() => notify("Malik AI Pro открывает все модели и снимает дневные лимиты")}>
            <Crown size={14} className={styles.crown} fill="currentColor" strokeWidth={1.2} /> Malik AI Pro
          </button>
          <button type="button" className={styles.ghostPill} onClick={() => window.open("/", "_self")}>
            <Download size={14} /> Скачать App
          </button>
          <button
            type="button"
            className={styles.iconPill}
            aria-label={unread ? `Уведомления, непрочитанных ${unread}` : "Уведомления"}
            onClick={() => { setInboxOpen((open) => !open); if (!inboxOpen) markInboxRead() }}
          >
            <Bell size={16} />
            {unread ? <span className={styles.dot} data-preserve-brand-color="true" /> : null}
          </button>
          <button type="button" className={styles.topAvatar} onClick={() => goto("profile")} aria-label="Мой профиль">
            <Avatar src={profile?.avatarUrl} name={profile?.displayName || "Malik"} className={styles.avatarSmall} />
            <span className={styles.onlineDot} data-preserve-brand-color="true" />
          </button>
        </div>

        {inboxOpen ? (
          <section className={styles.sideCard}>
            <div className={styles.sideCardTitle}>Уведомления</div>
            {notifications.length ? (
              <div className={styles.inboxList}>
                {notifications.slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.inboxItem} ${item.read ? "" : styles.inboxUnread}`}
                    onClick={() => { if (item.postId) { goto("foryou"); setActiveId(item.postId) } }}
                  >
                    <Avatar src={item.actor?.avatarUrl} name={item.actor?.displayName || "Malik"} className={styles.avatarSmall} />
                    <span>
                      <b>{item.actor?.displayName || "Malik Shorts"}</b>
                      <small>{NOTIFICATION_TEXT[item.type] || "новое событие"}</small>
                    </span>
                    <time>{new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</time>
                  </button>
                ))}
              </div>
            ) : <div className={styles.sideCardText}>Пока тихо. Здесь появятся лайки, комментарии и новые подписчики.</div>}
          </section>
        ) : null}

        <section className={styles.sideCard}>
          <div className={styles.meRow}>
            <Avatar src={profile?.avatarUrl} name={profile?.displayName || "Malik"} className={styles.meAvatar} />
            <div className={styles.meBody}>
              <div className={styles.meName}>{profile?.displayName || "Malik AI"}</div>
              <div className={styles.meHandle}>@{profile?.username || "malik"}</div>
            </div>
            <button type="button" className={styles.secondaryButton} style={{ width: "auto", marginTop: 0 }} onClick={() => goto("profile")}>Профиль</button>
            <button type="button" className={styles.iconPill} aria-label="Настройки" onClick={() => window.location.assign("/dashboard")}><Settings size={15} /></button>
          </div>
          <div className={styles.statRow}>
            <span><b>{compact(profile?.postCount)}</b>Видео</span>
            <span><b>{compact(profile?.followerCount)}</b>Подписчики</span>
            <span><b>{compact(profile?.followingCount)}</b>Подписки</span>
          </div>
          {profile?.bio ? <div className={styles.quotedBio}>&laquo;{profile.bio}&raquo;</div> : null}
          <div className={styles.metaRow}><MapPin size={12} /> Казахстан <Link2 size={12} /> <a href="/" className={styles.metaLink} data-preserve-brand-color="true">malik.ai</a></div>
        </section>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>Текущий автор</div>
          {activeShort ? (
            <>
              <div className={styles.meRow}>
                <Avatar src={activeShort.creator.avatarUrl} name={activeShort.creator.displayName} className={styles.meAvatar} />
                <div className={styles.meBody}>
                  <div className={styles.meName}>
                    {activeShort.creator.displayName}
                    {activeShort.creator.verified ? <span className={styles.verified} style={{ marginLeft: 6 }}><Check size={9} /></span> : null}
                  </div>
                  <div className={styles.meHandle}>@{activeShort.creator.username}</div>
                </div>
                {activeShort.creator.id !== profile?.userKey ? (
                  <button type="button" className={activeShort.viewer.following ? styles.secondaryButton : styles.connectButton} style={{ width: "auto", marginTop: 0 }} onClick={() => toggleFollow(activeShort)}>
                    {activeShort.viewer.following ? "Вы подписаны" : "Подписаться"}
                  </button>
                ) : null}
              </div>

              {creator ? (
                <>
                  <div className={styles.creatorSplit}>
                    <div className={styles.statRow}>
                      <span><b>{compact(creator.profile.followerCount)}</b>Подписчики</span>
                      <span><b>{compact(creator.profile.postCount)}</b>Видео</span>
                    </div>
                    {creator.profile.bio ? <div className={styles.creatorAbout}>{creator.profile.bio}</div> : null}
                  </div>
                  {creator.posts.length ? (
                    <div className={styles.creatorStrip}>
                      {creator.posts.slice(0, 4).map((post) => (
                        <button key={post.id} type="button" className={styles.creatorThumb} onClick={() => { goto("foryou"); setActiveId(post.id) }}>
                          {post.posterUrl ? <img src={post.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={styles.cardBlank}><Video size={16} /></span>}
                          <span className={styles.cardViews}><Play size={9} fill="currentColor" />{compact(post.metrics.views)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : creatorBusy ? <div className={styles.sideCardText}>Загружаю автора…</div> : null}
            </>
          ) : <div className={styles.sideCardText}>Пролистай ленту — автор текущего ролика появится здесь.</div>}
        </section>

        {activeShort ? (
          <section className={styles.sideCard}>
            <div className={styles.sideCardTitle}>Источник</div>
            <div className={styles.meRow}>
              <span className={styles.sourceMark} data-source={activeShort.source} data-preserve-brand-color="true">
                {activeShort.source === "youtube" ? <YouTubeMark /> : activeShort.source === "tiktok" ? <TikTokMark /> : <MalikMark />}
              </span>
              <div className={styles.meBody}>
                <div className={styles.meName}>{SOURCE_LABEL[activeShort.source]}</div>
                <div className={styles.meHandle}>{SOURCE_NOTE[activeShort.source]}</div>
              </div>
              {activeShort.sourceUrl ? (
                <a className={styles.secondaryButton} style={{ width: "auto", marginTop: 0, textDecoration: "none" }} href={activeShort.sourceUrl} target="_blank" rel="noreferrer noopener">
                  Открыть <ExternalLink size={12} style={{ marginLeft: 5, verticalAlign: "-1px" }} />
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>AI-инструменты</div>
          <div className={styles.toolGrid}>
            {AI_TOOLS.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={styles.tool}
                  disabled={!activeShort}
                  onClick={() => activeShort && runTool(tool.id, activeShort)}
                >
                  <span className={styles.toolIcon}><Icon size={16} /></span>
                  <span><strong>{tool.title}</strong><small>{tool.note}</small></span>
                  <ChevronRight size={14} />
                </button>
              )
            })}
          </div>
        </section>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>Быстрые действия</div>
          <div className={styles.quickRow}>
            <button type="button" className={`${styles.quick} ${activeShort?.viewer.liked ? styles.quickOn : ""}`} disabled={!activeShort} onClick={() => activeShort && toggleLike(activeShort)}>
              <Heart size={14} fill={activeShort?.viewer.liked ? "currentColor" : "none"} /> Нравится
            </button>
            <button type="button" className={`${styles.quick} ${activeShort?.viewer.saved ? styles.quickOn : ""}`} disabled={!activeShort} onClick={() => activeShort && toggleSave(activeShort)}>
              <Bookmark size={14} fill={activeShort?.viewer.saved ? "currentColor" : "none"} /> Сохранить
            </button>
            <button type="button" className={styles.quick} disabled={!activeShort} onClick={() => activeShort && shareShort(activeShort)}>
              <Share2 size={14} /> Поделиться
            </button>
          </div>
        </section>

        <section className={styles.sideCard}>
          <div className={styles.sideCardTitle}>Язык ленты</div>
          <div className={styles.pillRow}>
            {(["ru", "kk", "en"] as const).map((lang) => <button key={lang} type="button" className={`${styles.pill} ${language === lang ? styles.pillActive : ""}`} onClick={() => setLanguage(lang)}>{lang.toUpperCase()}</button>)}
          </div>
          <button type="button" className={tiktok.connected ? styles.secondaryButton : styles.connectButton} onClick={syncTikTok}>
            {tiktok.connected ? <><RefreshCw size={13} style={{ display: "inline", marginRight: 6 }} />Синхронизировать TikTok</> : "Подключить TikTok"}
          </button>
        </section>

        <div className={styles.versionNote}>v1.2.0</div>
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

      {tool ? <>
        <button type="button" className={styles.scrim} aria-label="Закрыть" onClick={() => setTool(null)} />
        <aside className={styles.drawer}>
          <header className={styles.drawerHeader}>
            <span>{tool.title}</span>
            <button type="button" className={styles.iconPlain} onClick={() => setTool(null)}><X size={18} /></button>
          </header>
          <div className={styles.toolBody}>
            {tool.busy ? <div className={styles.loading} style={{ minHeight: 160 }}><div className={styles.loader} /></div> : tool.body}
          </div>
          {!tool.busy && tool.body ? (
            <div className={styles.commentComposer}>
              <button type="button" className={styles.connectButton} style={{ marginTop: 0 }} onClick={() => {
                navigator.clipboard?.writeText(tool.body).then(() => notify("Скопировано"), () => notify("Буфер обмена недоступен"))
              }}>Скопировать</button>
            </div>
          ) : null}
        </aside>
      </> : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  )
}
