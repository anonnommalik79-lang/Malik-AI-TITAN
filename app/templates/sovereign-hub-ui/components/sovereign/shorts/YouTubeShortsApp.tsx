"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { Home, Search, Library, History, Users, ArrowLeft, Youtube } from "lucide-react"
import type { Channel, YouTubeVideo } from "@/lib/youtube/contracts"
import { videoPath, shortsPath } from "@/lib/youtube/contracts"
import { api, fmt, RequestError } from "./youtube-api"
import { YouTubePlayer } from "./YouTubePlayer"
import { YouTubeActions, Subscribe } from "./YouTubeActions"
import { YouTubeComments } from "./YouTubeComments"
import { YouTubeAccountMenu } from "./YouTubeAccountMenu"
import s from "./MalikShortsApp.module.css"

type Account = { connected: boolean; channel?: Channel | null; channels?: Channel[] }
type Clip = YouTubeVideo & { progress?: number; watchedAt?: string }
type Page = { items: Clip[] | Channel[]; nextPageToken?: string; nextOffset?: number | null; note?: string }
const tabs = [["liked", "Лайки"], ["saved", "Сохранённое"], ["subscriptions", "Подписки"], ["uploads", "Мои видео"]]
export default function YouTubeShortsApp() {
  const path = usePathname(), query = useSearchParams(), router = useRouter()
  const [account, setAccount] = useState<Account | null>(null), [message, setMessage] = useState("")
  const [reconnect, setReconnect] = useState(false), [busy, setBusy] = useState(false)
  const [clips, setClips] = useState<Clip[]>([]), [authors, setAuthors] = useState<Channel[]>([])
  const [cursor, setCursor] = useState(""), [note, setNote] = useState(""), [active, setActive] = useState("")
  const [profile, setProfile] = useState<{ channel: Channel; subscribed: boolean } | null>(null)
  const [commentVideo, setCommentVideo] = useState<YouTubeVideo | null>(null)
  const [draft, setDraft] = useState(query.get("q") || ""), [kind, setKind] = useState(query.get("kind") || "videos")
  const [language, setLanguage] = useState(query.get("language") || "ru"), [recent, setRecent] = useState(query.get("recent") === "true")
  const stream = useRef<HTMLDivElement>(null), loading = useRef(false), generation = useRef(0)
  const isHistory = path === "/shorts/history", isLibrary = path === "/shorts/library"
  const channelId = path.startsWith("/shorts/channel/") ? path.split("/")[3] : ""
  const videoId = path.startsWith("/shorts/youtube/") ? path.split("/")[3] : ""
  const tab = tabs.some(([id]) => id === query.get("tab")) ? query.get("tab")! : "liked"
  const following = query.get("view") === "following"
  const channelResults = isLibrary && tab === "subscriptions" || !isLibrary && !channelId && !videoId && !isHistory && query.get("kind") === "channels"
  const ready = !!account?.channel && !reconnect
  const endpoint = isHistory ? "/api/shorts/history" : videoId ? `/api/youtube/videos/${videoId}` : channelId ? `/api/youtube/channels/${channelId}/videos` : isLibrary ? tab === "subscriptions" ? "/api/youtube/subscriptions" : `/api/youtube/library/${tab}` : following ? "/api/youtube/following" : `/api/youtube/feed?${new URLSearchParams({ q: query.get("q") || "", kind: query.get("kind") || "videos", language: query.get("language") || "ru", recent: query.get("recent") || "false" })}`
  const error = useCallback((e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return
    if (e instanceof RequestError && e.code === "AUTH_REQUIRED") { window.location.assign("/sign-in?returnTo=" + encodeURIComponent(shortsPath(window.location.pathname + window.location.search))); return }
    setMessage(e instanceof Error ? e.message : "Запрос не выполнен. Попробуйте ещё раз.")
    if (e instanceof RequestError && e.reconnect) setReconnect(true)
  }, [])
  const loadAccount = useCallback(async () => { try { setAccount(await api<Account>("/api/youtube/me")); setReconnect(false) } catch (e) { error(e); setAccount({ connected: false }) } }, [error])
  useEffect(() => { void loadAccount() }, [loadAccount])
  useEffect(() => { if (query.get("youtube") === "consent_denied") setMessage("Доступ к YouTube не предоставлен. Подключите аккаунт, чтобы продолжить.") }, [query])
  const loadPage = useCallback(async (token = "", signal?: AbortSignal) => {
    const current = generation.current
    if (loading.current) return
    loading.current = true; setBusy(true)
    try {
      const url = endpoint + (endpoint.includes("?") ? "&" : "?") + (isHistory ? "offset=" : "pageToken=") + encodeURIComponent(token)
      const result = await api<Page & { video?: Clip }>(url, "GET", undefined, signal)
      if (current !== generation.current || signal?.aborted) return
      const items = result.video ? [result.video] : result.items || []
      if (channelResults) setAuthors((old) => token ? [...old, ...(items as Channel[]).filter((r) => !old.some((o) => o.id === r.id))] : items as Channel[])
      else setClips((old) => token ? [...old, ...(items as Clip[]).filter((r) => !old.some((o) => o.id === r.id))] : items as Clip[])
      setCursor(result.nextPageToken || (result.nextOffset != null ? String(result.nextOffset) : "")); setNote(result.note || "")
    } catch (e) { if (current === generation.current && !signal?.aborted) error(e) }
    finally { if (current === generation.current) { loading.current = false; setBusy(false) } }
  }, [endpoint, isHistory, channelResults, error])
  useEffect(() => {
    generation.current++; loading.current = false
    setClips([]); setAuthors([]); setActive(""); setCursor(""); setProfile(null); setCommentVideo(null)
    stream.current?.scrollTo(0, 0)
    if (!ready) return
    const controller = new AbortController()
    void loadPage("", controller.signal)
    if (channelId) api<{ channel: Channel; subscribed: boolean }>(`/api/youtube/channels/${channelId}`, "GET", undefined, controller.signal).then(setProfile).catch((e) => { if (!controller.signal.aborted) error(e) })
    return () => controller.abort()
  }, [ready, loadPage, channelId, error])
  useEffect(() => {
    if (!stream.current || isHistory) return
    const observer = new IntersectionObserver((entries) => {
      const best = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= .55).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (best) setActive((best.target as HTMLElement).dataset.video || "")
    }, { root: stream.current, threshold: [.55, .8] })
    stream.current.querySelectorAll("[data-video]").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [clips, isHistory])
  const history = useCallback((id: string, progress: number) => { if (progress > 0) void api("/api/shorts/history", "POST", { videoId: id, progress }).catch(error) }, [error])
  const connect = `/api/youtube/connect?returnTo=${encodeURIComponent(path + (query.size ? `?${query}` : ""))}`
  const nav = [["/shorts", "Главная", Home], ["/shorts?view=following", "Подписки", Users], ["/shorts/library", "Библиотека", Library], ["/shorts/history", "История", History]] as const
  return <div className={`${s.root} ${s.connectedRoot}`}>
    <aside className={s.left}>
      <Link href="/dashboard" className={s.brand}><ArrowLeft size={20} /><div><b>Malik Shorts</b><div className={s.brandSub}>YouTube connected</div></div></Link>
      <nav className={s.nav}>{nav.map(([href, title, Icon]) => <Link key={href} href={href} className={s.navButton}><Icon size={20} />{title}</Link>)}</nav>
      <div className={s.leftFooter}>{account?.channel && <Link className={s.profileButton} href={`/shorts/channel/${account.channel.id}`}><span className={s.avatar}>{account.channel.avatar && <img src={account.channel.avatar} alt="" />}</span><span>{account.channel.title}</span></Link>}
        {account?.connected && <button className={s.secondaryButton} disabled={busy} onClick={async () => { if (!window.confirm("Отключить YouTube и удалить историю Malik? Плейлист и действия в YouTube сохранятся.")) return; setBusy(true); try { await api("/api/youtube/disconnect", "POST", {}); setAccount({ connected: false }); setClips([]); setReconnect(false) } catch (e) { error(e) } finally { setBusy(false) } }}>Отключить YouTube</button>}
        <Link href="/shorts/privacy">Данные и ограничения</Link>
      </div>
    </aside>
    <main className={s.connectedMain}>
      <header className={s.connectedHeader}><Link href="/dashboard" aria-label="Вернуться в Malik AI"><ArrowLeft size={20} /></Link><strong>Malik Shorts</strong><span><Youtube size={20} /> YouTube</span>{account?.channel && <YouTubeAccountMenu channel={account.channel} error={error} disconnected={() => { setAccount({ connected: false }); setClips([]); setReconnect(false) }} />}</header>
      {message && <div className={s.connectedNotice} role="status">{message}<button onClick={() => setMessage("")} aria-label="Закрыть сообщение">×</button></div>}
      {!ready ? <section className={s.connectGate}>
        <Youtube size={40} /><h1>{account === null ? "Проверяем подключение…" : reconnect ? "Подключите YouTube заново" : account.connected ? "Выберите канал YouTube" : "Подключите свой YouTube"}</h1>
        <p>Смотрите видео, ставьте лайки, комментируйте и подписывайтесь через официальный API. Изменения сохраняются в вашем YouTube, а не имитируются в Malik.</p>
        {account?.connected && !reconnect && !!account.channels?.length && <p>Выберите нужный канал на экране Google при повторном подключении. Без однозначной YouTube identity действия недоступны.</p>}
        {account?.connected && !account.channels?.length && !reconnect && <p>Google не вернул канал. <a href="https://www.youtube.com/create_channel" target="_blank" rel="noreferrer">Создайте канал YouTube</a>, затем подключитесь снова.</p>}
        {account !== null && <a className={s.connectedPrimary} href={connect}>Подключить YouTube</a>}
        <p>Запрашивается доступ к чтению и управлению видео, комментариями и подписками. Мы выполняем действия только по вашим нажатиям. <Link href="/shorts/privacy">Как используются данные</Link>.</p>
      </section> : <>
        {!videoId && !isLibrary && !isHistory && !channelId && <form className={s.connectedSearch} onSubmit={(e) => { e.preventDefault(); router.push(`/shorts?${new URLSearchParams({ q: draft, kind, language, recent: String(recent) })}`) }}>
          <label className={s.searchField}><Search size={18} /><input aria-label="Поиск YouTube" placeholder="Видео, автор или тема" maxLength={150} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
          <select aria-label="Тип результатов" value={kind} onChange={(e) => setKind(e.target.value)}><option value="videos">Видео</option><option value="channels">Каналы</option></select>
          <select aria-label="Язык поиска" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select>
          <label><input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} /> За неделю</label><button type="submit">Найти</button>
        </form>}
        {isLibrary && <nav className={s.connectedTabs}>{tabs.map(([id, title]) => <Link key={id} aria-current={tab === id ? "page" : undefined} href={`/shorts/library?tab=${id}`}>{title}</Link> )}<Link href="/shorts/history">История Malik</Link></nav>}
        {isHistory && <div className={s.connectedTabs}><h1>История Malik</h1><button disabled={busy || !clips.length} onClick={async () => { if (!window.confirm("Удалить всю историю просмотров Malik? История YouTube не изменится.")) return; try { await api("/api/shorts/history", "DELETE", { all: true }); setClips([]); setCursor("") } catch (e) { error(e) } }}>Очистить историю</button></div>}
        <div className={s.connectedScroll} ref={stream}>
          {profile && <section className={s.channelSummary}>{profile.channel.avatar && <img src={profile.channel.avatar} alt="" />}<h1>{profile.channel.title}</h1><p>{profile.channel.handle} · {fmt(profile.channel.subscribers)} подписчиков · {fmt(profile.channel.videoCount)} видео</p><p>{profile.channel.description}</p><Subscribe channelId={profile.channel.id} initial={profile.subscribed} error={error} /></section>}
          <p className={s.connectedHint}>{isHistory ? "Просмотры внутри Malik; это не история YouTube." : isLibrary && tab === "saved" ? "Приватный плейлист Malik Shorts Saved в вашем YouTube. Это не Watch Later." : following ? "Последние видео каналов, на которые вы подписаны." : !isLibrary && !videoId && !channelId ? "Официальный поиск коротких видео YouTube (до 4 минут), не персональная лента Shorts." : "Данные и действия синхронизируются с YouTube."} {note}</p>
          {authors.map((channel) => <Link className={s.channelCard} key={channel.id} href={`/shorts/channel/${channel.id}`}>{channel.avatar && <img src={channel.avatar} alt="" />}<div><h2>{channel.title}</h2><p>{channel.handle} · {fmt(channel.subscribers)} подписчиков</p><p>{channel.description.slice(0, 180)}</p></div></Link>)}
          {clips.map((clip) => isHistory ? <article className={s.historyCard} key={clip.id}><Link href={`${videoPath(clip.id)}?start=${Math.floor(clip.progress || 0)}`}>{clip.thumbnail && <img src={clip.thumbnail} alt="" />}<div><h2>{clip.title}</h2><p>{clip.channel.title} · {clip.watchedAt && new Date(clip.watchedAt).toLocaleString("ru-RU")}</p><span>Продолжить с {Math.floor(clip.progress || 0)} с</span></div></Link><button onClick={async () => { try { await api("/api/shorts/history", "DELETE", { videoId: clip.id }); setClips((old) => old.filter((v) => v.id !== clip.id)) } catch (e) { error(e) } }}>Удалить</button></article> : <article className={s.connectedClip} key={clip.id}>
            <div className={s.playerFrame} data-video={clip.id}>{active === clip.id ? <YouTubePlayer paused={!!commentVideo} videoId={clip.id} start={videoId ? Math.min(clip.duration, Math.max(0, Number(query.get("start")) || 0)) : 0} onProgress={(seconds) => history(clip.id, seconds)} onError={error} /> : <button className={s.posterButton} onClick={() => router.push(videoPath(clip.id))} aria-label={`Смотреть ${clip.title}`}>{clip.thumbnail && <img src={clip.thumbnail} alt="" />}<span>Смотреть в плеере YouTube</span></button>}</div>
            <div className={s.clipDetails}><Link href={`/shorts/channel/${clip.channel.id}`} className={s.clipAuthor}>{clip.channel.avatar && <img src={clip.channel.avatar} alt="" />}{clip.channel.title}</Link><h2><Link href={videoPath(clip.id)}>{clip.title}</Link></h2><p>{fmt(clip.views)} просмотров · {new Date(clip.publishedAt).toLocaleDateString("ru-RU")} · {Math.floor(clip.duration)} с</p><YouTubeActions video={clip} active={active === clip.id} comments={() => setCommentVideo(clip)} error={error} /><a href={clip.sourceUrl} target="_blank" rel="noreferrer">Открыть в YouTube ↗</a></div>
          </article>)}
          {!busy && !clips.length && !authors.length && <div className={s.connectedEmpty}><h2>Пока нет результатов</h2><p>Измените запрос или проверьте подключение. Мы не подставляем выдуманные видео и счётчики.</p><button onClick={() => void loadPage()}>Обновить</button></div>}
          {busy && <p className={s.connectedHint} role="status">Загружаем данные YouTube…</p>}
          {cursor && <button className={s.loadMore} disabled={busy} onClick={() => void loadPage(cursor)}>Загрузить ещё</button>}
        </div>
      </>}
      <nav className={s.connectedMobileNav}>{nav.map(([href, title, Icon]) => <Link key={href} href={href}><Icon size={20} /><span>{title}</span></Link>)}<Link href="/shorts/privacy">Данные</Link></nav>
    </main>
    {commentVideo && account?.channel && <YouTubeComments key={commentVideo.id} video={commentVideo} ownChannel={account.channel.id} close={() => setCommentVideo(null)} error={error} changed={(delta) => { setClips((old) => old.map((v) => v.id === commentVideo.id ? { ...v, comments: v.comments === undefined ? undefined : Math.max(0, v.comments + delta) } : v)); void api<{ video: YouTubeVideo }>(`/api/youtube/videos/${commentVideo.id}`).then(({ video }) => setClips((old) => old.map((v) => v.id === video.id ? { ...v, comments: video.comments } : v))).catch(error) }} />}
  </div>
}
