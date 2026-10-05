"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type User = { id: string; email: string; name: string; createdAt?: string | null; lastSignInAt?: string | null }
type Entry = {
  id: string; userId: string; userEmail: string; userName: string;
  userText: string; assistantText: string; createdAt: string;
  source: "chat" | "voice"; status?: "pending" | "success" | "failed" | "interrupted";
  errorCode?: string; errorMessage?: string; httpStatus?: number; durationMs?: number;
  provider?: string; model?: string;
}
type Overview = { ok: boolean; recentUsers?: User[]; warning?: string | null; error?: string }
type Activity = { ok: boolean; items?: Entry[]; total?: number; today?: number; yesterday?: number; storage?: string; storageWarning?: string | null; warning?: string | null; error?: string }
type Filter = "all" | "success" | "failed" | "interrupted" | "pending"
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
  const refresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [a, b] = await Promise.all([
        fetch("/api/founder/overview", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/founder/activity", { credentials: "same-origin", cache: "no-store" }),
      ])
      const users = await a.json() as Overview, logs = await b.json() as Activity
      if (!a.ok || !b.ok || !users.ok || !logs.ok) throw new Error(logs.error || users.error || "Нет доступа или сервер временно недоступен")
      setOverview(users); setActivity(logs)
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить данные") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const users = overview?.recentUsers || [], entries = activity?.items || []
  const filtered = useMemo(() => entries.filter(row => {
    if (selectedEmail && row.userEmail.toLowerCase() !== selectedEmail.toLowerCase() && row.userId !== selectedEmail) return false
    if (filter !== "all" && (row.status || "success") !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || [row.userName, row.userEmail, row.userText, row.assistantText, row.errorCode].some(value => String(value || "").toLowerCase().includes(q))
  }), [entries, selectedEmail, filter, query])
  const counts = useMemo(() => ({
    all: entries.length, success: entries.filter(e => (e.status || "success") === "success").length,
    failed: entries.filter(e => e.status === "failed").length, interrupted: entries.filter(e => e.status === "interrupted").length,
    pending: entries.filter(e => e.status === "pending").length,
  }), [entries])
  return (
    <main className="relative z-[80] min-h-[100dvh] bg-black px-4 pb-16 pt-7 text-white sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
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
        {error ? <div role="alert" className="mb-5 border border-red-900 p-4 text-sm text-red-300">{error}</div> : null}
        {activity?.storage !== "encrypted-object-storage" ? (
          <div role="status" className="mb-5 border border-amber-900 bg-[#15110a] p-4 text-sm text-amber-200">
            Постоянная база пока НЕ подключена: текущий журнал находится в памяти Render и может исчезнуть после перезапуска. Настрой FOUNDER_HISTORY_BUCKET, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY и SECRET.
          </div>
        ) : <div className="mb-5 border border-zinc-800 p-3 text-xs text-zinc-400">Хранилище настроено: encrypted-object-storage. Для гарантии сохранности проверь тестовую запись после перезапуска сервиса.</div>}
        {activity?.warning || overview?.warning ? <p role="alert" className="mb-5 text-sm text-amber-300">{activity?.warning || overview?.warning}</p> : null}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {([["Пользователей", users.length], ["Всего запросов", entries.length], ["Ответил", counts.success], ["Ошибка", counts.failed], ["Прервано", counts.interrupted]] as const).map(([label, value]) => (
            <div key={label} className="border border-zinc-800 bg-[#090909] px-4 py-5"><p className="mb-2 text-xs text-zinc-500">{label}</p><strong className="text-3xl tabular-nums">{value}</strong></div>
          ))}
        </div>
        <div className="grid min-h-[460px] gap-4 lg:grid-cols-[275px_minmax(0,1fr)]">
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
                  className={`rounded-lg border px-3 py-2 text-xs ${filter === key ? "border-white bg-white text-black" : "border-zinc-800 text-zinc-400 hover:border-zinc-500"}`}>{labels[key]} · {counts[key]}</button>
              ))}</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading && !activity ? <p className="p-8 text-sm text-zinc-400">Загружаем историю…</p> : filtered.length === 0 ? <p className="p-8 text-sm text-zinc-500">Записей пока нет по выбранному фильтру. Новые запросы будут отображаться здесь.</p> : filtered.map(row => {
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
