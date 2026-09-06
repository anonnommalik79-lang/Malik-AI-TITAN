"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import type { YouTubeVideo, YouTubeComment } from "@/lib/youtube/contracts"
import { api, fmt } from "./youtube-api"
import styles from "./MalikShortsApp.module.css"
export function YouTubeComments({ video, ownChannel, close, error, changed }: { video: YouTubeVideo; ownChannel: string; close: () => void; error: (e: unknown) => void; changed: (delta: number) => void }) {
  const [items, setItems] = useState<YouTubeComment[]>([]), [cursor, setCursor] = useState("")
  const [text, setText] = useState(""), [reply, setReply] = useState<YouTubeComment | null>(null)
  const [editing, setEditing] = useState<YouTubeComment | null>(null), [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState(""), [replies, setReplies] = useState<Record<string, { items: YouTubeComment[]; cursor?: string }>>({})
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close() }
      if (event.key === "Tab" && !dialog.current?.contains(document.activeElement)) { event.preventDefault(); dialog.current?.querySelector<HTMLElement>("button:not(:disabled),textarea")?.focus() }
    }
    document.addEventListener("keydown", keydown)
    return () => document.removeEventListener("keydown", keydown)
  }, [close])
  const load = useCallback(async (token = "", signal?: AbortSignal) => {
    setBusy(true)
    try { const result = await api<{ items: YouTubeComment[]; nextPageToken?: string }>(`/api/youtube/videos/${video.id}/comments?pageToken=${encodeURIComponent(token)}`, "GET", undefined, signal); setItems((old) => token ? [...old, ...result.items.filter((r) => !old.some((o) => o.id === r.id))] : result.items); setCursor(result.nextPageToken || "") }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) { setLocalError(e instanceof Error ? e.message : "Не удалось загрузить комментарии"); error(e) } } finally { setBusy(false) }
  }, [video.id, error])
  useEffect(() => { const controller = new AbortController(); void load("", controller.signal); const previous = document.activeElement as HTMLElement; dialog.current?.focus(); return () => { controller.abort(); previous?.focus() } }, [load])
  const showReplies = async (item: YouTubeComment) => {
    if (busy) return
    setBusy(true)
    try { const result = await api<{ items: YouTubeComment[]; nextPageToken?: string }>(`/api/youtube/comments/${item.id}/replies?pageToken=${encodeURIComponent(replies[item.id]?.cursor || "")}`); setReplies((old) => ({ ...old, [item.id]: { items: [...(old[item.id]?.items || []), ...result.items.filter((r) => !(old[item.id]?.items || []).some((o) => o.id === r.id))], cursor: result.nextPageToken } })) }
    catch (e) { error(e) } finally { setBusy(false) }
  }
  const remove = async (item: YouTubeComment) => {
    if (!window.confirm("Удалить этот комментарий из YouTube?")) return
    setBusy(true)
    try { await api(`/api/youtube/comments/${item.id}`, "DELETE", {}); changed(-(1 + item.replyCount)); setItems((old) => old.filter((r) => r.id !== item.id)); setReplies((old) => Object.fromEntries(Object.entries(old).map(([key, value]) => [key, { ...value, items: value.items.filter((r) => r.id !== item.id) }]))) }
    catch (e) { error(e) } finally { setBusy(false) }
  }
  const render = (item: YouTubeComment, nested = false): React.ReactNode => <div key={item.id} className={styles.comment}>
    <span className={styles.avatar}>{item.avatar && <img src={item.avatar} alt="" />}</span><div>
      {item.channelId ? <Link href={`/shorts/channel/${item.channelId}`}>{item.author}</Link> : <strong>{item.author}</strong>}
      <p className={styles.commentText}>{item.text}</p><small>{new Date(item.publishedAt).toLocaleString("ru-RU")} {item.updatedAt !== item.publishedAt && "· изменён"} · 👍 {fmt(item.likes)} {item.viewerRating === "like" && "· ваш лайк"}</small>
      <div className={styles.commentControls}>
        {!nested && <button onClick={() => { setReply(item); setEditing(null); dialog.current?.querySelector("textarea")?.focus() }}>Ответить</button>}
        {item.own && item.channelId === ownChannel && <><button disabled={busy} onClick={() => { setEditing(item); setReply(null); setText(item.text) }}>Изменить</button><button disabled={busy} onClick={() => remove(item)}>Удалить</button></>}
        {!nested && item.replyCount > 0 && (!replies[item.id] || replies[item.id].cursor) && <button disabled={busy} onClick={() => showReplies(item)}>{replies[item.id] ? "Ещё ответы" : `Ответы (${item.replyCount})`}</button>}
      </div>
      {!nested && replies[item.id]?.items.map((child) => render(child, true))}
    </div>
  </div>
  return <><button className={styles.scrim} onClick={close} aria-label="Закрыть комментарии" /><div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Комментарии YouTube" ref={dialog} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape") close()
    if (event.key === "Tab") { const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a,textarea') || []); if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1]?.focus() } else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0]?.focus() } }
  }}>
    <div className={styles.drawerHeader}>Комментарии YouTube<button className={styles.iconPlain} onClick={close} aria-label="Закрыть"><X /></button></div>
    <div className={styles.commentList}>{localError && <p role="alert">{localError}</p>}{items.map((item) => render(item))}{busy && <p role="status">Загрузка…</p>}{cursor && <button disabled={busy} onClick={() => load(cursor)}>Ещё комментарии</button>}</div>
    <form className={styles.youtubeComposer} onSubmit={async (event) => {
      event.preventDefault(); if (busy || !text.trim()) return
      setBusy(true)
      try {
        const path = editing ? `/api/youtube/comments/${editing.id}` : reply ? `/api/youtube/comments/${reply.id}/replies` : `/api/youtube/videos/${video.id}/comments`
        const result = await api<{ item: YouTubeComment }>(path, editing ? "PATCH" : "POST", { text: text.trim() })
        if (editing) { setItems((old) => old.map((r) => r.id === editing.id ? result.item : r)); setReplies((old) => Object.fromEntries(Object.entries(old).map(([key, value]) => [key, { ...value, items: value.items.map((r) => r.id === editing.id ? result.item : r) }]))) }
        else if (reply) { setItems((old) => old.map((r) => r.id === reply.id ? { ...r, replyCount: r.replyCount + 1 } : r)); setReplies((old) => ({ ...old, [reply.id]: { ...old[reply.id], items: [...(old[reply.id]?.items || []), result.item] } })) }
        else setItems((old) => [result.item, ...old])
        if (!editing) changed(1)
        setLocalError(""); setText(""); setReply(null); setEditing(null)
      } catch (e) { setLocalError(e instanceof Error ? e.message : "Комментарий не отправлен"); error(e) } finally { setBusy(false) }
    }}>
      {(reply || editing) && <div>{editing ? "Редактирование" : `Ответ: ${reply?.author}`}<button type="button" onClick={() => { setReply(null); setEditing(null); setText("") }}>Отмена</button></div>}
      <textarea aria-label="Текст комментария YouTube" maxLength={2200} value={text} onChange={(event) => setText(event.target.value)} placeholder="Комментарий будет опубликован на YouTube" />
      <button disabled={busy || !text.trim()} type="submit">Отправить в YouTube</button>
    </form>
  </div></>
}
