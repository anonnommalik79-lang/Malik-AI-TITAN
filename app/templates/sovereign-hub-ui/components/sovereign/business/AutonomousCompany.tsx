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
 * The agents are real. Each is a business mode that already exists, run through
 * POST /api/business/run - the endpoint this section has always used - in the
 * order a company is actually built, each one handed what the ones before it
 * produced. Nothing here reports success that the API did not return: a step
 * that fails says so, with the error, and the run stops rather than printing a
 * finished company that was never made.
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
import { clientFetchWithTimeout } from "@/lib/api-client"
import { takePrefillPrompt } from "@/lib/malik-context"
import {
  AUTONOMOUS_AGENTS,
  BUSINESS_TEMPLATES,
  TEMPLATE_CATEGORIES,
  STRESS_TEST,
  agentInput,
  stressTestInput,
  templateInstruction,
  type AutonomousAgent,
  type BusinessTemplate,
  type TemplateCategory,
} from "@/lib/business/autonomous"
import { MALIK_MODELS, type MalikModelId } from "@/lib/ai/malik-models"
import styles from "./AutonomousCompany.module.css"

const ENDPOINT = "/api/business/run"

/** The section's own default, named in the reference. */
const DEFAULT_MODEL: MalikModelId = "malik-27b"

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
}

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

  const inline = (value: string, key: string): React.ReactNode =>
    value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => (
      part.startsWith("**") && part.endsWith("**")
        ? <b key={`${key}-${index}`}>{part.slice(2, -2)}</b>
        : <span key={`${key}-${index}`}>{part}</span>
    ))

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
        // The |---|---| separator carries no data; it only tells markdown where
        // the header ends, which we already know from being the first row.
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
  const [modelId, setModelId] = useState<MalikModelId>(DEFAULT_MODEL)
  const [category, setCategory] = useState<TemplateCategory>("Все")
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  // Which template is steering the run, and the instruction it produced.
  //
  // The instruction is state, not something derived at send time, because it is
  // editable: what stands in that box is what the eight agents get. Someone who
  // knows his own market can strike out the line that is wrong for it, and the
  // run will honour that rather than quietly re-adding it.
  const [activeTemplate, setActiveTemplate] = useState<BusinessTemplate | null>(null)
  const [instruction, setInstruction] = useState("")
  const [instructionOpen, setInstructionOpen] = useState(true)
  const [query, setQuery] = useState("")
  // State, not a ref: the header button reads this during render, and a ref
  // would leave "Остановить" on screen after the run had already finished.
  const [running, setRunning] = useState(false)

  // The stress test: its own state, because it is its own call and its own
  // failure. A run that produced eight documents is still a success when the
  // ninth stage cannot be reached.
  const [stress, setStress] = useState("")
  const [stressBusy, setStressBusy] = useState(false)
  const [stressError, setStressError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const model = useMemo(
    () => MALIK_MODELS.find((item) => item.id === modelId) || MALIK_MODELS.find((item) => item.id === DEFAULT_MODEL),
    [modelId],
  )

  const templates = useMemo(() => {
    // "Мои шаблоны" has nothing saved yet; showing the whole catalogue there
    // would be a lie about what it is.
    const byCategory = category === "Мои"
      ? []
      : category === "Все"
        ? BUSINESS_TEMPLATES
        : BUSINESS_TEMPLATES.filter((item) => item.category === category)

    const needle = query.trim().toLowerCase()
    if (!needle) return byCategory
    // Searches the playbook too: someone looking for "отток" or "фудкост" is
    // looking for the business those words belong to.
    return byCategory.filter((item) => [
      item.title, item.description, item.category, item.market || "", ...item.playbook, ...item.metrics,
    ].join(" ").toLowerCase().includes(needle))
  }, [category, query])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  // A click anywhere closes the control menus, the way every menu in this app does.
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

  /**
   * Runs the eight agents, in order, each one on the real endpoint.
   *
   * Sequential on purpose: every agent is given what the ones before it wrote,
   * which is the difference between one company and eight unrelated documents.
   */
  const run = useCallback(async () => {
    const brief = prompt.trim()
    if (!brief || runningRef.current) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    runningRef.current = true
    setRunning(true)

    setRunError(null)
    setStress("")
    setStressError(null)
    setStage("running")
    setSteps(AUTONOMOUS_AGENTS.map((agent) => ({ agent, state: "waiting", content: "" })))
    setExpanded(AUTONOMOUS_AGENTS[0].id)

    // These are the keys BusinessRunContext actually has. Country, budget and
    // requirements have no field of their own, and inventing one would mean the
    // person's answers never reached the prompt at all - they go into `extra`,
    // which buildBusinessPrompt does render.
    const extra = [
      country ? `Страна / рынок: ${country}` : "",
      budget ? `Бюджет на запуск: ${budget}` : "",
      requirements ? `Особые требования: ${requirements}` : "",
    ].filter(Boolean).join("\n")

    const context = {
      language: "ru" as const,
      industry: market || undefined,
      extra: extra || undefined,
    }

    const done: Array<{ agent: AutonomousAgent; content: string }> = []

    for (const agent of AUTONOMOUS_AGENTS) {
      if (controller.signal.aborted) break
      setSteps((current) => current.map((step) => (step.agent.id === agent.id ? { ...step, state: "running" } : step)))
      setExpanded(agent.id)
      const started = Date.now()

      try {
        const response = await clientFetchWithTimeout(
          ENDPOINT,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              mode: agent.mode,
              input: agentInput(agent, brief, done, instruction),
              context,
              language: "ru",
              modelId,
            }),
          },
          120_000,
        )
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || data.publicError || `HTTP ${response.status}`)
        }
        const content = String(data.content || data.text || "").trim()
        if (!content) throw new Error("Пустой ответ от модели")

        done.push({ agent, content })
        setSteps((current) => current.map((step) => (step.agent.id === agent.id
          ? {
            ...step,
            state: "done",
            content,
            provider: typeof data.provider === "string" ? data.provider : undefined,
            model: typeof data.model === "string" ? data.model : (typeof data.engine === "string" ? data.engine : undefined),
            ms: Date.now() - started,
          }
          : step)))
      } catch (error) {
        if (controller.signal.aborted) break
        const message = error instanceof Error ? error.message : "Ошибка запроса"
        setSteps((current) => current.map((step) => (step.agent.id === agent.id
          ? { ...step, state: "failed", error: message, ms: Date.now() - started }
          : step)))
        // The next agent is written against this one's output. Continuing
        // without it produces a company assembled from a hole, so the run
        // stops and says where.
        setRunError(`${agent.name} остановился: ${message}`)
        break
      }
    }

    runningRef.current = false
    setRunning(false)
  }, [budget, country, instruction, market, modelId, prompt, requirements])

  /**
   * Runs the stress test against what the eight agents actually wrote.
   *
   * The prompt cap is per plan - 3000 characters for a guest, 6000 free - and
   * the client has no way to know which applies. So it asks with the generous
   * budget and, if the server says the input is too long, reads the real cap out
   * of the refusal and asks again at that size. The refusal happens in
   * checkPromptLength, before any provider is called, so the retry costs a round
   * trip and not a model call.
   */
  const runStressTest = useCallback(async () => {
    const done = steps
      .filter((step) => step.state === "done" && step.content)
      .map((step) => ({ agent: step.agent, content: step.content }))
    if (!done.length || stressBusy) return

    setStressBusy(true)
    setStressError(null)
    setStress("")

    const ask = async (budget: number) => {
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: STRESS_TEST.mode,
            input: stressTestInput(prompt.trim(), done, budget),
            context: { language: "ru" as const, industry: market || undefined },
            language: "ru",
            modelId,
          }),
        },
        120_000,
      )
      return { response, data: await response.json().catch(() => ({})) }
    }

    try {
      let { response, data } = await ask(11_000)

      if (data?.code === "PROMPT_TOO_LONG") {
        const cap = Number(String(data.error || "").match(/\/(\d+)\s*chars/)?.[1])
        if (!Number.isFinite(cap)) throw new Error(data.error || "Запрос слишком длинный")
        ;({ response, data } = await ask(Math.max(900, cap - 400)))
      }

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || data.publicError || `HTTP ${response.status}`)
      }
      const content = String(data.content || data.text || "").trim()
      if (!content) throw new Error("Пустой ответ от модели")
      setStress(content)
    } catch (error) {
      setStressError(error instanceof Error ? error.message : "Не удалось выполнить проверку")
    } finally {
      setStressBusy(false)
    }
  }, [market, modelId, prompt, steps, stressBusy])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    setRunning(false)
    setSteps((current) => current.map((step) => (step.state === "running"
      ? { ...step, state: "failed", error: "Остановлено" }
      : step)))
  }, [])

  const restart = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    setRunning(false)
    setSteps([])
    setRunError(null)
    setStress("")
    setStressError(null)
    setStage("workspace")
    onNewChat?.()
  }, [onNewChat])

  const completed = steps.filter((step) => step.state === "done").length
  const activeAgentId = steps.find((step) => step.state === "running")?.agent.id

  /* ------------------------------------------------------------ INTRO */

  if (stage === "intro") {
    return (
      <main className={styles.root} data-view="business-autonomous" data-stage="intro">
        <div className={styles.intro}>
          <div className={styles.introArt}>
            {/* Local, not a remote URL: an empty grey column on the first screen
                of a product page is the worst possible first impression, and a
                third-party host is one outage away from it. */}
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

  /* ------------------------------------------------- WORKSPACE / RUNNING */

  return (
    <main className={styles.root} data-view="business-autonomous" data-stage={stage}>
      <div className={styles.workspace}>
        {/* Deliberately a div, not a header: the dashboard shell styles
            `.malik-dashboard-shell header *` and hides `header > div:nth-of-type(2)`
            for its own top bar, which swallowed this hero's icon and meta line. */}
        <div className={styles.hero}>
          <div className={styles.kicker}><span className={styles.dot} /> Autonomous Business OS</div>
          <div className={styles.briefcase}><Briefcase strokeWidth={1.7} /></div>
          <h1 className={styles.heroTitle}>MALIK AUTONOMOUS COMPANY</h1>
          <p className={styles.heroLead}>Одна идея → исследование → продукт → клиенты → продажи.</p>
          <div className={styles.heroMeta}>
            <span>{model?.label}</span><i /><span>8 AI-агентов</span><i /><span>API orchestration</span>
          </div>
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

              {/* There is no attach button and no microphone here on purpose:
                  /api/business/run takes text, and a control that looks like it
                  works but does nothing is worse than one that is absent. */}
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
                    onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
                    aria-haspopup="listbox"
                    aria-expanded={openMenu === "model"}
                  >
                    <span className={styles.modelMark}><MalikMark /></span>
                    <span className={styles.modelText}>
                      <span className={styles.modelName}>{model?.label}</span>
                      <span className={styles.modelMini}>{model?.providerModel}</span>
                    </span>
                    <ChevronDown className={styles.chevron} strokeWidth={2} />
                  </button>
                  {openMenu === "model" && (
                    <div className={styles.menu} role="listbox">
                      {MALIK_MODELS.filter((item) => item.tier === "free").map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={item.id === modelId}
                          onClick={() => { setModelId(item.id); setOpenMenu(null) }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <ControlMenu
                  id="market" label="Рынок" value={market} icon={Globe}
                  options={MARKETS} open={openMenu === "market"}
                  onToggle={() => setOpenMenu(openMenu === "market" ? null : "market")}
                  onPick={(value) => { setMarket(value); setOpenMenu(null) }}
                />
                <ControlMenu
                  id="country" label="Страна" value={country} icon={MapPin}
                  options={COUNTRIES} open={openMenu === "country"}
                  onToggle={() => setOpenMenu(openMenu === "country" ? null : "country")}
                  onPick={(value) => { setCountry(value); setOpenMenu(null) }}
                />
                <ControlMenu
                  id="budget" label="Бюджет" value={budget} icon={DollarSign}
                  options={BUDGETS} open={openMenu === "budget"}
                  onToggle={() => setOpenMenu(openMenu === "budget" ? null : "budget")}
                  onPick={(value) => { setBudget(value); setOpenMenu(null) }}
                />
                <ControlMenu
                  id="req" label="Особые требования" value={requirements} icon={SlidersHorizontal}
                  freeform open={openMenu === "req"}
                  onToggle={() => setOpenMenu(openMenu === "req" ? null : "req")}
                  onPick={(value) => { setRequirements(value); setOpenMenu(null) }}
                />

                <span className={styles.spacer} />
                <button
                  type="button"
                  className={styles.send}
                  onClick={() => void run()}
                  disabled={!prompt.trim()}
                  aria-label="Запустить Autonomous Company"
                >
                  <ArrowUp strokeWidth={2} />
                </button>
              </div>
            </section>

            <section className={styles.strip} aria-label="Autonomous agent pipeline">
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
            </section>

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
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.category} ${category === item.id ? styles.categoryActive : ""}`}
                    onClick={() => setCategory(item.id)}
                    aria-pressed={category === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <label className={styles.search}>
                <Search strokeWidth={1.8} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Найти шаблон"
                  aria-label="Поиск по шаблонам"
                />
              </label>
            </div>

            <section className={styles.grid}>
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`${styles.templateCard} ${activeTemplate?.id === template.id ? styles.templateCardActive : ""}`}
                  onClick={() => applyTemplate(template)}
                  aria-pressed={activeTemplate?.id === template.id}
                >
                  <Image src={template.image} alt={template.title} width={320} height={200} sizes="(max-width: 900px) 50vw, 16vw" />
                  <span className={styles.templateBody}>
                    <span className={styles.templateTitle}>{template.title}</span>
                    <span className={styles.templateDesc}>{template.description}</span>
                    <span className={styles.templateArrow}>→</span>
                  </span>
                </button>
              ))}
              {category === "Мои" && !templates.length && (
                <p className={styles.emptyNote}>
                  Здесь появятся шаблоны, которые ты сохранишь сам. Пока их нет — начни со «Своего шаблона» справа.
                </p>
              )}
              {category !== "Мои" && query.trim() && !templates.length && (
                <p className={styles.emptyNote}>По запросу «{query.trim()}» ничего не нашлось.</p>
              )}
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

            <section className={styles.strip} aria-label="Autonomous agent pipeline">
              <div className={styles.stripLabel}>
                <span className={styles.dot} />
                <span><b>{model?.label}</b><small>API orchestration</small></span>
              </div>
              <div className={styles.flow}>
                {steps.map((step, index) => (
                  <span key={step.agent.id} style={{ display: "contents" }}>
                    <span className={`${styles.chip} ${
                      step.state === "running" ? styles.chipActive
                        : step.state === "done" ? styles.chipDone
                          : step.state === "failed" ? styles.chipFailed : ""
                    }`}>
                      <b>{step.agent.name}</b><small>{step.agent.role}</small>
                    </span>
                    {index < steps.length - 1 && <em>→</em>}
                  </span>
                ))}
              </div>
            </section>

            {runError && (
              <div className={styles.runHead}>
                <div className={styles.runBrief}>
                  <b style={{ color: "#f2b4b4" }}><TriangleAlert size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{runError}</b>
                  <span>Запуск остановлен. Следующие агенты работают на результатах предыдущих.</span>
                </div>
                <button type="button" className={styles.ghost} onClick={() => void run()}>Повторить</button>
              </div>
            )}

            <div className={styles.steps}>
              {steps.map((step, index) => {
                const open = expanded === step.agent.id
                return (
                  <article key={step.agent.id} className={styles.step}>
                    <button
                      type="button"
                      className={styles.stepHead}
                      onClick={() => setExpanded(open ? null : step.agent.id)}
                      aria-expanded={open}
                    >
                      <span className={`${styles.stepBadge} ${
                        step.state === "running" ? styles.stepBadgeActive
                          : step.state === "done" ? styles.stepBadgeDone
                            : step.state === "failed" ? styles.stepBadgeFailed : ""
                      }`}>
                        {step.state === "running" ? <Loader2 size={14} className={styles.spin} />
                          : step.state === "done" ? <Check size={14} />
                            : step.state === "failed" ? <TriangleAlert size={14} />
                              : index + 1}
                      </span>
                      <span>
                        <span className={styles.stepName}>{step.agent.name}</span>
                        <span className={styles.stepRole}>{step.agent.role} · {step.agent.mode}</span>
                      </span>
                      <span className={styles.stepState}>
                        {step.state === "waiting" && "в очереди"}
                        {step.state === "running" && "работает…"}
                        {step.state === "done" && `готово${step.ms ? ` · ${(step.ms / 1000).toFixed(1)}с` : ""}`}
                        {step.state === "failed" && "ошибка"}
                      </span>
                    </button>

                    {open && (step.content || step.error) && (
                      <div className={`${styles.stepBody} ${step.error ? styles.stepError : ""}`}>
                        {step.error ? step.error : <Rich text={step.content} />}
                        {step.state === "done" && (step.provider || step.model) && (
                          <div className={styles.stepMeta}>
                            {[step.provider, step.model].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            {/* The stress test lives at the bottom of the run, because it has
                nothing to read until the agents have written something. */}
            {completed > 0 && !running && (
              <section className={styles.stress}>
                <div className={styles.stressHead}>
                  <span className={styles.stressIcon}><ShieldAlert strokeWidth={1.8} /></span>
                  <div>
                    <b>{STRESS_TEST.title}</b>
                    <small>{STRESS_TEST.subtitle}</small>
                  </div>
                  <button type="button" className={styles.stressRun} onClick={() => void runStressTest()} disabled={stressBusy}>
                    {stressBusy
                      ? <><Loader2 size={14} className={styles.spin} /> Разбираю план…</>
                      : stress ? "Проверить заново" : "Проверить план"}
                  </button>
                </div>

                {!stress && !stressError && !stressBusy && (
                  <p className={styles.stressLead}>
                    План разберут на допущения: что должно оказаться правдой, какая цифра это решает,
                    как проверить её за неделю и при каком результате план не работает.
                    {completed < AUTONOMOUS_AGENTS.length && ` Сейчас готово ${completed} из ${AUTONOMOUS_AGENTS.length} — проверка пройдёт по тому, что есть.`}
                  </p>
                )}

                {stressError && (
                  <p className={`${styles.stressLead} ${styles.stressFailed}`}>
                    <TriangleAlert size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    {stressError}
                  </p>
                )}

                {stress && <div className={styles.stressBody}><Rich text={stress} /></div>}
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
