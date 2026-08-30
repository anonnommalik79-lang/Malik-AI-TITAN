"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Crown,
  FolderKanban,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react"
import { getStoredAuthSnapshot } from "@/lib/auth/client-session"
import { MALIK_OWNER_EMAIL } from "@/lib/auth/admin-policy"

type FounderPayload = {
  ok: boolean
  generatedAt?: string
  error?: string
  warning?: string | null
  metrics?: {
    totalUsers: number
    returningUsers: number
    retentionRate: number
    verifiedUsers: number
    newUsers7d: number
    dau: number
    wau: number
    mau: number
    runtimeActiveUsers: number
    totalTokens: number
    chatRequests: number
    projectRequests: number
    imageGenerations: number
    videoGenerations: number
    uploads: number
  }
  runtimeSafety?: {
    maxJsonMb: number
    disabledFeatures: string[]
    urlGuard: boolean
    requestTimeouts: boolean
    streamingBodyLimit: boolean
    founderAuth: string
    workosTimeoutMs: number
    secretsExposed: boolean
  }
  topUsage?: Array<{
    userId: string
    tokensUsed: number
    chatCount: number
    imageCount: number
    videoCount: number
    projectCount: number
  }>
  recentUsers?: Array<{
    id: string
    email: string
    name: string
    emailVerified: boolean
    createdAt: string | null
    lastSignInAt: string | null
    activeToday?: boolean
  }>
  scopes?: {
    users: string
    tokenAndGenerationUsage: string
  }
}

function isFounderSnapshot() {
  const snapshot = getStoredAuthSnapshot()
  return Boolean(
    snapshot?.isAdmin === true &&
    snapshot?.email?.trim().toLowerCase() === MALIK_OWNER_EMAIL,
  )
}

function number(value: number | undefined) {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Number(value) || 0))
}

function when(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  emphasis = false,
}: {
  label: string
  value: string
  note?: string
  icon: typeof Users
  emphasis?: boolean
}) {
  return (
    <article className={`malik-founder-card${emphasis ? " is-emphasis" : ""}`}>
      <div className="malik-founder-card__head">
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  )
}

function SafetyItem({ label, value, ok = true }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className={`malik-founder-safety-item${ok ? " is-ok" : " is-warn"}`}>
      <span className="malik-founder-safety-dot" />
      <span><strong>{label}</strong><small>{value}</small></span>
    </div>
  )
}

export function FounderConsoleRuntime() {
  const [founder, setFounder] = useState(false)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<FounderPayload | null>(null)
  const [error, setError] = useState("")
  const [mobile, setMobile] = useState(false)
  const [userQuery, setUserQuery] = useState("")

  const refresh = useCallback(async () => {
    if (!founder) return
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/founder/overview", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as FounderPayload
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Founder API ${response.status}`)
      setPayload(data)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику")
    } finally {
      setLoading(false)
    }
  }, [founder])

  useEffect(() => {
    const updateFounder = () => {
      const next = isFounderSnapshot()
      setFounder(next)
      if (!next) setOpen(false)
    }
    updateFounder()
    window.addEventListener("malik-auth-updated", updateFounder)
    window.addEventListener("storage", updateFounder)
    return () => {
      window.removeEventListener("malik-auth-updated", updateFounder)
      window.removeEventListener("storage", updateFounder)
    }
  }, [])

  useEffect(() => {
    if (!founder) {
      setNavTarget(null)
      return
    }

    let frame = 0
    const scan = () => {
      frame = 0
      const sidebar = document.querySelector<HTMLElement>(".malik-sidebar")
      const expanded = sidebar?.querySelector<HTMLElement>('nav[aria-label="Основная навигация"]')
      const collapsed = sidebar?.querySelector<HTMLElement>('nav[aria-label="Навигация"]')
      const target = expanded || collapsed || null
      setNavTarget((current) => current === target ? current : target)
      setSidebarWidth(sidebar?.getBoundingClientRect().width || 0)
      setMobile(window.innerWidth <= 768)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-collapsed"] })
    window.addEventListener("resize", schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [founder])

  useEffect(() => {
    if (!open || !founder) return
    void refresh()
  }, [open, founder, refresh])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const sidebarButton = target?.closest(".malik-sidebar button")
      if (sidebarButton && !sidebarButton.hasAttribute("data-founder-nav")) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClick, true)
    }
  }, [open])

  const metrics = payload?.metrics
  const safety = payload?.runtimeSafety
  const navCollapsed = navTarget?.getAttribute("aria-label") === "Навигация"
  const offset = mobile ? 0 : sidebarWidth

  const primaryMetrics = useMemo(() => [
    { label: "Пользователи", value: number(metrics?.totalUsers), note: "зарегистрировано", icon: Users },
    { label: "Вернулись", value: number(metrics?.returningUsers), note: `${metrics?.retentionRate || 0}% retention`, icon: RotateCcw },
    { label: "Токены", value: number(metrics?.totalTokens), note: "использовано моделями сегодня", icon: Zap },
    { label: "Активны сегодня", value: number(metrics?.dau), note: "DAU по входам", icon: Activity },
  ], [metrics])

  const visibleUsers = useMemo(() => {
    const users = payload?.recentUsers || []
    const query = userQuery.trim().toLowerCase()
    if (!query) return users
    return users.filter((entry) => `${entry.name || ""} ${entry.email || ""}`.toLowerCase().includes(query))
  }, [payload?.recentUsers, userQuery])

  if (!founder || typeof document === "undefined") return null

  const navButton = navTarget ? createPortal(
    navCollapsed ? (
      <button
        type="button"
        data-founder-nav
        aria-label="Основатель"
        title="Основатель"
        aria-current={open ? "page" : undefined}
        onClick={() => setOpen(true)}
        className={`malik-sidebar-rail-btn${open ? " is-active" : ""}`}
      >
        <Crown className="h-[18px] w-[18px]" />
      </button>
    ) : (
      <button
        type="button"
        data-founder-nav
        aria-current={open ? "page" : undefined}
        onClick={() => setOpen(true)}
        className={`malik-sidebar-primary malik-founder-nav${open ? " is-active" : ""}`}
      >
        <Crown className="h-[17px] w-[17px]" />
        <span>Основатель</span>
        <em>PRIVATE</em>
      </button>
    ),
    navTarget,
  ) : null

  const consoleView = open ? createPortal(
    <section className="malik-founder-layer" style={{ left: offset }} aria-label="Консоль основателя">
      <header className="malik-founder-header">
        <div className="malik-founder-header__copy">
          <div className="malik-founder-eyebrow"><Crown /> FOUNDER PRIVATE</div>
          <h1>Основатель</h1>
          <p>Живая внутренняя аналитика Malik AI</p>
        </div>
        <div className="malik-founder-header__actions">
          <button type="button" onClick={() => void refresh()} disabled={loading} title="Обновить" aria-label="Обновить аналитику">
            <RefreshCw className={loading ? "is-spinning" : ""} />
          </button>
          <button type="button" onClick={() => setOpen(false)} title="Закрыть" aria-label="Закрыть"><X /></button>
        </div>
      </header>

      <div className="malik-founder-scroll">
        <div className="malik-founder-primary-grid">
          {primaryMetrics.map((card, index) => (
            <MetricCard key={card.label} {...card} emphasis={index === 0 || index === 1} />
          ))}
        </div>

        {error ? (
          <div className="malik-founder-error">
            <ShieldCheck />
            <div><strong>Данные временно недоступны</strong><span>{error}</span></div>
            <button type="button" onClick={() => void refresh()}>Повторить</button>
          </div>
        ) : null}

        <div className="malik-founder-section-title">
          <div><strong>Активность продукта</strong><span>Авторизация + реальные runtime-счётчики</span></div>
          {payload?.generatedAt ? <time>{when(payload.generatedAt)}</time> : null}
        </div>

        <div className="malik-founder-secondary-grid">
          <MetricCard label="WAU" value={number(metrics?.wau)} note="активны 7 дней" icon={BarChart3} />
          <MetricCard label="MAU" value={number(metrics?.mau)} note="активны 30 дней" icon={Sparkles} />
          <MetricCard label="Новые · 7 дней" value={number(metrics?.newUsers7d)} note="новые аккаунты" icon={UserPlus} />
          <MetricCard label="Проверенные" value={number(metrics?.verifiedUsers)} note="email verified" icon={CheckCircle2} />
          <MetricCard label="Сообщения" value={number(metrics?.chatRequests)} note="AI запросы сегодня" icon={MessageSquare} />
          <MetricCard label="Проекты" value={number(metrics?.projectRequests)} note="project-запросы сегодня" icon={FolderKanban} />
          <MetricCard label="Фото" value={number(metrics?.imageGenerations)} note="генерации сегодня" icon={ImageIcon} />
          <MetricCard label="Видео" value={number(metrics?.videoGenerations)} note="генерации сегодня" icon={Video} />
          <MetricCard label="Загрузки" value={number(metrics?.uploads)} note="файлы сегодня" icon={Upload} />
          <MetricCard label="Runtime users" value={number(metrics?.runtimeActiveUsers)} note="видел текущий сервер" icon={Activity} />
        </div>

        <div className="malik-founder-section-title">
          <div><strong>Состояние runtime</strong><span>Защита запросов и серверные предохранители</span></div>
          <span className={`malik-founder-health-pill${safety ? " is-live" : ""}`}><span />{safety ? "LIVE" : "WAIT"}</span>
        </div>

        <section className="malik-founder-safety">
          <div className="malik-founder-safety__head">
            <div className="malik-founder-safety__icon"><ShieldCheck /></div>
            <div><strong>Runtime Safety</strong><span>Никакие секреты и API-ключи здесь не отображаются.</span></div>
          </div>
          <div className="malik-founder-safety-grid">
            <SafetyItem label="Founder auth" value={safety?.founderAuth === "server-verified" ? "Проверяется сервером" : "Ожидание данных"} ok={safety?.founderAuth === "server-verified"} />
            <SafetyItem label="URL guard" value={safety?.urlGuard ? "Private/credential URL блокируются" : "Ожидание данных"} ok={Boolean(safety?.urlGuard)} />
            <SafetyItem label="Request timeout" value={safety?.requestTimeouts ? "Внешние запросы ограничены по времени" : "Ожидание данных"} ok={Boolean(safety?.requestTimeouts)} />
            <SafetyItem label="Body limit" value={safety ? `${number(safety.maxJsonMb)} MB JSON + streaming guard` : "Ожидание данных"} ok={Boolean(safety?.streamingBodyLimit)} />
            <SafetyItem label="WorkOS timeout" value={safety ? `${number(Math.round(safety.workosTimeoutMs / 1000))} сек` : "Ожидание данных"} ok={Boolean(safety?.workosTimeoutMs)} />
            <SafetyItem label="Secrets" value={safety?.secretsExposed === false ? "Не выдаются клиенту" : "Ожидание данных"} ok={safety?.secretsExposed === false} />
          </div>
          {safety?.disabledFeatures?.length ? (
            <div className="malik-founder-disabled"><strong>Отключено через env:</strong><span>{safety.disabledFeatures.join(", ")}</span></div>
          ) : null}
        </section>

        <div className="malik-founder-columns">
          <section className="malik-founder-panel">
            <div className="malik-founder-panel__head">
              <div><strong>Кто расходует токены</strong><span>Текущий день / текущий Render runtime</span></div>
              <Zap />
            </div>
            <div className="malik-founder-table">
              <div className="malik-founder-table__row is-head"><span>Пользователь</span><span>Запросы</span><span>Токены</span></div>
              {(payload?.topUsage || []).length ? (payload?.topUsage || []).map((entry) => (
                <div key={entry.userId} className="malik-founder-table__row">
                  <span title={entry.userId}>{entry.userId}</span>
                  <span>{number(entry.chatCount + entry.projectCount)}</span>
                  <span>{number(entry.tokensUsed)}</span>
                </div>
              )) : <div className="malik-founder-empty">Пока нет расхода токенов в текущем runtime.</div>}
            </div>
          </section>

          <section className="malik-founder-panel">
            <div className="malik-founder-panel__head malik-founder-panel__head--users">
              <div><strong>Все пользователи</strong><span>{number(payload?.recentUsers?.length)} аккаунтов WorkOS</span></div>
              <Users />
            </div>
            <label className="malik-founder-user-search">
              <Search aria-hidden="true" />
              <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Поиск по имени или email" aria-label="Поиск пользователей" />
              {userQuery ? <button type="button" onClick={() => setUserQuery("")} aria-label="Очистить поиск"><X /></button> : null}
            </label>
            <div className="malik-founder-users">
              {visibleUsers.length ? visibleUsers.map((entry) => (
                <div key={entry.id || entry.email} className="malik-founder-user-row">
                  <span className="malik-founder-user-avatar">{(entry.name || entry.email || "U").charAt(0).toUpperCase()}</span>
                  <span className="malik-founder-user-copy">
                    <strong>{entry.name || "Пользователь"}{entry.emailVerified ? <CheckCircle2 /> : null}{entry.activeToday ? <span className="malik-founder-online-dot" title="Активен сегодня" /> : null}</strong>
                    <small title={entry.email}>{entry.email}</small>
                  </span>
                  <time>{when(entry.lastSignInAt || entry.createdAt)}</time>
                </div>
              )) : <div className="malik-founder-empty">{userQuery ? "По этому запросу пользователей нет." : "WorkOS пока не вернул список пользователей."}</div>}
            </div>
          </section>
        </div>

        <footer className="malik-founder-foot">
          <ShieldCheck />
          <span>
            Доступ защищён сервером и разрешён только подтверждённому owner-аккаунту. Пользователи/возвраты берутся из {payload?.scopes?.users || "WorkOS"}; токены и генерации — {payload?.scopes?.tokenAndGenerationUsage || "из текущего runtime"}.
            {payload?.warning ? ` Источник WorkOS сообщил: ${payload.warning}` : ""}
          </span>
        </footer>
      </div>

      <style>{`
        .malik-founder-nav { position:relative; }
        .malik-founder-nav em { margin-left:auto; border:1px solid rgba(232,197,106,.22); border-radius:999px; padding:2px 5px; color:#b89a53; font-size:7.5px; font-style:normal; font-weight:800; letter-spacing:.08em; }
        .malik-founder-layer { position:fixed; z-index:72; top:0; right:0; bottom:0; display:flex; min-width:0; flex-direction:column; overflow:hidden; background:#050505; color:#f7f7f8; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .malik-founder-header { min-height:86px; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:16px 26px; border-bottom:1px solid rgba(255,255,255,.08); background:#080808; }
        .malik-founder-header__copy { min-width:0; }
        .malik-founder-eyebrow { display:flex; align-items:center; gap:7px; margin-bottom:5px; color:#c9aa61; font-size:9px; font-weight:850; letter-spacing:.16em; }
        .malik-founder-eyebrow svg { width:13px; height:13px; }
        .malik-founder-header h1 { margin:0; color:#fff; font-size:24px; line-height:1.1; font-weight:720; letter-spacing:-.035em; }
        .malik-founder-header p { margin:5px 0 0; color:#77777f; font-size:12px; }
        .malik-founder-header__actions { display:flex; flex:0 0 auto; gap:7px; }
        .malik-founder-header__actions button { width:38px; height:38px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.09); border-radius:10px; background:#121212; color:#a9a9af; }
        .malik-founder-header__actions button:hover { background:#1a1a1a; color:#fff; }
        .malik-founder-header__actions svg { width:17px; height:17px; }
        .malik-founder-header__actions .is-spinning { animation:malik-founder-spin .8s linear infinite; }
        .malik-founder-scroll { min-height:0; flex:1; overflow:auto; overscroll-behavior:contain; padding:24px 26px 36px; scrollbar-width:thin; scrollbar-color:#252525 transparent; }
        .malik-founder-primary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
        .malik-founder-secondary-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
        .malik-founder-card { min-width:0; min-height:112px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid rgba(255,255,255,.08); border-radius:15px; background:#0e0e0e; padding:15px; }
        .malik-founder-card.is-emphasis { border-color:rgba(232,197,106,.18); background:#11100d; }
        .malik-founder-card__head { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#818188; font-size:11px; font-weight:650; }
        .malik-founder-card__head span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-card__head svg { width:16px; height:16px; flex:0 0 auto; color:#696970; }
        .malik-founder-card.is-emphasis .malik-founder-card__head svg { color:#c9aa61; }
        .malik-founder-card > strong { margin-top:12px; overflow:hidden; color:#fff; font-size:27px; line-height:1; font-weight:730; letter-spacing:-.04em; text-overflow:ellipsis; }
        .malik-founder-card > small { margin-top:8px; overflow:hidden; color:#66666d; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-section-title { display:flex; align-items:end; justify-content:space-between; gap:12px; margin:27px 0 11px; }
        .malik-founder-section-title div { min-width:0; display:grid; gap:3px; }
        .malik-founder-section-title strong { color:#ededee; font-size:14px; }
        .malik-founder-section-title span,.malik-founder-section-title time { color:#66666e; font-size:10px; }
        .malik-founder-health-pill { display:inline-flex; flex:0 0 auto; align-items:center; gap:6px; border:1px solid rgba(255,255,255,.08); border-radius:999px; padding:4px 8px; color:#67676e !important; font-size:8px !important; font-weight:800; letter-spacing:.08em; }
        .malik-founder-health-pill > span { width:6px; height:6px; border-radius:999px; background:#666; }
        .malik-founder-health-pill.is-live { border-color:rgba(92,173,113,.2); color:#8ec29a !important; }
        .malik-founder-health-pill.is-live > span { background:#69b77b; box-shadow:0 0 10px rgba(105,183,123,.45); }
        .malik-founder-safety { overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:#0c0c0c; }
        .malik-founder-safety__head { display:flex; align-items:center; gap:11px; padding:14px 15px; border-bottom:1px solid rgba(255,255,255,.07); }
        .malik-founder-safety__icon { width:34px; height:34px; display:grid; flex:0 0 auto; place-items:center; border:1px solid rgba(104,176,123,.14); border-radius:10px; background:rgba(104,176,123,.06); color:#7db58a; }
        .malik-founder-safety__icon svg { width:17px; height:17px; }
        .malik-founder-safety__head > div:last-child { min-width:0; display:grid; gap:3px; }
        .malik-founder-safety__head strong { color:#e4e4e7; font-size:12px; }
        .malik-founder-safety__head span { color:#66666e; font-size:9.5px; }
        .malik-founder-safety-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; background:rgba(255,255,255,.055); }
        .malik-founder-safety-item { min-width:0; display:flex; align-items:flex-start; gap:9px; background:#0b0b0b; padding:12px 14px; }
        .malik-founder-safety-dot { width:7px; height:7px; flex:0 0 auto; margin-top:4px; border-radius:999px; background:#6d6d73; }
        .malik-founder-safety-item.is-ok .malik-founder-safety-dot { background:#69b77b; box-shadow:0 0 10px rgba(105,183,123,.3); }
        .malik-founder-safety-item.is-warn .malik-founder-safety-dot { background:#b9a064; }
        .malik-founder-safety-item > span:last-child { min-width:0; display:grid; gap:3px; }
        .malik-founder-safety-item strong { overflow:hidden; color:#cfcfd3; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-safety-item small { overflow:hidden; color:#5f5f67; font-size:9px; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-disabled { display:flex; gap:8px; border-top:1px solid rgba(255,255,255,.06); padding:10px 14px; color:#696970; font-size:9px; }
        .malik-founder-disabled strong { color:#98989e; }
        .malik-founder-disabled span { min-width:0; overflow-wrap:anywhere; }
        .malik-founder-columns { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:12px; margin-top:22px; }
        .malik-founder-panel { min-width:0; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:#0c0c0c; }
        .malik-founder-panel__head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 16px; border-bottom:1px solid rgba(255,255,255,.07); }
        .malik-founder-panel__head div { min-width:0; display:grid; gap:3px; }
        .malik-founder-panel__head strong { color:#eee; font-size:12px; }
        .malik-founder-panel__head span { overflow:hidden; color:#65656c; font-size:9.5px; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-panel__head > svg { width:16px; height:16px; flex:0 0 auto; color:#77777e; }
        .malik-founder-table { padding:6px 10px 10px; }
        .malik-founder-table__row { display:grid; grid-template-columns:minmax(0,1fr) 76px 92px; gap:10px; align-items:center; min-height:37px; padding:0 6px; border-bottom:1px solid rgba(255,255,255,.045); color:#bdbdc2; font-size:10.5px; }
        .malik-founder-table__row:last-child { border-bottom:0; }
        .malik-founder-table__row span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-table__row span:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
        .malik-founder-table__row.is-head { min-height:31px; color:#5f5f67; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
        .malik-founder-user-search { position:relative; display:block; margin:10px 10px 4px; }
        .malik-founder-user-search > svg { position:absolute; top:50%; left:10px; width:13px; height:13px; transform:translateY(-50%); color:#5f5f66; pointer-events:none; }
        .malik-founder-user-search input { width:100%; height:34px; border:1px solid rgba(255,255,255,.08); border-radius:10px; outline:0; background:#111; padding:0 34px 0 31px; color:#d7d7da; font:inherit; font-size:10px; }
        .malik-founder-user-search input::placeholder { color:#55555c; }
        .malik-founder-user-search input:focus { border-color:rgba(255,255,255,.16); }
        .malik-founder-user-search button { position:absolute; top:50%; right:5px; width:26px; height:26px; display:grid; place-items:center; transform:translateY(-50%); border:0; border-radius:8px; background:transparent; color:#66666d; }
        .malik-founder-user-search button:hover { background:#1a1a1a; color:#aaa; }
        .malik-founder-user-search button svg { width:12px; height:12px; }
        .malik-founder-users { max-height:430px; overflow:auto; overscroll-behavior:contain; padding:5px 10px 10px; scrollbar-width:thin; scrollbar-color:#222 transparent; }
        .malik-founder-user-row { display:grid; grid-template-columns:32px minmax(0,1fr) auto; gap:10px; align-items:center; min-height:51px; border-bottom:1px solid rgba(255,255,255,.045); }
        .malik-founder-user-row:last-child { border-bottom:0; }
        .malik-founder-user-avatar { width:28px; height:28px; display:grid; place-items:center; border-radius:9px; background:#181818; color:#d8d8db; font-size:10px; font-weight:800; }
        .malik-founder-user-copy { min-width:0; display:grid; gap:2px; }
        .malik-founder-user-copy strong { display:flex; align-items:center; gap:5px; overflow:hidden; color:#d7d7da; font-size:10.5px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-user-copy strong svg { width:11px; height:11px; flex:0 0 auto; color:#8ea58e; }
        .malik-founder-online-dot { width:6px; height:6px; flex:0 0 auto; border-radius:999px; background:#69b77b; box-shadow:0 0 7px rgba(105,183,123,.35); }
        .malik-founder-user-copy small { overflow:hidden; color:#626269; font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
        .malik-founder-user-row time { color:#5f5f66; font-size:9px; white-space:nowrap; }
        .malik-founder-empty { padding:22px 8px; color:#606067; font-size:10px; text-align:center; }
        .malik-founder-error { display:flex; align-items:center; gap:11px; margin-top:12px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:#101010; padding:12px 14px; }
        .malik-founder-error > svg { width:18px; height:18px; flex:0 0 auto; color:#bca261; }
        .malik-founder-error div { min-width:0; flex:1; display:grid; gap:2px; }
        .malik-founder-error strong { color:#e6e6e8; font-size:11px; }
        .malik-founder-error span { overflow-wrap:anywhere; color:#6e6e75; font-size:9px; }
        .malik-founder-error button { flex:0 0 auto; border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:6px 9px; background:#181818; color:#cfcfd2; font-size:9px; }
        .malik-founder-foot { display:flex; align-items:flex-start; gap:9px; margin-top:14px; color:#606067; font-size:9.5px; line-height:1.55; }
        .malik-founder-foot span { min-width:0; overflow-wrap:anywhere; }
        .malik-founder-foot svg { width:14px; height:14px; flex:0 0 auto; margin-top:1px; color:#78787f; }
        @keyframes malik-founder-spin { to { transform:rotate(360deg); } }
        @media (max-width:1280px) { .malik-founder-secondary-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
        @media (max-width:1100px) { .malik-founder-primary-grid,.malik-founder-secondary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .malik-founder-columns { grid-template-columns:1fr; } .malik-founder-safety-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:768px) { .malik-founder-layer { left:0 !important; z-index:90; } .malik-founder-header { min-height:74px; padding:12px 14px; } .malik-founder-header h1 { font-size:21px; } .malik-founder-header p { max-width:58vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .malik-founder-scroll { padding:14px 12px calc(28px + env(safe-area-inset-bottom)); } .malik-founder-primary-grid,.malik-founder-secondary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .malik-founder-card { min-height:103px; padding:13px; } .malik-founder-card > strong { font-size:23px; } .malik-founder-safety-grid { grid-template-columns:1fr 1fr; } .malik-founder-safety-item { padding:11px 10px; } .malik-founder-users { max-height:50dvh; } }
        @media (max-width:430px) { .malik-founder-primary-grid,.malik-founder-secondary-grid { grid-template-columns:1fr 1fr; } .malik-founder-card__head { font-size:10px; } .malik-founder-card > strong { font-size:21px; } .malik-founder-card > small { font-size:9px; } .malik-founder-safety-grid { grid-template-columns:1fr; } .malik-founder-section-title { align-items:center; } .malik-founder-section-title time { display:none; } .malik-founder-table__row { grid-template-columns:minmax(0,1fr) 58px 72px; gap:7px; font-size:9.5px; } .malik-founder-user-row time { display:none; } .malik-founder-error { align-items:flex-start; } }
      `}</style>
    </section>,
    document.body,
  ) : null

  return <>{navButton}{consoleView}</>
}
