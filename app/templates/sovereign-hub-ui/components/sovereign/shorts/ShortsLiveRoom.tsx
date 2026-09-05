"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Camera, Radio, Send, Square } from "lucide-react"
import styles from "./MalikShortsSections.module.css"

type LiveSegment = {
  sequence: number
  public_url: string
  mime_type?: string
  duration_ms?: number
  bytes?: number
  created_at?: string
}

function supportedRecorderMime() {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ]
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) || ""
}

function recordStandaloneChunk(stream: MediaStream, mimeType: string, durationMs = 2600) {
  return new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }) : new MediaRecorder(stream)
    } catch (error) {
      reject(error)
      return
    }
    const chunks: BlobPart[] = []
    const timer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop()
    }, durationMs)
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
    recorder.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error("MEDIA_RECORDER_FAILED"))
    }
    recorder.onstop = () => {
      window.clearTimeout(timer)
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }))
    }
    recorder.start()
  })
}

export function ShortsLiveRoom({ liveId }: { liveId: string }) {
  const [session, setSession] = useState<any>(null)
  const [chat, setChat] = useState<any[]>([])
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<string | null>(null)
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastError, setBroadcastError] = useState("")
  const [segments, setSegments] = useState<LiveSegment[]>([])
  const [currentSegment, setCurrentSegment] = useState<LiveSegment | null>(null)
  const [transportReady, setTransportReady] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null)
  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const broadcastingRef = useRef(false)
  const sequenceRef = useRef(0)
  const lastTransportSequence = useRef<number | null>(null)
  const playedSequences = useRef(new Set<number>())
  const viewerKey = useRef(`live-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const isOwner = Boolean(me && session?.creator_key === me)

  const load = useCallback(async () => {
    const [liveResponse, meResponse] = await Promise.all([
      fetch(`/api/shorts/live?liveId=${encodeURIComponent(liveId)}&limit=100`, { cache: "no-store" }),
      fetch("/api/shorts/me", { cache: "no-store" }).catch(() => null),
    ])
    const json = await liveResponse.json().catch(() => ({}))
    if (liveResponse.ok) { setSession(json.session || null); setChat(Array.isArray(json.chat) ? json.chat : []) }
    if (meResponse?.ok) {
      const profileJson = await meResponse.json().catch(() => null)
      setMe(profileJson?.profile?.userKey || null)
    }
    setLoading(false)
  }, [liveId])

  const loadSegments = useCallback(async () => {
    const params = new URLSearchParams({ liveId, limit: "12", viewerKey: viewerKey.current })
    if (lastTransportSequence.current != null) params.set("after", String(lastTransportSequence.current))
    const response = await fetch(`/api/shorts/live/segments?${params}`, { cache: "no-store" })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) return
    const incoming = Array.isArray(json.segments) ? json.segments as LiveSegment[] : []
    if (incoming.length) {
      lastTransportSequence.current = Number(incoming[incoming.length - 1].sequence)
      setSegments((current) => {
        const map = new Map(current.map((item) => [Number(item.sequence), item]))
        for (const item of incoming) map.set(Number(item.sequence), item)
        return Array.from(map.values()).sort((a, b) => Number(a.sequence) - Number(b.sequence)).slice(-24)
      })
      setTransportReady(true)
    }
  }, [liveId])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 3500)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!session || session.status === "ended" || session.status === "cancelled") return
    loadSegments()
    const timer = window.setInterval(loadSegments, 1100)
    return () => window.clearInterval(timer)
  }, [loadSegments, session?.id, session?.status])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }) }, [chat.length])

  const pendingSegments = useMemo(
    () => segments.filter((item) => !playedSequences.current.has(Number(item.sequence))),
    [segments, currentSegment],
  )

  useEffect(() => {
    if (isOwner && broadcasting) return
    if (currentSegment) return
    const next = pendingSegments.length > 5 ? pendingSegments[pendingSegments.length - 2] : pendingSegments[0]
    if (next) setCurrentSegment(next)
  }, [broadcasting, currentSegment, isOwner, pendingSegments])

  useEffect(() => {
    const video = remoteVideo.current
    if (!video || !currentSegment) return
    video.src = currentSegment.public_url
    video.load()
    video.play().catch(() => {})
  }, [currentSegment])

  const advanceRemote = useCallback(() => {
    if (currentSegment) playedSequences.current.add(Number(currentSegment.sequence))
    setCurrentSegment(null)
  }, [currentSegment])

  const send = async () => {
    const text = body.trim(); if (!text) return
    setBody("")
    const response = await fetch("/api/shorts/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", liveId, body: text }) })
    if (!response.ok) setBody(text); else await load()
  }

  const uploadChunk = useCallback(async (blob: Blob, sequence: number) => {
    const contentType = blob.type || "video/webm"
    const prepare = await fetch("/api/shorts/live/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", liveId, sequence, contentType }),
    })
    const prepared = await prepare.json().catch(() => ({}))
    if (!prepare.ok || !prepared.uploadUrl) throw new Error(prepared.error || "LIVE_UPLOAD_PREPARE_FAILED")

    const upload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": prepared.contentType || contentType }, body: blob })
    if (!upload.ok) throw new Error(`LIVE_SEGMENT_UPLOAD_${upload.status}`)

    const commit = await fetch("/api/shorts/live/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "commit", liveId, sequence, contentType: prepared.contentType || contentType, durationMs: 2600, bytes: blob.size }),
    })
    const committed = await commit.json().catch(() => ({}))
    if (!commit.ok) throw new Error(committed.error || "LIVE_SEGMENT_COMMIT_FAILED")
  }, [liveId])

  const broadcastLoop = useCallback(async (stream: MediaStream, mimeType: string) => {
    while (broadcastingRef.current && stream.getTracks().some((track) => track.readyState === "live")) {
      const started = performance.now()
      const blob = await recordStandaloneChunk(stream, mimeType, 2600)
      if (!broadcastingRef.current) break
      if (!blob.size) continue
      const sequence = sequenceRef.current++
      await uploadChunk(blob, sequence)
      const elapsed = performance.now() - started
      if (elapsed < 2700) await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 2700 - elapsed)))
    }
  }, [uploadChunk])

  const startBroadcast = useCallback(async () => {
    setBroadcastError("")
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setBroadcastError("Этот браузер не поддерживает Malik Live camera transport.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      if (localVideo.current) {
        localVideo.current.srcObject = stream
        localVideo.current.muted = true
        await localVideo.current.play().catch(() => {})
      }
      const startResponse = await fetch("/api/shorts/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", liveId }),
      })
      if (!startResponse.ok) throw new Error("LIVE_START_FAILED")
      sequenceRef.current = Math.max(0, (lastTransportSequence.current ?? -1) + 1)
      broadcastingRef.current = true
      setBroadcasting(true)
      const mime = supportedRecorderMime()
      broadcastLoop(stream, mime).catch((error) => {
        console.error("[Malik Live] broadcaster loop failed", error)
        setBroadcastError("Эфир остановлен: не удалось загрузить следующий live-сегмент.")
        broadcastingRef.current = false
        setBroadcasting(false)
      })
      await load()
    } catch (error) {
      console.error("[Malik Live] start failed", error)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      broadcastingRef.current = false
      setBroadcasting(false)
      setBroadcastError("Не удалось запустить камеру/микрофон или live transport.")
    }
  }, [broadcastLoop, liveId, load])

  const stopBroadcast = useCallback(async () => {
    broadcastingRef.current = false
    setBroadcasting(false)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (localVideo.current) localVideo.current.srcObject = null
    await fetch("/api/shorts/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end", liveId }),
    }).catch(() => null)
    await load()
  }, [liveId, load])

  useEffect(() => () => {
    broadcastingRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  if (loading) return <div style={page}><div className={styles.loading}>Подключаю Malik Live…</div></div>
  if (!session) return <div style={page}><div style={inner}><Link href="/shorts/live" style={back}><ArrowLeft size={14} /> Malik Live</Link><div className={styles.empty}>Эфир не найден или уже недоступен.</div></div></div>

  const liveVideo = isOwner && broadcasting
    ? <video ref={localVideo} muted autoPlay playsInline style={videoStyle} />
    : currentSegment
      ? <video ref={remoteVideo} controls muted autoPlay playsInline onEnded={advanceRemote} onError={advanceRemote} style={videoStyle} />
      : session.playback_url
        ? <video src={session.playback_url} controls autoPlay playsInline style={videoStyle} />
        : <div style={{ textAlign: "center", color: "#666", padding: 30 }}><Radio size={42} /><div style={{ marginTop: 10 }}>{session.status === "ended" ? "Эфир завершён." : isOwner ? "Нажми «Начать с камеры» — Malik Shorts сам отправит live-сегменты прямо в CDN." : transportReady ? "Подключаю следующий live-сегмент…" : "Ждём первый live-сегмент автора…"}</div></div>

  return <div style={page}><div style={inner}><Link href="/shorts/live" style={back}><ArrowLeft size={14} /> Все эфиры</Link><div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 14px", flexWrap: "wrap" }}><span style={{ background: session.status === "live" ? "#fff" : "#171717", color: session.status === "live" ? "#050505" : "#aaa", borderRadius: 8, padding: "6px 9px", fontSize: 10, fontWeight: 900 }}><Radio size={11} style={{ marginRight: 5, verticalAlign: "middle" }} />{session.status === "live" ? "LIVE" : session.status.toUpperCase()}</span><div style={{ flex: 1, minWidth: 180 }}><h1 style={{ margin: 0, fontSize: 23 }}>{session.title || "Malik Live"}</h1><div style={{ color: "#777", fontSize: 11 }}>@{session.malik_shorts_profiles?.username || "creator"} · {Number(session.viewer_count || 0)} зрителей · Malik Live Transport</div></div>{isOwner && session.status !== "ended" ? (broadcasting ? <button type="button" className={styles.btn} onClick={stopBroadcast}><Square size={14} /> Завершить эфир</button> : <button type="button" className={styles.btn} onClick={startBroadcast}><Camera size={14} /> Начать с камеры</button>) : null}</div>{broadcastError ? <div style={{ marginBottom: 10, color: "#ff8d8d", fontSize: 12 }}>{broadcastError}</div> : null}<div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,360px)", gap: 12 }}><section style={{ minHeight: 520, borderRadius: 18, overflow: "hidden", background: "#090909", border: "1px solid rgba(255,255,255,.08)", display: "grid", placeItems: "center" }}>{liveVideo}</section><aside style={{ height: 520, borderRadius: 18, background: "#090909", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ padding: 13, borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 12, fontWeight: 800 }}>Live chat</div><div style={{ flex: 1, overflowY: "auto", padding: 12 }}>{chat.map((message) => <div key={message.id} style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.45 }}><strong>{message.malik_shorts_profiles?.display_name || message.malik_shorts_profiles?.username || "Malik user"}</strong> <span style={{ color: "#aaa" }}>{message.body}</span></div>)}<div ref={bottom} /></div><div style={{ display: "flex", gap: 7, padding: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}><input className={styles.search} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send() } }} placeholder="Напиши в эфир…" /><button className={styles.btn} onClick={send}><Send size={14} /></button></div></aside></div></div></div>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#050505", color: "#fff", padding: "22px max(12px,3vw)", fontFamily: "Inter,system-ui,sans-serif" }
const inner: React.CSSProperties = { maxWidth: 1250, margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", gap: 7, alignItems: "center", color: "#888", textDecoration: "none", fontSize: 12 }
const videoStyle: React.CSSProperties = { width: "100%", height: "100%", minHeight: 520, maxHeight: "72vh", objectFit: "contain", background: "#000" }
