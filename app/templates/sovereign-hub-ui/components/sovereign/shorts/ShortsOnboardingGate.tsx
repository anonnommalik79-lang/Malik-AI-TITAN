"use client"

import { useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "malik_shorts_onboarded_v2"

export function ShortsOnboardingGate() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<any>(null)
  const [topics, setTopics] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bridges, setBridges] = useState<any>({ youtube: { connected: false }, tiktok: { connected: false } })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch("/api/shorts/me", { cache: "no-store" }),
      fetch("/api/shorts/topics?limit=24&region=KZ", { cache: "no-store" }),
      fetch("/api/youtube/status", { cache: "no-store" }),
      fetch("/api/tiktok/status", { cache: "no-store" }),
    ]).then(async ([meRes, topicsRes, ytRes, ttRes]) => {
      if (!alive || meRes.status === 401) return
      const [me, topicJson, youtube, tiktok] = await Promise.all([
        meRes.json().catch(() => null), topicsRes.json().catch(() => ({ items: [] })), ytRes.json().catch(() => ({ connected: false })), ttRes.json().catch(() => ({ connected: false })),
      ])
      if (!alive) return
      const items = Array.isArray(topicJson?.items) ? topicJson.items : []
      setProfile(me?.profile || null)
      setTopics(items)
      setBridges({ youtube, tiktok })
      const weighted = items.filter((item: any) => Number(item.viewerWeight || 0) > 0)
      setSelected(new Set(weighted.map((item: any) => String(item.id))))
      const locallyDone = window.localStorage.getItem(STORAGE_KEY) === "1"
      if (!locallyDone && weighted.length === 0) setOpen(true)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const canFinish = useMemo(() => topics.length === 0 || selected.size >= Math.min(3, topics.length), [selected.size, topics.length])

  const toggleTopic = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const finish = async () => {
    if (!canFinish || saving) return
    setSaving(true)
    try {
      const chosen = topics.filter((topic) => selected.has(String(topic.id)))
      await Promise.all(chosen.map((topic) => fetch("/api/shorts/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, action: "follow" }),
      }).catch(() => null)))
      window.localStorage.setItem(STORAGE_KEY, "1")
      setOpen(false)
      window.location.reload()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,.88)", backdropFilter: "blur(18px)", display: "grid", placeItems: "center", padding: 18 }}>
    <div style={{ width: "min(680px,100%)", maxHeight: "88vh", overflow: "auto", background: "#090909", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: 24, color: "#fff", boxShadow: "0 30px 100px rgba(0,0,0,.65)" }}>
      <div style={{ fontSize: 10, letterSpacing: ".16em", color: "#777", fontWeight: 800 }}>MALIK SHORTS · ПЕРВЫЙ ЗАПУСК</div>
      {step === 0 ? <>
        <h2 style={{ fontSize: 30, letterSpacing: "-.04em", margin: "12px 0 8px" }}>Один Malik ID — вся социальная сеть.</h2>
        <p style={{ color: "#999", lineHeight: 1.6, fontSize: 14 }}>Твой аккаунт Malik AI автоматически является аккаунтом Malik Shorts. Отдельную регистрацию делать не нужно. YouTube и TikTok подключаются как creator bridges и не заменяют твой Malik-профиль.</p>
        <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: "#101010", border: "1px solid rgba(255,255,255,.08)" }}><strong>{profile?.displayName || "Malik user"}</strong><div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>@{profile?.username || "malik"}</div></div>
        <button onClick={() => setStep(1)} style={primary}>Продолжить</button>
      </> : null}

      {step === 1 ? <>
        <h2 style={{ fontSize: 27, letterSpacing: "-.035em", margin: "12px 0 8px" }}>Подключи свои каналы.</h2>
        <p style={{ color: "#999", lineHeight: 1.6, fontSize: 14 }}>После OAuth Malik сможет показывать твой доступный профиль, публикации и разрешённые действия внутри единого интерфейса.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 18 }}>
          <a href="/api/youtube/connect" style={bridgeCard}><strong>YouTube</strong><span>{bridges.youtube?.connected ? `Подключён · ${bridges.youtube.account?.displayName || "канал"}` : "Войти с YouTube"}</span></a>
          <a href="/api/tiktok/connect" style={bridgeCard}><strong>TikTok</strong><span>{bridges.tiktok?.connected ? `Подключён · ${bridges.tiktok.account?.displayName || "аккаунт"}` : "Подключить TikTok"}</span></a>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}><button onClick={() => setStep(0)} style={secondary}>Назад</button><button onClick={() => setStep(2)} style={primary}>Дальше</button></div>
      </> : null}

      {step === 2 ? <>
        <h2 style={{ fontSize: 27, letterSpacing: "-.035em", margin: "12px 0 8px" }}>Что тебе показывать?</h2>
        <p style={{ color: "#999", lineHeight: 1.6, fontSize: 14 }}>Выбери минимум 3 темы. Это только старт: Malik Ranker дальше перестроит интересы по досмотрам, пропускам, лайкам, сохранениям и подпискам.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>{topics.length ? topics.map((topic) => {
          const active = selected.has(String(topic.id))
          return <button key={topic.id} onClick={() => toggleTopic(String(topic.id))} style={{ ...topicButton, background: active ? "#fff" : "#111", color: active ? "#050505" : "#bbb" }}>{topic.name || topic.slug}</button>
        }) : <div style={{ color: "#777", fontSize: 13 }}>Topic Graph появится после применения V2 migration. Онбординг можно завершить и без него.</div>}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 20 }}><button onClick={() => setStep(1)} style={secondary}>Назад</button><button disabled={!canFinish || saving} onClick={finish} style={{ ...primary, opacity: !canFinish || saving ? .45 : 1 }}>{saving ? "Сохраняю…" : "Запустить мою ленту"}</button><span style={{ color: "#666", fontSize: 11 }}>{selected.size} выбрано</span></div>
      </> : null}
    </div>
  </div>
}

const primary: React.CSSProperties = { border: 0, background: "#fff", color: "#050505", minHeight: 42, borderRadius: 12, padding: "0 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", marginTop: 18 }
const secondary: React.CSSProperties = { ...primary, background: "#171717", color: "#ddd", border: "1px solid rgba(255,255,255,.08)" }
const bridgeCard: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, minHeight: 100, justifyContent: "center", textDecoration: "none", color: "#fff", background: "#101010", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 16, fontSize: 14 }
const topicButton: React.CSSProperties = { minHeight: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,.09)", padding: "0 13px", fontSize: 12, fontWeight: 750, cursor: "pointer" }
