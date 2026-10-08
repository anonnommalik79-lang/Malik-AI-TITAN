"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Code2, Download, ExternalLink, Globe2, Loader2, PackageOpen, RefreshCw, Rocket } from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { downloadProjectZip } from "@/lib/business/project-zip"
import { assessBusinessLaunch } from "@/lib/business/launch-readiness"
import styles from "./CompanyLaunchPad.module.css"

type LaunchStep = {
  agent: { id: string; name: string; role: string }
  state: string
  content: string
}

type ProjectFile = { path: string; content: string }
type ProjectQa = { passed?: boolean; checks?: string[]; issues?: string[]; warnings?: string[]; syntaxChecked?: boolean; buildVerified?: boolean; reviewer?: string; rounds?: number }

export type CompanyLaunchPadProps = {
  steps: LaunchStep[]
  accountId?: string
  canDeploy?: boolean
  prompt: string
  market?: string
  country?: string
  budget?: string
  requirements?: string
}

type BuildMeta = { provider?: string; model?: string; latencyMs?: number }

function hashKey(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9а-яёқғүұөһіә-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "malik-company"
}

function companyTitle(prompt: string) {
  const first = prompt.split(/[.!?\n]/)[0]?.trim() || "Malik Company"
  return first.length > 54 ? `${first.slice(0, 51)}…` : first
}

function compactStep(step: LaunchStep) {
  const text = step.content.trim()
  if (text.length <= 2200) return text
  return `${text.slice(0, 1100)}\n\n[…]\n\n${text.slice(-1100)}`
}

function buildWebsiteBrief(props: CompanyLaunchPadProps) {
  const constraints = [
    props.market ? `Рынок: ${props.market}` : "",
    props.country ? `Страна: ${props.country}` : "",
    props.budget ? `Бюджет: ${props.budget}` : "",
    props.requirements ? `Требования: ${props.requirements}` : "",
  ].filter(Boolean).join("\n")
  const blueprint = props.steps
    .filter((step) => step.state === "done" && step.content.trim())
    .map((step) => `## ${step.agent.name} · ${step.agent.role}\n${compactStep(step)}`)
    .join("\n\n")

  return [
    "Создай реальный работающий MVP этой компании по решениям восьми агентов Malik Autonomous Company.",
    "Это не концепт и не объяснение. Нужен законченный продуктовый интерфейс, который можно открыть и показать инвестору.",
    "Сохрани название, ICP, оффер, рынок, цену, CTA и ключевые решения из плана. Не выдумывай другой бизнес.",
    "Сделай премиальный полностью адаптивный интерфейс: hero, продукт, ценность, функции/услуги, pricing если определён, FAQ и сильный CTA.",
    "Не вставляй фальшивые отзывы, клиентов, выручку или логотипы компаний. Если факта нет — не изображай его как факт.",
    `ИСХОДНАЯ ИДЕЯ:\n${props.prompt.trim()}`,
    constraints ? `ОГРАНИЧЕНИЯ:\n${constraints}` : "",
    `РЕШЕНИЯ АГЕНТОВ:\n${blueprint}`,
  ].filter(Boolean).join("\n\n")
}

function companyPlan(props: CompanyLaunchPadProps) {
  return props.steps
    .filter((step) => step.state === "done")
    .map((step) => `# ${step.agent.name} · ${step.agent.role}\n\n${step.content}`)
    .join("\n\n---\n\n")
}

export function CompanyLaunchPad(props: CompanyLaunchPadProps) {
  const ready = props.steps.length >= 8 && props.steps.every((step) => step.state === "done" && step.content.trim())
  // Account and eight agent results are part of the cache key: never show a
  // project from another user or a prior run with the same one-line idea.
  const storageKey = useMemo(() => `malik-autonomous-product:v2:${hashKey([
    props.accountId || "anonymous", props.prompt, props.market || "", props.country || "",
    props.budget || "", props.requirements || "",
    ...props.steps.filter((s) => s.state === "done").map((s) => s.agent.id + ":" + s.content),
  ].join("\n"))}`, [props.accountId, props.prompt, props.market, props.country, props.budget, props.requirements, props.steps])
  const projectStorageKey = useMemo(() => `${storageKey}:nextjs`, [storageKey])
  const title = useMemo(() => companyTitle(props.prompt), [props.prompt])
  const brief = useMemo(() => buildWebsiteBrief(props), [props])

  const [loadedKey, setLoadedKey] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [html, setHtml] = useState("")
  const [meta, setMeta] = useState<BuildMeta>({})
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState("")
  const [deploying, setDeploying] = useState(false)
  const [deployUrl, setDeployUrl] = useState("")
  const [deployError, setDeployError] = useState("")

  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [projectName, setProjectName] = useState("")
  const [projectQa, setProjectQa] = useState<ProjectQa>({})
  const [projectBuilding, setProjectBuilding] = useState(false)
  const [projectError, setProjectError] = useState("")
  const [projectDeploying, setProjectDeploying] = useState(false)
  const [projectDeployUrl, setProjectDeployUrl] = useState("")
  const [projectDeployState, setProjectDeployState] = useState("")
  const [projectDeployId, setProjectDeployId] = useState("")
  const [projectDeployError, setProjectDeployError] = useState("")

  const readiness = useMemo(() => assessBusinessLaunch({
    completedAgents: props.steps.filter((step) => step.state === "done" && step.content.trim()).length,
    hasStandaloneHtml: Boolean(html.trim()),
    projectFiles: projectFiles.length,
    qaPassed: projectQa.passed === true,
    syntaxChecked: projectQa.syntaxChecked === true,
    deploymentUrl: projectDeployUrl,
    deploymentState: projectDeployState,
  }), [props.steps, html, projectFiles.length, projectQa.passed, projectQa.syntaxChecked, projectDeployUrl, projectDeployState])

  useEffect(() => {
    if (!previewOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewOpen(false) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [previewOpen])

  useEffect(() => {
    if (!ready) return
    setHtml("")
    setMeta({})
    setDeployUrl("")
    setProjectFiles([])
    setProjectName("")
    setProjectQa({})
    setProjectDeployUrl("")
    setProjectDeployId("")
    setProjectDeployState("")
    setBuildError("")
    setProjectError("")
    setProjectDeployError("")
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null")
      if (stored?.html && typeof stored.html === "string") {
        setHtml(stored.html)
        setMeta(stored.meta || {})
        setDeployUrl(typeof stored.deployUrl === "string" ? stored.deployUrl : "")
      }
      const project = JSON.parse(localStorage.getItem(projectStorageKey) || "null")
      if (Array.isArray(project?.files)) {
        setProjectFiles(project.files)
        setProjectName(typeof project.projectName === "string" ? project.projectName : "")
        setProjectQa(project.qa || {})
        setProjectDeployUrl(typeof project.deployUrl === "string" ? project.deployUrl : "")
        setProjectDeployState(typeof project.deployState === "string" ? project.deployState : "")
        setProjectDeployId(typeof project.deployId === "string" ? project.deployId : "")
      }
    } catch {}
    setLoadedKey(storageKey)
  }, [projectStorageKey, ready, storageKey])

  const persist = useCallback((nextHtml: string, nextMeta: BuildMeta, nextDeployUrl = deployUrl) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ html: nextHtml, meta: nextMeta, deployUrl: nextDeployUrl, savedAt: Date.now() }))
    } catch {}
  }, [deployUrl, storageKey])

  const persistProject = useCallback((files: ProjectFile[], name: string, qa: ProjectQa, url = projectDeployUrl, deployState = projectDeployState, deployId = projectDeployId) => {
    try {
      localStorage.setItem(projectStorageKey, JSON.stringify({ files, projectName: name, qa, deployUrl: url, deployState, deployId, savedAt: Date.now() }))
    } catch {}
  }, [projectDeployId, projectDeployState, projectDeployUrl, projectStorageKey])

  // Check queued Vercel jobs from the browser. The Render process stays idle.
  useEffect(() => {
    if (!props.canDeploy || !projectDeployId || !["QUEUED", "BUILDING", "INITIALIZING"].includes(projectDeployState)) return
    let active = true
    let attempts = 0
    const check = async () => {
      if (!active || attempts++ >= 24) return
      try {
        const response = await fetch(`/api/business/deploy-project?id=${encodeURIComponent(projectDeployId)}`, { cache: "no-store" })
        const result = await response.json().catch(() => ({}))
        if (!active || !response.ok || !result?.ok) return
        const state = String(result.readyState || "").toUpperCase()
        if (!state) return
        setProjectDeployState(state)
        persistProject(projectFiles, projectName, projectQa, projectDeployUrl, state, projectDeployId)
        if (["ERROR", "CANCELED", "CANCELLED"].includes(state)) {
          setProjectDeployError(String(result.error || "Vercel build завершился с ошибкой"))
        }
      } catch { /* Network failure is not proof of deployment success. */ }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 6500)
    return () => { active = false; window.clearInterval(timer) }
  }, [props.canDeploy, projectDeployId, projectDeployState, projectFiles, projectName, projectQa, projectDeployUrl, persistProject])

  const build = useCallback(async () => {
    if (!ready || building) return
    setBuilding(true)
    setBuildError("")
    setDeployError("")
    setDeployUrl("")
    try {
      const response = await clientFetchWithTimeout(
        "/api/generate/website",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: brief }) },
        180_000,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      const nextHtml = String(data?.html || data?.content || "").trim()
      if (!/<html[\s>]/i.test(nextHtml)) throw new Error("Builder returned invalid HTML")
      const nextMeta = {
        provider: typeof data?.provider === "string" ? data.provider : undefined,
        model: typeof data?.model === "string" ? data.model : undefined,
        latencyMs: Number.isFinite(Number(data?.latencyMs)) ? Number(data.latencyMs) : undefined,
      }
      setHtml(nextHtml)
      setMeta(nextMeta)
      persist(nextHtml, nextMeta, "")
      // Only account-scoped business cache owns this HTML. The old global
      // malik-sites-v6 cache could expose one account's project to another.
      return nextHtml
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : "Не удалось собрать продукт")
    } finally {
      setBuilding(false)
    }
  }, [brief, building, persist, props.prompt, ready, title])

  const buildNextProject = useCallback(async (previewHtml?: string) => {
    if (!ready || projectBuilding) return
    setProjectBuilding(true)
    setProjectError("")
    setProjectDeployError("")
    setProjectDeployUrl("")
    setProjectDeployState("")
    setProjectDeployId("")
    try {
      const response = await clientFetchWithTimeout(
        "/api/business/build-project",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: brief, html: previewHtml || html, name: slug(title) }),
        },
        300_000,
      )
      const data = await response.json().catch(() => ({}))
      const files = Array.isArray(data?.files)
        ? data.files.filter((file: any) => typeof file?.path === "string" && typeof file?.content === "string")
        : []
      if (!response.ok || data?.ok === false) {
        const issues = Array.isArray(data?.qa?.issues) ? data.qa.issues.join(" · ") : ""
        throw new Error(data?.error || issues || `HTTP ${response.status}`)
      }
      if (!files.length) throw new Error("Project Builder завершился без файлов")
      const nextName = String(data?.projectName || slug(title))
      const qa = data?.qa || {}
      setProjectFiles(files)
      setProjectName(nextName)
      setProjectQa(qa)
      persistProject(files, nextName, qa, "", "", "")
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Не удалось собрать Next.js проект")
    } finally {
      setProjectBuilding(false)
    }
  }, [brief, html, persistProject, projectBuilding, ready, title])

  // One click assembles both the standalone website and the Next.js source.
  // Publishing to a paid hosting provider remains an explicit separate action.
  const buildAll = useCallback(async () => {
    if (!ready || building || projectBuilding) return
    const previewHtml = html || await build()
    if (previewHtml) await buildNextProject(previewHtml)
  }, [ready, building, projectBuilding, html, build, buildNextProject])

  const openPreview = useCallback(() => {
    // Generated HTML must never become a top-level blob: document inheriting
    // Malik AI origin. Only render inside a sandboxed iframe.
    if (html) setPreviewOpen(true)
  }, [html])

  const reportMarkdown = useCallback(() => [
    "# Malik Autonomous Company — Паспорт запуска",
    "",
    `Идея: ${title}`,
    `Техническая готовность: ${readiness.score}%`,
    `Подтверждение сборки Vercel: ${readiness.technicallyDelivered ? "READY" : "не получено"}`,
    `Текущий статус: ${projectDeployState || "не опубликован"}`,
    `URL: ${projectDeployUrl || "нет"}`,
    "",
    "## Фактические этапы",
    ...readiness.milestones.map((step) => `- [${step.done ? "x" : " "}] ${step.title}: ${step.detail}`),
    "",
    "## Ручная проверка перед коммерческим запуском",
    ...readiness.externalChecks.map((item) => `- [ ] ${item}`),
    "",
    "Коммерческий запуск компании и юридическое соответствие не проверяются автоматически.",
  ].join("\n"), [title, readiness, projectDeployState, projectDeployUrl])

  const downloadReadinessReport = useCallback(() => {
    downloadProjectZip(`${slug(title)}-launch-passport`, [
      { name: "launch-readiness.md", content: reportMarkdown() },
      { name: "company-plan.md", content: companyPlan(props) },
      { name: "launch-readiness.json", content: JSON.stringify({
        technicalScore: readiness.score, milestones: readiness.milestones,
        externalChecks: readiness.externalChecks, blockers: readiness.blockers,
        deploymentState: projectDeployState || null, deploymentUrl: projectDeployUrl || null,
        generatedAt: new Date().toISOString(),
      }, null, 2) },
    ])
  }, [props, readiness, reportMarkdown, projectDeployState, projectDeployUrl, title])

  const downloadZip = useCallback(() => {
    if (!html) return
    const manifest = JSON.stringify({ idea: props.prompt, market: props.market || null, country: props.country || null, budget: props.budget || null, requirements: props.requirements || null, generatedAt: new Date().toISOString() }, null, 2)
    const readme = `# ${title}\n\nGenerated by Malik Autonomous Company.\n\nOpen \`index.html\` in any modern browser. No build step is required.\n`
    downloadProjectZip(`${slug(title)}-malik`, [
      { name: "index.html", content: html },
      { name: "company-plan.md", content: companyPlan(props) },
      { name: "launch-readiness.md", content: reportMarkdown() },
      { name: "company.json", content: manifest },
      { name: "README.md", content: readme },
    ])
  }, [html, props, title, reportMarkdown])

  const downloadNextZip = useCallback(() => {
    if (!projectFiles.length) return
    downloadProjectZip(`${projectName || slug(title)}-nextjs`, [
      ...projectFiles.map((file) => ({ name: file.path, content: file.content })),
      { name: "company-plan.md", content: companyPlan(props) },
      { name: "launch-readiness.md", content: reportMarkdown() },
    ])
  }, [projectFiles, projectName, props, title, reportMarkdown])

  const deploy = useCallback(async () => {
    if (!props.canDeploy || !html || deploying) return
    setDeploying(true)
    setDeployError("")
    try {
      const response = await clientFetchWithTimeout(
        "/api/business/deploy",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, name: slug(title) }) },
        90_000,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.ok === false) {
        if (data?.code === "VERCEL_NOT_CONFIGURED") {
          downloadZip()
          window.open(String(data?.dropUrl || "https://vercel.com/drop"), "_blank", "noopener,noreferrer")
          throw new Error("Автодеплой ещё не подключён на сервере. ZIP скачан, открыт Vercel Drop.")
        }
        throw new Error(data?.error || `HTTP ${response.status}`)
      }
      const url = String(data?.url || "")
      if (!url) throw new Error("Deploy завершился без URL")
      setDeployUrl(url)
      persist(html, meta, url)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : "Не удалось задеплоить")
    } finally {
      setDeploying(false)
    }
  }, [props.canDeploy, deploying, downloadZip, html, meta, persist, title])

  const deployNextProject = useCallback(async () => {
    if (!props.canDeploy || !projectFiles.length || projectDeploying || !projectQa.passed) return
    setProjectDeploying(true)
    setProjectDeployError("")
    try {
      const response = await clientFetchWithTimeout(
        "/api/business/deploy-project",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName || slug(title), files: projectFiles }),
        },
        150_000,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.ok === false) {
        if (data?.code === "VERCEL_NOT_CONFIGURED") {
          downloadNextZip()
          window.open(String(data?.dropUrl || "https://vercel.com/drop"), "_blank", "noopener,noreferrer")
          throw new Error("Vercel token не подключён. Исходники Next.js скачаны ZIP-архивом.")
        }
        throw new Error(data?.error || `HTTP ${response.status}`)
      }
      const url = String(data?.url || "")
      const state = String(data?.readyState || "QUEUED")
      if (!url) throw new Error("Vercel не вернул URL проекта")
      setProjectDeployUrl(url)
      setProjectDeployState(state)
      const deploymentId = String(data?.id || "")
      setProjectDeployId(deploymentId)
      persistProject(projectFiles, projectName || slug(title), projectQa, url, state, deploymentId)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (error) {
      setProjectDeployError(error instanceof Error ? error.message : "Не удалось задеплоить Next.js проект")
    } finally {
      setProjectDeploying(false)
    }
  }, [props.canDeploy, downloadNextZip, persistProject, projectDeploying, projectFiles, projectName, projectQa, title])

  if (!ready || loadedKey !== storageKey) return null

  return (
    <section className={styles.root} aria-label="Malik Company Launchpad">
      <div className={styles.readiness} aria-label="Техническая готовность компании">
        <div className={styles.readinessTop}>
          <div><span className={styles.readinessEyebrow}>LAUNCH READINESS</span>
            <h3>Паспорт запуска</h3>
            <p>Только подтверждённые этапы создания продукта, не прогноз выручки.</p>
          </div>
          <strong className={styles.readinessScore}>{readiness.score}<span>%</span></strong>
        </div>
        <div className={styles.readinessTrack} role="progressbar" aria-label="Техническая готовность" aria-valuenow={readiness.score} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${readiness.score}%` }} />
        </div>
        <div className={styles.readinessGrid}>
          {readiness.milestones.map((item) => (
            <div key={item.id} className={styles.readinessItem} data-status={item.done ? "complete" : item.blocked ? "blocked" : "pending"}>
              <span>{item.done ? "✓" : item.blocked ? "!" : "○"} {item.title}</span>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
        <div className={styles.readinessBottom}>
          <p>{readiness.technicallyDelivered
            ? "Vercel подтвердил сборку. Клиентов, договоры, платежи и доступность сайта всё равно надо проверить."
            : `Следующий этап: ${readiness.blockers[0] || "внешняя проверка"}.`}</p>
          <button type="button" className={styles.secondary} onClick={downloadReadinessReport}><Download /> Паспорт + план ZIP</button>
        </div>
        <details className={styles.externalChecks}>
          <summary>Что нужно для реального работающего бизнеса</summary>
          <ul>{readiness.externalChecks.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      </div>
      <div className={styles.head}>
        <span className={styles.icon}><Rocket strokeWidth={1.8} /></span>
        <div className={styles.heading}>
          <span>COMPANY LAUNCHPAD</span>
          <h3>Из плана — в работающий продукт</h3>
          <p>8 агентов согласовали план. Malik создаёт HTML и Next.js; факт публикации подтверждается отдельно.</p>
        </div>
        {!html ? (
          <button type="button" className={styles.primary} onClick={() => void buildAll()} disabled={building || projectBuilding}>
            {building || projectBuilding ? <><Loader2 className={styles.spin} /> Собираю полный пакет…</> : <><Code2 /> Собрать полный пакет</>}
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => void build()} disabled={building}>
            {building ? <Loader2 className={styles.spin} /> : <RefreshCw />} Пересобрать preview
          </button>
        )}
      </div>

      {buildError && <div className={styles.error}>{buildError}</div>}

      {!html && !building && !buildError && (
        <div className={styles.empty}>
          <PackageOpen />
          <div><b>План готов к сборке</b><span>Одна команда создаст HTML и Next.js исходники с синтаксической проверкой.</span></div>
        </div>
      )}

      {html && (
        <>
          <div className={styles.statusRow}>
            <span><CheckCircle2 /> MVP preview собран</span>
            <span><Globe2 /> Локальный preview · ещё не опубликован</span>
            <span><PackageOpen /> ZIP ready</span>
            {meta.model && <span className={styles.meta}>{meta.model}{meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)}с` : ""}</span>}
          </div>

          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <span className={styles.lights}><i /><i /><i /></span>
              <span className={styles.address}>{deployUrl || "malik://autonomous-company/preview"}</span>
              <button type="button" onClick={openPreview} aria-label="Открыть preview в новой вкладке"><ExternalLink /></button>
            </div>
            <iframe title="Autonomous Company live preview" srcDoc={html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={openPreview}><ExternalLink /> Открыть preview</button>
            <button type="button" className={styles.secondary} onClick={downloadZip}><Download /> Скачать HTML ZIP</button>
            {props.canDeploy ? (
              <button type="button" className={styles.primary} onClick={() => void deploy()} disabled={deploying}>
                {deploying ? <><Loader2 className={styles.spin} /> Deploy…</> : <><Rocket /> Опубликовать HTML</>}
              </button>
            ) : <span className="text-xs text-zinc-400">ZIP можно опубликовать самостоятельно. Общий автодеплой доступен только владельцу Malik AI.</span>}
          </div>

          {deployUrl && <div className={styles.deployed}><CheckCircle2 /><span><b>Preview deployment создан</b><a href={deployUrl} target="_blank" rel="noreferrer">{deployUrl}</a></span></div>}
          {deployError && <div className={styles.error}>{deployError}</div>}

          <div className={styles.projectStage}>
            <div className={styles.projectHead}>
              <div>
                <span>PRODUCTION BUILD</span>
                <h4>Next.js Project · Build → QA → Fix → Deploy</h4>
                <p>MalikCoder создаёт multi-file App Router проект, QA gate проверяет контракт и при ошибках автоматически запускает repair round.</p>
              </div>
              <button type="button" className={projectFiles.length ? styles.secondary : styles.primary} onClick={() => void buildNextProject()} disabled={projectBuilding}>
                {projectBuilding
                  ? <><Loader2 className={styles.spin} /> Build + QA…</>
                  : projectFiles.length ? <><RefreshCw /> Пересобрать Next.js</> : <><Code2 /> Собрать Next.js проект</>}
              </button>
            </div>

            {projectError && <div className={styles.error}>{projectError}</div>}

            {projectBuilding && (
              <div className={styles.pipeline}>
                <span className={styles.pipelineActive}>1. Generate files</span><i>→</i>
                <span>2. Static QA</span><i>→</i>
                <span>3. AI review</span><i>→</i>
                <span>4. Auto-fix</span>
              </div>
            )}

            {!!projectFiles.length && (
              <>
                <div className={styles.statusRow}>
                  <span><CheckCircle2 /> {projectFiles.length} файлов</span>
                  <span><CheckCircle2 /> {projectQa.passed ? "Синтаксис проверен" : "QA не подтверждён"}</span>
                  <span><RefreshCw /> {projectQa.rounds || 1} round</span>
                  <span><PackageOpen /> Next.js ZIP ready</span>
                  {projectDeployState && <span><Globe2 /> Vercel {projectDeployState}</span>}
                </div>

                <div className={styles.fileGrid}>
                  {projectFiles.map((file) => (
                    <div key={file.path} className={styles.fileCard}>
                      <Code2 />
                      <span><b>{file.path}</b><small>{Math.max(1, Math.round(file.content.length / 1024))} KB</small></span>
                    </div>
                  ))}
                </div>

                {!!projectQa.checks?.length && (
                  <div className={styles.qaBox}>
                    <b>QA gate</b>
                    <span>{projectQa.checks.slice(0, 8).join(" · ")}</span>
                    <small>Это статическая проверка; финальный Next.js build подтверждается только Vercel.</small>
                    {!!projectQa.warnings?.length && <small>{projectQa.warnings.join(" · ")}</small>
                  </div>
                )}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={downloadNextZip}><Download /> Скачать Next.js ZIP</button>
                  {props.canDeploy ? (
                    <button type="button" className={styles.primary} onClick={() => void deployNextProject()} disabled={projectDeploying || !projectQa.passed}>
                      {projectDeploying ? <><Loader2 className={styles.spin} /> Vercel build…</> : <><Rocket /> Собрать и опубликовать</>}
                    </button>
                  ) : <span className="text-xs text-zinc-400">Скачай Next.js ZIP и разверни в своём GitHub/Vercel. Автопубликация требует отдельной интеграции.</span>}
                </div>

                {projectDeployUrl && (
                  <div className={styles.deployed}>
                    <CheckCircle2 />
                    <span>
                      <b>{projectDeployState === "READY" ? "Vercel подтвердил успешную сборку" : `Vercel: ${projectDeployState || "создан"} · публикация пока не подтверждена`}</b>
                      <a href={projectDeployUrl} target="_blank" rel="noreferrer">{projectDeployUrl}</a>
                    </span>
                  </div>
                )}
                {projectDeployError && <div className={styles.error}>{projectDeployError}</div>}
              </>
            )}
          </div>
        </>
      )}
      {previewOpen && html && (
        <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label="Изолированный предпросмотр" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false) }}>
          <div className={styles.previewDialog}>
            <div className={styles.previewToolbar}>
              <span><Globe2 /> Изолированный просмотр. Не вводите пароли и реальные платёжные данные.</span>
              <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Закрыть предпросмотр">Закрыть ✕</button>
            </div>
            <iframe title="Полноэкранный изолированный предпросмотр" srcDoc={html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" />
          </div>
        </div>
      )}
    </section>
  )
}

export default CompanyLaunchPad
