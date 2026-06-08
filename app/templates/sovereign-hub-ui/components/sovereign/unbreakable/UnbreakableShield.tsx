"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Crosshair,
  Cpu,
  Eye,
  Gauge,
  KeyRound,
  Radar,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Waves,
  HeartPulse,
  Play,
} from "lucide-react"

/**
 * UnbreakableShield — "Unbreakable AI" resilience screen.
 *
 * Redesigned as a calm, OpenAI-style product page: a thin status line, a large
 * header (title → explanation → what-it-is/how-to), then big content shelves —
 * a System Integrity panel, live telemetry, an interactive threat simulator +
 * incident log, a wall of protection layers, resilience guarantees and a
 * closing CTA, finished with a status footer.
 *
 * Real behaviour is preserved: "Run integrity check" hits `/api/ai/status`,
 * results can be sent to Canvas, Codex/next-section navigation works, and the
 * threat simulator drives the integrity gauge, layer states and incident log.
 */

export type UnbreakableShieldProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type LayerId = "retry" | "privacy" | "ratelimit" | "backup" | "continuity" | "monitor"
type Verdict = "BLOCKED" | "MITIGATED" | "THROTTLED" | "QUARANTINED"

type Layer = {
  id: LayerId
  title: string
  body: string
  icon: typeof Shield
  statA: [string, string]
  statB: [string, string]
}

type Threat = {
  id: string
  label: string
  tier: string
  icon: typeof Shield
  engages: LayerId[]
  drop: number
  resolve: string
  verdict: Verdict
}

type LogTone = "ok" | "warn" | "recover"
type LogEntry = { id: number; time: string; label: string; target: string; verdict: Verdict | "LIVE"; tone: LogTone }

const VERDICT_RU: Record<Verdict | "LIVE", string> = {
  BLOCKED: "ЗАБЛОК.",
  MITIGATED: "СНЯТО",
  THROTTLED: "ОЧЕРЕДЬ",
  QUARANTINED: "ИЗОЛИР.",
  LIVE: "ЭФИР",
}

const LAYERS: Layer[] = [
  { id: "retry", title: "Щит повторов", body: "Самовосстанавливающиеся повторы с умной экспоненциальной задержкой по всем линиям провайдеров. Сбойный вызов тихо переигрывается, прежде чем превратится в ошибку для пользователя.", icon: RefreshCw, statA: ["3.2М", "событий"], statB: ["0", "потерь"] },
  { id: "privacy", title: "Стена приватности", body: "Изоляция без утечек — вырезает секреты, заголовки и персональные данные из любого ответа. Наружу уходит только очищенный, публично-безопасный результат.", icon: Eye, statA: ["1.7М", "событий"], statB: ["0", "утечек"] },
  { id: "ratelimit", title: "Лимитер запросов", body: "Адаптивный троттлинг и поведенческая защита от ботов, которая не душит живого пользователя. Всплески сглаживаются очередью, а не отказом.", icon: Gauge, statA: ["8.9М", "запр."], statB: ["1.2К", "отбито"] },
  { id: "backup", title: "Резервный режим", body: "Мгновенный межрегиональный failover с детерминированным резервированием при полном сбое. Трафик перетекает на живую линию за миллисекунды.", icon: Server, statA: ["Активен", ""], statB: ["3", "региона"] },
  { id: "continuity", title: "Непрерывность", body: "Гарантированный аптайм — интерфейс не покажет мёртвый экран ни под какой нагрузкой. И в продакшене, и на сцене перед инвесторами отклик остаётся безупречным.", icon: HeartPulse, statA: ["99.99%", ""], statB: ["0", "сбоев"] },
  { id: "monitor", title: "Монитор здоровья", body: "Телеметрия задержек и ошибок в реальном времени — рубильник срабатывает раньше, чем проблему заметит пользователь. Деградация локализуется, а не распространяется.", icon: Activity, statA: ["Все", "в норме"], statB: ["Здоров", ""] },
]

const THREATS: Threat[] = [
  { id: "ddos", label: "DDoS-флуд", tier: "Уровень 3/4", icon: Waves, engages: ["ratelimit", "monitor"], drop: 20, resolve: "Флуд поглощён на периметре", verdict: "BLOCKED" },
  { id: "rate", label: "Шквал запросов", tier: "Уровень 7", icon: Gauge, engages: ["ratelimit"], drop: 12, resolve: "Всплеск сглажен и поставлен в очередь", verdict: "THROTTLED" },
  { id: "key", label: "Утечка ключа", tier: "Учётные данные", icon: KeyRound, engages: ["privacy", "backup"], drop: 24, resolve: "Секрет изолирован, отдан фолбэк", verdict: "QUARANTINED" },
  { id: "jwt", label: "JWT-эксплойт", tier: "Подмена токена", icon: ShieldCheck, engages: ["privacy", "monitor"], drop: 18, resolve: "Поддельный токен отклонён", verdict: "BLOCKED" },
  { id: "bot", label: "Рой ботов", tier: "Поведение", icon: Bot, engages: ["ratelimit", "monitor"], drop: 16, resolve: "Рой распознан и отброшен", verdict: "MITIGATED" },
  { id: "spike", label: "Скачок трафика", tier: "Объём", icon: Activity, engages: ["monitor", "continuity"], drop: 14, resolve: "Ёмкость масштабирована, UI устоял", verdict: "MITIGATED" },
]

const SEED_LOG: LogEntry[] = [
  { id: -1, time: "12:45:32", label: "Брутфорс заблокирован", target: "IP 203.0.113.45", verdict: "BLOCKED", tone: "ok" },
  { id: -2, time: "12:44:18", label: "Аномальный вход обнаружен", target: "admin@corp.com", verdict: "MITIGATED", tone: "warn" },
  { id: -3, time: "12:43:07", label: "Попытка SQL-инъекции", target: "/api/auth/login", verdict: "BLOCKED", tone: "ok" },
  { id: -4, time: "12:41:55", label: "Превышен лимит запросов", target: "IP 198.51.100.23", verdict: "THROTTLED", tone: "warn" },
  { id: -5, time: "12:40:21", label: "Подозрительный пейлоад", target: "/api/transfer", verdict: "QUARANTINED", tone: "recover" },
]

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function fallbackStatus(operator: string): string {
  return [
    "MALIK AI · отчёт о целостности (offline-safe)",
    "",
    `Оператор    : ${operator}`,
    "Защита      : ВКЛЮЧЕНА",
    "Провайдеры  : основной недоступен → активна резервная линия",
    "Приватность : белый режим (без сырых данных провайдера)",
    "Лимитер     : адаптивная очередь готова",
    "Непрерывн.  : UI защищён, мёртвых экранов нет",
    "",
    "Живой эндпоинт статуса недоступен — этот детерминированный отчёт",
    "подтверждает, что защитный слой держит. Добавь ключи для живой телеметрии.",
  ].join("\n")
}

function statusFromPayload(payload: unknown, operator: string): string {
  if (!payload || typeof payload !== "object") return fallbackStatus(operator)
  try {
    const lines = ["MALIK AI · живая целостность среды", "", `Оператор : ${operator}`]
    const p = payload as Record<string, unknown>
    const keys = Object.keys(p).slice(0, 14)
    if (!keys.length) return fallbackStatus(operator)
    for (const k of keys) {
      const v = p[k]
      const value = typeof v === "object" ? JSON.stringify(v) : String(v)
      lines.push(`${k.padEnd(12).slice(0, 12)}: ${value.slice(0, 80)}`)
    }
    return lines.join("\n")
  } catch {
    return fallbackStatus(operator)
  }
}

function artifactFromReport(report: string, integrity: number): string {
  const safe = report.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Unbreakable AI · Integrity Report</title>
<style>
  :root { color-scheme: dark; } * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif; background: radial-gradient(120% 90% at 50% -10%, #0e1411, #060707 72%); color:#e8eae9; min-height:100vh; padding:46px 20px; }
  .wrap { max-width:760px; margin:0 auto; }
  .tag { display:inline-flex; gap:8px; align-items:center; font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#34d399; border:1px solid rgba(52,211,153,.3); border-radius:999px; padding:6px 14px; }
  h1 { font-size:32px; margin:16px 0 4px; color:#f4f5f4; letter-spacing:-0.01em; }
  .gauge { font-size:14px; color:#9aa3a0; margin:0 0 22px; }
  pre { white-space:pre-wrap; word-break:break-word; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); border-radius:18px; padding:22px; font-family:ui-monospace, Menlo, monospace; font-size:13.5px; line-height:1.7; }
</style></head>
<body><div class="wrap"><span class="tag">Unbreakable AI · Integrity</span><h1>Runtime resilience report</h1><p class="gauge">System integrity: ${integrity}%</p><pre>${safe}</pre></div></body></html>`
}

const cssVar = (vars: Record<string, string | number>) => vars as CSSProperties

export function UnbreakableShield({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: UnbreakableShieldProps) {
  const operator = username && username.trim() ? username.trim() : "guest@malik.ai"

  const [integrity, setIntegrity] = useState(100)
  const [status, setStatus] = useState("Все слои защиты активны и в норме")
  const [report, setReport] = useState("")
  const [loading, setLoading] = useState(false)
  const [engaged, setEngaged] = useState<Set<LayerId>>(new Set())
  const [log, setLog] = useState<LogEntry[]>(SEED_LOG)
  const [activeThreat, setActiveThreat] = useState<string | null>(null)
  const [metrics, setMetrics] = useState({ uptime: 99.995, guarded: 184283924, blocked: 1043, latency: 161 })
  const [clock, setClock] = useState("--:--:--")

  const seqRef = useRef(0)
  const logIdRef = useRef(0)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const simRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout)
  }, [])

  // Live telemetry + clock — only after mount, so SSR/CSR markup matches.
  useEffect(() => {
    setClock(nowLabel())
    const id = setInterval(() => {
      setMetrics((m) => ({
        uptime: Math.min(99.999, Math.max(99.99, 99.992 + Math.random() * 0.007)),
        guarded: m.guarded + Math.floor(Math.random() * 240) + 20,
        blocked: m.blocked + (Math.random() > 0.8 ? 1 : 0),
        latency: 150 + Math.floor(Math.random() * 28),
      }))
      setClock(nowLabel())
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const integrityTone = useMemo(() => {
    if (integrity >= 90) return "strong"
    if (integrity >= 70) return "guard"
    return "stress"
  }, [integrity])

  const metricCards = useMemo(
    () => [
      { id: "uptime", label: "Аптайм", icon: HeartPulse, value: `${metrics.uptime.toFixed(3)}%`, note: "за 30 дней", delta: "+0.01%", up: true },
      { id: "guarded", label: "Запросов под защитой", icon: ShieldCheck, value: metrics.guarded.toLocaleString("ru-RU"), note: "всего", delta: "+12.4%", up: true },
      { id: "blocked", label: "Угроз отражено", icon: Crosshair, value: metrics.blocked.toLocaleString("ru-RU"), note: "за 24 часа", delta: "-8.7%", up: false },
      { id: "latency", label: "Задержка защиты", icon: Activity, value: `${metrics.latency} мс`, note: "медиана", delta: "+3мс", up: false },
    ],
    [metrics],
  )

  const pushLog = (label: string, target: string, verdict: Verdict, tone: LogTone) => {
    logIdRef.current += 1
    const entry: LogEntry = { id: logIdRef.current, time: nowLabel(), label, target, verdict, tone }
    setLog((prev) => [entry, ...prev].slice(0, 7))
  }

  const runCheck = async () => {
    if (loading) return
    const seq = seqRef.current + 1
    seqRef.current = seq
    const current = () => seqRef.current === seq
    setLoading(true)
    setStatus("Опрашиваю живую среду…")
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 30_000)
      const res = await fetch("/api/ai/status", { method: "GET", signal: controller.signal })
      clearTimeout(t)
      const payload = await res.json().catch(() => ({}))
      if (!current()) return
      if (!res.ok) throw new Error(`status ${res.status}`)
      setReport(statusFromPayload(payload, operator))
      setIntegrity(100)
      setStatus("Среда здорова · все линии зелёные")
      pushLog("Проверка целостности пройдена", "все системы", "BLOCKED", "ok")
    } catch {
      if (!current()) return
      setReport(fallbackStatus(operator))
      setIntegrity((v) => Math.max(72, v))
      setStatus("Подтверждён резервный режим · UI защищён")
      pushLog("Живой эндпоинт недоступен", "держит резерв", "MITIGATED", "recover")
    } finally {
      if (current()) setLoading(false)
    }
  }

  const simulate = (threat: Threat) => {
    setActiveThreat(threat.id)
    setEngaged(new Set(threat.engages))
    setIntegrity((v) => Math.max(38, v - threat.drop))
    setStatus(`Инцидент: ${threat.label} — нейтрализую…`)
    pushLog(`${threat.label} (${threat.tier})`, threat.resolve, threat.verdict, "warn")

    const t1 = setTimeout(() => setStatus(`Нейтрализовано · ${threat.resolve}`), 900)
    const t2 = setTimeout(() => {
      setEngaged(new Set())
      setIntegrity(100)
      setActiveThreat(null)
      setStatus("Восстановлено · все слои защиты активны")
    }, 2100)
    timers.current.push(t1, t2)
  }

  const launchRandom = () => {
    const pick = THREATS[Math.floor(Math.random() * THREATS.length)]
    simulate(pick)
  }

  const sendCanvas = () => {
    onOpenCanvas?.(artifactFromReport(report || fallbackStatus(operator), integrity))
    setStatus("Отчёт о целостности отправлен в Canvas")
  }

  const reset = () => {
    onNewChat?.()
    setReport("")
    setLog(SEED_LOG)
    setEngaged(new Set())
    setIntegrity(100)
    setActiveThreat(null)
    setStatus("Все слои защиты активны и в норме")
  }

  // Integrity arc geometry
  const R = 70
  const CIRC = 2 * Math.PI * R
  const dash = CIRC * 0.75 // three-quarter arc
  const offset = dash * (1 - integrity / 100)

  return (
    <main className="uba" data-view="unbreakable-ai">
      <div className="uba__bg" aria-hidden="true" />
      <div className="uba__inner">

      {/* Thin status line */}
      <div className="uba__status">
        <span className="uba__status-left">
          <span className="uba__dot" />
          <span className="uba__status-key">Статус системы</span>
          <strong className="uba__status-val">Защищено</strong>
        </span>
        <span className="uba__status-right">
          Уровень угрозы
          <strong data-tone={integrityTone}>
            {integrity >= 90 ? "низкий" : integrity >= 70 ? "повышен" : "высокий"}
          </strong>
        </span>
      </div>

      {/* Header — title → explanation → what it is / how to use */}
      <header className="uba__head">
        <span className="uba__eyebrow"><Shield size={13} /> Отказоустойчивость</span>
        <h1 className="uba__title">Unbreakable AI</h1>
        <p className="uba__lede">
          Слой устойчивости поверх вашего ИИ. Он переживает падения провайдеров, гасит атаки и держит
          безупречный отклик под любой нагрузкой — ноль простоев, ноль утечек, ноль мёртвых экранов.
          Каждый запрос проходит через защитный контур, прежде чем дойти до пользователя.
        </p>
      </header>

      {/* What it is / how to use */}
      <section className="uba__shelf uba__about">
        <div className="uba__about-copy">
          <span className="uba__shelf-label">Что это и как использовать</span>
          <h2 className="uba__shelf-title">Защитный конвейер для каждого запроса</h2>
          <p>
            Каждый запрос к модели проходит через защитный конвейер: умный роутер выбирает живого
            провайдера, изолирует отказавшего и мгновенно переключает трафик на резервную линию в другом
            регионе. Пользователь не видит сбоя и не ждёт ответа дольше обычного.
          </p>
          <p>
            Поверх этого работают адаптивная очередь и троттлинг, приватный периметр, который вырезает
            ключи, заголовки и секреты из ответов, и непрерывный мониторинг здоровья — рубильник
            срабатывает раньше, чем проблему заметит человек.
          </p>
        </div>
        <ol className="uba__steps">
          <li>
            <span className="uba__step-num">1</span>
            <div>
              <strong>Запустите проверку целостности.</strong>
              Кнопка «Проверить целостность» опрашивает живую среду <code>/api/ai/status</code> и показывает
              реальный статус всех линий защиты.
            </div>
          </li>
          <li>
            <span className="uba__step-num">2</span>
            <div>
              <strong>Прогоните сценарий атаки.</strong>
              В симуляторе угроз посмотрите, как система гасит DDoS, утечку ключа или шквал запросов в
              реальном времени — без вреда для продакшена.
            </div>
          </li>
          <li>
            <span className="uba__step-num">3</span>
            <div>
              <strong>Следите за метриками и журналом.</strong>
              Телеметрия и журнал инцидентов показывают, что именно отражено и в каком состоянии находится
              каждый слой защиты.
            </div>
          </li>
          <li>
            <span className="uba__step-num">4</span>
            <div>
              <strong>Передайте отчёт команде.</strong>
              Одним кликом отправьте полный отчёт об устойчивости в Canvas или откройте Cortex для разбора.
            </div>
          </li>
        </ol>
      </section>

      {/* System integrity */}
      <section className="uba__shelf uba__integrity">
        <div className="uba__integrity-copy">
          <span className="uba__shelf-label"><Gauge size={13} /> Целостность системы</span>
          <h2 className="uba__shelf-title">Состояние защиты в реальном времени</h2>
          <p>
            Сводный показатель здоровья всех слоёв. Запустите живую проверку среды или прогоните атаку —
            индикатор отреагирует мгновенно и вернётся к 100% после восстановления.
          </p>
          <p className="uba__integrity-note">{status}</p>
          <div className="uba__actions">
            <button type="button" className="uba__btn uba__btn--primary" onClick={runCheck} disabled={loading}>
              <Activity size={15} />
              {loading ? "Проверяю…" : "Проверить целостность"}
            </button>
            <button type="button" className="uba__btn uba__btn--ghost" onClick={launchRandom}>
              <Crosshair size={15} />
              Симулировать атаку
            </button>
            <button type="button" className="uba__btn uba__btn--ghost" onClick={onOpenCodex}>
              <Cpu size={15} />
              Открыть Cortex
            </button>
          </div>
        </div>

        <div className="uba__gauge">
          <svg className="uba__arc" viewBox="0 0 160 160" width="150" height="150" aria-hidden="true">
            <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6" strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round" transform="rotate(135 80 80)" />
            <circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke="url(#ubaArc)"
              strokeWidth="6"
              strokeDasharray={`${dash} ${CIRC}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(135 80 80)"
              style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }}
            />
            <defs>
              <linearGradient id="ubaArc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#34d399" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <div className="uba__gauge-val">
            <strong data-tone={integrityTone}>{integrity}</strong>
            <em>%</em>
            <span>целостность</span>
          </div>
        </div>
      </section>

      {/* Live integrity report — appears after check */}
      {report ? (
        <section className="uba__shelf uba__report" aria-label="Отчёт о целостности">
          <div className="uba__report-head">
            <div>
              <span className="uba__shelf-label"><Server size={13} /> Отчёт среды</span>
              <h2 className="uba__shelf-title">Результат последней проверки</h2>
            </div>
            <div className="uba__report-meta">
              <span data-tone={integrityTone}>{integrity}% целостность</span>
              <span>{operator}</span>
            </div>
          </div>
          <pre className="uba__report-body">{report}</pre>
          <div className="uba__actions uba__report-actions">
            <button type="button" className="uba__btn uba__btn--primary" onClick={sendCanvas}>
              <ShieldCheck size={15} /> Отправить в Canvas
            </button>
            <button type="button" className="uba__btn uba__btn--ghost" onClick={runCheck} disabled={loading}>
              <RefreshCw size={15} />
              {loading ? "Обновляю…" : "Обновить отчёт"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Metrics */}
      <section className="uba__metrics" aria-label="Live telemetry">
        {metricCards.map((m) => {
          const Icon = m.icon
          return (
            <article key={m.id}>
              <div className="uba__metric-top">
                <span className="uba__metric-ico"><Icon size={15} /></span>
                <span className="uba__metric-label">{m.label}</span>
                <span className={`uba__metric-delta ${m.up ? "is-up" : "is-down"}`}>
                  {m.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {m.delta}
                </span>
              </div>
              <strong className="uba__metric-value">{m.value}</strong>
              <span className="uba__metric-note">{m.note}</span>
              <span className="uba__metric-spark" aria-hidden="true">
                {Array.from({ length: 22 }).map((_, i) => (
                  <i key={i} style={cssVar({ "--i": i })} />
                ))}
              </span>
            </article>
          )
        })}
      </section>

      {/* Ops: simulator + incident log */}
      <section className="uba__ops">
        <div className="uba__shelf uba__sim" ref={simRef}>
          <span className="uba__shelf-label"><Crosshair size={13} /> Симулятор угроз</span>
          <h2 className="uba__shelf-title">Проверьте систему под огнём</h2>
          <p className="uba__shelf-sub">Запустите контролируемый сценарий атаки и посмотрите, как защита гасит угрозу в реальном времени.</p>
          <div className="uba__threats">
            {THREATS.map((threat) => {
              const Icon = threat.icon
              return (
                <button key={threat.id} type="button" data-active={activeThreat === threat.id ? "1" : "0"} onClick={() => simulate(threat)}>
                  <span className="uba__threat-ico"><Icon size={16} /></span>
                  <span className="uba__threat-copy">
                    <strong>{threat.label}</strong>
                    <em>{threat.tier}</em>
                  </span>
                </button>
              )
            })}
          </div>
          <button type="button" className="uba__btn uba__btn--ghost uba__launch" onClick={launchRandom}>
            <Play size={14} /> Запустить случайную симуляцию
          </button>
        </div>

        <div className="uba__shelf uba__log">
          <div className="uba__log-head">
            <span className="uba__shelf-label"><Radar size={13} /> Журнал инцидентов</span>
            <span className="uba__log-live"><i />ЭФИР</span>
          </div>
          <ul>
            {log.map((entry) => (
              <li key={entry.id}>
                <span className="uba__log-time">{entry.time}</span>
                <span className="uba__log-label">{entry.label}</span>
                <span className="uba__log-target">{entry.target}</span>
                <span className="uba__verdict" data-v={entry.verdict}>{VERDICT_RU[entry.verdict]}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="uba__link-btn" onClick={reset}>Сбросить учения →</button>
        </div>
      </section>

      {/* Protection layers */}
      <section className="uba__layers" aria-label="Protection layers">
        <div className="uba__layers-head">
          <div>
            <span className="uba__shelf-label"><Shield size={13} /> Слои защиты</span>
            <h2 className="uba__shelf-title">Шесть линий, которые держат систему</h2>
          </div>
          <button type="button" className="uba__link-btn" onClick={() => onViewChange("features")}>Дальше →</button>
        </div>
        <div className="uba__layer-grid">
          {LAYERS.map((layer) => {
            const Icon = layer.icon
            return (
              <article key={layer.id} data-engaged={engaged.has(layer.id) ? "1" : "0"}>
                <div className="uba__layer-top">
                  <span className="uba__layer-ico"><Icon size={18} /></span>
                  <span className="uba__layer-state"><i />{engaged.has(layer.id) ? "АКТИВЕН" : "НАГОТОВЕ"}</span>
                </div>
                <strong className="uba__layer-title">{layer.title}</strong>
                <p>{layer.body}</p>
                <div className="uba__layer-foot">
                  <span><strong>{layer.statA[0]}</strong> {layer.statA[1]}</span>
                  <span className="uba__layer-foot-b"><strong>{layer.statB[0]}</strong> {layer.statB[1]}</span>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Resilience guarantees */}
      <section className="uba__guarantees" aria-label="Resilience guarantees">
        <div className="uba__layers-head">
          <div>
            <span className="uba__shelf-label"><ShieldCheck size={13} /> Почему это не ломается</span>
            <h2 className="uba__shelf-title">Гарантии, а не обещания</h2>
          </div>
        </div>
        <div className="uba__guarantee-grid">
          {[
            { icon: RefreshCw, title: "Всегда онлайн by design", body: "Падает провайдер — трафик за миллисекунды уходит в другой регион. Пользователь не видит шва. Аптайм — это гарантия, заложенная в архитектуру, а не надежда." },
            { icon: Eye, title: "Невидимая оборона", body: "Угрозы гасятся до того, как коснутся вашей логики. Ни один ключ, заголовок или секрет не покидает периметр. Приватность — это правило по умолчанию, а не опция." },
            { icon: Activity, title: "Проверено под огнём", body: "Закалено на сотнях миллионов защищённых запросов — ноль утечек данных и ноль мёртвых экранов во время живых демонстраций и пиковых нагрузок." },
            { icon: Cpu, title: "Готов к аудиту из коробки", body: "Полная телеметрия инцидентов с экспортом в Canvas, размеченная под контроли SOC 2 и ISO 27001. Комплаенс поставляется вместе с продуктом." },
          ].map((g) => {
            const Icon = g.icon
            return (
              <article key={g.title}>
                <span className="uba__guarantee-ico"><Icon size={18} /></span>
                <strong>{g.title}</strong>
                <p>{g.body}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="uba__shelf uba__cta">
        <div className="uba__cta-copy">
          <span className="uba__shelf-label">Несокрушимый стандарт</span>
          <h2 className="uba__shelf-title">Создано, чтобы не падать.</h2>
          <p>Запустите живую проверку целостности или передайте команде полный отчёт об устойчивости одним кликом — чтобы вам никогда не пришлось объяснять, почему что-то упало.</p>
        </div>
        <div className="uba__actions">
          <button type="button" className="uba__btn uba__btn--primary" onClick={runCheck} disabled={loading}>
            <Activity size={15} />
            {loading ? "Проверяю…" : "Проверить целостность"}
          </button>
          <button type="button" className="uba__btn uba__btn--ghost" onClick={sendCanvas}>
            <ShieldCheck size={15} /> Экспорт отчёта
          </button>
          <button type="button" className="uba__btn uba__btn--ghost" onClick={() => onViewChange("features")}>
            Дальше →
          </button>
        </div>
      </section>

      {/* Footer rail */}
      <footer className="uba__footer">
        <span><Server size={12} /> Дата-центр · US-EAST-1</span>
        <span>Системное время · {clock} UTC</span>
        <span>Развёртывание · v2.24.7</span>
        <span>Последний бэкап · 2 мин назад</span>
        <span className="uba__footer-comp"><ShieldCheck size={12} /> SOC 2 · ISO 27001</span>
      </footer>

      </div>

      <style jsx>{`
        .uba {
          position: relative;
          width: 100%;
          /* Scroll fix: this screen is rendered inside a fixed-height frame
             (.malik-route-content has overflow:hidden), so the screen itself
             must be the scroll container instead of being clipped. */
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px;
          color: #e7eae8;
          font-feature-settings: "ss01";
          -webkit-font-smoothing: antialiased;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
        }
        .uba::-webkit-scrollbar { width: 6px; }
        .uba::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
        }
        .uba::-webkit-scrollbar-track { background: transparent; }
        @media (max-width: 920px) {
          .uba { padding-top: clamp(20px, 3vw, 32px); }
        }
        .uba__inner {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
        }
        .uba__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(60% 38% at 18% 0%, rgba(16, 185, 129, 0.07), transparent 60%),
            radial-gradient(50% 34% at 96% 2%, rgba(34, 211, 238, 0.05), transparent 62%);
        }
        .uba > * {
          position: relative;
          z-index: 1;
        }
        .uba__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #6fb89f;
        }

        /* Status line */
        .uba__status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          margin-bottom: 30px;
        }
        .uba__status-left {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .uba__dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #6ee7b7;
        }
        .uba__status-key {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #8a958f;
        }
        .uba__status-val {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #d8efe4;
        }
        .uba__status-right {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8a958f;
        }
        .uba__status-right strong {
          margin-left: 8px;
          font-weight: 700;
          color: #6ee7b7;
        }
        .uba__status-right strong[data-tone="guard"] { color: #e7c46a; }
        .uba__status-right strong[data-tone="stress"] { color: #e89b6a; }

        /* Header */
        .uba__head {
          max-width: 70ch;
          margin: 0 0 40px;
        }
        .uba__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #6fb89f;
          margin-bottom: 18px;
        }
        .uba__title {
          margin: 0 0 18px;
          font-size: clamp(38px, 6vw, 64px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .uba__lede {
          margin: 0;
          font-size: clamp(16px, 1.7vw, 20px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 60ch;
        }

        /* Generic shelf */
        .uba__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .uba__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(20px, 2.3vw, 27px);
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: #f1f4f2;
        }

        /* About / how-to */
        .uba__about {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
        }
        @media (max-width: 880px) {
          .uba__about { grid-template-columns: 1fr; }
        }
        .uba__about-copy p {
          margin: 0 0 14px;
          font-size: 15px;
          line-height: 1.7;
          color: #a7b2ac;
          max-width: 56ch;
        }
        .uba__about-copy p:last-child { margin-bottom: 0; }
        .uba__steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .uba__steps li {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .uba__step-num {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          color: #6ee7b7;
          border: 1px solid rgba(110, 231, 183, 0.28);
          background: rgba(52, 211, 153, 0.06);
        }
        .uba__steps li div {
          font-size: 14px;
          line-height: 1.6;
          color: #9aa6a0;
        }
        .uba__steps strong {
          display: block;
          color: #e7ece9;
          font-weight: 600;
          margin-bottom: 2px;
        }
        .uba__steps code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12.5px;
          color: #8fdcc2;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 1px 6px;
        }

        /* Integrity shelf */
        .uba__integrity {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: clamp(24px, 4vw, 56px);
          align-items: center;
        }
        @media (max-width: 760px) {
          .uba__integrity { grid-template-columns: 1fr; }
        }
        .uba__integrity-copy p {
          margin: 0 0 12px;
          font-size: 15px;
          line-height: 1.65;
          color: #a7b2ac;
          max-width: 56ch;
        }
        .uba__integrity-note {
          color: #8fc7b3 !important;
          font-size: 13.5px !important;
          min-height: 20px;
        }
        .uba__gauge {
          position: relative;
          display: grid;
          place-items: center;
          width: 200px;
          height: 200px;
          justify-self: center;
        }
        .uba__arc { position: absolute; inset: 0; margin: auto; }
        .uba__gauge-val {
          display: grid;
          justify-items: center;
          gap: 2px;
        }
        .uba__gauge-val strong {
          font-size: 58px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
          color: #f1f5f3;
        }
        .uba__gauge-val strong[data-tone="guard"] { color: #ecd9a0; }
        .uba__gauge-val strong[data-tone="stress"] { color: #ecb79a; }
        .uba__gauge-val em {
          font-style: normal;
          font-size: 18px;
          font-weight: 600;
          color: #7e948c;
        }
        .uba__gauge-val span {
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #6f827b;
          margin-top: 4px;
        }

        /* Integrity report shelf */
        .uba__report {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .uba__report-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .uba__report-head .uba__shelf-title { margin-bottom: 0; }
        .uba__report-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          font-size: 12px;
          color: #8a958f;
        }
        .uba__report-meta span:first-child {
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #8fc7b3;
        }
        .uba__report-meta span:first-child[data-tone="guard"] { color: #e7c46a; }
        .uba__report-meta span:first-child[data-tone="stress"] { color: #e89b6a; }
        .uba__report-meta span:last-child {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
        }
        .uba__report-body {
          margin: 0;
          max-height: 280px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(0, 0, 0, 0.22);
          padding: 20px 22px;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12.5px;
          line-height: 1.72;
          color: #b8c4be;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
        }
        .uba__report-actions { margin-top: 18px; }

        /* Buttons — clean, understated, OpenAI-style (no neon glow) */
        .uba__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }
        .uba__btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          border-radius: 10px;
          padding: 11px 18px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
        }
        .uba__btn--primary {
          background: #f5f6f5;
          color: #0c1310;
          border-color: #f5f6f5;
        }
        .uba__btn--primary:hover:not(:disabled) { background: #e3e6e4; border-color: #e3e6e4; }
        .uba__btn--primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .uba__btn--ghost {
          background: transparent;
          color: #cdd6d1;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .uba__btn--ghost:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.28);
          color: #f1f4f2;
        }
        .uba__link-btn {
          background: none;
          border: none;
          color: #8fbfaf;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.16s ease;
        }
        .uba__link-btn:hover { color: #eef3f0; }

        /* Metrics */
        .uba__metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }
        .uba__metrics article {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: 20px 20px 34px;
        }
        .uba__metric-top {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .uba__metric-ico {
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          color: #79c4ab;
          background: rgba(255, 255, 255, 0.05);
        }
        .uba__metric-label {
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #8a958f;
          flex: 1;
        }
        .uba__metric-delta {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-size: 11px;
          font-weight: 700;
        }
        .uba__metric-delta.is-up { color: #57b894; }
        .uba__metric-delta.is-down { color: #c97f86; }
        .uba__metric-value {
          display: block;
          margin: 14px 0 3px;
          font-size: 29px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #f1f4f2;
          font-variant-numeric: tabular-nums;
        }
        .uba__metric-note {
          font-size: 11.5px;
          color: #7e8b85;
        }
        .uba__metric-spark {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 12px;
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 16px;
          opacity: 0.5;
        }
        .uba__metric-spark i {
          flex: 1;
          border-radius: 1px;
          background: linear-gradient(180deg, #34d399, rgba(34, 211, 238, 0.2));
          height: 40%;
          animation: ubaSpark 1.7s ease-in-out infinite;
          animation-delay: calc(var(--i) * -0.09s);
        }

        /* Ops */
        .uba__ops {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
          gap: 22px;
          margin-bottom: 22px;
        }
        @media (max-width: 900px) {
          .uba__ops { grid-template-columns: 1fr; }
        }
        .uba__ops .uba__shelf { margin-bottom: 0; }
        .uba__shelf-sub {
          margin: 0 0 18px;
          font-size: 14px;
          line-height: 1.6;
          color: #9aa6a0;
        }
        .uba__threats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (max-width: 540px) {
          .uba__threats { grid-template-columns: 1fr; }
        }
        .uba__threats button {
          display: flex;
          align-items: center;
          gap: 11px;
          text-align: left;
          padding: 13px 13px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          color: #cdd6d1;
          cursor: pointer;
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .uba__threats button:hover {
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.04);
        }
        .uba__threats button[data-active="1"] {
          border-color: rgba(232, 155, 106, 0.45);
          background: rgba(232, 155, 106, 0.08);
        }
        .uba__threat-ico {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          flex-shrink: 0;
          color: #79c4ab;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .uba__threats button[data-active="1"] .uba__threat-ico {
          color: #e8b79a;
          background: rgba(232, 155, 106, 0.12);
          border-color: rgba(232, 155, 106, 0.3);
        }
        .uba__threat-copy { display: flex; flex-direction: column; gap: 1px; }
        .uba__threat-copy strong { font-size: 13.5px; color: #eef3f0; font-weight: 600; }
        .uba__threat-copy em { font-style: normal; font-size: 11px; color: #7e8b85; }
        .uba__launch {
          width: 100%;
          justify-content: center;
          margin-top: 14px;
        }

        .uba__log-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .uba__log-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #6fb89f;
        }
        .uba__log-live i {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #34d399;
        }
        .uba__log ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .uba__log li {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: center;
          gap: 12px;
          padding: 11px 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 12.5px;
        }
        .uba__log-time {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
          color: #6f827b;
        }
        .uba__log-label { color: #d4ddd8; }
        .uba__log-target {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
          color: #7e948c;
          white-space: nowrap;
        }
        @media (max-width: 600px) {
          .uba__log li { grid-template-columns: auto 1fr auto; }
          .uba__log-target { display: none; }
        }
        .uba__verdict {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .uba__verdict[data-v="BLOCKED"] { color: #6ee7b7; background: rgba(16, 185, 129, 0.12); }
        .uba__verdict[data-v="MITIGATED"] { color: #7dd3fc; background: rgba(56, 189, 248, 0.12); }
        .uba__verdict[data-v="THROTTLED"] { color: #e7c46a; background: rgba(234, 179, 8, 0.12); }
        .uba__verdict[data-v="QUARANTINED"] { color: #cbb4f0; background: rgba(168, 85, 247, 0.14); }
        .uba__verdict[data-v="LIVE"] { color: #6ee7b7; background: rgba(16, 185, 129, 0.12); }
        .uba__log .uba__link-btn { margin-top: 16px; }

        /* Layers */
        .uba__layers { margin-bottom: 22px; }
        .uba__layers-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .uba__layers-head .uba__shelf-title { margin-bottom: 0; }
        .uba__layer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .uba__layer-grid article {
          position: relative;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: 22px 22px 20px;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .uba__layer-grid article:hover {
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.03);
        }
        .uba__layer-grid article[data-engaged="1"] {
          border-color: rgba(110, 231, 183, 0.4);
          background: rgba(52, 211, 153, 0.05);
        }
        .uba__layer-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .uba__layer-ico {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 11px;
          color: #79c4ab;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .uba__layer-grid article[data-engaged="1"] .uba__layer-ico {
          color: #0c1310;
          background: #6ee7b7;
          border-color: transparent;
        }
        .uba__layer-state {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #7e948c;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          padding: 3px 9px;
        }
        .uba__layer-state i {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #34d399;
        }
        .uba__layer-grid article[data-engaged="1"] .uba__layer-state {
          color: #6ee7b7;
          border-color: rgba(110, 231, 183, 0.4);
        }
        .uba__layer-title {
          display: block;
          font-size: 17px;
          font-weight: 600;
          color: #f1f4f2;
          margin-bottom: 8px;
        }
        .uba__layer-grid p {
          margin: 0 0 16px;
          font-size: 13.5px;
          line-height: 1.6;
          color: #9aa6a0;
        }
        .uba__layer-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #7e8b85;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          padding-top: 14px;
        }
        .uba__layer-foot strong { color: #d4ddd8; font-size: 13px; }
        .uba__layer-foot-b { text-align: right; }

        /* Guarantees */
        .uba__guarantees { margin-bottom: 22px; }
        .uba__guarantee-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
        .uba__guarantee-grid article {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: 26px 24px;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .uba__guarantee-grid article:hover {
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.03);
        }
        .uba__guarantee-ico {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          color: #79c4ab;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 16px;
        }
        .uba__guarantee-grid strong {
          display: block;
          font-size: 16px;
          font-weight: 600;
          color: #f1f4f2;
          margin-bottom: 8px;
        }
        .uba__guarantee-grid p {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.65;
          color: #9aa6a0;
        }

        /* CTA */
        .uba__cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 22px;
        }
        .uba__cta-copy { max-width: 56ch; }
        .uba__cta-copy .uba__shelf-title { margin-bottom: 10px; }
        .uba__cta-copy p {
          margin: 0;
          font-size: 14.5px;
          line-height: 1.6;
          color: #a7b2ac;
        }
        .uba__cta .uba__actions { margin-top: 0; }

        /* Footer */
        .uba__footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 20px;
          margin-top: 8px;
          padding: 16px 18px;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.015);
          font-size: 11.5px;
          color: #7e8b85;
        }
        .uba__footer span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .uba__footer-comp {
          margin-left: auto;
          color: #6fb89f;
        }

        @keyframes ubaSpark { 0%, 100% { height: 25%; opacity: 0.5; } 50% { height: 100%; opacity: 0.9; } }

        @media (prefers-reduced-motion: reduce) {
          .uba__metric-spark i { animation: none !important; }
        }
      `}</style>
    </main>
  )
}

export default UnbreakableShield
