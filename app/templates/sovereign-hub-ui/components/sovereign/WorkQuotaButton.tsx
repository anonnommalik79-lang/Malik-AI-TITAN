"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Clock3, RefreshCw, X } from "lucide-react"

type LimitWindow = { limit: number | null; used: number; remaining: number | null; resetAt: string | null }
type WorkQuota = {
  tier: "guest" | "free" | "plus" | "owner"
  unlimited: boolean
  fiveHour: LimitWindow
  weekly: LimitWindow
}
function relativeReset(date: string | null) {
  if (!date) return "После первого запроса"
  const diff = Math.max(0, new Date(date).getTime() - Date.now())
  if (diff === 0) return "Обновляется"
  const minutes = Math.ceil(diff / 60000)
  if (minutes < 60) return "Через " + minutes + " мин"
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return "Через " + hours + " ч " + (minutes % 60) + " мин"
  return "Через " + Math.floor(hours / 24) + " д " + (hours % 24) + " ч"
}

function WindowMeter({ label, entry }: { label: string; entry: LimitWindow }) {
  const percent = entry.limit && entry.limit > 0 ? Math.min(100, (entry.used / entry.limit) * 100) : 0
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-zinc-300">{label}</span>
      <strong className="tabular-nums font-semibold text-white">{entry.remaining ?? "∞"} / {entry.limit ?? "∞"} осталось</strong>
    </div>
    {entry.limit !== null ? <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-white transition-[width]" style={{ width: percent + "%" }} />
    </div> : null}
    <p className="text-[11px] text-zinc-500">{entry.resetAt ? "Восстановление: " + relativeReset(entry.resetAt) : "Период начинается с первого запроса"}</p>
  </div>
}

export function WorkQuotaButton() {
  const [open, setOpen] = useState(false)
  const [quota, setQuota] = useState<WorkQuota | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/work/limits", { cache: "no-store", credentials: "same-origin" })
      const json = await response.json()
      if (!response.ok || !json?.ok || !json?.quota) throw new Error(String(json?.message || "Лимиты не загружены"))
      setQuota(json.quota as WorkQuota)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить лимиты")
      setQuota(null)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", dismiss)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", onKey) }
  }, [open])
  return <div className="relative shrink-0" ref={root}>
    <button
      type="button"
      onClick={() => { setOpen((value) => !value); void load() }}
      aria-label="Лимиты Malik Work"
      aria-expanded={open}
      aria-haspopup="dialog"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.045] px-2.5 text-xs font-semibold text-zinc-200 transition hover:border-white/35 hover:bg-white/10 sm:px-3"
    ><Clock3 className="h-4 w-4" /><span className="hidden min-[400px]:inline">Лимиты</span>
      {quota && !quota.unlimited && <span className="tabular-nums text-white">{quota.weekly.remaining ?? 0}</span>}
      {quota?.unlimited && <span>∞</span>}
    </button>
    {open && <section role="dialog" aria-label="Лимиты Malik Work" className="absolute right-0 top-[calc(100%+10px)] z-[400] w-[min(350px,calc(100vw-24px))] space-y-5 rounded-2xl border border-white/15 bg-[#101012] p-4 text-white shadow-[0_18px_56px_rgba(0,0,0,.75)]">
      <div className="flex items-start justify-between gap-2">
        <div><strong className="text-sm">Malik Work · лимиты</strong><p className="mt-1 text-xs text-zinc-400">{quota?.tier === "plus" ? "MalikAI Plus" : quota?.tier === "owner" ? "Владелец" : quota?.tier === "guest" ? "Гость" : "Бесплатный"}</p></div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Обновить лимиты" title="Обновить" className="rounded-lg p-2 hover:bg-white/10" onClick={() => void load()}><RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /></button>
          <button type="button" aria-label="Закрыть лимиты" className="rounded-lg p-2 hover:bg-white/10" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : null}
      {!quota && !error ? <p className="text-xs text-zinc-400">Загружаю реальные данные…</p> : null}
      {quota?.unlimited ? <p className="text-sm text-zinc-200">Неограниченный доступ к Malik Work.</p> : null}
      {quota?.tier === "guest" ? <p className="text-sm text-zinc-300">Войдите в аккаунт, чтобы получить 6 запросов в неделю.</p> : null}
      {quota && quota.tier !== "guest" && !quota.unlimited && <div className="space-y-5">
        {quota.fiveHour.limit !== null && <WindowMeter label="За 5 часов" entry={quota.fiveHour} />}
        <WindowMeter label="За 7 дней" entry={quota.weekly} />
      </div>}
      <p className="border-t border-white/10 pt-3 text-[11px] leading-5 text-zinc-500">Учитываются только запросы в Malik Work. Для Plus работают два независимых периода; списание подтверждается сервером.</p>
    </section>}
  </div>
}
