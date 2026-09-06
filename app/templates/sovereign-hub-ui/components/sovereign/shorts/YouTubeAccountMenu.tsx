"use client"
import { useState } from "react"
import Link from "next/link"
import type { Channel } from "@/lib/youtube/contracts"
import { api } from "./youtube-api"
import s from "./MalikShortsApp.module.css"
export function YouTubeAccountMenu({ channel, disconnected, error }: { channel: Channel; disconnected: () => void; error: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  return <details className={s.accountMenu}><summary aria-label="Мой YouTube-аккаунт">{channel.avatar ? <img src={channel.avatar} alt="" /> : "Аккаунт"}</summary><div>
    <strong>{channel.title}</strong><Link href={`/shorts/channel/${channel.id}`}>Мой канал</Link><Link href="/shorts/privacy">Данные и разрешения</Link>
    <button disabled={busy} onClick={async () => {
      if (!window.confirm("Отозвать доступ YouTube и удалить историю Malik? Ваши действия в YouTube сохранятся.")) return
      setBusy(true)
      try { await api("/api/youtube/disconnect", "POST", {}); disconnected() } catch (e) { error(e) } finally { setBusy(false) }
    }}>Отключить YouTube</button>
  </div></details>
}
