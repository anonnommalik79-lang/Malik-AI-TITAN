"use client"

import { useMemo, useState } from "react"
import {
  Bot,
  CalendarCheck,
  ChevronRight,
  Cpu,
  GitBranch,
  LayoutDashboard,
  Maximize2,
  Play,
  Radar,
  RefreshCw,
  Rocket,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { sectionHeroUrl } from "@/lib/section-media"
import { COMMAND_AGENT_PHOTOS } from "@/lib/media-library"

export type CommandCenterStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

const ENDPOINT = "/api/ai/chat"
const HERO_PHOTO = sectionHeroUrl("command-center")

const METRICS = [
  { label: "Агенты", value: "18", note: "12 активных · 6 в резерве", icon: Bot },
  { label: "Миссии", value: "24", note: "↑ 4 за последний час", icon: Workflow },
  { label: "Успех", value: "98.7%", note: "Без мёртвых экранов", icon: Radar },
  { label: "Очередь", value: "37", note: "Сглаженная нагрузка", icon: LayoutDashboard },
] as const

const AGENTS = COMMAND_AGENT_PHOTOS

const MISSIONS = [
  { title: "Подготовка Digital Bridge 2026", progress: 68, status: "Выполняется", route: "presentation-generation" },
  { title: "Запуск Malik Vision Studio", progress: 42, status: "Выполняется", route: "photo-generation" },
  { title: "Инвесторский лендинг", progress: 0, status: "Ожидание", route: "landing-generation" },
  { title: "Аналитический cockpit", progress: 83, status: "Выполняется", route: "dashboard-generation" },
] as const

const PROMPT_CHIPS = [
  "Составь миссию подготовки Malik AI к Digital Bridge: 7 шагов, дедлайны, ответственные агенты",
  "План запуска AI SaaS за 14 дней: лендинг, демо, аналитика, питч-дек",
  "Операционный бриф: как показать Command Center инвестору за 3 минуты",
]

const DEFAULT_BRIEF =
  "Составь операционный план подготовки Malik AI Sovereign Hub к демо-дню: миссии, агенты, артефакты (лендинг, фото, видео, код), таймлайн на 10 дней и чеклист для инвестора."

function canvasArtifact(brief: string, plan: string, operator: string) {
  const safeBrief = brief.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safePlan = plan.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>Command Center · Mission Plan</title>
<style>:root{color-scheme:dark}body{margin:0;font-family:system-ui,sans-serif;background:#030303;color:#e8eae9;padding:40px 24px;line-height:1.65}.wrap{max-width:900px;margin:0 auto}h1{font-size:28px}p{color:#94a3b8}.plan{margin-top:24px;padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02)}</style></head>
<body><div class="wrap"><h1>Command Center · Mission Plan</h1><p>${safeBrief}</p><div class="plan">${safePlan}</div><p style="margin-top:16px;font-size:12px;color:#64748b">Оператор: ${operator}</p></div></body></html>`
}

export function CommandCenterStudio({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: CommandCenterStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [brief, setBrief] = useState(DEFAULT_BRIEF)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Центр управления готов")
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState("")

  const activeMissions = useMemo(() => MISSIONS.filter((m) => m.progress > 0).length, [])

  const runBrief = async () => {
    if (!brief.trim()) {
      setError("Введите операционный бриф")
      return
    }
    setLoading(true)
    setError(null)
    setStatus("Строю миссию…")
    try {
      const res = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: brief,
            mode: "command-center",
            context: "mission-plan",
          }),
        },
        60_000,
      )
      const data = await res.json().catch(() => ({}))
      const text =
        data.reply ||
        data.message ||
        data.content ||
        (typeof data.text === "string" ? data.text : "") ||
        "Миссия сформирована локально: 1) Бриф → 2) Агенты → 3) Артефакты → 4) Демо → 5) Питч."
      setPlan(String(text))
      setStatus("План миссии готов")
    } catch {
      const fallback = [
        "MALIK AI · Mission Plan (offline-safe)",
        "",
        "День 1–2: Final Intelligence — сценарий демо и роутинг интентов",
        "День 3–4: Photo + Video Generation — визуальные артефакты для сцены",
        "День 5–6: Website + Landing — продуктовая страница и CTA",
        "День 7–8: Command Center — миссии, агенты, телеметрия",
        "День 9: Unbreakable AI — проверка отказоустойчивости",
        "День 10: Pitch Deck + Canvas — финальная презентация инвестору",
      ].join("\n")
      setPlan(fallback)
      setError("API недоступен — показан резервный план миссии")
      setStatus("Резервный режим")
    } finally {
      setLoading(false)
    }
  }

  const sendCanvas = () => {
    onOpenCanvas?.(canvasArtifact(brief, plan || "План не сгенерирован", operator))
    setStatus("План отправлен в Canvas")
  }

  const reset = () => {
    onNewChat?.()
    setBrief(DEFAULT_BRIEF)
    setPlan("")
    setError(null)
    setStatus("Центр управления готов")
  }

  return (
    <main className="ccs" data-view="command-center">
      <div className="ccs__bg" aria-hidden="true" />
      <div className="ccs__inner">
        <div className="ccs__status">
          <span className="ccs__status-left">
            <span className="ccs__dot" />
            <span className="ccs__status-key">Command Center</span>
            <strong className="ccs__status-val">Онлайн</strong>
          </span>
          <span className="ccs__status-right">
            Активных миссий
            <strong>{activeMissions}</strong>
          </span>
        </div>

        <header className="ccs__head">
          <span className="ccs__eyebrow"><Workflow size={13} /> Центр управления</span>
          <h1 className="ccs__title">Command Center</h1>
          <p className="ccs__lede">
            Операционный штаб Malik AI: агенты, миссии, телеметрия и маршрутизация в Codex, Canvas и
            генераторы. Спокойный интерфейс уровня OpenAI — большие полки, богатый русский текст, без
            неоновых кнопок-светильников.
          </p>
        </header>

        <section className="ccs__shelf ccs__hero">
          <div
            className="ccs__hero-media"
            style={{ backgroundImage: `url(${HERO_PHOTO})` }}
            role="img"
            aria-label="Mission control"
          >
            <div className="ccs__hero-overlay" />
            <div className="ccs__hero-caption">
              <span className="ccs__shelf-label"><Radar size={13} /> Живой штаб</span>
              <h2 className="ccs__shelf-title">Миссии под контролем</h2>
              <p>{status}</p>
            </div>
          </div>
          <div className="ccs__hero-copy">
            <span className="ccs__shelf-label">Что это и как использовать</span>
            <h2 className="ccs__shelf-title">От брифа до артефакта</h2>
            <p>
              Command Center объединяет агентов, очередь миссий и маршруты в продуктовые модули. Бриф
              уходит в <code>{ENDPOINT}</code>, план можно отправить в Canvas или передать в Codex.
            </p>
            <ol className="ccs__steps">
              <li><span className="ccs__step-num">1</span><div><strong>Опишите цель.</strong> Бриф миссии — что нужно подготовить к демо или запуску.</div></li>
              <li><span className="ccs__step-num">2</span><div><strong>Сгенерируйте план.</strong> AI разложит шаги по агентам и срокам.</div></li>
              <li><span className="ccs__step-num">3</span><div><strong>Запустите маршруты.</strong> Переходите в генераторы, проекты или Canvas.</div></li>
              <li><span className="ccs__step-num">4</span><div><strong>Покажите инвестору.</strong> Телеметрия и прогресс миссий — на одном экране.</div></li>
            </ol>
          </div>
        </section>

        <section className="ccs__metrics" aria-label="Метрики">
          {METRICS.map((m) => (
            <article key={m.label} className="ccs__metric">
              <m.icon size={18} />
              <strong>{m.value}</strong>
              <span>{m.label}</span>
              <p>{m.note}</p>
            </article>
          ))}
        </section>

        <section className="ccs__shelf ccs__brief">
          <div className="ccs__brief-head">
            <div>
              <span className="ccs__shelf-label"><Terminal size={13} /> Бриф миссии</span>
              <h2 className="ccs__shelf-title">Операционный план</h2>
            </div>
          </div>
          <textarea
            className="ccs__textarea"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="Опишите миссию: цель, сроки, артефакты, аудитория…"
          />
          <div className="ccs__chips">
            {PROMPT_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setBrief(chip)}>
                {chip.slice(0, 56)}…
              </button>
            ))}
          </div>
          {error ? <p className="ccs__error">{error}</p> : null}
          {plan ? <pre className="ccs__plan">{plan}</pre> : null}
          <div className="ccs__actions">
            <button type="button" className="ccs__btn ccs__btn--primary" onClick={runBrief} disabled={loading}>
              <Play size={15} />
              {loading ? "Строю план…" : "Запустить миссию"}
            </button>
            <button type="button" className="ccs__btn ccs__btn--ghost" onClick={sendCanvas}>
              <Maximize2 size={15} /> В Canvas
            </button>
            <button type="button" className="ccs__btn ccs__btn--ghost" onClick={onOpenCodex}>
              <Cpu size={15} /> Codex
            </button>
            <button type="button" className="ccs__btn ccs__btn--ghost" onClick={reset}>
              <RefreshCw size={15} /> Сброс
            </button>
          </div>
        </section>

        <section className="ccs__agents" aria-label="Агенты">
          <div className="ccs__section-head">
            <div>
              <span className="ccs__shelf-label"><Bot size={13} /> Агенты</span>
              <h2 className="ccs__shelf-title">Операционные роли</h2>
            </div>
          </div>
          <div className="ccs__agent-grid">
            {AGENTS.map((a) => (
              <article key={a.id} className="ccs__agent-card">
                <div className="ccs__agent-photo" style={{ backgroundImage: `url(${a.photo})` }} />
                <div className="ccs__agent-body">
                  <strong>{a.title}</strong>
                  <p>{a.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ccs__shelf ccs__missions">
          <span className="ccs__shelf-label"><CalendarCheck size={13} /> Очередь</span>
          <h2 className="ccs__shelf-title">Активные миссии</h2>
          <div className="ccs__mission-list">
            {MISSIONS.map((m) => (
              <button
                key={m.title}
                type="button"
                className="ccs__mission-row"
                onClick={() => onViewChange(m.route)}
              >
                <div>
                  <strong>{m.title}</strong>
                  <span>{m.status}</span>
                </div>
                <div className="ccs__progress">
                  <div className="ccs__progress-bar" style={{ width: `${m.progress}%` }} />
                  <span>{m.progress}%</span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className="ccs__shelf ccs__cta">
          <div className="ccs__cta-copy">
            <span className="ccs__shelf-label">Следующий шаг</span>
            <h2 className="ccs__shelf-title">Запустите Creator Engines</h2>
            <p>Из штаба — сразу в AI Generator, Website Builder или Pitch Deck Studio.</p>
          </div>
          <div className="ccs__actions">
            <button type="button" className="ccs__btn ccs__btn--primary" onClick={() => onViewChange("ai-generator")}>
              <Sparkles size={15} /> AI Generator
            </button>
            <button type="button" className="ccs__btn ccs__btn--ghost" onClick={() => onViewChange("website-generation")}>
              Website Builder <ChevronRight size={15} />
            </button>
            <button type="button" className="ccs__btn ccs__btn--ghost" onClick={() => onViewChange("projects")}>
              <GitBranch size={15} /> Проекты
            </button>
          </div>
        </section>

        <footer className="ccs__footer">
          <span><Rocket size={12} /> Malik Command · v2</span>
          <span>Оператор · {operator}</span>
          <span>Эндпоинт · {ENDPOINT}</span>
        </footer>
      </div>

      <style jsx>{`
        .ccs {
          position: relative;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px;
          color: #e7eae8;
          -webkit-font-smoothing: antialiased;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
        }
        .ccs::-webkit-scrollbar { width: 6px; }
        .ccs::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
        @media (max-width: 920px) { .ccs { padding-top: clamp(20px, 3vw, 32px); } }
        .ccs__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(55% 40% at 12% 0%, rgba(245, 158, 11, 0.05), transparent 60%),
            radial-gradient(45% 35% at 95% 4%, rgba(211, 162, 62, 0.04), transparent 62%);
        }
        .ccs__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .ccs__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8ba3b8;
        }
        .ccs__status {
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
        .ccs__status-left { display: inline-flex; align-items: center; gap: 10px; }
        .ccs__dot { width: 8px; height: 8px; border-radius: 999px; background: #fcd34d; }
        .ccs__status-key { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a958f; }
        .ccs__status-val { font-size: 12.5px; font-weight: 700; color: #fde68a; }
        .ccs__status-right { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a958f; }
        .ccs__status-right strong { margin-left: 8px; font-weight: 700; color: #fde68a; }
        .ccs__head { max-width: 70ch; margin: 0 0 40px; }
        .ccs__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8ba3b8;
          margin-bottom: 18px;
        }
        .ccs__title {
          margin: 0 0 18px;
          font-size: clamp(38px, 6vw, 64px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .ccs__lede {
          margin: 0;
          font-size: clamp(16px, 1.7vw, 20px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 60ch;
        }
        .ccs__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .ccs__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(20px, 2.3vw, 27px);
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: #f1f4f2;
        }
        .ccs__hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          gap: clamp(20px, 3vw, 32px);
          padding: 0;
          overflow: hidden;
          border: none;
          background: transparent;
        }
        @media (max-width: 900px) { .ccs__hero { grid-template-columns: 1fr; } }
        .ccs__hero-media {
          position: relative;
          min-height: 340px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }
        .ccs__hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 30%, rgba(3, 3, 3, 0.88) 100%);
        }
        .ccs__hero-caption { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px; }
        .ccs__hero-caption p { margin: 8px 0 0; font-size: 13px; color: #b8c4be; }
        .ccs__hero-copy {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 32px);
        }
        .ccs__hero-copy p { margin: 0 0 14px; font-size: 15px; line-height: 1.7; color: #a7b2ac; }
        .ccs__hero-copy code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12px;
          color: #fcd34d;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 1px 6px;
        }
        .ccs__steps { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        .ccs__steps li { display: flex; gap: 14px; align-items: flex-start; }
        .ccs__step-num {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          color: #fde68a;
          border: 1px solid rgba(252, 211, 77, 0.28);
          background: rgba(245, 158, 11, 0.08);
        }
        .ccs__steps li div { font-size: 14px; line-height: 1.6; color: #9aa6a0; }
        .ccs__steps strong { display: block; color: #e7ece9; font-weight: 600; margin-bottom: 2px; }
        .ccs__metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }
        @media (max-width: 900px) { .ccs__metrics { grid-template-columns: repeat(2, 1fr); } }
        .ccs__metric {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          padding: 18px;
          color: #8ba3b8;
        }
        .ccs__metric strong { display: block; font-size: 28px; color: #f4f6f5; margin: 10px 0 4px; }
        .ccs__metric span { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .ccs__metric p { margin: 8px 0 0; font-size: 12px; color: #8a958f; }
        .ccs__textarea {
          width: 100%;
          resize: vertical;
          min-height: 110px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.25);
          color: #e8ece9;
          font-size: 15px;
          line-height: 1.55;
          padding: 16px 18px;
          outline: none;
        }
        .ccs__textarea:focus { border-color: rgba(252, 211, 77, 0.35); }
        .ccs__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
        .ccs__chips button {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          background: transparent;
          color: #aab4af;
          font-size: 12px;
          padding: 8px 14px;
          cursor: pointer;
        }
        .ccs__chips button:hover { border-color: rgba(255, 255, 255, 0.22); color: #e7ece9; }
        .ccs__error { margin: 0 0 12px; font-size: 13px; color: #fca5a5; }
        .ccs__plan {
          margin: 0 0 16px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
          font-size: 13px;
          line-height: 1.6;
          color: #c5cdc8;
          white-space: pre-wrap;
          overflow-x: auto;
        }
        .ccs__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        .ccs__btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          padding: 11px 18px;
          cursor: pointer;
          transition: background 0.16s, border-color 0.16s, color 0.16s;
        }
        .ccs__btn--primary {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #f4f6f5;
          color: #0a0a0a;
          box-shadow: none;
        }
        .ccs__btn--primary:hover:not(:disabled) { background: #ffffff; }
        .ccs__btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .ccs__btn--ghost {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: #d1d9d4;
        }
        .ccs__btn--ghost:hover { border-color: rgba(255, 255, 255, 0.28); color: #f4f6f5; }
        .ccs__section-head { margin-bottom: 18px; }
        .ccs__agents { margin-bottom: 22px; }
        .ccs__agent-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        @media (max-width: 700px) { .ccs__agent-grid { grid-template-columns: 1fr; } }
        .ccs__agent-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.015);
        }
        .ccs__agent-photo {
          height: 140px;
          background-size: cover;
          background-position: center;
        }
        .ccs__agent-body { padding: 16px 18px; }
        .ccs__agent-body strong { display: block; font-size: 16px; color: #f1f4f2; margin-bottom: 6px; }
        .ccs__agent-body p { margin: 0; font-size: 13px; line-height: 1.55; color: #9aa6a0; }
        .ccs__mission-list { display: flex; flex-direction: column; gap: 10px; }
        .ccs__mission-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 16px;
          width: 100%;
          text-align: left;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          padding: 14px 18px;
          color: inherit;
          cursor: pointer;
        }
        .ccs__mission-row:hover { border-color: rgba(255, 255, 255, 0.16); }
        .ccs__mission-row strong { display: block; font-size: 14px; color: #f1f4f2; }
        .ccs__mission-row span { font-size: 12px; color: #8a958f; }
        .ccs__progress { display: flex; align-items: center; gap: 10px; min-width: 120px; }
        .ccs__progress-bar {
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, #f59e0b, #fcd34d);
        }
        .ccs__progress span { font-size: 12px; color: #aab4af; min-width: 36px; }
        .ccs__cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .ccs__cta-copy p { margin: 0; font-size: 15px; color: #a7b2ac; max-width: 48ch; }
        .ccs__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 24px;
          margin-top: 8px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: #6b756f;
        }
        .ccs__footer span { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </main>
  )
}
