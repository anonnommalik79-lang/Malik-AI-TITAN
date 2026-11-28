"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type User = { id: string; email: string; name: string; createdAt?: string | null; lastSignInAt?: string | null }
type Entry = {
  id: string; userId: string; userEmail: string; userName: string;
  userText: string; assistantText: string; createdAt: string;
  source: "chat" | "voice"; status?: "pending" | "success" | "failed" | "interrupted";
  errorCode?: string; errorMessage?: string; httpStatus?: number; durationMs?: number;
  provider?: string; model?: string;
  textTruncated?: boolean;
}
type Overview = { ok: boolean; recentUsers?: User[]; warning?: string | null; error?: string }
type Activity = { ok: boolean; items?: Entry[]; total?: number; today?: number; yesterday?: number; storage?: string; storageWarning?: string | null; warning?: string | null; error?: string; partial?: boolean }
type Filter = "all" | "success" | "failed" | "interrupted" | "pending"
const EMPTY_ENTRIES: Entry[] = []
const labels: Record<Filter, string> = { all: "Все запросы", success: "Ответил", failed: "Ошибка", interrupted: "Прервано", pending: "В обработке" }
const style: Record<Exclude<Filter, "all">, string> = {
  success: "border-zinc-600 text-white", failed: "border-red-900 text-red-300",
  interrupted: "border-amber-900 text-amber-300", pending: "border-zinc-700 text-zinc-400",
}
function when(iso?: string | null) {
  if (!iso) return "—"
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", year: "numeric" })
}
export default function FounderHistoryClient() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedEmail, setSelectedEmail] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<"feed" | "users" | "analytics">("feed")
  const [mobileFilters, setMobileFilters] = useState(false)
  const [mobileLimit, setMobileLimit] = useState(30)
  const inFlight = useRef<AbortController | null>(null)
  const refresh = useCallback(async (silent = false) => {
    if (silent && inFlight.current) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    if (!silent) setLoading(true)
    setError("")
    try {
      const [a, b] = await Promise.all([
        fetch("/api/founder/overview", { credentials: "same-origin", cache: "no-store", signal: controller.signal }),
        fetch("/api/founder/activity", { credentials: "same-origin", cache: "no-store", signal: controller.signal }),
      ])
      const users = await a.json() as Overview, logs = await b.json() as Activity
      if (controller.signal.aborted) return
      if ([401, 403].includes(a.status) || [401, 403].includes(b.status)) {
        setOverview(null); setActivity(null)
        throw new Error("Нет доступа")
      }
      if (a.ok && users.ok) setOverview(users)
      if (b.ok && logs.ok) setActivity(logs)
      if (!a.ok || !b.ok || !users.ok || !logs.ok) throw new Error(logs.error || users.error || "Сервер временно недоступен")
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить данные") }
    finally { if (inFlight.current === controller) { inFlight.current = null; setLoading(false) } }
  }, [])
  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true) }, 30_000)
    const onAuth = () => { setOverview(null); setActivity(null); void refresh() }
    window.addEventListener("malik-auth-updated", onAuth)
    return () => { window.clearInterval(poll); inFlight.current?.abort(); window.removeEventListener("malik-auth-updated", onAuth) }
  }, [refresh])
  const users = overview?.recentUsers || [], entries = activity?.items || EMPTY_ENTRIES
  const filtered = useMemo(() => entries.filter(row => {
    if (selectedEmail && row.userEmail.toLowerCase() !== selectedEmail.toLowerCase() && row.userId !== selectedEmail) return false
    if (filter !== "all" && (row.status || "success") !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || [row.id, row.userName, row.userEmail, row.userText, row.assistantText, row.errorCode].some(value => String(value || "").toLowerCase().includes(q))
  }), [entries, selectedEmail, filter, query])
  const counts = useMemo(() => ({
    all: entries.length, success: entries.filter(e => (e.status || "success") === "success").length,
    failed: entries.filter(e => e.status === "failed").length, interrupted: entries.filter(e => e.status === "interrupted").length,
    pending: entries.filter(e => e.status === "pending").length,
  }), [entries])
  const unavailable = !activity
  const incomplete = Boolean(error || activity?.partial || activity?.warning)
  const metric = (value: number) => unavailable ? "—" : `${incomplete ? "≥" : ""}${value.toLocaleString("ru-RU")}`
  const percent = (value: number) => unavailable || incomplete || !counts.all ? "—" : `${(100 * value / counts.all).toFixed(1)}%`
  return (
    <main className="relative z-[80] min-h-[100dvh] bg-black px-3 pb-16 pt-3 text-white sm:px-5 lg:px-10 lg:pt-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="hidden lg:flex mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-[.2em] text-zinc-500">MALIK AI / PRIVATE FOUNDER DATABASE</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">История запросов</h1>
            <p className="mt-2 text-sm text-zinc-400">Пользователи, запросы, ответы, ошибки и прерванные генерации.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:border-white">На главную</a>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">{loading ? "Загрузка…" : "Обновить"}</button>
          </div>
        </header>
        <header className="mb-3 lg:hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2 border-b border-white/25 pb-3">
            <a href="/" className="min-w-0 text-lg font-bold tracking-tight">Malik AI</a>
            <div className="flex shrink-0 items-center gap-2"><span className="rounded-full border border-white/60 px-3 py-2 text-xs font-semibold">Founder DB</span><button type="button" aria-label="Обновить историю" onClick={() => void refresh()} disabled={loading} className="h-10 w-10 rounded-full border border-white/40 text-xl disabled:opacity-50">↻</button></div>
          </div>
          <p className="mb-1 text-[9px] font-semibold tracking-[.16em] text-zinc-400">MALIK AI / PRIVATE FOUNDER DATABASE</p>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight">История запросов</h1>
          <p className="mt-1 text-xs text-zinc-400">Запросы, ответы и пользователи · обновление 30 с</p>
        </header>
        {error ? <div role="alert" className="mb-3 rounded-lg border border-red-900 p-2 text-xs text-red-300 lg:mb-5 lg:p-4 lg:text-sm">Не удалось обновить историю. {activity ? "Показаны ранее загруженные данные." : "История недоступна, а не пуста."} <span className="block break-words">{error}</span></div> : null}
        {activity?.storageWarning ? (
          <div role="status" className="hidden lg:block mb-5 border border-amber-900 bg-[#15110a] p-4 text-sm text-amber-200">
            {activity.storageWarning}
          </div>
        ) : activity ? <div className="hidden lg:block mb-5 border border-zinc-800 p-3 text-xs text-zinc-400">Хранилище настроено: {activity.storage}. Автообновление каждые 30 секунд. <a href="/api/founder/storage-health" className="underline">Проверить запись и чтение</a>.</div> : null}
        {activity?.warning || overview?.warning ? <p role="alert" className="mb-3 break-words text-xs text-amber-300 lg:mb-5 lg:text-sm">{activity?.warning || overview?.warning}</p> : null}
        <div className="mb-6 hidden gap-3 lg:grid lg:grid-cols-5">
          {([["Пользователей", users.length], ["Всего запросов", entries.length], ["Ответил", counts.success], ["Ошибка", counts.failed], ["Прервано", counts.interrupted]] as const).map(([label, value]) => (
            <div key={label} className="border border-zinc-800 bg-[#090909] px-4 py-5"><p className="mb-2 text-xs text-zinc-500">{label}</p><strong className="text-3xl tabular-nums">{label === "Пользователей" ? (overview ? value : "—") : metric(value)}</strong></div>
          ))}
        </div>
        <div className="mb-3 grid grid-cols-6 gap-2 lg:hidden">
          {([{ label: "Пользователей", value: overview ? users.length.toLocaleString("ru-RU") : "—", icon: "♙" }, { label: "Всего запросов", value: metric(counts.all), icon: "▤" }, { label: "Ответил", value: metric(counts.success), icon: "✓", detail: percent(counts.success) }, { label: "Ошибка", value: metric(counts.failed), icon: "!", detail: percent(counts.failed) }, { label: "Прервано", value: metric(counts.interrupted), icon: "Ⅱ", detail: percent(counts.interrupted) }]).map((item, i) => (
            <div key={item.label} className={`flex min-w-0 items-center gap-1.5 rounded-xl border border-white/60 px-2 py-2 ${i < 2 ? "col-span-3" : "col-span-2"}`}>
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm">{item.icon}</span>
              <div className="min-w-0"><p className="text-[10px] leading-tight text-zinc-400">{item.label}</p><strong className="block break-all text-lg leading-tight tabular-nums">{item.value}</strong>{item.detail ? <p className="text-[10px] text-zinc-300">{item.detail}</p> : null}</div>
            </div>
          ))}
        </div>
        <section aria-label="Мобильная история" className="min-w-0 lg:hidden">
          <nav aria-label="Разделы истории" className="mb-3 grid grid-cols-[1.4fr_1fr_1fr] gap-1 rounded-xl border border-white/70 p-1">
            {([["feed", "Запросы и ответы"], ["users", "Пользователи"], ["analytics", "Аналитика"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mobileTab === key} onClick={() => setMobileTab(key)} className={`min-h-10 min-w-0 rounded-lg px-1 text-[11px] font-semibold leading-tight ${mobileTab === key ? "bg-white text-black" : "text-white"}`}>{label}</button>)}
          </nav>
          {mobileTab === "feed" ? <>
            <div className="mb-2 flex min-w-0 gap-2">
              <input aria-label="Поиск в истории" value={query} onChange={e => { setQuery(e.target.value); setMobileLimit(30) }} placeholder="Поиск по email, тексту, ID…" className="min-w-0 flex-1 rounded-xl border border-white/60 bg-black px-3 py-2 text-base text-white outline-none focus:border-white" />
              <button type="button" aria-expanded={mobileFilters} onClick={() => setMobileFilters(!mobileFilters)} className="shrink-0 rounded-xl border border-white/60 px-2 text-xs font-semibold">Фильтры</button>
            </div>
            {mobileFilters || selectedEmail ? <select aria-label="Аккаунт" value={selectedEmail} onChange={e => { setSelectedEmail(e.target.value); setMobileLimit(30) }} className="mb-2 w-full min-w-0 rounded-lg border border-white/50 bg-black px-2 py-2 text-base text-white"><option value="">Все аккаунты</option>{users.map(user => <option key={user.id || user.email} value={user.email || user.id}>{user.email || user.name || user.id}</option>)}</select> : null}
            <div className="mb-3 flex min-w-0 gap-1.5 overflow-x-auto pb-1">{(Object.keys(labels) as Filter[]).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setMobileLimit(30) }} className={`min-h-9 shrink-0 rounded-full border px-2 text-[10px] font-semibold ${filter === key ? "border-white bg-white text-black" : "border-white/35 text-white"}`}>{labels[key]} · {metric(counts[key])}</button>)}</div>
            <div className="space-y-2.5">
              {loading && unavailable ? <p className="p-4 text-sm text-zinc-400">Загружаем историю…</p> : unavailable || (incomplete && !filtered.length) ? <p className="p-4 text-sm text-zinc-400">Полная история временно недоступна. Попробуйте обновить.</p> : !filtered.length ? <p className="p-4 text-sm text-zinc-400">Нет записей по выбранному фильтру.</p> : filtered.slice(0, mobileLimit).map(row => {
                const status = row.status || "success", open = expanded === row.id, answer = row.assistantText || (status === "pending" ? "Ответ ещё не завершён" : "Ответ не был сохранён")
                return <article key={row.id + row.userId} className="min-w-0 rounded-xl border border-white/60 p-2.5">
                  <div className="mb-2 flex min-w-0 items-start gap-2">
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">♙</span>
                    <div className="min-w-0 flex-1"><p className="break-all text-xs font-semibold">{row.userEmail || row.userId}</p><p className="mt-0.5 break-words text-[10px] text-zinc-400">{when(row.createdAt)}{row.model ? " · " + row.model : ""}</p></div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${status === "success" ? "border-emerald-600 text-emerald-400" : style[status]}`}>{labels[status]}</span>
                  </div>
                  <div className="mb-1.5 flex min-w-0 items-start gap-2 rounded-lg border border-white/25 bg-[#090909] p-2"><span aria-label="Запрос" className="shrink-0 font-semibold text-zinc-400">Q</span><p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug [overflow-wrap:anywhere] ${open ? "" : "line-clamp-3"}`}>{row.userText || "(без текста)"}</p></div>
                  <div className="flex min-w-0 items-start gap-2 rounded-lg border border-white/25 bg-[#090909] p-2"><span aria-label="Ответ" className="shrink-0 font-semibold text-zinc-400">A</span><p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug [overflow-wrap:anywhere] ${open ? "" : "line-clamp-5"}`}>{answer}</p></div>
                  <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.id)} className="mt-1 min-h-9 w-full text-left text-xs text-zinc-400">{open ? "Свернуть" : "Полный текст и подробности"} {open ? "↑" : "↓"}</button>
                  {open ? <div className="space-y-1 break-words text-xs text-zinc-400">{row.textTruncated ? <p>Текст сокращён в журнале.</p> : null}{row.errorCode || row.errorMessage ? <p className="text-red-300">{row.errorCode} {row.errorMessage}</p> : null}<p>{[row.provider, row.model, row.httpStatus ? "HTTP " + row.httpStatus : "", typeof row.durationMs === "number" ? (row.durationMs / 1000).toFixed(1) + " с" : ""].filter(Boolean).join(" · ")}</p></div> : null}
                </article>
              })}
              {filtered.length > mobileLimit ? <button type="button" onClick={() => setMobileLimit(n => n + 30)} className="w-full rounded-xl border border-white/60 py-3 text-sm">Показать ещё</button> : null}
            </div>
          </> : mobileTab === "users" ? <div className="space-y-2"><button type="button" onClick={() => { setSelectedEmail(""); setMobileTab("feed"); setMobileLimit(30) }} className="w-full rounded-xl border border-white/60 p-3 text-left text-sm">Все аккаунты</button>{users.map(user => <button key={user.id || user.email} type="button" onClick={() => { setSelectedEmail(user.email || user.id); setMobileTab("feed"); setMobileLimit(30); setExpanded(null) }} className="w-full rounded-xl border border-white/50 p-3 text-left"><strong className="block break-all text-sm">{user.name || "Пользователь"}</strong><span className="block break-all text-xs text-zinc-400">{user.email || user.id}</span><span className="text-xs text-zinc-500">{when(user.lastSignInAt || user.createdAt)}</span></button>)}</div> : <div className="space-y-3 rounded-xl border border-white/60 p-3 text-sm"><p>Сегодня: {metric(activity?.today ?? 0)}</p><p>Вчера: {metric(activity?.yesterday ?? 0)}</p><p>В обработке: {metric(counts.pending)}</p><p className="break-words text-xs text-zinc-400">{activity?.storageWarning || (activity ? "Хранилище: " + activity.storage : "Хранилище недоступно")}</p><a href="/api/founder/storage-health" className="underline">Проверить запись и чтение</a></div>}
          {activity?.storageWarning && mobileTab !== "analytics" ? <p className="mt-3 break-words text-xs text-amber-300">{activity.storageWarning}</p> : null}
        </section>
        <div className="hidden min-h-[460px] gap-4 lg:grid lg:grid-cols-[275px_minmax(0,1fr)]">
          <aside className="border border-zinc-800 bg-[#070707]">
            <div className="border-b border-zinc-800 px-4 py-4"><h2 className="font-semibold">Все пользователи</h2><p className="mt-1 text-xs text-zinc-500">Выбери email для истории</p></div>
            <div className="max-h-[570px] overflow-y-auto p-2">
              <button type="button" onClick={() => setSelectedEmail("")} className={`mb-1 w-full rounded-md px-3 py-3 text-left text-sm ${!selectedEmail ? "bg-white text-black" : "text-zinc-300 hover:bg-zinc-900"}`}>Все аккаунты · {users.length}</button>
              {users.map(user => (
                <button key={user.id || user.email} type="button" onClick={() => { setSelectedEmail(user.email || user.id); setExpanded(null) }} className={`mb-1 w-full rounded-md px-3 py-3 text-left ${selectedEmail === (user.email || user.id) ? "bg-white text-black" : "text-zinc-300 hover:bg-zinc-900"}`}>
                  <strong className="block truncate text-xs">{user.name || "Пользователь"}</strong>
                  <span className="mt-1 block break-all text-[11px] opacity-70">{user.email || "email отсутствует"}</span>
                  <span className="mt-1 block text-[10px] opacity-50">Вход: {when(user.lastSignInAt || user.createdAt)}</span>
                </button>
              ))}
            </div>
          </aside>
          <section className="min-w-0 border border-zinc-800 bg-[#070707]">
            <div className="border-b border-zinc-800 p-4">
              <h2 className="mb-3 font-semibold">Запросы и ответы</h2>
              <input aria-label="Поиск по email или сообщению" value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по email, тексту, ошибке…" className="mb-3 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white" />
              <div className="flex flex-wrap gap-2">{(Object.keys(labels) as Filter[]).map(key => (
                <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
                  className={`rounded-lg border px-3 py-2 text-xs ${filter === key ? "border-white bg-white text-black" : "border-zinc-800 text-zinc-400 hover:border-zinc-500"}`}>{labels[key]} · {metric(counts[key])}</button>
              ))}</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading && !activity ? <p className="p-8 text-sm text-zinc-400">Загружаем историю…</p> : unavailable || (incomplete && !filtered.length) ? <p className="p-8 text-sm text-zinc-400">Полная история временно недоступна.</p> : filtered.length === 0 ? <p className="p-8 text-sm text-zinc-500">Записей пока нет по выбранному фильтру. Новые запросы будут отображаться здесь.</p> : filtered.map(row => {
                const status = row.status || "success", isOpen = expanded === row.id
                return <article key={row.id + row.userId} className="border-b border-zinc-900">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : row.id)} aria-expanded={isOpen} className="w-full px-4 py-4 text-left hover:bg-[#111]">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span className={`rounded border px-2 py-1 ${style[status]}`}>{labels[status]}</span>
                      <span>{row.source.toUpperCase()}</span><span>{when(row.createdAt)}</span>
                      {typeof row.httpStatus === "number" ? <span>HTTP {row.httpStatus}</span> : null}
                      {typeof row.durationMs === "number" ? <span>{(row.durationMs / 1000).toFixed(1)} с</span> : null}
                    </div>
                    <p className="mb-1 break-all text-xs text-zinc-400">{row.userEmail || row.userId}</p>
                    <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-zinc-100">{row.userText || "(без текста)"}</p>
                    <p className="mt-2 text-xs text-zinc-500">{isOpen ? "Свернуть ↑" : "Показать ответ и подробности ↓"}</p>
                  </button>
                  {isOpen ? <div className="space-y-4 border-t border-zinc-800 bg-black p-4 text-sm">
                    <div><p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Сообщение пользователя</p><p className="whitespace-pre-wrap break-words text-zinc-200">{row.userText}</p></div>
                    <div><p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Ответ Malik AI</p><p className="whitespace-pre-wrap break-words text-zinc-300">{row.assistantText || (status === "pending" ? "Ответ ещё не завершён" : "Ответ не был сохранён")}</p></div>
                    {row.textTruncated ? <p className="text-xs text-amber-300">Длинный текст сокращён в журнале до 256 000 символов; это не полная копия сообщения.</p> : null}
                    {row.errorCode || row.errorMessage ? <div className="border border-red-900 p-3 text-red-300"><strong>{row.errorCode || "ERROR"}</strong><p className="mt-1 break-words">{row.errorMessage}</p></div> : null}
                    {row.provider || row.model ? <p className="text-xs text-zinc-500">{[row.provider, row.model].filter(Boolean).join(" · ")}</p> : null}
                  </div> : null}
                </article>
              })}
            </div>
          </section>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-zinc-500">Только владелец. Не публикуй переписки и email без основания и уведомляй пользователей о сборе диагностических данных. Pending без подтверждённого завершения более 10 минут отображается как «Прервано», но это не доказывает, что пользователь не получил ответ.</p>
      </div>
    </main>
  )
}
