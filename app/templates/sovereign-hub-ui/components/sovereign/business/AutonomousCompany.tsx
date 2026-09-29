"use client"

/**
 * Бизнес под ключ — Autonomous Company.
 *
 * Three states in one component, because they are one screen at three moments
 * and a route change between them would lose the brief the person just typed:
 *
 *   intro      the product screen - photograph, what it does, one white button
 *   workspace  the brief: composer, the eight agents, the templates
 *   running    the pipeline, live, with what each agent actually returned
 *
 * The agents are real. Each is a business mode that already exists, answered
 * by Google Gemini through POST /api/business/agent, in the order a company is
 * actually built, each one handed everything the ones before it produced. The
 * answer streams: the card shows Gemini thinking, then the document being
 * written. Nothing here reports success that the API did not return: a step
 * that fails says why in words, and "Продолжить" resumes from that step
 * instead of throwing away the agents that already finished.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import {
  ArrowRight,
  ArrowUp,
  Briefcase,
  Check,
  ChevronDown,
  DollarSign,
  FileText,
  Globe,
  Loader2,
  MapPin,
  PenSquare,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react"
import { AgentStreamError, streamAgent, type AgentSource } from "@/lib/business/agent-client"
import { takePrefillPrompt } from "@/lib/malik-context"
import {
  AUTONOMOUS_AGENTS,
  BUSINESS_TEMPLATES,
  TEMPLATE_CATEGORIES,
  STRESS_TEST,
  SUMMARY_STAGE,
  templateInstruction,
  type AutonomousAgent,
  type BusinessTemplate,
  type TemplateCategory,
} from "@/lib/business/autonomous"
import { CompanyLaunchPad } from "./CompanyLaunchPad"
import styles from "./AutonomousCompany.module.css"

/** "auto" lets the server pick the newest Gemini the key can see. */
const AUTO_MODEL = "auto"

type GeminiStatus = { ok: boolean; configured: boolean; label?: string; models?: string[]; summary?: string }

/** "gemini-3.8-flash" → "Gemini 3.8 Flash", the way Google writes it. */
function geminiName(id: string) {
  if (id === "gemini-flash-latest") return "Gemini Flash (latest)"
  if (id === "gemini-flash-lite-latest") return "Gemini Flash-Lite (latest)"
  return id.split("-").map((part) => (
    part === "gemini" ? "Gemini" : part === "flash" ? "Flash" : part === "pro" ? "Pro" : part === "lite" ? "Lite" : part === "preview" ? "Preview" : part
  )).join(" ").replace("Flash Lite", "Flash-Lite")
}

/** The part of an agent's answer written for the next agent, not for people. */
function splitState(text: string) {
  const index = text.search(/(?:^|\n)#{1,4}\s*(?:company state|состояние компании)/i)
  if (index < 0) return { body: text, state: "" }
  return { body: text.slice(0, index).trim(), state: text.slice(index).replace(/^\s*#{1,4}[^\n]*\n?/, "").trim() }
}

/** Gemini's thought summaries open with a bold title; that title is the status line. */
function thoughtTitle(text: string) {
  const bold = text.match(/\*\*([^*]{3,90})\*\*/)
  const line = (bold?.[1] || text.split("\n").find((item) => item.trim()) || "").trim()
  return line.replace(/^#+\s*/, "").slice(0, 90)
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve() }, { once: true })
  })
}

const formatTokens = (value?: number) => (value ? `${value.toLocaleString("ru-RU")} токенов` : "")

type Stage = "intro" | "workspace" | "running"
type StepState = "waiting" | "running" | "done" | "failed"

type Step = {
  agent: AutonomousAgent
  state: StepState
  content: string
  error?: string
  provider?: string
  model?: string
  ms?: number
  /** Gemini's latest thought summaries while it is thinking. */
  thoughts?: string[]
  sources?: AgentSource[]
  tokens?: number
  /** Waiting out a Gemini rate limit (or a brief overload) until this time. */
  waitUntil?: number
  waitReason?: "quota" | "busy"
}

type Stage2 = { state: "idle" | "running" | "done" | "failed"; content: string; model?: string; ms?: number; error?: string; thoughts?: string[] }

const CAPABILITIES: Array<{ icon: typeof Search; title: string; desc: string }> = [
  { icon: Search, title: "Исследует рынок", desc: "Спрос, конкуренты и возможности." },
  { icon: FileText, title: "Создаёт продукт и сайт", desc: "Бренд, структура и готовый запуск." },
  { icon: PenSquare, title: "Генерирует контент", desc: "Креативы, тексты и продвижение." },
  { icon: Users, title: "Находит клиентов", desc: "Привлекает нужную аудиторию." },
  { icon: SlidersHorizontal, title: "Ведёт лиды и продажи", desc: "Заявки, CRM и рост выручки." },
]

const MARKETS = ["Общепит", "E-commerce", "B2B услуги", "SaaS", "Образование", "Недвижимость", "Логистика", "Фитнес и здоровье", "Туризм"]
const COUNTRIES = ["Казахстан", "Узбекистан", "Кыргызстан", "Россия", "ОАЭ", "Глобально"]
const BUDGETS = ["до 500 тыс ₸", "до 2 млн ₸", "до 5 млн ₸", "до 10 млн ₸", "до 40 млн ₸", "от 100 млн ₸"]

function MalikMark() {
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label="Malik AI">
      <rect width="512" height="512" rx="104" fill="#f7f7f7" />
      <path d="M100 324 233 137v187H100Z" fill="#050505" />
      <path d="M263 137h128L263 327V137Z" fill="#050505" />
    </svg>
  )
}

/**
 * Renders the markdown the business modes actually emit, and nothing else.
 *
 * The app has a full renderer in NoBlueUiGuard, but it builds DOM imperatively
 * and is bound to the chat's assistant cards; reaching into it from here would
 * be fragile in both directions. The output formats in output-templates.ts are
 * a closed set - headings, tables, bullets, checkboxes, numbered lines - so
 * this parses that set and leaves anything else as a paragraph. Raw "## Приговор"
 * and "|---|---|" on screen is the difference between a finished product and a
 * debug view, and this block is the one someone is shown first.
 */
function Rich({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const blocks: React.ReactNode[] = []
  let i = 0

  // Bold, `code` and [links](https://…). Links are rendered only for http(s)
  // targets, so a model cannot slip a javascript: URL into the page.
  const inline = (value: string, key: string): React.ReactNode =>
    value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]{1,200}\]\(https?:\/\/[^\s)]{1,500}\))/g).filter(Boolean).map((part, index) => {
      const id = `${key}-${index}`
      if (part.startsWith("**") && part.endsWith("**")) return <b key={id}>{part.slice(2, -2)}</b>
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={id} className={styles.richCode}>{part.slice(1, -1)}</code>
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (link) return <a key={id} href={link[2]} target="_blank" rel="noreferrer noopener" className={styles.richLink}>{link[1]}</a>
      return <span key={id}>{part}</span>
    })

  while (i < lines.length) {
    const line = lines[i].trim()

    if (!line) { i += 1; continue }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push(<h4 key={i} className={styles.richHeading}>{heading[2]}</h4>)
      i += 1
      continue
    }

    if (line.startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i += 1
      }
      if (rows.length) {
        const [head, ...body] = rows
        blocks.push(
          <div key={`t${i}`} className={styles.richTableWrap}>
            <table className={styles.richTable}>
              <thead><tr>{head.map((c, n) => <th key={n}>{inline(c, `h${i}-${n}`)}</th>)}</tr></thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r}>{head.map((_, n) => <td key={n}>{inline(row[n] || "", `c${i}-${r}-${n}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
      }
      continue
    }

    if (/^[-*•]\s*\[[ xX]\]/.test(line) || /^[-*•]\s+/.test(line)) {
      const items: Array<{ text: string; checked: boolean | null }> = []
      while (i < lines.length) {
        const item = lines[i].trim()
        const box = item.match(/^[-*•]\s*\[([ xX])\]\s*(.*)$/)
        const bullet = item.match(/^[-*•]\s+(.+)$/)
        if (box) items.push({ text: box[2], checked: box[1].toLowerCase() === "x" })
        else if (bullet) items.push({ text: bullet[1], checked: null })
        else break
        i += 1
      }
      blocks.push(
        <ul key={`l${i}`} className={styles.richList}>
          {items.map((item, n) => (
            <li key={n} className={item.checked === null ? "" : styles.richTask}>
              {item.checked !== null && <span className={styles.richBox} aria-hidden>{item.checked ? "✓" : ""}</span>}
              {inline(item.text, `li${i}-${n}`)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/)
    if (numbered) {
      blocks.push(
        <p key={i} className={styles.richNumbered}>
          <span>{numbered[1]}.</span>{inline(numbered[2], `n${i}`)}
        </p>,
      )
      i += 1
      continue
    }

    blocks.push(<p key={i} className={styles.richParagraph}>{inline(line, `p${i}`)}</p>)
    i += 1
  }

  return <>{blocks}</>
}

export type AutonomousCompanyProps = {
  username?: string
  onViewChange?: (view: string) => void
  onNewChat?: () => void
}

export function AutonomousCompany({ username, onNewChat }: AutonomousCompanyProps) {
  const [stage, setStage] = useState<Stage>("intro")
  const [prompt, setPrompt] = useState(() => takePrefillPrompt())
  const [market, setMarket] = useState("")
  const [country, setCountry] = useState("")
  const [budget, setBudget] = useState("")
  const [requirements, setRequirements] = useState("")
  const [modelId, setModelId] = useState<string>(AUTO_MODEL)
  const [gemini, setGemini] = useState<GeminiStatus | null>(null)
  const [summary, setSummary] = useState<Stage2>({ state: "idle", content: "" })
  const [category, setCategory] = useState<TemplateCategory>("Все")
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [activeTemplate, setActiveTemplate] = useState<BusinessTemplate | null>(null)
  const [instruction, setInstruction] = useState("")
  const [instructionOpen, setInstructionOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [running, setRunning] = useState(false)
  const [stress, setStress] = useState("")
  const [stressBusy, setStressBusy] = useState(false)
  const [stressError, setStressError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const stepsRef = useRef<Step[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { stepsRef.current = steps }, [steps])

  // Which Gemini this server can actually reach, asked once. It costs nothing:
  // the server only lists the models each key can see.
  useEffect(() => {
    let alive = true
    fetch("/api/business/gemini-check", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: GeminiStatus) => { if (alive) setGemini(data) })
      .catch(() => { if (alive) setGemini({ ok: false, configured: false, summary: "Не удалось проверить Gemini." }) })
    return () => { alive = false }
  }, [])

  const modelLabel = modelId === AUTO_MODEL
    ? gemini?.label ? `${gemini.label}` : "Gemini"
    : geminiName(modelId)
  const modelOptions = useMemo(() => [...new Set([...(gemini?.models || []), "gemini-flash-latest"])], [gemini?.models])

  // A second hand for the rate-limit countdown, only while something waits.
  const waiting = steps.some((step) => step.waitUntil && step.waitUntil > now)
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [waiting])

  const templates = useMemo(() => {
    const byCategory = category === "Мои"
      ? []
      : category === "Все"
        ? BUSINESS_TEMPLATES
        : BUSINESS_TEMPLATES.filter((item) => item.category === category)

    const needle = query.trim().toLowerCase()
    if (!needle) return byCategory
    return byCategory.filter((item) => [
      item.title, item.description, item.category, item.market || "", ...item.playbook, ...item.metrics,
    ].join(" ").toLowerCase().includes(needle))
  }, [category, query])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [openMenu])

  const openWorkspace = useCallback(() => {
    setStage("workspace")
    window.setTimeout(() => textareaRef.current?.focus(), 60)
  }, [])

  const applyTemplate = useCallback((template: BusinessTemplate) => {
    setActiveTemplate(template)
    setInstruction(templateInstruction(template))
    setInstructionOpen(true)
    setPrompt(template.prompt)
    if (template.market) setMarket(template.market)
    if (template.country) setCountry(template.country)
    if (template.budget) setBudget(template.budget)
    if (template.requirements) setRequirements(template.requirements)
    textareaRef.current?.focus()
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  const startCustom = useCallback(() => {
    setActiveTemplate(null)
    setInstruction("")
    setPrompt("")
    setMarket("")
    setCountry("")
    setBudget("")
    setRequirements("")
    textareaRef.current?.focus()
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  const patchStep = useCallback((id: string, patch: Partial<Step> | ((step: Step) => Partial<Step>)) => {
    setSteps((current) => current.map((step) => (step.agent.id === id
      ? { ...step, ...(typeof patch === "function" ? patch(step) : patch) }
      : step)))
  }, [])

  const companyBody = useCallback(() => ({
    brief: prompt.trim(),
    instruction: instruction.trim() || undefined,
    market: market || undefined,
    country: country || undefined,
    budget: budget || undefined,
    requirements: requirements || undefined,
    model: modelId,
  }), [budget, country, instruction, market, modelId, prompt, requirements])

  /**
   * The eight agents, then the one-page summary.
   *
   * `resume` keeps every agent that already finished and starts at the first
   * one that did not - a failure at Sales no longer costs the CEO, Research
   * and everything else a second run.
   */
  const run = useCallback(async (resume = false) => {
    const brief = prompt.trim()
    if (!brief || runningRef.current) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    runningRef.current = true
    setRunning(true)

    setRunError(null)
    setStage("running")
    const kept = resume ? stepsRef.current : []
    const initial: Step[] = AUTONOMOUS_AGENTS.map((agent) => {
      const previous = kept.find((step) => step.agent.id === agent.id)
      return previous && previous.state === "done" ? previous : { agent, state: "waiting", content: "" }
    })
    setSteps(initial)
    stepsRef.current = initial
    if (!resume) {
      setStress("")
      setStressError(null)
    }
    setSummary({ state: "idle", content: "" })

    const body = companyBody()
    const done: Array<{ agentId: string; content: string }> = initial
      .filter((step) => step.state === "done")
      .map((step) => ({ agentId: step.agent.id, content: step.content }))

    let failed = false
    for (const agent of AUTONOMOUS_AGENTS) {
      if (controller.signal.aborted) break
      if (done.some((item) => item.agentId === agent.id)) continue
      setExpanded(agent.id)

      let retries = 0
      while (!controller.signal.aborted) {
        const started = Date.now()
        patchStep(agent.id, { state: "running", content: "", error: undefined, thoughts: [], sources: undefined, waitUntil: undefined, waitReason: undefined, model: undefined })
        try {
          const result = await streamAgent({ ...body, kind: "agent", agentId: agent.id, previous: done }, {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === "model") patchStep(agent.id, { model: event.label })
              else if (event.type === "thought") patchStep(agent.id, (step) => ({ thoughts: [...(step.thoughts || []), thoughtTitle(event.text)].filter(Boolean).slice(-4) }))
              else if (event.type === "delta") patchStep(agent.id, (step) => ({ content: step.content + event.text }))
              else if (event.type === "reset") patchStep(agent.id, { content: "" })
              else if (event.type === "sources") patchStep(agent.id, { sources: event.items })
            },
          })
          done.push({ agentId: agent.id, content: result.content })
          patchStep(agent.id, {
            state: "done",
            content: result.content,
            provider: "Google Gemini",
            model: result.label,
            ms: result.ms || Date.now() - started,
            sources: result.sources?.length ? result.sources : undefined,
            tokens: result.usage?.totalTokens,
            thoughts: undefined,
          })
          break
        } catch (error) {
          if (controller.signal.aborted) break
          const failure = error instanceof AgentStreamError ? error : new AgentStreamError("ERROR", "Ошибка запроса")
          // A per-minute limit or a brief overload clears by itself: wait it
          // out on screen, a few times at most, instead of stopping a company
          // halfway. Keys, safety and daily limits are not waited on.
          const quota = failure.code === "QUOTA" || failure.code === "RATE_LIMIT_REACHED"
          const busy = ["UNAVAILABLE", "TIMEOUT", "NETWORK", "INCOMPLETE", "EMPTY"].includes(failure.code)
          if ((quota && retries < 3) || (busy && retries < 2)) {
            retries += 1
            const wait = quota
              ? Math.min(Math.max(failure.retryAfterMs || 20_000, 5_000), 65_000)
              : Math.min(Math.max(failure.retryAfterMs || 8_000, 5_000), 20_000) * retries
            setNow(Date.now())
            patchStep(agent.id, { state: "running", content: "", waitUntil: Date.now() + wait, waitReason: quota ? "quota" : "busy" })
            await sleep(wait, controller.signal)
            continue
          }
          patchStep(agent.id, { state: "failed", error: failure.message, waitUntil: undefined, ms: Date.now() - started })
          setRunError(`${agent.name}: ${failure.message}`)
          failed = true
          break
        }
      }
      if (failed || controller.signal.aborted) break
    }

    // All eight finished: the page a founder reads first.
    if (!failed && !controller.signal.aborted && done.length === AUTONOMOUS_AGENTS.length) {
      const started = Date.now()
      setSummary({ state: "running", content: "", thoughts: [] })
      try {
        const result = await streamAgent({ ...body, kind: "summary", previous: done }, {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "delta") setSummary((current) => ({ ...current, content: current.content + event.text }))
            else if (event.type === "reset") setSummary((current) => ({ ...current, content: "" }))
            else if (event.type === "model") setSummary((current) => ({ ...current, model: event.label }))
            else if (event.type === "thought") setSummary((current) => ({ ...current, thoughts: [...(current.thoughts || []), thoughtTitle(event.text)].filter(Boolean).slice(-3) }))
          },
        })
        setSummary({ state: "done", content: result.content, model: result.label, ms: result.ms || Date.now() - started })
      } catch (error) {
        if (!controller.signal.aborted) {
          setSummary({ state: "failed", content: "", error: error instanceof Error ? error.message : "Итог не собрался" })
        }
      }
    }

    runningRef.current = false
    setRunning(false)
  }, [companyBody, patchStep, prompt])

  const runStressTest = useCallback(async () => {
    const done = steps
      .filter((step) => step.state === "done" && step.content)
      .map((step) => ({ agentId: step.agent.id, content: step.content }))
    if (!done.length || stressBusy) return

    setStressBusy(true)
    setStressError(null)
    setStress("")

    try {
      const result = await streamAgent({ ...companyBody(), kind: "stress", previous: done }, {
        onEvent: (event) => {
          if (event.type === "delta") setStress((current) => current + event.text)
          else if (event.type === "reset") setStress("")
        },
      })
      setStress(result.content)
    } catch (error) {
      setStressError(error instanceof Error ? error.message : "Не удалось выполнить проверку")
    } finally {
      setStressBusy(false)
    }
  }, [companyBody, steps, stressBusy])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    setRunning(false)
    setSteps((current) => current.map((step) => (step.state === "running"
      ? { ...step, state: "failed", error: "Остановлено. «Продолжить» начнёт этого агента заново.", waitUntil: undefined }
      : step)))
    setSummary((current) => (current.state === "running" ? { state: "idle", content: "" } : current))
    setRunError("Запуск остановлен.")
  }, [])

  const restart = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    setRunning(false)
    setSteps([])
    setRunError(null)
    setStress("")
    setStressError(null)
    setSummary({ state: "idle", content: "" })
    setStage("workspace")
    onNewChat?.()
  }, [onNewChat])

  const completed = steps.filter((step) => step.state === "done").length

  if (stage === "intro") {
    return (
      <main className={styles.root} data-view="business-autonomous" data-stage="intro">
        <div className={styles.intro}>
          <div className={styles.introArt}>
            <Image
              src="/business/hero.webp"
              alt="Предприниматель за работой в офисе Malik AI"
              width={775}
              height={874}
              priority
              sizes="(max-width: 900px) 100vw, 56vw"
            />
          </div>

          <div className={styles.introPanel}>
            <span className={styles.eyebrow}>Malik AI</span>
            <h1 className={styles.introTitle}>Autonomous Company</h1>
            <p className={styles.introLead}>Превращает одну идею в работающий бизнес.</p>

            <div className={styles.cards}>
              {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
                <button key={title} type="button" className={styles.card} onClick={openWorkspace}>
                  <span className={styles.cardIcon}><Icon strokeWidth={1.7} /></span>
                  <span>
                    <span className={styles.cardTitle}>{title}</span>
                    <span className={styles.cardDesc}>{desc}</span>
                  </span>
                  <span className={styles.cardArrow}><ArrowRight strokeWidth={1.8} /></span>
                </button>
              ))}
            </div>

            <div className={styles.introFooter}>
              <button type="button" className={styles.launch} onClick={openWorkspace}>
                <Play fill="currentColor" strokeWidth={0} />
                Запустить Autonomous Company
              </button>
              <span className={styles.launchNote}>От идеи до выручки.<br />С ИИ.</span>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.root} data-view="business-autonomous" data-stage={stage}>
      <div className={styles.workspace}>
        <div className={styles.hero}>
          <div className={styles.kicker}><span className={styles.dot} /> Autonomous Business OS</div>
          <div className={styles.briefcase}><Briefcase strokeWidth={1.7} /></div>
          <h1 className={styles.heroTitle}>MALIK AUTONOMOUS COMPANY</h1>
          <p className={styles.heroLead}>Одна идея → исследование → продукт → клиенты → продажи.</p>

          <div className={styles.heroMeta}>
            <span>{modelLabel}</span><i /><span>8 AI-агентов</span><i /><span>Google Gemini</span>
          </div>
          {gemini && (
            <div className={`${styles.engine} ${gemini.ok ? styles.engineOk : styles.engineOff}`} title={gemini.summary}>
              <span className={styles.engineDot} />
              {gemini.ok ? "Gemini подключён" : gemini.configured ? "Gemini: ключи не отвечают" : "Gemini не подключён"}
            </div>
          )}
        </div>

        {stage === "workspace" && (
          <>
            <section className={styles.promptPanel}>
              <div className={styles.promptTop}>
                <span className={styles.spark}><Sparkles strokeWidth={1.7} /></span>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() }
                  }}
                  placeholder="Опиши, какой бизнес ты хочешь создать..."
                  rows={2}
                  aria-label="Описание бизнеса"
                />
              </div>

              {instruction && (
                <div className={styles.instruction}>
                  <div className={styles.instructionHead}>
                    <Check strokeWidth={2.4} />
                    <span>
                      <b>Инструкция{activeTemplate ? ` · ${activeTemplate.title}` : ""}</b>
                      <small>Уходит каждому из восьми агентов. Правь свободно — отправится ровно то, что здесь написано.</small>
                    </span>
                    <button
                      type="button"
                      className={styles.instructionToggle}
                      onClick={() => setInstructionOpen((open) => !open)}
                      aria-expanded={instructionOpen}
                    >
                      {instructionOpen ? "Свернуть" : "Показать"}
                    </button>
                    <button
                      type="button"
                      className={styles.instructionToggle}
                      onClick={() => { setInstruction(""); setActiveTemplate(null) }}
                    >
                      Убрать
                    </button>
                  </div>
                  {instructionOpen && (
                    <textarea
                      className={styles.instructionText}
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      spellCheck={false}
                      aria-label="Отраслевая инструкция для восьми агентов"
                      rows={14}
                    />
                  )}
                </div>
              )}

              <div className={styles.promptActions} onPointerDown={(event) => event.stopPropagation()}>
                <div className={styles.menuWrap}>
                  <button
                    type="button"
                    className={styles.modelSelect}
                    data-business-model-icon="gemini"
                    onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
                    aria-haspopup="listbox"
                    aria-expanded={openMenu === "model"}
                  >
                    <span className={styles.modelMark}><MalikMark /></span>
                    <span className={styles.modelText}>
                      <span className={styles.modelName}>{modelLabel}</span>
                      <span className={styles.modelMini}>{modelId === AUTO_MODEL ? "Авто · лучшая доступная" : modelId}</span>
                    </span>
                    <ChevronDown className={styles.chevron} strokeWidth={2} />
                  </button>
                  {openMenu === "model" && (
                    <div className={styles.menu} role="listbox" data-engine="gemini">
                      <button
                        type="button"
                        role="option"
                        aria-selected={modelId === AUTO_MODEL}
                        onClick={() => { setModelId(AUTO_MODEL); setOpenMenu(null) }}
                      >
                        Gemini · Авто
                      </button>
                      {modelOptions.map((id) => (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={id === modelId}
                          onClick={() => { setModelId(id); setOpenMenu(null) }}
                        >
                          {geminiName(id)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <ControlMenu id="market" label="Рынок" value={market} icon={Globe} options={MARKETS} open={openMenu === "market"} onToggle={() => setOpenMenu(openMenu === "market" ? null : "market")} onPick={(value) => { setMarket(value); setOpenMenu(null) }} />
                <ControlMenu id="country" label="Страна" value={country} icon={MapPin} options={COUNTRIES} open={openMenu === "country"} onToggle={() => setOpenMenu(openMenu === "country" ? null : "country")} onPick={(value) => { setCountry(value); setOpenMenu(null) }} />
                <ControlMenu id="budget" label="Бюджет" value={budget} icon={DollarSign} options={BUDGETS} open={openMenu === "budget"} onToggle={() => setOpenMenu(openMenu === "budget" ? null : "budget")} onPick={(value) => { setBudget(value); setOpenMenu(null) }} />
                <ControlMenu id="req" label="Особые требования" value={requirements} icon={SlidersHorizontal} freeform open={openMenu === "req"} onToggle={() => setOpenMenu(openMenu === "req" ? null : "req")} onPick={(value) => { setRequirements(value); setOpenMenu(null) }} />

                <span className={styles.spacer} />
                <button type="button" className={styles.send} onClick={() => void run()} disabled={!prompt.trim()} aria-label="Запустить Autonomous Company">
                  <ArrowUp strokeWidth={2} />
                  <span className={styles.sendLabel}>Запустить</span>
                </button>
              </div>
            </section>

            <div className={styles.strip} role="group" aria-label="Autonomous agent pipeline">
              <div className={styles.stripLabel}>
                <span className={styles.dot} />
                <span><b>8 агентов готовы</b><small>один бизнес-процесс</small></span>
              </div>
              <div className={styles.flow}>
                {AUTONOMOUS_AGENTS.map((agent, index) => (
                  <span key={agent.id} style={{ display: "contents" }}>
                    <span className={styles.chip}><b>{agent.name}</b><small>{agent.role}</small></span>
                    {index < AUTONOMOUS_AGENTS.length - 1 && <em>→</em>}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.sectionHead}>
              <div>
                <span className={styles.sectionEyebrow}>Start from a proven playbook</span>
                <h2>Шаблоны бизнеса</h2>
              </div>
              <div className={styles.sectionStat}><b>{BUSINESS_TEMPLATES.length}</b><span>готовых сценариев</span></div>
            </div>

            <div className={styles.filters}>
              <nav className={styles.categories} aria-label="Категории шаблонов">
                {TEMPLATE_CATEGORIES.map((item) => (
                  <button key={item.id} type="button" className={`${styles.category} ${category === item.id ? styles.categoryActive : ""}`} onClick={() => setCategory(item.id)} aria-pressed={category === item.id}>
                    {item.label}
                  </button>
                ))}
              </nav>
              <label className={styles.search}>
                <Search strokeWidth={1.8} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти шаблон" aria-label="Поиск по шаблонам" />
              </label>
            </div>

            <section className={styles.grid}>
              {templates.map((template) => (
                <button key={template.id} type="button" className={`${styles.templateCard} ${activeTemplate?.id === template.id ? styles.templateCardActive : ""}`} onClick={() => applyTemplate(template)} aria-pressed={activeTemplate?.id === template.id}>
                  <Image src={template.image} alt={template.title} width={320} height={200} sizes="(max-width: 900px) 50vw, 16vw" />
                  <span className={styles.templateBody}>
                    <span className={styles.templateTitle}>{template.title}</span>
                    <span className={styles.templateDesc}>{template.description}</span>
                    <span className={styles.templateArrow}>→</span>
                  </span>
                </button>
              ))}
              {category === "Мои" && !templates.length && <p className={styles.emptyNote}>Здесь появятся шаблоны, которые ты сохранишь сам. Пока их нет — начни со «Своего шаблона» справа.</p>}
              {category !== "Мои" && query.trim() && !templates.length && <p className={styles.emptyNote}>По запросу «{query.trim()}» ничего не нашлось.</p>}
              <button type="button" className={`${styles.templateCard} ${styles.customCard}`} onClick={startCustom}>
                <span className={styles.customPlus}><Plus strokeWidth={1.8} /></span>
                <span>
                  <span className={styles.templateTitle}>Свой шаблон</span>
                  <span className={styles.templateDesc}>Настрой под свои идеи и создай уникальный бизнес.</span>
                </span>
              </button>
            </section>
          </>
        )}

        {stage === "running" && (
          <div className={styles.run}>
            <div className={styles.runHead}>
              <div className={styles.runBrief}>
                <b>{completed} из {AUTONOMOUS_AGENTS.length} агентов завершили работу</b>
                <span>{prompt.trim()}</span>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${(completed / AUTONOMOUS_AGENTS.length) * 100}%` }} />
                </div>
              </div>
              {running
                ? <button type="button" className={styles.ghost} onClick={stop}>Остановить</button>
                : <button type="button" className={styles.ghost} onClick={restart}>Новый запуск</button>}
            </div>

            <div className={styles.strip} role="group" aria-label="Autonomous agent pipeline">
              <div className={styles.stripLabel}>
                <span className={styles.dot} />
                <span><b>{modelLabel}</b><small>Google Gemini</small></span>
              </div>
              <div className={styles.flow}>
                {steps.map((step, index) => (
                  <span key={step.agent.id} style={{ display: "contents" }}>
                    <span className={`${styles.chip} ${step.state === "running" ? styles.chipActive : step.state === "done" ? styles.chipDone : step.state === "failed" ? styles.chipFailed : ""}`}>
                      <b>{step.agent.name}</b><small>{step.agent.role}</small>
                    </span>
                    {index < steps.length - 1 && <em>→</em>}
                  </span>
                ))}
              </div>
            </div>

            {runError && !running && (
              <div className={styles.runHead}>
                <div className={styles.runBrief}>
                  <b className={styles.runErrorText}><TriangleAlert size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{runError}</b>
                  <span>Готовые агенты сохранены. «Продолжить» начнёт с того, кто остановился.</span>
                </div>
                <button type="button" className={styles.ghost} onClick={() => void run(true)}>Продолжить</button>
              </div>
            )}

            {summary.state !== "idle" && (
              <section className={styles.summary} aria-live="polite">
                <div className={styles.summaryHead}>
                  <span className={styles.summaryIcon}>{summary.state === "running" ? <Loader2 size={15} className={styles.spin} /> : <Sparkles size={15} strokeWidth={1.8} />}</span>
                  <div>
                    <b>{SUMMARY_STAGE.title}</b>
                    <small>
                      {summary.state === "running" && (summary.content ? "Gemini пишет итог…" : summary.thoughts?.length ? `Думает: ${summary.thoughts[summary.thoughts.length - 1]}` : "Собирает восемь документов в одну страницу…")}
                      {summary.state === "done" && [summary.model, summary.ms ? `${(summary.ms / 1000).toFixed(1)} с` : ""].filter(Boolean).join(" · ")}
                      {summary.state === "failed" && summary.error}
                    </small>
                  </div>
                </div>
                {summary.content && (
                  <div className={styles.summaryBody}>
                    <Rich text={summary.content} />
                    {summary.state === "running" && <span className={styles.caret} aria-hidden />}
                  </div>
                )}
              </section>
            )}

            <div className={styles.steps}>
              {steps.map((step, index) => {
                const open = expanded === step.agent.id
                return (
                  <article key={step.agent.id} className={styles.step}>
                    <button type="button" className={styles.stepHead} onClick={() => setExpanded(open ? null : step.agent.id)} aria-expanded={open}>
                      <span className={`${styles.stepBadge} ${step.state === "running" ? styles.stepBadgeActive : step.state === "done" ? styles.stepBadgeDone : step.state === "failed" ? styles.stepBadgeFailed : ""}`}>
                        {step.state === "running" ? <Loader2 size={14} className={styles.spin} /> : step.state === "done" ? <Check size={14} /> : step.state === "failed" ? <TriangleAlert size={14} /> : index + 1}
                      </span>
                      <span>
                        <span className={styles.stepName}>{step.agent.name}</span>
                        <span className={styles.stepRole}>{step.agent.role} · {step.agent.mode}</span>
                      </span>
                      <span className={styles.stepState}>
                        {step.state === "waiting" && "в очереди"}
                        {step.state === "running" && (step.waitUntil && step.waitUntil > now
                          ? `${step.waitReason === "busy" ? "повтор" : "лимит Gemini"} · ${Math.ceil((step.waitUntil - now) / 1000)} с`
                          : step.content ? "пишет…" : "думает…")}
                        {step.state === "done" && `готово${step.ms ? ` · ${(step.ms / 1000).toFixed(1)} с` : ""}`}
                        {step.state === "failed" && "ошибка"}
                      </span>
                    </button>

                    {open && step.state === "running" && !step.content && (
                      <div className={styles.stepBody}>
                        <div className={styles.thinking}>
                          <span className={styles.thinkingPulse} aria-hidden />
                          <span>
                            {step.waitUntil && step.waitUntil > now
                              ? step.waitReason === "busy"
                                ? `Gemini перегружен — повторю сам через ${Math.ceil((step.waitUntil - now) / 1000)} с.`
                                : `Gemini просит подождать — продолжу сам через ${Math.ceil((step.waitUntil - now) / 1000)} с.`
                              : step.thoughts?.length
                                ? step.thoughts[step.thoughts.length - 1]
                                : `${step.model || "Gemini"} читает решения предыдущих агентов…`}
                          </span>
                        </div>
                        {!!step.thoughts && step.thoughts.length > 1 && (
                          <ul className={styles.thoughtTrail}>
                            {step.thoughts.slice(0, -1).map((item, n) => <li key={n}>{item}</li>)}
                          </ul>
                        )}
                      </div>
                    )}

                    {open && (step.content || step.error) && (() => {
                      if (step.error) return <div className={`${styles.stepBody} ${styles.stepError}`}>{step.error}</div>
                      const { body, state } = splitState(step.content)
                      return (
                        <div className={styles.stepBody}>
                          <Rich text={body} />
                          {step.state === "running" && <span className={styles.caret} aria-hidden />}
                          {state && step.state === "done" && (
                            <details className={styles.handoff}>
                              <summary>Передано следующему агенту · состояние компании</summary>
                              <Rich text={state} />
                            </details>
                          )}
                          {!!step.sources?.length && (
                            <div className={styles.sources}>
                              <span>Источники Google</span>
                              <ol>
                                {step.sources.map((source) => (
                                  <li key={source.uri}><a href={source.uri} target="_blank" rel="noreferrer noopener">{source.title}</a></li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {step.state === "done" && (
                            <div className={styles.stepMeta}>
                              {[step.model, step.ms ? `${(step.ms / 1000).toFixed(1)} с` : "", formatTokens(step.tokens), step.sources?.length ? `${step.sources.length} источн.` : ""].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </article>
                )
              })}
            </div>

            <CompanyLaunchPad
              steps={steps}
              prompt={prompt}
              market={market}
              country={country}
              budget={budget}
              requirements={requirements}
            />

            {completed > 0 && !running && (
              <section className={styles.stress}>
                <div className={styles.stressHead}>
                  <span className={styles.stressIcon}><ShieldAlert strokeWidth={1.8} /></span>
                  <div>
                    <b>{STRESS_TEST.title}</b>
                    <small>{STRESS_TEST.subtitle}</small>
                  </div>
                  <button type="button" className={styles.stressRun} onClick={() => void runStressTest()} disabled={stressBusy}>
                    {stressBusy ? <><Loader2 size={14} className={styles.spin} /> Разбираю план…</> : stress ? "Проверить заново" : "Проверить план"}
                  </button>
                </div>

                {!stress && !stressError && !stressBusy && (
                  <p className={styles.stressLead}>
                    План разберут на допущения: что должно оказаться правдой, какая цифра это решает,
                    как проверить её за неделю и при каком результате план не работает.
                    {completed < AUTONOMOUS_AGENTS.length && ` Сейчас готово ${completed} из ${AUTONOMOUS_AGENTS.length} — проверка пройдёт по тому, что есть.`}
                  </p>
                )}

                {stressError && <p className={`${styles.stressLead} ${styles.stressFailed}`}><TriangleAlert size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{stressError}</p>}
                {stress && <div className={styles.stressBody}><Rich text={stress} />{stressBusy && <span className={styles.caret} aria-hidden />}</div>}
              </section>
            )}
          </div>
        )}
      </div>
      <span hidden>{username}</span>
    </main>
  )
}

function ControlMenu({
  id, label, value, icon: Icon, options, freeform, open, onToggle, onPick,
}: {
  id: string
  label: string
  value: string
  icon: typeof Globe
  options?: string[]
  freeform?: boolean
  open: boolean
  onToggle: () => void
  onPick: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (open) setDraft(value) }, [open, value])

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={`${styles.control} ${value ? styles.controlSet : ""}`}
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icon strokeWidth={1.7} />
        <span>{value || label}</span>
      </button>
      {open && (
        <div className={styles.menu} id={`menu-${id}`}>
          {freeform ? (
            <input
              autoFocus
              value={draft}
              placeholder="Например: только онлайн, команда 2 человека"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") onPick(draft.trim()) }}
              onBlur={() => onPick(draft.trim())}
              aria-label={label}
            />
          ) : (
            (options || []).map((option) => (
              <button key={option} type="button" onClick={() => onPick(option)}>{option}</button>
            ))
          )}
          {value && <button type="button" onClick={() => onPick("")}>Очистить</button>}
        </div>
      )}
    </div>
  )
}

export default AutonomousCompany
