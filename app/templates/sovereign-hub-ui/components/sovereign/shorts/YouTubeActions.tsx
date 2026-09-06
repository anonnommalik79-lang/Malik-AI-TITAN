"use client"
import { useEffect, useState } from "react"
import { Heart, MessageCircle, Bookmark, Share2 } from "lucide-react"
import { videoPath, type YouTubeVideo } from "@/lib/youtube/contracts"
import { api, fmt } from "./youtube-api"
import styles from "./MalikShortsApp.module.css"
export function Subscribe({ channelId, initial, error }: { channelId: string; initial: boolean; error: (e: unknown) => void }) {
  const [subscribed, setSubscribed] = useState(initial), [busy, setBusy] = useState(false)
  useEffect(() => setSubscribed(initial), [initial])
  return <button disabled={busy} className={styles.secondaryButton} onClick={async () => {
    if (busy) return
    const before = subscribed; setSubscribed(!before); setBusy(true)
    try { const value = await api<{ subscribed: boolean }>(`/api/youtube/channels/${channelId}/subscription`, "POST", { subscribed: !before }); setSubscribed(value.subscribed) }
    catch (e) { setSubscribed(before); error(e) } finally { setBusy(false) }
  }}>{subscribed ? "Отписаться" : "Подписаться"}</button>
}
export function YouTubeActions({ video, active, comments, error }: { video: YouTubeVideo; active: boolean; comments: () => void; error: (e: unknown) => void }) {
  const [rating, setRating] = useState(video.rating || "none"), [likes, setLikes] = useState(video.likes)
  const [saved, setSaved] = useState(false), [subscribed, setSubscribed] = useState(false)
  const [ready, setReady] = useState(false), [busy, setBusy] = useState("")
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    api<{ video: YouTubeVideo; subscribed: boolean; saved: boolean }>(`/api/youtube/videos/${video.id}`, "GET", undefined, controller.signal).then((value) => { setRating(value.video.rating || "none"); setLikes(value.video.likes); setSaved(value.saved); setSubscribed(value.subscribed); setReady(true) }).catch((e) => { if (e.name !== "AbortError") error(e) })
    return () => controller.abort()
  }, [active, video.id, error])
  return <div className={styles.connectedActions}>
    <button aria-label={rating === "like" ? "Убрать лайк YouTube" : "Лайк YouTube"} aria-pressed={rating === "like"} className={rating === "like" ? styles.youtubeLiked : ""} disabled={!ready || !!busy} onClick={async () => {
      if (busy) return
      const before = rating, count = likes, next = before === "like" ? "none" : "like"
      setRating(next); setLikes(count === undefined ? undefined : Math.max(0, count + (next === "like" ? 1 : -1))); setBusy("rating")
      try { const result = await api<{ video?: YouTubeVideo; rating?: string }>(`/api/youtube/videos/${video.id}/rating`, "POST", { rating: next }); if (result.video) { setRating(result.video.rating || next); setLikes(result.video.likes) } }
      catch (e) { setRating(before); setLikes(count); error(e) } finally { setBusy("") }
    }}><Heart fill={rating === "like" ? "currentColor" : "none"} size={20} />{fmt(likes)}</button>
    <button onClick={comments} aria-label="Комментарии YouTube"><MessageCircle size={20} />{fmt(video.comments)}</button>
    <button disabled={!ready || !!busy} aria-pressed={saved} onClick={async () => {
      if (busy) return
      const before = saved; setSaved(!before); setBusy("saved")
      try { const result = await api<{ saved: boolean }>(`/api/youtube/videos/${video.id}/saved`, "POST", { saved: !before }); setSaved(result.saved) }
      catch (e) { setSaved(before); error(e) } finally { setBusy("") }
    }}><Bookmark fill={saved ? "currentColor" : "none"} size={20} />{saved ? "Сохранено" : "Сохранить"}</button>
    <button onClick={async () => {
      const url = window.location.origin + videoPath(video.id)
      try { if (navigator.share) await navigator.share({ title: video.title, text: video.channel.title, url }); else { await navigator.clipboard.writeText(url); error(new Error("Ссылка Malik Shorts скопирована.")) } }
      catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) error(e) }
    }}><Share2 size={20} />Поделиться</button>
    {ready && <Subscribe channelId={video.channel.id} initial={subscribed} error={error} />}
  </div>
}
