"use client"
import { useEffect, useRef, useState } from "react"
import styles from "./MalikShortsApp.module.css"

type Player = { playVideo(): void; pauseVideo(): void; mute(): void; unMute(): void; isMuted(): boolean; getCurrentTime(): number; getDuration(): number; getPlayerState(): number; destroy(): void }
type API = { Player: new (element: HTMLElement, options: { videoId: string; width: string; height: string; playerVars: Record<string, string | number>; events: { onReady(event: { target: Player }): void; onError(): void; onAutoplayBlocked(): void } }) => Player }
let apiPromise: Promise<API> | undefined
let rememberedMuted = true
function loadAPI() {
  const target = window as unknown as { YT?: API; onYouTubeIframeAPIReady?: () => void }
  if (target.YT?.Player) return Promise.resolve(target.YT)
  if (!apiPromise) apiPromise = new Promise<API>((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady
    const timeout = window.setTimeout(() => { apiPromise = undefined; reject(new Error("PLAYER_TIMEOUT")) }, 20000)
    target.onYouTubeIframeAPIReady = () => { previous?.(); window.clearTimeout(timeout); if (target.YT) resolve(target.YT) }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"
      script.onerror = () => { window.clearTimeout(timeout); script.remove(); apiPromise = undefined; reject(new Error("PLAYER_LOAD_FAILED")) }
      document.head.appendChild(script)
    }
  })
  return apiPromise
}

/** Native YouTube controls are the ONLY playback UI. No observer can undo Pause. */
export function YouTubePlayer({ videoId, start = 0, paused = false, onProgress, onError }: { videoId: string; start?: number; paused?: boolean; onProgress: (seconds: number) => void; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<Player | null>(null)
  useEffect(() => { if (paused) instance.current?.pauseVideo() }, [paused])
  const callbacks = useRef({ onProgress, onError })
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { callbacks.current = { onProgress, onError } }, [onProgress, onError])
  useEffect(() => {
    let disposed = false, player: Player | undefined, timer: number | undefined
    let played = false, ticks = 0
    const host = document.createElement("div")
    container.current?.appendChild(host)
    const pauseWhenHidden = () => { if (document.hidden) player?.pauseVideo?.() }
    const visible = new IntersectionObserver(([entry]) => { if (entry && !entry.isIntersecting) player?.pauseVideo?.() })
    if (container.current) visible.observe(container.current)
    document.addEventListener("visibilitychange", pauseWhenHidden)
    loadAPI().then((api) => {
      if (disposed) return
      player = new api.Player(host, { videoId, width: "100%", height: "100%", playerVars: { controls: 1, autoplay: 0, playsinline: 1, rel: 0, start: Math.floor(start), origin: window.location.origin }, events: {
        onReady: ({ target }) => {
          if (disposed) return
          instance.current = target
          if (rememberedMuted) target.mute(); else target.unMute()
          if (!document.hidden) target.playVideo()
          timer = window.setInterval(() => {
            rememberedMuted = target.isMuted()
            if (target.getPlayerState() === 1) { played = true; if (++ticks % 30 === 0) callbacks.current.onProgress(target.getCurrentTime()) }
          }, 500)
        },
        onError: () => callbacks.current.onError("YouTube не разрешает воспроизведение этого видео во встроенном плеере."),
        onAutoplayBlocked: () => setBlocked(true),
      } })
    }).catch(() => { if (!disposed) callbacks.current.onError("Плеер YouTube не загрузился. Проверьте сеть и блокировщики.") })
    return () => {
      disposed = true; window.clearInterval(timer); visible.disconnect(); document.removeEventListener("visibilitychange", pauseWhenHidden)
      if (player) { if (played) callbacks.current.onProgress(player.getCurrentTime()); if (instance.current === player) { rememberedMuted = player.isMuted(); instance.current = null; player.pauseVideo() } player.destroy() }
      host.remove()
    }
  }, [videoId, start])
  return <><div className={styles.youtubePlayer} ref={container} />{blocked && <p className={styles.emptyText}>Браузер остановил автозапуск. Нажмите Play в плеере YouTube.</p>}</>
}
