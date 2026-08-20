"use client"

import { useMemo, useState, type ReactNode } from "react"
import { baseHealthChecks, MEDIA_PROVIDERS, renderSafeCheck, storageGuardReport, TEXT_PROVIDERS } from "@/lib/malik-unbreakable-ai"

type UnbreakableDashboardProps = {
  onPrompt?: (prompt: string) => void
}

const topbarItems = [
  ["◎", "Malik AI Agents", "Open Malik AI security agents"],
  ["✺", "High-Speed queue", "Open protected high-speed queue"],
  ["⌘", "Malik Ask", "Open Malik Ask under Unbreakable AI guardrails"],
  ["⌕", "Craft & Search", "Run guarded craft and search workflow"],
  ["↯", "API 2.0", "Inspect protected API 2.0 status"],
  ["✧", "Create AI flow", "Create a protected AI flow"],
  ["⟡", "Deploy", "Run guarded deploy checks"],
  [">_", "Malik Codex", "Open Malik Codex with policy guard"],
  ["✣", "Creator Mode: ON", "Keep creator mode protected"],
] as const

const metricCards = [
  {
    title: "Угрозы заблокированы",
    value: "12,458",
    change: "↑ 38% с прошлой недели",
    tone: "red",
    icon: "⌵",
  },
  {
    title: "Защита сессий",
    value: "99.98%",
    change: "↑ 0.28% с прошлой недели",
    tone: "teal",
    icon: "◇",
  },
  {
    title: "Политики",
    value: "64",
    change: "↑ 8 новых за неделю",
    tone: "violet",
    icon: "▣",
  },
  {
    title: "Риск",
    value: "Низкий",
    change: "2.1 / 100",
    tone: "risk",
    icon: "⬡",
  },
] as const

const threatFeed = [
  ["10:42:31", "Блокировка: Prompt injection", "Попытка обхода системных инструкций", "Высокий"],
  ["10:31:07", "Блокировка: Data Exfiltration", "Попытка извлечения конфиденциальных данных", "Высокий"],
  ["10:19:44", "Блокировка: Jailbreak", "Обнаружен обход служебной модели", "Высокий"],
  ["10:05:12", "Блокировка: Malware Link", "Опасная ссылка в пользовательском вводе", "Средний"],
  ["09:58:03", "Предупреждение: Spam Burst", "Аномальная высокая нагрузка от IP", "Низкий"],
] as const

const guardrails = [
  ["Запрещенный контент", "Активно", "✾"],
  ["Инъекции и jailbreak", "Активно", "⌘"],
  ["Утечка персональных данных", "Активно", "▣"],
  ["Вредоносные ссылки и файлы", "Активно", "◇"],
  ["Манипуляции и обман", "Активно", "◎"],
  ["Насилие и экстремизм", "Активно", "△"],
  ["NSFW и вредный контент", "Мониторинг", "⚠"],
  ["Авторские права и плагиат", "Активно", "▤"],
] as const

const anomalies = [
  ["Всплеск попыток обхода", "Зафиксирован рост попыток jailbreak на 240% по сравнению с обычным уровнем.", "10:43", "Критический", "red"],
  ["Необычная активность API ключа", "API ключ sk-73a... используется из нового региона (SG).", "10:31", "Высокий", "amber"],
  ["Массовые неудачные входы", "Обнаружены множественные неудачные попытки входа для user@example.com.", "10:12", "Средний", "yellow"],
] as const

const users = [
  ["admin@sov.ai", "Owner", "Активен"],
  ["secops@sov.ai", "Security Admin", "Активен"],
  ["dev@sov.ai", "Developer", "Активен"],
  ["analyst@sov.ai", "Analyst", "Активен"],
  ["viewer@sov.ai", "Viewer", "Ограничен"],
] as const

const accessZones = [
  ["Production", "Full Access"],
  ["Staging", "Read / Write"],
  ["Data Vault", "Restricted"],
  ["Logs & Monitoring", "Read Only"],
] as const

const bottomCards = [
  {
    title: "Audit Logs",
    text: "Полные журналы действий системы и пользователей.",
    stats: [["Событий (7 дн.)", "2.14M"], ["Уникальных акторов", "1,268"]],
    button: "Открыть логи",
    visual: "logs",
  },
  {
    title: "Data Privacy",
    text: "Контроль PII, шифрование и правила хранения данных.",
    stats: [["PII найдено", "8,632"], ["Запросов на удаление", "24"]],
    button: "Управлять данными",
    visual: "vault",
  },
  {
    title: "Rate Limits",
    text: "Защита от злоупотреблений и контроль нагрузки.",
    stats: [["Заблокировано", "32.7K"], ["Текущая нагрузка", "34%"]],
    button: "Настроить лимиты",
    visual: "gauge",
  },
  {
    title: "Fraud Detection",
    text: "Обнаружение мошенничества и подозрительных платежей в реальном времени.",
    stats: [["Проверено транзакций", "98,214"], ["Заблокировано", "312"]],
    button: "Открыть отчеты",
    visual: "brain",
  },
] as const

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("ub-card", className)}>{children}</section>
}

function MiniTrend({ tone }: { tone: string }) {
  const stroke = tone === "red" ? "#fb7185" : tone === "teal" ? "#2dd4bf" : "#d9ae45"
  return (
    <svg className="ub-trend" viewBox="0 0 220 56" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 43 L18 41 L31 44 L46 38 L61 40 L75 34 L91 37 L105 31 L121 32 L137 27 L154 29 L169 22 L185 24 L204 18 L218 12" />
      <path d="M2 43 L18 41 L31 44 L46 38 L61 40 L75 34 L91 37 L105 31 L121 32 L137 27 L154 29 L169 22 L185 24 L204 18 L218 12" stroke={stroke} />
    </svg>
  )
}

function RiskGauge() {
  return (
    <div className="ub-risk-gauge" aria-hidden="true">
      <div className="ub-risk-ring" />
      <div className="ub-risk-center">⬡</div>
    </div>
  )
}

function ShieldVisual() {
  return (
    <div className="ub-shield-visual" aria-hidden="true">
      <div className="ub-shield-orbit" />
      <div className="ub-shield-body">
        <span>🔒</span>
      </div>
      <div className="ub-shield-floor" />
    </div>
  )
}

function BottomVisual({ type }: { type: string }) {
  return (
    <div className={cx("ub-bottom-visual", `ub-bottom-visual-${type}`)} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

export function UnbreakableDashboard({ onPrompt }: UnbreakableDashboardProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const checks = useMemo(() => baseHealthChecks(), [])
  const providers = useMemo(() => [...TEXT_PROVIDERS, ...MEDIA_PROVIDERS], [])
  const render = renderSafeCheck()
  const storage = typeof window !== "undefined" ? storageGuardReport() : { ok: true, bytes: 0, message: "SSR safe" }

  const run = (prompt: string) => onPrompt?.(prompt)

  return (
    <main className="unbreakable-home">
      <div className="ub-bg-aura" />
      <div className="ub-bg-grid" />

      <div className="ub-topbar" aria-label="Unbreakable AI shortcuts">
        {topbarItems.map(([icon, label, prompt]) => (
          <button key={label} type="button" onClick={() => run(prompt)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="ub-topbar-status" aria-hidden="true">
        <span>♢</span>
        <span>♛ 4,460</span>
        <span>M</span>
      </div>

      <section className="unbreakable-inner">
        <header className="ub-header">
          <div>
            <div className="ub-title-row">
              <h1>Unbreakable AI</h1>
              <span>LIVE</span>
            </div>
            <p>Абсолютная защита, guardrails, безопасность и контроль доступа.</p>
          </div>

          <div className="ub-export">
            <button type="button" onClick={() => setExportOpen((value) => !value)}>
              ⬆ Экспорт отчета
              <span>⌄</span>
            </button>
            {exportOpen && (
              <div className="ub-export-menu">
                {["Security PDF", "SOC2 snapshot", "CSV audit log"].map((item) => (
                  <button key={item} type="button" onClick={() => run(`Export ${item} from Unbreakable AI`)}>
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <section className="ub-metrics">
          {metricCards.map((card) => (
            <GlassCard key={card.title} className={cx("ub-metric", `ub-metric-${card.tone}`)}>
              <div>
                <p>{card.title}</p>
                <strong>{card.value}</strong>
                <span>{card.change}</span>
              </div>
              {card.tone === "risk" ? (
                <RiskGauge />
              ) : (
                <div className="ub-metric-visual">
                  <div className="ub-metric-icon">{card.icon}</div>
                  <MiniTrend tone={card.tone} />
                </div>
              )}
            </GlassCard>
          ))}
        </section>

        <section className="ub-control-grid">
          <GlassCard className="ub-security-center">
            <div className="ub-panel-head">
              <h2>Центр безопасности</h2>
              <button type="button" onClick={() => run("Show security center for the last 7 days")}>7 дней ⌄</button>
            </div>

            <div className="ub-security-body">
              <ShieldVisual />
              <div className="ub-threat-feed">
                <h3>Лента угроз</h3>
                {threatFeed.map(([time, title, text, level]) => (
                  <div key={`${time}-${title}`} className="ub-threat-item">
                    <span>{time}</span>
                    <div>
                      <strong>{title}</strong>
                      <p>{text}</p>
                    </div>
                    <em className={level === "Высокий" ? "ub-red" : level === "Средний" ? "ub-amber" : "ub-green"}>{level}</em>
                  </div>
                ))}
              </div>
            </div>

            <div className="ub-security-stats">
              {[
                ["Проверено запросов", "1.42M"],
                ["Заблокировано", "12,458"],
                ["Предотвращено атак", "4,203"],
                ["Сред. время реакции", "38 мс"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="ub-guardrails">
            <h2>Guardrails Engine</h2>
            <div className="ub-guardrail-list">
              {guardrails.map(([name, status, icon]) => (
                <div key={name}>
                  <span>{icon}</span>
                  <p>{name}</p>
                  <em>{status}</em>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => run("Open Unbreakable AI policy management")}>Управление политиками →</button>
          </GlassCard>

          <GlassCard className="ub-anomalies">
            <div className="ub-panel-head">
              <h2>Аномалии и сигналы</h2>
              <button type="button" onClick={() => run("Filter Unbreakable AI signals by all levels")}>Все уровни ⌄</button>
            </div>
            <div className="ub-anomaly-list">
              {anomalies.map(([title, text, time, level, tone]) => (
                <div key={title} className={cx("ub-anomaly", `ub-anomaly-${tone}`)}>
                  <span>△</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                    <em>{level}</em>
                  </div>
                  <time>{time}</time>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => run("Show all Unbreakable AI security signals")}>Смотреть все сигналы →</button>
          </GlassCard>

          <GlassCard className="ub-access">
            <div className="ub-panel-head">
              <h2>Доступ и роли</h2>
              <button type="button" onClick={() => run("Open users and roles in Unbreakable AI")}>Смотреть все</button>
            </div>
            <div className="ub-users">
              <div className="ub-users-head">
                <span>Пользователь</span>
                <span>Роль</span>
                <span>Статус</span>
              </div>
              {users.map(([email, role, status]) => (
                <div key={email}>
                  <span>{email}</span>
                  <span>{role}</span>
                  <em className={status === "Активен" ? "ub-green-text" : "ub-amber-text"}>● {status}</em>
                </div>
              ))}
            </div>
            <div className="ub-zones">
              <h3>Сферы доступа</h3>
              {accessZones.map(([zone, access]) => (
                <div key={zone}>
                  <span>{zone}</span>
                  <em>{access}</em>
                </div>
              ))}
            </div>
          </GlassCard>
        </section>

        <section className="ub-bottom-grid">
          {bottomCards.map((card) => (
            <GlassCard key={card.title} className="ub-bottom-card">
              <div>
                <h2>{card.title}</h2>
                <p>{card.text}</p>
                <div className="ub-bottom-stats">
                  {card.stats.map(([label, value]) => (
                    <span key={label}>
                      {label}
                      <strong>{value}</strong>
                    </span>
                  ))}
                </div>
                <button type="button" onClick={() => run(`Open ${card.title} in Unbreakable AI`)}>
                  {card.button} →
                </button>
              </div>
              <BottomVisual type={card.visual} />
            </GlassCard>
          ))}
        </section>

        <section className="ub-system-strip" aria-label="Live guard status">
          {checks.map((check) => (
            <span key={check.id}>● {check.title}: {check.status}</span>
          ))}
          <span>Render: {render.ok ? "safe" : "check"}</span>
          <span>Storage: {storage.message}</span>
          <span>Engines: {providers.length} fallback routes</span>
        </section>
      </section>
    </main>
  )
}

