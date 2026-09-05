"use client"

import { useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Code2,
  Copy,
  DollarSign,
  FileText,
  Globe2,
  Headphones,
  Loader2,
  MapPin,
  Megaphone,
  Palette,
  Play,
  Search,
  Sparkles,
  Users,
  Zap,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { takePrefillPrompt } from "@/lib/malik-context"

export type BusinessCommandCenterProps = {
  username?: string
  onViewChange?: (view: string) => void
  onNewChat?: () => void
}

type Stage = "intro" | "configure" | "running"
type RunState = "idle" | "running" | "done" | "error"

type AgentDef = {
  id: string
  name: string
  role: string
  task: string
  icon: typeof Brain
}

const MODEL_LABEL = "MalikLLM Qwen3.8 27B"
const ENDPOINT = "/api/business/autonomous"

const AGENTS: AgentDef[] = [
  { id: "ceo", name: "CEO", role: "Стратегия", task: "Формирует бизнес-модель, оффер и план запуска", icon: Brain },
  { id: "research", name: "Research", role: "Рынок", task: "Проверяет спрос, конкурентов и точки входа", icon: Search },
  { id: "coder", name: "Coder", role: "Продукт", task: "Проектирует продукт, сайт и технический стек", icon: Code2 },
  { id: "design", name: "Design", role: "Бренд", task: "Собирает позиционирование и визуальную систему", icon: Palette },
  { id: "marketing", name: "Marketing", role: "Привлечение", task: "Строит контент, каналы и воронку", icon: Megaphone },
  { id: "sales", name: "Sales", role: "Продажи", task: "Готовит лиды, скрипты и механику закрытия", icon: Users },
  { id: "support", name: "Support", role: "Клиенты", task: "Проектирует поддержку и удержание", icon: Headphones },
  { id: "analyst", name: "Analyst", role: "Рост", task: "Ставит KPI, аналитику и цикл улучшений", icon: BarChart3 },
]

const CAPABILITIES = [
  { title: "Исследует рынок", note: "Спрос, конкуренты и возможности.", icon: Search },
  { title: "Создаёт продукт и сайт", note: "Оффер, структура и готовый план запуска.", icon: FileText },
  { title: "Генерирует маркетинг", note: "Контент, позиционирование и продвижение.", icon: Megaphone },
  { title: "Находит клиентов", note: "Целевая аудитория, лиды и outreach.", icon: Users },
  { title: "Ведёт лиды и продажи", note: "Воронка, CRM-логика и рост выручки.", icon: BarChart3 },
]

const TEMPLATES = [
  {
    id: "saas",
    title: "AI SaaS",
    note: "Сервис с подпиской",
    idea: "Запусти AI SaaS для малого бизнеса: автоматизация заявок, контента и поддержки клиентов.",
    market: "B2B SaaS",
    budget: "$300–1,000",
  },
  {
    id: "agency",
    title: "AI-агентство",
    note: "Сайт + AI + боты",
    idea: "Запусти агентство, которое продаёт компаниям сайты, AI-ассистентов и Telegram/WhatsApp-ботов под ключ.",
    market: "Услуги для бизнеса",
    budget: "$100–500",
  },
  {
    id: "commerce",
    title: "E-commerce",
    note: "Товар + продажи",
    idea: "Запусти нишевый e-commerce бренд с быстрым тестом спроса, лендингом, контентом и системой продаж.",
    market: "E-commerce",
    budget: "$500–2,000",
  },
]

function MalikMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`ac-model-mark${compact ? " is-compact" : ""}`}>
      <img src="/icon.svg" alt="" />
    </span>
  )
}

export function BusinessCommandCenter({ username, onNewChat }: BusinessCommandCenterProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [stage, setStage] = useState<Stage>("intro")
  const [idea, setIdea] = useState(() => takePrefillPrompt())
  const [market, setMarket] = useState("Онлайн / глобальный")
  const [country, setCountry] = useState("Казахстан")
  const [budget, setBudget] = useState("$0–500")
  const [requirements, setRequirements] = useState("Сайт, оффер, контент, лиды, продажи и аналитика")
  const [runState, setRunState] = useState<RunState>("idle")
  const [activeAgent, setActiveAgent] = useState(0)
  const [result, setResult] = useState("")
  const [provider, setProvider] = useState("")
  const [providerModel, setProviderModel] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  const progress = useMemo(() => {
    if (runState === "done") return 100
    if (runState === "error") return Math.max(12, Math.round(((activeAgent + 1) / AGENTS.length) * 100))
    if (runState !== "running") return 0
    return Math.min(92, Math.max(8, Math.round(((activeAgent + 0.55) / AGENTS.length) * 100)))
  }, [activeAgent, runState])

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setIdea(template.idea)
    setMarket(template.market)
    setBudget(template.budget)
  }

  const startRunPulse = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      setActiveAgent((current) => Math.min(current + 1, AGENTS.length - 1))
    }, 1500)
  }

  const stopRunPulse = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const launchCompany = async () => {
    if (!idea.trim()) {
      setError("Опишите бизнес, который нужно запустить.")
      setStage("configure")
      return
    }

    setStage("running")
    setRunState("running")
    setActiveAgent(0)
    setResult("")
    setProvider("")
    setProviderModel("")
    setError("")
    startRunPulse()

    try {
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea: idea.trim(),
            market,
            country,
            budget,
            requirements,
            language: "ru",
            modelId: "malik-27b",
            operator,
          }),
        },
        90_000,
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`)
      }

      stopRunPulse()
      setActiveAgent(AGENTS.length - 1)
      setProvider(String(payload?.provider || ""))
      setProviderModel(String(payload?.model || ""))
      setResult(String(payload?.content || payload?.text || "").trim())
      setRunState("done")
    } catch (cause) {
      stopRunPulse()
      setError(cause instanceof Error ? cause.message : "Не удалось запустить Autonomous Company")
      setRunState("error")
    }
  }

  const reset = () => {
    stopRunPulse()
    onNewChat?.()
    setStage("intro")
    setRunState("idle")
    setActiveAgent(0)
    setResult("")
    setProvider("")
    setProviderModel("")
    setError("")
  }

  const copyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError("Не удалось скопировать результат")
    }
  }

  if (stage === "intro") {
    return (
      <main className="ac-shell" data-view="business-command-center" data-stage="intro">
        <div className="ac-intro-grid">
          <section className="ac-office" aria-label="Autonomous Company office">
            <img
              src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=86"
              alt="Современный офис"
            />
            <div className="ac-office-shade" />
            <div className="ac-office-brand">
              <span>БОЛЬШИЕ ИДЕИ</span>
              <strong>СТАНОВЯТСЯ<br />РЕАЛЬНЫМИ<br />КОМПАНИЯМИ.</strong>
              <em>MALIK AI</em>
            </div>
            <div className="ac-office-console">
              <div className="ac-office-console-head"><MalikMark compact /> Autonomous Company</div>
              <p>8 AI-агентов готовы строить бизнес</p>
              <div className="ac-office-console-row"><span>CEO</span><span>Research</span><span>Coder</span><span>Sales</span></div>
            </div>
          </section>

          <section className="ac-intro-panel">
            <div className="ac-kicker">MALIK AI</div>
            <h1>Autonomous Company</h1>
            <p className="ac-intro-lede">Превращает одну идею в работающую бизнес-систему — от исследования рынка до продаж и аналитики.</p>

            <div className="ac-capability-list">
              {CAPABILITIES.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="ac-capability">
                    <span className="ac-capability-icon"><Icon size={22} /></span>
                    <span><strong>{item.title}</strong><small>{item.note}</small></span>
                    <ArrowRight size={18} />
                  </div>
                )
              })}
            </div>

            <div className="ac-intro-bottom">
              <button type="button" className="ac-primary ac-primary-large" onClick={() => setStage("configure")}>
                <Play size={17} fill="currentColor" /> Запустить бизнес
              </button>
              <div className="ac-model-chip"><MalikMark compact /><span><b>{MODEL_LABEL}</b><small>Основной мозг · 8 агентов</small></span></div>
            </div>
          </section>
        </div>
        <AutonomousStyles />
      </main>
    )
  }

  if (stage === "configure") {
    return (
      <main className="ac-shell" data-view="business-command-center" data-stage="configure">
        <div className="ac-config-wrap">
          <header className="ac-topbar">
            <button type="button" className="ac-back" onClick={() => setStage("intro")}><ChevronLeft size={17} /> Назад</button>
            <div className="ac-topbar-title"><Briefcase size={18} /><span>Бизнес под ключ</span></div>
            <div className="ac-live"><span /> 8 агентов готовы</div>
          </header>

          <div className="ac-config-head">
            <div>
              <div className="ac-kicker">MALIK AUTONOMOUS COMPANY</div>
              <h1>Что будем запускать?</h1>
              <p>Опишите идею. Malik AI соберёт стратегию, продукт, бренд, маркетинг, продажи, поддержку и аналитику в один запуск.</p>
            </div>
            <div className="ac-model-card">
              <MalikMark />
              <span><small>Основная модель</small><strong>{MODEL_LABEL}</strong><em>Groq · Qwen · API</em></span>
            </div>
          </div>

          <section className="ac-config-grid">
            <div className="ac-form-card">
              <label className="ac-label" htmlFor="ac-idea">Идея бизнеса</label>
              <textarea
                id="ac-idea"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Например: запусти AI-агентство для ресторанов Алматы, которое продаёт сайты, ботов и автоматизацию заявок…"
                rows={7}
              />

              <div className="ac-field-grid">
                <label><span><Globe2 size={14} /> Рынок</span><input value={market} onChange={(event) => setMarket(event.target.value)} /></label>
                <label><span><MapPin size={14} /> Страна</span><input value={country} onChange={(event) => setCountry(event.target.value)} /></label>
                <label><span><DollarSign size={14} /> Бюджет</span><input value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
                <label><span><Sparkles size={14} /> Требования</span><input value={requirements} onChange={(event) => setRequirements(event.target.value)} /></label>
              </div>

              {error ? <div className="ac-error">{error}</div> : null}

              <button id="ac-launch" type="button" className="ac-primary ac-launch" onClick={launchCompany}>
                <Zap size={18} fill="currentColor" /> Создать компанию <ArrowRight size={17} />
              </button>
            </div>

            <aside className="ac-agent-preview">
              <div className="ac-shelf-title"><span>Команда AI</span><em>8 агентов</em></div>
              <div className="ac-agent-mini-grid">
                {AGENTS.map((agent) => {
                  const Icon = agent.icon
                  return <div key={agent.id} className="ac-agent-mini"><span><Icon size={16} /></span><div><strong>{agent.name}</strong><small>{agent.role}</small></div></div>
                })}
              </div>
              <div className="ac-api-note"><Bot size={16} /><span><strong>API orchestration</strong><small>Запуск идёт через сервер Malik AI. Реальные внешние действия не считаются выполненными, пока API не подтвердит их.</small></span></div>
            </aside>
          </section>

          <section className="ac-templates">
            <div className="ac-shelf-title"><span>Быстрый старт</span><em>Шаблоны бизнеса</em></div>
            <div className="ac-template-grid">
              {TEMPLATES.map((template) => (
                <button key={template.id} type="button" onClick={() => applyTemplate(template)}>
                  <span className="ac-template-icon"><Briefcase size={17} /></span>
                  <span><strong>{template.title}</strong><small>{template.note}</small></span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <AutonomousStyles />
      </main>
    )
  }

  return (
    <main className="ac-shell" data-view="business-command-center" data-stage="running">
      <div className="ac-run-wrap">
        <header className="ac-topbar">
          <button type="button" className="ac-back" onClick={reset}><ChevronLeft size={17} /> Новый запуск</button>
          <div className="ac-topbar-title"><Briefcase size={18} /><span>Бизнес под ключ</span></div>
          <div className={`ac-run-badge is-${runState}`}>
            {runState === "running" ? <Loader2 size={13} className="ac-spin" /> : runState === "done" ? <CheckCircle2 size={13} /> : <Circle size={13} />}
            {runState === "running" ? "Агенты работают" : runState === "done" ? "Запуск готов" : "Требуется проверка"}
          </div>
        </header>

        <section className="ac-run-head">
          <div>
            <div className="ac-kicker">AUTONOMOUS COMPANY RUN</div>
            <h1>{runState === "done" ? "Компания собрана" : "Строим компанию"}</h1>
            <p>{idea}</p>
          </div>
          <div className="ac-run-model"><MalikMark /><span><small>Primary brain</small><strong>{MODEL_LABEL}</strong><em>{providerModel || "qwen/qwen3.8-27b"}</em></span></div>
        </section>

        <div className="ac-progress-card">
          <div className="ac-progress-top"><span>Общий прогресс</span><strong>{progress}%</strong></div>
          <div className="ac-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="ac-progress-meta"><span>{country}</span><span>{market}</span><span>{budget}</span></div>
        </div>

        <section className="ac-run-grid">
          <div className="ac-agent-stack">
            {AGENTS.map((agent, index) => {
              const Icon = agent.icon
              const done = runState === "done" || index < activeAgent
              const active = runState === "running" && index === activeAgent
              const failed = runState === "error" && index === activeAgent
              return (
                <div key={agent.id} className={`ac-agent-row${active ? " is-active" : ""}${done ? " is-done" : ""}${failed ? " is-error" : ""}`}>
                  <span className="ac-agent-avatar"><Icon size={18} /></span>
                  <span className="ac-agent-copy"><strong>{agent.name}<em>{agent.role}</em></strong><small>{agent.task}</small></span>
                  <span className="ac-agent-state">
                    {done ? <Check size={16} /> : active ? <Loader2 size={16} className="ac-spin" /> : failed ? "!" : <Circle size={13} />}
                  </span>
                </div>
              )
            })}
          </div>

          <aside className="ac-output">
            <div className="ac-output-head">
              <span><Bot size={16} /> Результат запуска</span>
              {result ? <button type="button" onClick={copyResult}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Скопировано" : "Копировать"}</button> : null}
            </div>
            {runState === "running" ? (
              <div className="ac-output-wait"><Loader2 size={28} className="ac-spin" /><strong>{AGENTS[activeAgent]?.name} работает</strong><span>{AGENTS[activeAgent]?.task}</span></div>
            ) : runState === "error" ? (
              <div className="ac-output-error"><strong>Запуск остановлен</strong><p>{error}</p><button type="button" className="ac-secondary" onClick={launchCompany}>Повторить</button></div>
            ) : (
              <>
                <div className="ac-output-engine"><span>API</span><strong>{provider || "Malik AI"}</strong><span>Model</span><strong>{providerModel || MODEL_LABEL}</strong></div>
                <pre>{result || "Модель завершила запуск без текстового результата."}</pre>
              </>
            )}
          </aside>
        </section>
      </div>
      <AutonomousStyles />
    </main>
  )
}

function AutonomousStyles() {
  return (
    <style jsx global>{`
      .ac-shell{height:100%;min-height:0;overflow:auto;background:#050607;color:#f5f5f6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .ac-shell *{box-sizing:border-box}.ac-shell button,.ac-shell input,.ac-shell textarea{font:inherit}.ac-shell button{cursor:pointer}
      .ac-intro-grid{display:grid;grid-template-columns:minmax(520px,1.08fr) minmax(460px,.92fr);min-height:100%;background:radial-gradient(circle at 80% 20%,rgba(62,80,102,.12),transparent 34%),#050607}
      .ac-office{position:relative;min-height:760px;overflow:hidden;border-right:1px solid rgba(255,255,255,.08);background:#0a0b0d}.ac-office>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.82) contrast(1.05) brightness(.72)}
      .ac-office-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,5,6,.38),transparent 44%,rgba(4,5,6,.1)),linear-gradient(0deg,rgba(4,5,6,.62),transparent 45%)}
      .ac-office-brand{position:absolute;left:7%;top:8%;display:flex;max-width:270px;flex-direction:column;gap:9px;text-shadow:0 3px 18px rgba(0,0,0,.55)}.ac-office-brand span{font-size:11px;letter-spacing:.22em;color:#c7c7cc}.ac-office-brand strong{font-size:31px;line-height:1.05;letter-spacing:-.035em}.ac-office-brand em{font-size:11px;font-style:normal;letter-spacing:.14em;color:#e5e5e7}
      .ac-office-console{position:absolute;right:5%;bottom:6%;width:min(360px,48%);border:1px solid rgba(255,255,255,.15);border-radius:16px;background:rgba(7,9,12,.78);padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.5);backdrop-filter:blur(16px)}.ac-office-console-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650}.ac-office-console p{margin:10px 0 13px;color:#a7aab2;font-size:12px}.ac-office-console-row{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.ac-office-console-row span{border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.04);padding:6px 4px;text-align:center;color:#c6c8ce;font-size:9.5px}
      .ac-intro-panel{display:flex;min-height:760px;flex-direction:column;justify-content:center;padding:58px clamp(34px,5vw,78px)}.ac-kicker{margin-bottom:13px;color:#aeb2ba;font-size:11px;font-weight:650;letter-spacing:.2em}.ac-intro-panel h1,.ac-config-head h1,.ac-run-head h1{margin:0;color:#fff;font-size:clamp(38px,4vw,62px);line-height:.98;letter-spacing:-.052em}.ac-intro-lede{max-width:690px;margin:17px 0 28px;color:#9ea5b2;font-size:18px;line-height:1.5}
      .ac-capability-list{display:flex;flex-direction:column;gap:9px}.ac-capability{display:grid;grid-template-columns:56px 1fr 20px;align-items:center;gap:14px;min-height:80px;border:1px solid rgba(255,255,255,.075);border-radius:13px;background:#0b0d10;padding:10px 17px;transition:.16s ease}.ac-capability:hover{border-color:rgba(255,255,255,.14);background:#0f1115;transform:translateX(2px)}.ac-capability-icon{display:grid;width:48px;height:48px;place-items:center;border-radius:11px;background:#13161b;color:#f2f3f4}.ac-capability strong{display:block;font-size:15px;font-weight:610}.ac-capability small{display:block;margin-top:5px;color:#828996;font-size:12px}.ac-capability>svg{color:#707782}
      .ac-intro-bottom{display:flex;align-items:center;gap:18px;margin-top:26px}.ac-primary{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:11px;background:#f3f4f5;color:#0a0b0d;font-weight:680;transition:.15s ease}.ac-primary:hover{background:#fff;transform:translateY(-1px)}.ac-primary-large{min-height:54px;padding:0 24px;font-size:14px}.ac-model-chip{display:flex;align-items:center;gap:10px}.ac-model-chip b{display:block;color:#dedfe2;font-size:11.5px}.ac-model-chip small{display:block;margin-top:3px;color:#6f7680;font-size:10px}
      .ac-model-mark{display:grid;width:42px;height:42px;flex:0 0 auto;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#f5f5f5;overflow:hidden}.ac-model-mark.is-compact{width:25px;height:25px;border-radius:7px}.ac-model-mark img{width:100%;height:100%;object-fit:cover}
      .ac-config-wrap,.ac-run-wrap{width:min(1320px,calc(100% - 48px));margin:0 auto;padding-bottom:60px}.ac-topbar{display:grid;height:66px;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid rgba(255,255,255,.07)}.ac-back{display:inline-flex;width:max-content;align-items:center;gap:5px;border:0;background:transparent;color:#858b95;font-size:12px}.ac-back:hover{color:#fff}.ac-topbar-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650}.ac-live,.ac-run-badge{display:flex;justify-self:end;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:#0b0d0f;padding:6px 10px;color:#aeb3ba;font-size:10.5px}.ac-live>span{width:6px;height:6px;border-radius:50%;background:#64d49b;box-shadow:0 0 10px rgba(100,212,155,.45)}
      .ac-config-head,.ac-run-head{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;padding:54px 0 32px}.ac-config-head>div:first-child,.ac-run-head>div:first-child{max-width:820px}.ac-config-head h1,.ac-run-head h1{font-size:50px}.ac-config-head p,.ac-run-head p{margin:14px 0 0;color:#858c97;font-size:14px;line-height:1.6}.ac-model-card,.ac-run-model{display:flex;min-width:290px;align-items:center;gap:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#0a0c0f;padding:13px}.ac-model-card small,.ac-run-model small{display:block;color:#747b86;font-size:9.5px}.ac-model-card strong,.ac-run-model strong{display:block;margin-top:3px;font-size:12px}.ac-model-card em,.ac-run-model em{display:block;margin-top:3px;color:#666d77;font-size:9.5px;font-style:normal}
      .ac-config-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(310px,.65fr);gap:18px}.ac-form-card,.ac-agent-preview,.ac-progress-card,.ac-agent-stack,.ac-output,.ac-templates{border:1px solid rgba(255,255,255,.075);border-radius:16px;background:#090b0d}.ac-form-card{padding:22px}.ac-label{display:block;margin-bottom:9px;color:#c8cbd0;font-size:11px;font-weight:600}.ac-form-card textarea,.ac-form-card input{width:100%;border:1px solid rgba(255,255,255,.09);outline:0;background:#060708;color:#f1f2f3}.ac-form-card textarea{resize:vertical;min-height:156px;border-radius:12px;padding:14px;font-size:13px;line-height:1.55}.ac-form-card textarea:focus,.ac-form-card input:focus{border-color:rgba(255,255,255,.2)}.ac-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.ac-field-grid label{display:block}.ac-field-grid label>span{display:flex;align-items:center;gap:6px;margin:0 0 6px 2px;color:#7f8690;font-size:10px}.ac-form-card input{height:39px;border-radius:9px;padding:0 10px;font-size:11.5px}.ac-launch{width:100%;height:48px;margin-top:16px;font-size:13px}.ac-launch>svg:last-child{margin-left:auto}.ac-error{margin-top:10px;border:1px solid rgba(248,113,113,.2);border-radius:8px;background:rgba(127,29,29,.12);padding:9px 10px;color:#fca5a5;font-size:11px}
      .ac-agent-preview{padding:19px}.ac-shelf-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.ac-shelf-title span{font-size:11.5px;font-weight:650}.ac-shelf-title em{color:#6f7680;font-size:9.5px;font-style:normal}.ac-agent-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ac-agent-mini{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#07090b;padding:9px}.ac-agent-mini>span{display:grid;width:29px;height:29px;place-items:center;border-radius:8px;background:#12151a;color:#cfd2d7}.ac-agent-mini strong{display:block;font-size:10.5px}.ac-agent-mini small{display:block;margin-top:2px;color:#676e78;font-size:8.5px}.ac-api-note{display:flex;gap:9px;margin-top:13px;border-top:1px solid rgba(255,255,255,.06);padding-top:13px;color:#7e858f}.ac-api-note>svg{flex:0 0 auto;margin-top:2px}.ac-api-note strong{display:block;color:#aeb3ba;font-size:10px}.ac-api-note small{display:block;margin-top:4px;font-size:9px;line-height:1.45}
      .ac-templates{margin-top:18px;padding:18px}.ac-template-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.ac-template-grid button{display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:#07090a;padding:11px;color:#e7e8ea;text-align:left}.ac-template-grid button:hover{border-color:rgba(255,255,255,.15);background:#0d0f12}.ac-template-grid button>span:nth-child(2){min-width:0;flex:1}.ac-template-grid strong{display:block;font-size:10.5px}.ac-template-grid small{display:block;margin-top:2px;color:#696f79;font-size:9px}.ac-template-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:#111419;color:#cfd1d5}.ac-template-grid button>svg{color:#666d77}
      .ac-run-badge.is-running{color:#d8dadd}.ac-run-badge.is-done{color:#91ddb5}.ac-run-badge.is-error{color:#f3a6a6}.ac-spin{animation:ac-spin .9s linear infinite}@keyframes ac-spin{to{transform:rotate(360deg)}}
      .ac-progress-card{padding:15px 17px}.ac-progress-top,.ac-progress-meta{display:flex;align-items:center;justify-content:space-between}.ac-progress-top span{color:#8d949d;font-size:10.5px}.ac-progress-top strong{font-size:12px}.ac-progress-track{height:5px;margin:10px 0;border-radius:99px;background:#171a1e;overflow:hidden}.ac-progress-track span{display:block;height:100%;border-radius:99px;background:#f0f1f2;transition:width .45s ease}.ac-progress-meta{justify-content:flex-start;gap:7px}.ac-progress-meta span{border:1px solid rgba(255,255,255,.06);border-radius:99px;background:#060708;padding:4px 8px;color:#747b85;font-size:8.5px}
      .ac-run-grid{display:grid;grid-template-columns:minmax(390px,.72fr) minmax(0,1.28fr);gap:16px;margin-top:16px}.ac-agent-stack{padding:10px}.ac-agent-row{display:grid;grid-template-columns:38px 1fr 26px;align-items:center;gap:10px;min-height:64px;border-radius:10px;padding:7px 9px;color:#858b94}.ac-agent-row+.ac-agent-row{border-top:1px solid rgba(255,255,255,.045)}.ac-agent-row.is-active{background:#101318;color:#f2f3f4}.ac-agent-row.is-done{color:#c8ccd0}.ac-agent-row.is-error{background:rgba(90,24,24,.12);color:#f3b0b0}.ac-agent-avatar{display:grid;width:34px;height:34px;place-items:center;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0d1013}.ac-agent-copy strong{display:flex;align-items:center;gap:7px;font-size:10.5px}.ac-agent-copy strong em{color:#636a74;font-size:8.5px;font-style:normal;font-weight:500}.ac-agent-copy small{display:block;margin-top:4px;color:#666d76;font-size:9px}.ac-agent-state{display:grid;place-items:center;color:#6b727b}.ac-agent-row.is-done .ac-agent-state{color:#75d49f}
      .ac-output{min-height:510px;overflow:hidden}.ac-output-head{display:flex;height:48px;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06);padding:0 16px}.ac-output-head>span{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:650}.ac-output-head button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:#797f88;font-size:9px}.ac-output-engine{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:7px;border-bottom:1px solid rgba(255,255,255,.05);padding:10px 16px;color:#666d76;font-size:8.5px}.ac-output-engine strong{color:#aeb3b9;font-weight:550}.ac-output pre{margin:0;padding:17px;color:#c7cbd0;font-family:Inter,ui-sans-serif,system-ui;white-space:pre-wrap;font-size:11px;line-height:1.65}.ac-output-wait{display:flex;height:430px;flex-direction:column;align-items:center;justify-content:center;color:#737a84;text-align:center}.ac-output-wait strong{margin-top:14px;color:#d8dade;font-size:13px}.ac-output-wait span{max-width:340px;margin-top:6px;font-size:10px}.ac-output-error{padding:22px;color:#d9d9db}.ac-output-error p{color:#ee9e9e;font-size:11px}.ac-secondary{border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#121417;padding:8px 12px;color:#e8e8e9;font-size:10px}
      @media(max-width:1100px){.ac-intro-grid{grid-template-columns:1fr}.ac-office{min-height:480px;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.ac-intro-panel{min-height:auto;padding:44px 30px}.ac-config-grid,.ac-run-grid{grid-template-columns:1fr}.ac-config-head,.ac-run-head{align-items:flex-start;flex-direction:column}.ac-model-card,.ac-run-model{min-width:0}.ac-agent-preview{order:-1}}
      @media(max-width:700px){.ac-config-wrap,.ac-run-wrap{width:calc(100% - 24px)}.ac-topbar{grid-template-columns:1fr auto}.ac-topbar-title{display:none}.ac-config-head,.ac-run-head{padding:34px 0 22px}.ac-config-head h1,.ac-run-head h1{font-size:38px}.ac-field-grid,.ac-template-grid,.ac-agent-mini-grid{grid-template-columns:1fr}.ac-intro-bottom{align-items:stretch;flex-direction:column}.ac-office{min-height:380px}.ac-office-brand strong{font-size:24px}.ac-office-console{width:64%}.ac-run-grid{grid-template-columns:1fr}.ac-output{min-height:420px}}
    `}</style>
  )
}

export default BusinessCommandCenter
