"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

type ActionKind = "search" | "source" | "reading" | "error" | "done" | "plan" | "other"
type MotionAction = { text: string; kind: ActionKind; domain: string }
type MotionState = {
  target: HTMLElement | null
  web: boolean
  active: boolean
  sourceCount: number
  observedElapsed: number
  actions: MotionAction[]
  sourceDomains: string[]
  thinkingLabel: string
}

const EMPTY_STATE: MotionState = {
  target: null,
  web: false,
  active: false,
  sourceCount: 0,
  observedElapsed: 0,
  actions: [],
  sourceDomains: [],
  thinkingLabel: "",
}

function cleanText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function unique(items: string[]) {
  return items.filter((item, index) => item && items.indexOf(item) === index)
}

function normalizeDomain(value?: string | null) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0]
}

function domainFromText(text: string) {
  const match = text.match(/(?:·|—|:|\s)([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\b|\/)/i)
  return normalizeDomain(match?.[1])
}

function domainFromIcon(root: Element | null) {
  const image = root?.querySelector<HTMLImageElement>(".malik-source-icon img")
  const raw = image?.currentSrc || image?.src || ""
  if (!raw) return ""
  try {
    const url = new URL(raw, window.location.href)
    const encoded = url.searchParams.get("domain_url") || url.searchParams.get("domain")
    if (encoded) return normalizeDomain(encoded)
  } catch {}
  return ""
}

function detectKind(text: string): ActionKind {
  const value = text.toLowerCase()
  if (/(?:ошиб|не удалось|недоступ|failed|error|timeout|таймаут)/iu.test(value)) return "error"
  if (/(?:найден\s+источник|source\s+found)/iu.test(value)) return "source"
  if (/(?:читаю|открываю|reading|read\s+source)/iu.test(value)) return "reading"
  if (/(?:поиск|ищ(?:у|ет|ем|ут)|search(?:ing|ed)?|web\s*search)/iu.test(value)) return "search"
  if (/(?:готов|заверш|done|complete)/iu.test(value)) return "done"
  if (/(?:проверя|сверя|сравни|анализир|планир|понима|verify|check|compare|analyse|analyze)/iu.test(value)) return "plan"
  return "other"
}

function sameMotion(a: MotionState, b: MotionState) {
  return a.target === b.target
    && a.web === b.web
    && a.active === b.active
    && a.sourceCount === b.sourceCount
    && a.observedElapsed === b.observedElapsed
    && a.thinkingLabel === b.thinkingLabel
    && a.sourceDomains.join("|") === b.sourceDomains.join("|")
    && a.actions.map((x) => `${x.kind}:${x.domain}:${x.text}`).join("|") === b.actions.map((x) => `${x.kind}:${x.domain}:${x.text}`).join("|")
}

function findActiveThinking(): MotionState {
  if (typeof document === "undefined") return EMPTY_STATE
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "[data-malik-message='assistant'] .malik-thinking-line, [data-malik-message='assistant'] .malik-activity",
  ))
  const original = candidates.at(-1) || null
  if (!original?.isConnected || !original.parentElement) return EMPTY_STATE

  const target = original.parentElement
  const web = original.classList.contains("malik-activity")
  const active = Boolean(original.querySelector(".malik-thinking-dots"))

  if (!web) {
    const clone = original.cloneNode(true) as HTMLElement
    clone.querySelectorAll(".malik-thinking-dots").forEach((node) => node.remove())
    return { ...EMPTY_STATE, target, active, thinkingLabel: cleanText(clone.textContent) || "Думаю" }
  }

  const rows = Array.from(original.querySelectorAll<HTMLElement>(".malik-activity-row:not(.is-meta)"))
  const actions = rows.map((row) => {
    const text = cleanText(row.querySelector<HTMLElement>(".malik-activity-text")?.textContent)
    if (!text) return null
    return { text, kind: detectKind(text), domain: domainFromIcon(row) || domainFromText(text) }
  }).filter((item): item is MotionAction => Boolean(item))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.text === item.text) === index)

  const iconDomains = Array.from(original.querySelectorAll<HTMLElement>(".malik-live-source-icons .malik-source-icon"))
    .map((icon) => domainFromIcon(icon)).filter(Boolean)
  const sourceDomains = unique([...iconDomains, ...actions.map((item) => item.domain).filter(Boolean)])
  const iconCount = original.querySelectorAll(".malik-live-source-icons .malik-source-icon").length
  const metaText = cleanText(original.querySelector<HTMLElement>(".malik-activity-row.is-meta .malik-activity-text")?.textContent)

  return {
    target,
    web: true,
    active,
    sourceCount: Math.max(iconCount, sourceDomains.length),
    observedElapsed: Number(metaText.match(/(\d+)\s*s\b/i)?.[1] || 0),
    actions,
    sourceDomains,
    thinkingLabel: actions.at(-1)?.text || "Думаю",
  }
}

function makeSearchLine(text: string) {
  const value = cleanText(text)
  if (/поиск\s+в\s+интернет/iu.test(value)) return value
  if (/^search(?:ing|ed)?\b/iu.test(value) || /^ищ/iu.test(value)) return `Поиск в Интернете · ${value}`
  return value || "Поиск в Интернете"
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function sourceKind(domain: string) {
  if (/(^|\.)(docs?|developer|developers|api)\./i.test(domain)) return "Документация"
  if (/(^|\.)(support|help)\./i.test(domain)) return "Справка"
  if (/\.gov(?:\.|$)/i.test(domain)) return "Официальный"
  if (/(reuters|bloomberg|techcrunch|theverge|wired|forbes|bbc|apnews)/i.test(domain)) return "Новости"
  return "Веб"
}

function sourcePriority(domain: string) {
  const kind = sourceKind(domain)
  return kind === "Официальный" ? 0 : kind === "Документация" ? 1 : kind === "Справка" ? 2 : kind === "Новости" ? 3 : 4
}

export function MalikSearchMotion() {
  const [motion, setMotion] = useState<MotionState>(EMPTY_STATE)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [manualExpansion, setManualExpansion] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return
    let frame = 0
    const scan = () => {
      frame = 0
      const next = findActiveThinking()
      setMotion((previous) => sameMotion(previous, next) ? previous : next)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(scan) }
    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "src"] })
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    setElapsed(motion.observedElapsed)
    setExpanded(false)
    setManualExpansion(false)
  }, [motion.target])

  useEffect(() => {
    if (motion.observedElapsed > 0) setElapsed((current) => Math.max(current, motion.observedElapsed))
  }, [motion.observedElapsed])

  useEffect(() => {
    if (!motion.target || !motion.active) return
    const startedAt = Date.now() - Math.max(elapsed, motion.observedElapsed) * 1000
    const timer = window.setInterval(() => setElapsed(Math.max(motion.observedElapsed, Math.round((Date.now() - startedAt) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [motion.target, motion.active, motion.observedElapsed])

  const searches = useMemo(() => motion.actions.filter((item) => item.kind === "search").map((item) => makeSearchLine(item.text)), [motion.actions])
  const reading = useMemo(() => motion.actions.filter((item) => item.kind === "reading"), [motion.actions])
  const errors = useMemo(() => motion.actions.filter((item) => item.kind === "error"), [motion.actions])
  const conflict = useMemo(() => motion.actions.find((item) => /(?:расхожд|противореч|conflict|contradict)/iu.test(item.text)), [motion.actions])
  const freshness = useMemo(() => motion.actions.find((item) => /(?:актуаль|свеж|дата|latest|recent|published)/iu.test(item.text)), [motion.actions])
  const sourceDomains = useMemo(() => [...motion.sourceDomains].sort((a, b) => sourcePriority(a) - sourcePriority(b)).slice(0, 8), [motion.sourceDomains])

  const searchCount = motion.web ? (searches.length || (motion.sourceCount ? 1 : 0)) : 0
  const sourceCount = Math.max(motion.sourceCount, motion.sourceDomains.length)
  const readCount = unique(reading.map((item) => item.domain).filter(Boolean)).length || reading.length

  useEffect(() => {
    if (!motion.web || !searchCount || manualExpansion) return
    if (!motion.active) { setExpanded(false); return }
    setExpanded(true)
    const timer = window.setTimeout(() => setExpanded(false), 2600)
    return () => window.clearTimeout(timer)
  }, [motion.web, motion.active, searchCount, manualExpansion])

  const currentAction = useMemo(() => {
    const useful = motion.actions.filter((item) => item.kind !== "search" && item.kind !== "source" && item.kind !== "done")
    if (motion.active && useful.length) return useful.at(-1)?.text || "Думаю"
    if (motion.active && sourceCount) return "Проверяю найденные источники"
    return motion.active ? "Думаю" : "Исследование завершено"
  }, [motion.actions, motion.active, sourceCount])

  const stats = [
    `${elapsed} сек`,
    searchCount ? `${searchCount} ${pluralRu(searchCount, "поиск", "поиска", "поисков")}` : "",
    sourceCount ? `${sourceCount} ${pluralRu(sourceCount, "источник", "источника", "источников")}` : "",
    readCount ? `прочитано ${readCount}` : "",
  ].filter(Boolean).join(" · ")

  const style = <style>{`
    [data-malik-message='assistant'] .malik-thinking-line,
    [data-malik-message='assistant'] .malik-activity { display:none!important; }
    [data-malik-message='assistant'] section[aria-label='План Malik Action OS'] { display:none!important; }
    .malik-search-motion{width:min(100%,720px);padding:4px 0 8px;color:#efeff1;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .malik-search-motion__stack{display:grid;gap:7px}
    .malik-search-motion__row,.malik-search-motion__summary{display:flex;align-items:flex-start;gap:9px;min-width:0;min-height:22px;color:#8f8f95;font-size:13px;font-weight:520;line-height:1.5}
    .malik-search-motion__summary{appearance:none;width:max-content;max-width:100%;padding:0;border:0;background:transparent;color:#aaaab0;cursor:pointer;text-align:left}.malik-search-motion__summary:hover{color:#f1f1f2}
    .malik-search-motion__icon{position:relative;display:grid;place-items:center;width:17px;height:20px;flex:0 0 17px;color:#85858b;font-size:13px}.malik-search-motion__icon.is-live:after{content:"";width:5px;height:5px;border-radius:99px;background:#ececee;animation:malik-research-pulse 1.25s ease-out infinite}
    .malik-search-motion__label{min-width:0;overflow-wrap:anywhere}.malik-search-motion__chevron{display:inline-block;margin-left:3px;color:#66666c;transition:transform .2s ease}.malik-search-motion__summary.is-open .malik-search-motion__chevron{transform:rotate(90deg)}
    .malik-search-motion__details{display:grid;gap:9px;margin:1px 0 3px 7px;padding:3px 0 4px 19px;border-left:1px solid rgba(255,255,255,.095);overflow:hidden;animation:malik-research-expand .2s ease both}
    .malik-search-motion__search-list{display:grid;gap:6px}.malik-search-motion__search{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;color:#74747a;font-size:12.5px;line-height:1.48;animation:malik-research-line-in .22s ease both}.malik-search-motion__search:last-child{color:#d9d9dc}.malik-search-motion__globe{color:#6f6f75}
    .malik-search-motion__sources-title{color:#66666c;font-size:11px;font-weight:650}.malik-search-motion__sources{display:flex;flex-wrap:wrap;gap:6px}.malik-search-motion__source{display:inline-flex;align-items:center;gap:7px;min-height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#0b0b0c;color:#aaaab0;font-size:11px}.malik-search-motion__source-mark{display:grid;place-items:center;width:15px;height:15px;border-radius:4px;background:#1a1a1d;color:#d8d8dc;font-size:8px;font-weight:800;text-transform:uppercase}.malik-search-motion__source-kind{color:#5f5f65}
    .malik-search-motion__signal{display:flex;align-items:flex-start;gap:7px;color:#8d8d93;font-size:11.5px;line-height:1.45}.malik-search-motion__signal strong{color:#c7c7cb!important;font-size:inherit!important;font-weight:650!important}
    .malik-search-motion__stage{color:#c8c8cc}.malik-search-motion__stage.is-active{color:#f0f0f1}.malik-search-motion__meta{color:#626268;font-size:11.5px;font-variant-numeric:tabular-nums}
    .malik-search-motion__stage.is-active .malik-search-motion__label{color:transparent;background:linear-gradient(90deg,#77777d 0%,#8b8b91 34%,#ffffff 50%,#8b8b91 66%,#77777d 100%);background-size:220% 100%;background-position:-200% 50%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:malik-thinking-text-sweep 1.35s linear infinite}
    .malik-search-motion__stage.is-active .malik-search-motion__icon{color:#f4f4f5;animation:malik-thinking-icon-pulse 1.35s ease-in-out infinite}
    @keyframes malik-research-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.2)}70%{box-shadow:0 0 0 5px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@keyframes malik-research-expand{from{opacity:0;max-height:0;transform:translateY(-3px)}to{opacity:1;max-height:440px;transform:none}}@keyframes malik-research-line-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}@keyframes malik-thinking-text-sweep{0%{background-position:-200% 50%}100%{background-position:200% 50%}}@keyframes malik-thinking-icon-pulse{0%,100%{opacity:.55}50%{opacity:1}}
    @media(max-width:640px){.malik-search-motion{width:100%}.malik-search-motion__row,.malik-search-motion__summary{font-size:12.5px}.malik-search-motion__search{font-size:12px}}
    @media(prefers-reduced-motion:reduce){.malik-search-motion__icon.is-live:after,.malik-search-motion__details,.malik-search-motion__search,.malik-search-motion__stage.is-active .malik-search-motion__label,.malik-search-motion__stage.is-active .malik-search-motion__icon{animation:none!important}.malik-search-motion__stage.is-active .malik-search-motion__label{color:#f0f0f1!important;background:none!important;-webkit-text-fill-color:currentColor!important}.malik-search-motion__chevron{transition:none}}
  `}</style>

  if (!motion.target) return style

  const hasDetails = searches.length > 0 || sourceDomains.length > 0 || errors.length > 0 || Boolean(conflict) || Boolean(freshness)
  const content = motion.web ? (
    <div className="malik-search-motion" aria-live="polite" aria-label="Ход веб-поиска Malik AI">
      <div className="malik-search-motion__stack">
        <button type="button" className={`malik-search-motion__summary${expanded ? " is-open" : ""}`} onClick={() => { setManualExpansion(true); setExpanded((value) => !value) }} aria-expanded={expanded}>
          <span className="malik-search-motion__icon" aria-hidden="true">⌕</span>
          <span className="malik-search-motion__label">
            {searchCount ? `Выполнено ${searchCount} ${pluralRu(searchCount, "поиск", "поиска", "поисков")}` : "Ищу в Интернете"}
            {hasDetails ? <span className="malik-search-motion__chevron">›</span> : null}
          </span>
        </button>

        {expanded && hasDetails ? (
          <div className="malik-search-motion__details" aria-label="История исследования">
            {searches.length ? <div className="malik-search-motion__search-list">{searches.slice(-8).map((item, index) => <div className="malik-search-motion__search" key={`${item}-${index}`}><span className="malik-search-motion__globe" aria-hidden="true">◎</span><span>{item}</span></div>)}</div> : null}
            {sourceDomains.length ? <><div className="malik-search-motion__sources-title">Источники</div><div className="malik-search-motion__sources">{sourceDomains.map((domain) => <span className="malik-search-motion__source" key={domain}><span className="malik-search-motion__source-mark">{domain.slice(0, 1)}</span><span>{domain}</span><span className="malik-search-motion__source-kind">{sourceKind(domain)}</span></span>)}</div></> : null}
            {freshness ? <div className="malik-search-motion__signal"><span aria-hidden="true">◷</span><span><strong>Актуальность:</strong> {freshness.text}</span></div> : null}
            {conflict ? <div className="malik-search-motion__signal"><span aria-hidden="true">◇</span><span><strong>Расхождение:</strong> {conflict.text}</span></div> : null}
            {errors.length ? <div className="malik-search-motion__signal"><span aria-hidden="true">!</span><span><strong>{errors.length} {pluralRu(errors.length, "источник", "источника", "источников")} недоступно.</strong> {motion.active ? "Продолжаю с доступными данными." : "Ответ собран из доступных источников."}</span></div> : null}
          </div>
        ) : null}

        <div className={`malik-search-motion__row malik-search-motion__stage${motion.active ? " is-active" : ""}`}><span className="malik-search-motion__icon" aria-hidden="true">✦</span><span className="malik-search-motion__label">{currentAction}</span></div>
        <div className="malik-search-motion__row malik-search-motion__meta"><span className={`malik-search-motion__icon${motion.active ? " is-live" : ""}`} aria-hidden="true">{motion.active ? "" : "◷"}</span><span className="malik-search-motion__label">{motion.active ? `Работа для ${elapsed}s` : stats}</span></div>
      </div>
    </div>
  ) : (
    <div className="malik-search-motion" aria-live="polite" aria-label="Malik AI думает"><div className="malik-search-motion__stack"><div className={`malik-search-motion__row malik-search-motion__stage${motion.active ? " is-active" : ""}`}><span className="malik-search-motion__icon" aria-hidden="true">✦</span><span className="malik-search-motion__label">{motion.thinkingLabel || "Думаю"}</span></div><div className="malik-search-motion__row malik-search-motion__meta"><span className={`malik-search-motion__icon${motion.active ? " is-live" : ""}`} aria-hidden="true">{motion.active ? "" : "◷"}</span><span>{motion.active ? `Работа для ${elapsed}s` : `Работало на протяжении ${elapsed}s`}</span></div></div></div>
  )

  return <>{style}{createPortal(content, motion.target)}</>
}

export default MalikSearchMotion