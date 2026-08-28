"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AudioLines, Bot, Clock3, Cpu, Film, ImageIcon, Info, MessageSquare,
  Plug, RefreshCw, Search, ShieldCheck,
} from "lucide-react"
import { COMPUTE_WEIGHTS, MAX_AGENT_COMPUTE, MAX_AGENT_RETRIES, MAX_AGENT_STEPS } from "@/lib/malik-compute/config"
import type { ComputeAdminStats, ComputeOperation, ComputePageData } from "@/lib/malik-compute/types"
import styles from "./compute.module.css"

const categories = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "research", label: "Research", icon: Search },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "voice", label: "Voice", icon: AudioLines },
  { id: "video", label: "Video", icon: Film },
  { id: "plugin", label: "Plugins", icon: Plug },
] as const

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

function UsageRows({ usage, total }: { usage: Record<ComputeOperation, number>; total: number }) {
  return <div className={styles.usage}>
    {categories.map(({ id, label, icon: Icon }) => <div className={styles.usageRow} key={id}>
      <span className={styles.category}><Icon size={16} aria-hidden="true" />{label}</span>
      <div className={styles.miniTrack} aria-hidden="true"><span style={{ width: `${Math.min(100, total ? usage[id] / total * 100 : 0)}%` }} /></div>
      <span className={styles.amount}>{number(usage[id])} <small>MCU</small></span>
    </div>)}
  </div>
}

function AdminCompute({ stats }: { stats: ComputeAdminStats }) {
  const metrics = [
    ["Requests today", number(stats.requests)],
    ["Compute used today", number(stats.used) + " MCU"],
    ["Remaining / capacity", number(stats.remaining) + " / " + number(stats.capacity)],
    ["Failed requests", number(stats.failedRequests)],
    ["Fallback count", number(stats.fallbackCount)],
    ["Reserved", number(stats.reserved) + " MCU"],
  ]
  return <section aria-label="Admin Compute">
    <div className={styles.sectionHeader}><h2><ShieldCheck size={17} /> Admin</h2><span className={styles.muted}>Сегодня · фактические операции</span></div>
    <div className={styles.metrics}>{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className={styles.columns}>
      <section className={styles.card}><h2>Usage by capability</h2><UsageRows usage={stats.usage} total={stats.used} /></section>
      <div className={styles.stack}>
        <section className={styles.card}><h2>Provider Health</h2><span className={styles.badge}>Не подключено</span><p className={styles.muted}>Мониторинг пока не подключён. Статус провайдеров не проверялся.</p></section>
        <section className={styles.card}><h2>Routing Distribution</h2><span className={styles.badge}>Не подключено</span><p className={styles.muted}>Здесь появится распределение маршрутов после подключения телеметрии.</p></section>
      </div>
    </div>
  </section>
}

export default function ComputePanel() {
  const [data, setData] = useState<ComputePageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [view, setView] = useState<"balance" | "admin">("balance")

  const refresh = useCallback((signal?: AbortSignal) =>
    fetch("/api/compute", { cache: "no-store", credentials: "same-origin", signal }).then((response) => {
      if (!response.ok) throw new Error("Compute unavailable")
      return response.json() as Promise<ComputePageData>
    }).then((next) => {
      if (!signal?.aborted) {
        setData(next)
        setError("")
        if (!next.admin) setView("balance")
      }
    }).catch(() => {
      if (!signal?.aborted) {
        setData(null)
        setError("Не удалось загрузить Compute. Проверьте вход в аккаунт и попробуйте ещё раз.")
      }
    }).finally(() => {
      if (!signal?.aborted) setLoading(false)
    }), [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    const update = () => { if (document.visibilityState === "visible") void refresh(controller.signal) }
    const timer = window.setInterval(update, 15000)
    window.addEventListener("focus", update)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", update) }
  }, [refresh])

  const balance = data?.balance
  const percent = balance && balance.dailyLimit ? balance.remaining / balance.dailyLimit * 100 : 0

  return <div className={styles.page} data-malik-compute>
    <div className={styles.content}>
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}><Cpu size={15} /> COMPUTE / V1</span><h1>Malik Compute</h1><p>One balance. Every capability. Every model.</p></div>
        <button className={styles.refresh} type="button" onClick={() => { setLoading(true); setError(""); void refresh() }} disabled={loading} aria-label="Обновить Compute"><RefreshCw size={17} className={loading ? styles.spinning : undefined} /></button>
      </div>
      <div className={styles.notice}><Info size={16} aria-hidden="true" /><p><strong>Реальный учёт.</strong> Успешные запросы используют общий баланс. Ошибки и демо-ответы не списываются. Обновление каждые 15 секунд.</p></div>
      {data?.guest ? <p className={styles.muted}>Гостевой баланс сохранён в этом браузере. Войдите в аккаунт, чтобы использовать один баланс на разных устройствах.</p> : null}
      {data?.admin && data.storage === "local-directory" ? <p className={styles.error}>Хранилище: локальный каталог сервера. Для сохранения при деплоях Render подключите постоянный диск и задайте MALIK_COMPUTE_DATA_DIR.</p> : null}
      {data?.admin ? <nav className={styles.tabs} aria-label="Разделы Compute">
        <button type="button" aria-pressed={view === "balance"} onClick={() => setView("balance")}>Мой Compute</button>
        <button type="button" aria-pressed={view === "admin"} onClick={() => setView("admin")}><ShieldCheck size={14} /> Admin</button>
      </nav> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!data && loading ? <div className={styles.loading} role="status">Загружаю Compute…</div> : null}
      {balance && view === "balance" ? <>
        <section className={styles.balance} aria-label="Daily compute remaining">
          <div className={styles.balanceTop}><span>Daily compute remaining</span><span className={styles.reset}><Clock3 size={14} /> Resets daily · 00:00 UTC</span></div>
          <div className={styles.balanceValue}><strong>{number(balance.remaining)}</strong><span>/ {number(balance.dailyLimit)} MCU</span></div>
          <div className={styles.track} role="progressbar" aria-label="Осталось Compute" aria-valuemin={0} aria-valuemax={balance.dailyLimit} aria-valuenow={balance.remaining} aria-valuetext={`${balance.remaining} из ${balance.dailyLimit} MCU`}><span style={{ width: `${percent}%` }} /></div>
          <div className={styles.balanceBottom}><span>Used <strong>{number(balance.used)} MCU</strong></span><span>Reserved <strong>{number(balance.reserved)} MCU</strong></span></div>
        </section>
        <div className={styles.columns}>
          <section className={styles.card}><div className={styles.sectionHeader}><h2>Usage by capability</h2><span className={styles.muted}>Сегодня</span></div><UsageRows usage={balance.usage} total={balance.used} /></section>
          <div className={styles.stack}>
            <section className={styles.card}><h2>Один общий баланс</h2><p className={styles.muted}>Чат, поиск, плагины, генерация и голос используют один баланс. Ошибка возвращает резерв; повторная проверка готовности видео не списывает MCU второй раз.</p><details className={styles.weights}><summary>Стоимость операций v1</summary><dl>{categories.map(({ id, label }) => <div key={id}><dt>{label}</dt><dd>{COMPUTE_WEIGHTS[id]} MCU{id === "agent" ? " / шаг оценки" : " / операция"}</dd></div>)}</dl><p className={styles.muted}>Это фиксированные единицы Malik, не токены или деньги провайдера. В голосе распознавание, ответ и озвучка — отдельные операции. Кэш и локальные резервные ответы бесплатны.</p></details></section>
            <section className={styles.card}><h2>Agent safety budget</h2><dl className={styles.limits}><div><dt>Steps</dt><dd>{MAX_AGENT_STEPS}</dd></div><div><dt>Retries</dt><dd>{MAX_AGENT_RETRIES}</dd></div><div><dt>Compute</dt><dd>{MAX_AGENT_COMPUTE} MCU</dd></div></dl><p className={styles.muted}>Лимиты подготовлены для подключения Agent. Новый агент не запускается.</p></section>
          </div>
        </div>
        <section className={styles.settlement}><div><h2>Reserve → execute → settle</h2><p className={styles.muted}>Пример: неиспользованный резерв возвращается в общий баланс.</p></div><div className={styles.calculation}><span>Reserve <strong>100</strong></span><span>Actual <strong>37</strong></span><span>Refund <strong>63 MCU</strong></span></div></section>
      </> : null}
      {data?.admin && view === "admin" ? <AdminCompute stats={data.admin} /> : null}
      <p className={styles.footer}>MCU — единица использования Malik AI. Не баланс API-провайдеров и не денежные средства.</p>
    </div>
  </div>
}
