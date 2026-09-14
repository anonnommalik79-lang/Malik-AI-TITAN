"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Code2, Download, ExternalLink, Globe2, Loader2, PackageOpen, RefreshCw, Rocket } from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { downloadProjectZip } from "@/lib/business/project-zip"
import styles from "./CompanyLaunchPad.module.css"

type LaunchStep = {
  agent: { id: string; name: string; role: string }
  state: string
  content: string
}

export type CompanyLaunchPadProps = {
  steps: LaunchStep[]
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
    "Создай реальный работающий одностраничный MVP/лендинг этой компании по решениям восьми агентов Malik Autonomous Company.",
    "Это не концепт и не объяснение. Нужен законченный продуктовый интерфейс, который можно открыть в браузере и показать инвестору.",
    "Сохрани название, ICP, оффер, рынок, цену, CTA и ключевые решения из плана. Не выдумывай другой бизнес.",
    "Сделай премиальный полностью адаптивный интерфейс: hero, продукт, ценность, функции/услуги, pricing если он определён, FAQ и сильный CTA.",
    "Не вставляй фальшивые отзывы, клиентов, выручку или логотипы компаний. Если факта нет — не изображай его как факт.",
    "Все CSS и JS должны находиться внутри одного index.html. Сайт должен работать без сборщика и внешнего backend.",
    `ИСХОДНАЯ ИДЕЯ:\n${props.prompt.trim()}`,
    constraints ? `ОГРАНИЧЕНИЯ:\n${constraints}` : "",
    `РЕШЕНИЯ АГЕНТОВ:\n${blueprint}`,
  ].filter(Boolean).join("\n\n")
}

function saveToSites(title: string, prompt: string, html: string) {
  try {
    const storageKey = "malik-sites-v6"
    const current = JSON.parse(localStorage.getItem(storageKey) || "[]")
    const list = Array.isArray(current) ? current : []
    const id = `autonomous-${Date.now().toString(36)}`
    const next = [{ id, title, prompt, html, createdAt: new Date().toISOString() }, ...list]
      .filter((site, index, all) => index === all.findIndex((item) => item?.html === site?.html))
      .slice(0, 24)
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {}
}

export function CompanyLaunchPad(props: CompanyLaunchPadProps) {
  const ready = props.steps.length >= 8 && props.steps.every((step) => step.state === "done" && step.content.trim())
  const storageKey = useMemo(() => `malik-autonomous-product:${hashKey(props.prompt)}`, [props.prompt])
  const title = useMemo(() => companyTitle(props.prompt), [props.prompt])
  const [html, setHtml] = useState("")
  const [meta, setMeta] = useState<BuildMeta>({})
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState("")
  const [deploying, setDeploying] = useState(false)
  const [deployUrl, setDeployUrl] = useState("")
  const [deployError, setDeployError] = useState("")

  useEffect(() => {
    if (!ready) return
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null")
      if (stored?.html && typeof stored.html === "string") {
        setHtml(stored.html)
        setMeta(stored.meta || {})
        setDeployUrl(typeof stored.deployUrl === "string" ? stored.deployUrl : "")
      }
    } catch {}
  }, [ready, storageKey])

  const persist = useCallback((nextHtml: string, nextMeta: BuildMeta, nextDeployUrl = deployUrl) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ html: nextHtml, meta: nextMeta, deployUrl: nextDeployUrl, savedAt: Date.now() }))
    } catch {}
  }, [deployUrl, storageKey])

  const build = useCallback(async () => {
    if (!ready || building) return
    setBuilding(true)
    setBuildError("")
    setDeployError("")
    setDeployUrl("")
    try {
      const response = await clientFetchWithTimeout(
        "/api/generate/website",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: buildWebsiteBrief(props) }) },
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
      saveToSites(title, props.prompt, nextHtml)
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : "Не удалось собрать продукт")
    } finally {
      setBuilding(false)
    }
  }, [building, persist, props, ready, title])

  const openPreview = useCallback(() => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [html])

  const downloadZip = useCallback(() => {
    if (!html) return
    const plan = props.steps.filter((step) => step.state === "done").map((step) => `# ${step.agent.name} · ${step.agent.role}\n\n${step.content}`).join("\n\n---\n\n")
    const manifest = JSON.stringify({ idea: props.prompt, market: props.market || null, country: props.country || null, budget: props.budget || null, requirements: props.requirements || null, generatedAt: new Date().toISOString() }, null, 2)
    const readme = `# ${title}\n\nGenerated by Malik Autonomous Company.\n\nOpen \`index.html\` in any modern browser. No build step is required.\n`
    downloadProjectZip(`${slug(title)}-malik`, [
      { name: "index.html", content: html },
      { name: "company-plan.md", content: plan },
      { name: "company.json", content: manifest },
      { name: "README.md", content: readme },
    ])
  }, [html, props, title])

  const deploy = useCallback(async () => {
    if (!html || deploying) return
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
  }, [deploying, downloadZip, html, meta, persist, title])

  if (!ready) return null

  return (
    <section className={styles.root} aria-label="Malik Company Launchpad">
      <div className={styles.head}>
        <span className={styles.icon}><Rocket strokeWidth={1.8} /></span>
        <div className={styles.heading}>
          <span>COMPANY LAUNCHPAD</span>
          <h3>Из плана — в работающий продукт</h3>
          <p>8 агентов согласовали компанию. Теперь Malik собирает сайт/MVP, live preview, ZIP и deployment.</p>
        </div>
        {!html ? (
          <button type="button" className={styles.primary} onClick={() => void build()} disabled={building}>
            {building ? <><Loader2 className={styles.spin} /> Собираю продукт…</> : <><Code2 /> Создать продукт</>}
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => void build()} disabled={building}>
            {building ? <Loader2 className={styles.spin} /> : <RefreshCw />} Пересобрать
          </button>
        )}
      </div>

      {buildError && <div className={styles.error}>{buildError}</div>}

      {!html && !building && !buildError && (
        <div className={styles.empty}>
          <PackageOpen />
          <div><b>План готов к сборке</b><span>Нажми «Создать продукт» — Coder превратит решения агентов в standalone index.html.</span></div>
        </div>
      )}

      {html && (
        <>
          <div className={styles.statusRow}>
            <span><CheckCircle2 /> MVP собран</span>
            <span><Globe2 /> Live preview</span>
            <span><PackageOpen /> ZIP ready</span>
            {meta.model && <span className={styles.meta}>{meta.model}{meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)}с` : ""}</span>}
          </div>

          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <span className={styles.lights}><i /><i /><i /></span>
              <span className={styles.address}>{deployUrl || "malik://autonomous-company/preview"}</span>
              <button type="button" onClick={openPreview} aria-label="Открыть preview в новой вкладке"><ExternalLink /></button>
            </div>
            <iframe title="Autonomous Company live preview" srcDoc={html} sandbox="allow-scripts allow-forms allow-modals allow-popups" />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={openPreview}><ExternalLink /> Открыть preview</button>
            <button type="button" className={styles.secondary} onClick={downloadZip}><Download /> Скачать ZIP</button>
            <button type="button" className={styles.primary} onClick={() => void deploy()} disabled={deploying}>
              {deploying ? <><Loader2 className={styles.spin} /> Deploy…</> : <><Rocket /> Deploy Company</>}
            </button>
          </div>

          {deployUrl && <div className={styles.deployed}><CheckCircle2 /><span><b>Deployment создан</b><a href={deployUrl} target="_blank" rel="noreferrer">{deployUrl}</a></span></div>}
          {deployError && <div className={styles.error}>{deployError}</div>}
        </>
      )}
    </section>
  )
}

export default CompanyLaunchPad
