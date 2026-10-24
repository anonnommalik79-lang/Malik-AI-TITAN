"use client"

import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCircle2, Copy, ExternalLink, FileText, ImageOff, Info, Search, StickyNote } from "lucide-react"
import { evaluate, type ExprValue } from "@/lib/generative-ui/expr"
import { rawFallbackText, resolveValue, uiToText } from "@/lib/generative-ui/fallback"
import { parsePartialUi } from "@/lib/generative-ui/partial"
import type { Block, ChartBlock, ControlBlock, DataOrigin, Format, ImageRef, TableBlock, UiDocument, Value } from "@/lib/generative-ui/protocol"
import { validateUi, type UiCheck } from "@/lib/generative-ui/validate"
import { layoutGraph } from "@/lib/visual/graph-layout"
import { formatCompact, formatCurrency, type VisualCurrency } from "@/lib/visual/format"
import { reportReferenceImageFailure, subscribeReferenceImages } from "@/lib/media/client-reference-cache"
import { isSafeVisualUrl, type MalikVisualImage } from "@/lib/media/reference-catalog"
import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { citationName, hostOf, safeHttps, type MalikCitation } from "@/lib/ai/citation-names"
import { ChartView, pieSlices } from "../visual-engine/VisualChart"
import { SERIES_COLORS, VisualBoundary, blockHash, useVisualField } from "../visual-engine/shared"
import "../visual-engine/visual-engine.css"
import "./generative-ui.css"

/**
 * MALIK Generative UI — draws a ```malik-ui composition.
 *
 * Every primitive maps to one component in the fixed registry below; nothing
 * from the answer is ever executed or injected as HTML. Values computed from
 * the shared state go through the closed expression evaluator, photos come
 * from the verified reference pipeline (or show a neutral placeholder), and
 * charts carry the origin of their numbers. While the fence streams, the
 * blocks that are already complete are drawn and the next one shows a
 * skeleton of its own shape; a block that fails to draw falls back to its
 * text, and a broken fence shows the strings it contained.
 */

type Scope = Record<string, ExprValue>
type Ctx = { scope: Scope; set: (key: string, value: ExprValue) => void; sources: readonly MalikCitation[]; uid: string }
const UiContext = createContext<Ctx>({ scope: {}, set: () => {}, sources: [], uid: "ui" })

type Props = {
  raw: string
  /** The fence is closed: the JSON is final. */
  closed: boolean
  /** The answer is still arriving. */
  streaming?: boolean
  sources?: readonly MalikCitation[]
  /** Per-message key: control positions survive a reload. */
  stateKey?: string
  /** How Markdown text is drawn (tables, lists) when a composition falls back to text. */
  renderMarkdown?: (markdown: string) => ReactNode
}

type Read = UiCheck & { pendingType?: string; broken: boolean }

function readUi(raw: string, closed: boolean, sources: readonly MalikCitation[]): Read {
  const options = { sources: sources.map((source) => ({ url: source.url, title: source.title })) }
  if (!closed) return { ...parsePartialUi(raw, options), broken: false }
  try {
    const check = validateUi(JSON.parse(raw), options)
    return { ...check, broken: !check.doc }
  } catch {
    // A closed fence whose JSON is cut or has trailing text: keep the complete blocks.
    const partial = parsePartialUi(raw, options)
    return partial.doc ? { ...partial, pendingType: undefined, broken: false, fixes: [...partial.fixes, "broken JSON: complete blocks kept"] } : { doc: null, issues: ["JSON could not be read"], fixes: [], broken: true }
  }
}

export function MalikGenerativeUi({ raw, closed, streaming = false, sources = [], stateKey, renderMarkdown }: Props) {
  const sourceKey = sources.map((source) => source.url).join("\n")
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the sources are compared by their links
  const read = useMemo(() => readUi(raw, closed, sources), [raw, closed, sourceKey])
  const text = (markdown: string) => renderMarkdown ? renderMarkdown(markdown) : markdown.split(/\n{2,}/u).map((part, index) => <p key={index}>{part}</p>)
  if (!read.doc) {
    if (!closed) return streaming ? <section className="mgu" data-malik-ui="pending" aria-busy="true"><UiSkeleton type={read.pendingType} /></section> : null
    const recovered = rawFallbackText(raw)
    return <UiFallback>{recovered ? text(recovered) : null}</UiFallback>
  }
  const doc = read.doc
  return <VisualBoundary fallback={<UiFallback>{text(uiToText(doc))}</UiFallback>}>
    <UiRoot doc={doc} sources={sources} stateKey={stateKey} pending={!closed && streaming ? read.pendingType || "text" : undefined} cut={!closed && !streaming} fixes={read.fixes.length} issues={read.issues.length} />
  </VisualBoundary>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> | null => value === null || (typeof value === "object" && !Array.isArray(value))

function UiRoot({ doc, sources, stateKey, pending, cut, fixes, issues }: { doc: UiDocument; sources: readonly MalikCitation[]; stateKey?: string; pending?: string; cut: boolean; fixes: number; issues: number }) {
  const initialJson = JSON.stringify(doc.state || {})
  const storeKey = stateKey ? `ui:${stateKey}` : `ui-anon:${blockHash(initialJson + doc.blocks.length)}`
  const [stored, setStored] = useVisualField<Record<string, unknown> | null>(storeKey, Boolean(stateKey), "state", null, isPlainObject)
  const scope = useMemo(() => {
    const initial = JSON.parse(initialJson) as Scope
    const merged: Scope = { ...initial }
    // A restored value counts only for a variable that still exists, with the same type.
    if (stored) for (const [key, value] of Object.entries(stored)) if (key in initial && typeof value === typeof initial[key]) merged[key] = value as ExprValue
    return merged
  }, [initialJson, stored])
  const set = useCallback((key: string, value: ExprValue) => setStored({ ...scope, [key]: value }), [scope, setStored])
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const ctx = useMemo<Ctx>(() => ({ scope, set, sources, uid }), [scope, set, sources, uid])
  return <section className="mgu" data-malik-ui={pending ? "streaming" : "ready"} data-preserve-brand-color="true" data-ui-fixes={fixes} data-ui-issues={issues} aria-label={doc.title || "Визуальный ответ"} aria-busy={pending ? true : undefined}>
    <UiContext.Provider value={ctx}><UiBlocks blocks={doc.blocks} /></UiContext.Provider>
    {pending ? <UiSkeleton type={pending} /> : null}
    {cut ? <p className="mgu-note" role="note">Ответ оборвался: показана готовая часть.</p> : null}
  </section>
}

function UiBlocks({ blocks }: { blocks: Block[] }) {
  const { scope } = useContext(UiContext)
  return <>{blocks.map((block, index) => block.when && !evaluate(block.when, scope) ? null : <UiBlock key={block.id || `${block.type}-${index}`} block={block} />)}</>
}

/* ----------------------------------------------------------------- values */

const CURRENCY: Record<string, VisualCurrency> = { "$": "USD", usd: "USD", "€": "EUR", eur: "EUR", "₸": "KZT", kzt: "KZT", "тг": "KZT", "₽": "RUB", rub: "RUB", "руб": "RUB" }

function showValue(value: ExprValue | null, options: { format?: Format; digits?: number; unit?: string } = {}): string {
  if (value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Да" : "Нет"
  if (typeof value === "string" || options.format === "text") return String(value)
  const unit = options.unit || ""
  const digits = options.digits ?? (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 1 : 2)
  if (options.format === "percent" || unit === "%") return `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`
  const currency = CURRENCY[unit.toLowerCase()]
  if (options.format === "currency" || currency) return currency ? formatCurrency(value, currency, options.digits) : `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`
  const number = options.format === "compact" ? formatCompact(value) : value.toLocaleString("ru-RU", { maximumFractionDigits: digits })
  return unit ? `${number} ${unit}` : number
}

function useValue(value: Value | null | undefined) {
  const { scope } = useContext(UiContext)
  return value === undefined ? null : resolveValue(value, scope)
}

const asText = (value: ExprValue | null) => (value === null ? "" : typeof value === "boolean" ? (value ? "Да" : "Нет") : String(value))

/** **bold**, `code` and [n] source markers inside a model's text — nothing else is interpreted. */
function RichText({ text }: { text: string }) {
  const { sources } = useContext(UiContext)
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\d{1,2}\])/u)
  return <>{parts.map((part, index) => {
    if (/^\*\*[^*\n]+\*\*$/u.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (/^`[^`\n]+`$/u.test(part)) return <code key={index} className="mgu-inline-code">{part.slice(1, -1)}</code>
    const ref = /^\[(\d{1,2})\]$/u.exec(part)
    if (ref) {
      const source = sources[Number(ref[1]) - 1]
      const href = source ? safeHttps(source.url) : ""
      return href ? <a key={index} className="mgu-ref" href={href} target="_blank" rel="noopener noreferrer nofollow" title={source!.title || citationName(source!)}>{ref[1]}</a> : <Fragment key={index}>{part}</Fragment>
    }
    return <Fragment key={index}>{part}</Fragment>
  })}</>
}

const ORIGIN: Record<DataOrigin, { label: string; title: string }> = {
  user: { label: "Ваши данные", title: "Построено по данным, которые вы указали" },
  sources: { label: "По источникам", title: "Цифры взяты из источников этого ответа" },
  computed: { label: "Расчёт", title: "Вычислено из данных и формул этого ответа" },
  illustrative: { label: "Иллюстрация, не измеренные данные", title: "Пример для наглядности, а не фактические показатели" },
}

function OriginBadge({ origin }: { origin?: DataOrigin }) {
  if (!origin) return null
  return <span className={`mgu-origin is-${origin}`} title={ORIGIN[origin].title}><span className="mgu-origin__dot" aria-hidden="true" />{ORIGIN[origin].label}</span>
}

/* ------------------------------------------------------------- registry */

function UiBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": return <UiHeading text={block.text} level={block.level || 2} eyebrow={block.eyebrow} />
    case "text": return <UiText text={block.text} tone={block.tone || "body"} />
    case "badge": return <UiBadge text={block.text} />
    case "divider": return <hr className="mgu-divider" />
    case "list": {
      const Tag = block.style === "number" ? "ol" : "ul"
      return <Tag className={`mgu-list is-${block.style || "bullet"}`}>
        {block.items.map((item, index) => <li key={index}>
          {block.style === "check" ? <span className="mgu-list__check" aria-hidden="true"><Check /></span> : null}
          <span>{typeof item === "string" ? <RichText text={item} /> : <><strong>{item.title}</strong>{item.text ? <> — <RichText text={item.text} /></> : null}</>}</span>
        </li>)}
      </Tag>
    }
    case "quote": return <figure className="mgu-quote"><blockquote><RichText text={block.text} /></blockquote>{block.author || block.label ? <figcaption>{[block.author, block.label].filter(Boolean).join(" · ")}</figcaption> : null}</figure>
    case "callout": return <UiCallout tone={block.tone || "note"} title={block.title} text={block.text} />
    case "image": return <UiPhoto image={block.image} aspect={block.aspect || "wide"} />
    case "gallery": return <div className={`mgu-gallery n-${Math.min(block.images.length, 4)}`}>{block.images.map((image, index) => <UiPhoto key={`${image.query}-${index}`} image={image} aspect={block.images.length === 1 ? "wide" : "square"} />)}</div>
    case "metric": return <UiMetric block={block} />
    case "progress": return <UiProgress label={block.label} value={block.value} max={block.max ?? 100} status={block.status || "running"} />
    case "code": return <UiCode code={block.code} language={block.language} filename={block.filename} />
    case "file": return <div className="mgu-file"><span className="mgu-file__icon" aria-hidden="true"><FileText /></span><div className="mgu-file__text"><strong>{block.name}</strong>{block.size || block.note ? <span>{[block.size, block.note].filter(Boolean).join(" · ")}</span> : null}</div>{block.href ? <a className="mgu-button" href={block.href} {...(block.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}>Открыть</a> : null}</div>
    case "citation": return <UiCitation block={block} />
    case "table": return <UiTable block={block} />
    case "chart": return <UiChart block={block} />
    case "timeline": return <ol className="mgu-timeline">{block.items.map((item, index) => <li key={index} className={item.status ? `is-${item.status}` : undefined}>
      <span className="mgu-timeline__dot" aria-hidden="true" />
      <div className="mgu-timeline__body">
        {item.date ? <p className="mgu-timeline__date">{item.date}{item.status === "active" ? <span className="mgu-timeline__now">сейчас</span> : null}</p> : null}
        <p className="mgu-timeline__title">{item.title}</p>
        {item.text ? <p className="mgu-timeline__text"><RichText text={item.text} /></p> : null}
      </div>
    </li>)}</ol>
    case "flow": return <UiFlow nodes={block.nodes} edges={block.edges} direction={block.direction || "down"} />
    case "tree": return <div className="mgu-tree" role="tree"><UiTreeNode node={block.root} depth={0} /></div>
    case "control": return <UiControl block={block} />
    case "card": return <UiCard block={block} />
    case "grid": {
      const metrics = block.items.every((item) => item.type === "metric")
      return <div className={`mgu-grid cols-${block.columns || 2}${metrics ? " is-metrics" : ""}`}><UiBlocks blocks={block.items} /></div>
    }
    case "stack": return <div className={`mgu-stack gap-${block.gap || "normal"}`}><UiBlocks blocks={block.items} /></div>
    case "section": return <section className="mgu-section">
      {block.title || block.number || block.eyebrow ? <div className="mgu-section__head">
        {block.number ? <span className="mgu-section__number">{block.number}</span> : null}
        <div className="mgu-section__titles">{block.eyebrow ? <p className="mgu-eyebrow">{block.eyebrow}</p> : null}{block.title ? <h3 className="mgu-section__title">{block.title}</h3> : null}</div>
      </div> : null}
      <div className="mgu-section__body"><UiBlocks blocks={block.items} /></div>
    </section>
    case "tabs": return <UiTabs tabs={block.tabs} />
    case "accordion": return <div className="mgu-accordion">{block.items.map((item, index) => <details key={index} open={item.open}>
      <summary>{item.title}</summary>
      <div className="mgu-accordion__body"><UiBlocks blocks={item.items} /></div>
    </details>)}</div>
  }
}

function UiHeading({ text, level, eyebrow }: { text: Value; level: 1 | 2 | 3; eyebrow?: string }) {
  const value = asText(useValue(text))
  const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4"
  return <div className={`mgu-heading is-${level}`}>{eyebrow ? <p className="mgu-eyebrow">{eyebrow}</p> : null}<Tag><RichText text={value} /></Tag></div>
}

function UiText({ text, tone }: { text: Value; tone: string }) {
  const value = asText(useValue(text))
  return <p className={`mgu-text is-${tone}`}><RichText text={value} /></p>
}

function UiBadge({ text }: { text: Value }) {
  return <span className="mgu-badge">{asText(useValue(text))}</span>
}

const CALLOUT_ICON = { note: StickyNote, info: Info, success: CheckCircle2, warning: AlertTriangle } as const

function UiCallout({ tone, title, text }: { tone: keyof typeof CALLOUT_ICON; title?: string; text: Value }) {
  const value = asText(useValue(text))
  const Icon = CALLOUT_ICON[tone]
  return <div className={`mgu-callout is-${tone}`} role={tone === "warning" ? "alert" : "note"}>
    <span className="mgu-callout__icon" aria-hidden="true"><Icon /></span>
    <div>{title ? <p className="mgu-callout__title">{title}</p> : null}<p className="mgu-callout__text"><RichText text={value} /></p></div>
  </div>
}

function UiMetric({ block }: { block: Extract<Block, { type: "metric" }> }) {
  const value = useValue(block.value)
  const delta = useValue(block.delta)
  const change = typeof delta === "number" ? delta : typeof delta === "string" ? Number.parseFloat(delta.replace(",", ".").replace(/[^\d.+-]/gu, "")) : Number.NaN
  return <div className="mgu-metric">
    <p className="mgu-metric__label">{block.label}</p>
    <p className="mgu-metric__value">{showValue(value, block)}</p>
    {delta !== null ? <p className={`mgu-metric__delta${change > 0 ? " is-up" : change < 0 ? " is-down" : ""}`}>
      {change > 0 ? <ArrowUp aria-hidden="true" /> : change < 0 ? <ArrowDown aria-hidden="true" /> : null}
      {typeof delta === "number" ? `${delta > 0 ? "+" : ""}${showValue(delta, { digits: block.digits })}` : asText(delta)}
    </p> : null}
    {block.hint ? <p className="mgu-metric__hint">{block.hint}</p> : null}
  </div>
}

function UiProgress({ label, value, max, status }: { label: string; value: Value; max: number; status: string }) {
  const resolved = useValue(value)
  const number = typeof resolved === "number" ? Math.max(0, Math.min(max, resolved)) : 0
  const share = Math.round((number / max) * 100)
  return <div className={`mgu-progress is-${status}`}>
    <div className="mgu-progress__top"><span>{label}</span><span>{share}%</span></div>
    <div className="mgu-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={number}><span style={{ width: `${share}%` }} /></div>
  </div>
}

function UiCode({ code, language, filename }: { code: string; language?: string; filename?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 1400); return () => window.clearTimeout(timer) }, [copied])
  const copy = () => { void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {}) }
  return <div className="mgu-code">
    <div className="mgu-code__bar"><span>{filename || language || "Код"}</span><button type="button" className="mgu-iconbtn" onClick={copy} aria-label={copied ? "Скопировано" : "Скопировать код"}>{copied ? <Check /> : <Copy />}</button></div>
    <pre><code>{code}</code></pre>
  </div>
}

function UiCitation({ block }: { block: Extract<Block, { type: "citation" }> }) {
  const { sources } = useContext(UiContext)
  if (block.ref) {
    const source = sources[block.ref - 1]
    const href = source ? safeHttps(source.url) : ""
    if (!source || !href) return null
    return <a className="mgu-cite" href={href} target="_blank" rel="noopener noreferrer nofollow"><span className="mgu-cite__n">{block.ref}</span>{block.label || source.title || citationName(source)}<ExternalLink aria-hidden="true" /></a>
  }
  if (!block.url) return null
  return <a className={`mgu-cite${block.unverified ? " is-unverified" : ""}`} href={block.url} target="_blank" rel="noopener noreferrer nofollow" title={block.unverified ? "Ссылки нет среди источников ответа" : undefined}>
    {block.label || hostOf(block.url)}{block.unverified ? <span className="mgu-cite__flag">не проверено</span> : null}<ExternalLink aria-hidden="true" />
  </a>
}

/* ---------------------------------------------------------------- photos */

function UiPhoto({ image, aspect, inCard = false }: { image: ImageRef; aspect: "wide" | "square" | "portrait" | "banner"; inCard?: boolean }) {
  const plan = useMemo<ReferenceVisualPlan>(() => ({ topic: image.query, queries: [image.query], explicit: true, layout: aspect === "portrait" ? "portrait" : "landscape" }), [image.query, aspect])
  const box = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const [result, setResult] = useState<{ topic: string; images: MalikVisualImage[] } | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState("")
  useEffect(() => {
    const node = box.current
    if (!node || near) return
    if (typeof IntersectionObserver === "undefined") { queueMicrotask(() => setNear(true)); return }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect() } }, { rootMargin: "240px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [near])
  useEffect(() => {
    if (!near) return
    let alive = true
    const stop = subscribeReferenceImages(plan, (images) => { if (alive) setResult({ topic: plan.topic, images }) })
    return () => { alive = false; stop() }
  }, [near, plan, attempt])
  const images = result?.topic === plan.topic ? result.images : null
  const photo = images?.find((item) => isSafeVisualUrl(item.url) && !failed.includes(item.url)) || null
  const status = !images ? "loading" : photo ? "ready" : "empty"
  const source = photo ? safeHttps(photo.sourceUrl || "") || photo.url : ""
  const credit = photo ? photo.credit || hostOf(photo.sourceUrl || photo.url) || "Источник фото" : ""
  const label = image.alt || image.caption || image.query
  return <figure ref={box} className={`mgu-photo is-${aspect} is-${status}${inCard ? " in-card" : ""}`} data-photo-status={status}>
    <div className="mgu-photo__frame">
      {photo ? <img src={photo.url} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={loaded === photo.url ? "is-loaded" : undefined}
        onLoad={() => setLoaded(photo.url)}
        onError={() => { setFailed((list) => [...list, photo.url]); if (reportReferenceImageFailure(plan, photo.url)) setAttempt((value) => value + 1) }} /> : null}
      {status === "empty" ? <div className="mgu-photo__empty" role="img" aria-label={`Проверенное фото не найдено: ${label}`}><ImageOff aria-hidden="true" /><span>Проверенное фото не найдено</span></div> : null}
      {photo ? <a className="mgu-photo__credit" href={source} target="_blank" rel="noopener noreferrer nofollow" title={[photo.credit, photo.license].filter(Boolean).join(" · ") || source} aria-label={`Источник фото: ${credit}`}>{credit}</a> : null}
    </div>
    {image.caption && !inCard ? <figcaption>{image.caption}</figcaption> : null}
  </figure>
}

/* ----------------------------------------------------------------- cards */

function UiCard({ block }: { block: Extract<Block, { type: "card" }> }) {
  const title = asText(useValue(block.title))
  const body = asText(useValue(block.body))
  const variant = block.variant || "plain"
  const href = block.href ? safeHttps(block.href) : ""
  return <article className={`mgu-card is-${variant}${block.image ? " has-image" : ""}`}>
    {block.image ? <UiPhoto image={block.image} aspect={variant === "hero" ? "banner" : "wide"} inCard /> : null}
    <div className="mgu-card__body">
      {block.number || block.badge ? <div className="mgu-card__top">
        {block.number ? <span className="mgu-card__number">{block.number}</span> : null}
        {block.badge ? <span className="mgu-badge">{block.badge}</span> : null}
      </div> : null}
      {block.eyebrow ? <p className="mgu-eyebrow">{block.eyebrow}</p> : null}
      {title ? <h4 className="mgu-card__title">{href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{title}<ExternalLink aria-hidden="true" /></a> : <RichText text={title} />}</h4> : null}
      {body ? <p className="mgu-card__text"><RichText text={body} /></p> : null}
      {block.items?.length ? <div className="mgu-card__items"><UiBlocks blocks={block.items} /></div> : null}
      {block.footer ? <p className="mgu-card__footer">{block.footer}</p> : null}
    </div>
  </article>
}

/* ----------------------------------------------------------------- table */

type Cell = ExprValue | null
function compareCells(a: Cell, b: Cell) {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), "ru", { numeric: true })
}

function UiTable({ block }: { block: TableBlock }) {
  const { scope, uid } = useContext(UiContext)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [query, setQuery] = useState("")
  const rows = useMemo(() => block.rows.map((row, index) => ({ index, cells: Object.fromEntries(block.columns.map((column) => [column.key, row[column.key] === null || row[column.key] === undefined ? null : resolveValue(row[column.key] as Value, scope)])) as Record<string, Cell> })), [block, scope])
  const numeric = useMemo(() => new Set(block.columns.filter((column) => {
    const values = rows.map((row) => row.cells[column.key]).filter((value) => value !== null)
    return values.length > 0 && values.every((value) => typeof value === "number")
  }).map((column) => column.key)), [block.columns, rows])
  const needle = query.trim().toLocaleLowerCase("ru")
  const shown = useMemo(() => {
    const filtered = needle ? rows.filter((row) => Object.values(row.cells).some((value) => asText(value).toLocaleLowerCase("ru").includes(needle))) : rows
    return sort ? [...filtered].sort((a, b) => compareCells(a.cells[sort.key], b.cells[sort.key]) * sort.dir) : filtered
  }, [rows, needle, sort])
  const toggle = (key: string) => setSort((current) => !current || current.key !== key ? { key, dir: numeric.has(key) ? -1 : 1 } : current.dir === (numeric.has(key) ? -1 : 1) ? { key, dir: current.dir === 1 ? -1 : 1 } : null)
  const label = block.caption || "Таблица"
  return <figure className="mgu-table">
    {block.caption || block.origin || block.filterable ? <div className="mgu-table__head">
      {block.caption ? <figcaption className="mgu-table__caption">{block.caption}</figcaption> : <span />}
      <div className="mgu-table__tools">
        {block.filterable ? <label className="mgu-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти" aria-label={`Поиск в таблице «${label}»`} id={`${uid}-search`} /></label> : null}
        <OriginBadge origin={block.origin} />
      </div>
    </div> : null}
    <div className="mgu-table__scroll" tabIndex={0} role="region" aria-label={label}>
      <table>
        <thead><tr>{block.columns.map((column) => {
          const align = column.align || (numeric.has(column.key) ? "right" : "left")
          const active = sort?.key === column.key
          return <th key={column.key} scope="col" className={`is-${align}`} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>
            {block.sortable !== false && rows.length > 1 ? <button type="button" onClick={() => toggle(column.key)} aria-label={`Сортировать по «${column.label}»`}>
              <span>{column.label}</span>{active ? (sort!.dir === 1 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" className="is-idle" />}
            </button> : column.label}
          </th>
        })}</tr></thead>
        <tbody>{shown.map((row) => <tr key={row.index} className={row.index === block.highlight ? "is-highlight" : undefined}>
          {block.columns.map((column, at) => {
            const value = row.cells[column.key]
            const align = column.align || (numeric.has(column.key) ? "right" : "left")
            const content = typeof value === "number" ? showValue(value, column) : value === null ? <span className="mgu-muted">—</span> : <RichText text={asText(value)} />
            return at === 0 ? <th key={column.key} scope="row" className={`is-${align}`}>{content}</th> : <td key={column.key} className={`is-${align}`}>{content}</td>
          })}
        </tr>)}</tbody>
      </table>
      {!shown.length ? <p className="mgu-table__empty">Ничего не найдено</p> : null}
    </div>
  </figure>
}

/* ----------------------------------------------------------------- chart */

function UiChart({ block }: { block: ChartBlock }) {
  const { scope } = useContext(UiContext)
  const [hidden, setHidden] = useState<string[]>([])
  const data = useMemo(() => ({
    labels: block.labels,
    series: block.series.map((series) => ({ name: series.name, values: series.values.map((value) => { const resolved = resolveValue(value, scope); return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : null }) })),
  }), [block, scope])
  const unit = block.format === "percent" ? "%" : block.unit
  const pie = block.kind === "pie" || block.kind === "donut"
  const scatter = block.kind === "scatter" ? data.series.map((series) => ({
    name: series.name,
    points: series.values.flatMap((y, index) => { const x = Number(String(block.labels[index]).replace(",", ".")); return y === null ? [] : [{ x: Number.isFinite(x) ? x : index + 1, y, label: block.labels[index] }] }),
  })) : undefined
  const height = block.kind === "hbar" ? Math.min(560, Math.max(170, block.labels.length * (22 + 14 * data.series.length) + 44)) : pie ? 250 : 270
  const slices = pie ? pieSlices(data) : []
  const legend = pie ? slices.map((slice) => ({ name: slice.label, color: slice.color, extra: `${showValue(slice.value, { unit, format: block.format, digits: block.digits })} · ${Math.round(slice.share)}%` }))
    : data.series.length > 1 ? data.series.map((series, index) => ({ name: series.name, color: SERIES_COLORS[index % SERIES_COLORS.length], extra: "" })) : []
  const summary = `${block.title || "График"}: ${data.labels.map((label, index) => `${label} — ${data.series.map((series) => showValue(series.values[index], { unit, format: block.format, digits: block.digits })).join(", ")}`).join("; ")}`
  return <figure className="mgu-chart" aria-label={summary}>
    <div className="mgu-chart__head">
      {block.title ? <h4 className="mgu-chart__title">{block.title}</h4> : <span />}
      <OriginBadge origin={block.origin} />
    </div>
    <ChartView kind={block.kind === "scatter" ? "scatter" : block.kind} data={data} unit={unit} height={height} hidden={pie ? [] : hidden} scatter={scatter} xLabel={block.xLabel} yLabel={block.yLabel} />
    {legend.length ? <div className="mgu-legend" role={pie ? "list" : "group"} aria-label="Легенда">
      {legend.map((item) => pie
        ? <span key={item.name} className="mgu-legend__item" role="listitem"><span className="mgu-legend__dot" style={{ background: item.color }} />{item.name}<b>{item.extra}</b></span>
        : <button key={item.name} type="button" className={`mgu-legend__item${hidden.includes(item.name) ? " is-off" : ""}`} aria-pressed={!hidden.includes(item.name)} onClick={() => setHidden((list) => list.includes(item.name) ? list.filter((name) => name !== item.name) : list.length + 1 < data.series.length ? [...list, item.name] : list)}>
          <span className="mgu-legend__dot" style={{ background: item.color }} />{item.name}
        </button>)}
    </div> : null}
    {block.note ? <figcaption className="mgu-note">{block.note}</figcaption> : null}
  </figure>
}

/* ------------------------------------------------------------- diagrams */

function UiFlow({ nodes, edges, direction }: { nodes: Array<{ id: string; label: string; detail?: string }>; edges: Array<{ from: string; to: string; label?: string }>; direction: "down" | "right" }) {
  const { uid } = useContext(UiContext)
  const layout = useMemo(() => layoutGraph(nodes.map((node) => ({ id: node.id, label: node.label })), edges, direction), [nodes, edges, direction])
  const [active, setActive] = useState<string | null>(null)
  const marker = `mgu-arrow-${uid}`
  const near = new Set<string>()
  if (active) { near.add(active); for (const edge of edges) { if (edge.from === active) near.add(edge.to); if (edge.to === active) near.add(edge.from) } }
  const described = nodes.filter((node) => node.detail)
  return <figure className={`mgu-flow${active ? " has-focus" : ""}`}>
    <div className="mgu-flow__scroll" tabIndex={0} role="region" aria-label={`Схема из ${nodes.length} блоков`}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: "100%", maxWidth: Math.round(layout.width * 1.15), minWidth: Math.round(layout.width * 0.62) }} role="img" aria-label={nodes.map((node) => node.label).join(" → ")}>
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8a8a" /></marker>
          <marker id={`${marker}-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f5f5f5" /></marker>
        </defs>
        {layout.edges.map((edge) => {
          const lit = Boolean(active && (edge.from === active || edge.to === active))
          return <path key={edge.id} className={`mgu-flow__edge${lit ? " is-lit" : ""}`} d={edge.points.map((point, at) => `${at ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ")} strokeDasharray={edge.dashed || edge.back ? "4 3" : undefined} markerEnd={`url(#${lit ? `${marker}-on` : marker})`} />
        })}
        {layout.edges.filter((edge) => edge.label && edge.labelAt).map((edge) => {
          const width = edge.label!.length * 6 + 16
          return <g key={`${edge.id}-label`} className="mgu-flow__label" transform={`translate(${edge.labelAt![0] - width / 2} ${edge.labelAt![1] - 9})`}><rect width={width} height={18} rx={9} /><text x={width / 2} y={12.5} textAnchor="middle">{edge.label}</text></g>
        })}
        {layout.nodes.map((node) => <g key={node.id} className={`mgu-flow__node${near.has(node.id) ? " is-near" : ""}${active === node.id ? " is-active" : ""}`} transform={`translate(${node.x} ${node.y})`} onClick={() => setActive(active === node.id ? null : node.id)}>
          <rect width={node.w} height={node.h} rx={11} />
          <text textAnchor="middle">{node.lines.map((line, at) => <tspan key={at} x={node.w / 2} y={node.h / 2 + (at - (node.lines.length - 1) / 2) * 15 + 4}>{line}</tspan>)}</text>
        </g>)}
      </svg>
    </div>
    {described.length ? <ol className="mgu-flow__legend">{described.map((node) => <li key={node.id}>
      <button type="button" className={active === node.id ? "is-active" : undefined} aria-pressed={active === node.id} onClick={() => setActive(active === node.id ? null : node.id)}>
        <strong>{node.label}</strong><span>{node.detail}</span>
      </button>
    </li>)}</ol> : null}
  </figure>
}

type TreeNode = { label: string; detail?: string; children?: TreeNode[] }
function UiTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  return <div className={`mgu-tree__node depth-${Math.min(depth, 3)}`} role="treeitem" aria-expanded={node.children?.length ? true : undefined}>
    <div className="mgu-tree__label"><strong>{node.label}</strong>{node.detail ? <span>{node.detail}</span> : null}</div>
    {node.children?.length ? <div className="mgu-tree__children" role="group">{node.children.map((child, index) => <UiTreeNode key={`${child.label}-${index}`} node={child} depth={depth + 1} />)}</div> : null}
  </div>
}

/* -------------------------------------------------------------- controls */

function UiControl({ block }: { block: ControlBlock }) {
  const { scope, set, uid } = useContext(UiContext)
  const id = `${uid}-${block.bind}`
  const value = scope[block.bind]
  const min = block.min ?? 0
  const max = block.max ?? 100
  const step = block.step ?? 1
  const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min))
  const options = block.options || []
  const radio = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = options.findIndex((option) => option.value === value)
    const move = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!move) return
    event.preventDefault()
    const next = options[(at + move + options.length) % options.length]
    set(block.bind, next.value)
    const target = event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)]
    target?.focus()
  }
  if (block.kind === "toggle") return <div className="mgu-control is-toggle">
    <span id={`${id}-label`}>{block.label}</span>
    <button type="button" role="switch" aria-checked={Boolean(value)} aria-labelledby={`${id}-label`} className="mgu-switch" onClick={() => set(block.bind, !value)}><span /></button>
  </div>
  if (block.kind === "select") return <div className="mgu-control">
    <label htmlFor={id}>{block.label}</label>
    <select id={id} value={String(options.findIndex((option) => option.value === value))} onChange={(event) => { const option = options[Number(event.target.value)]; if (option) set(block.bind, option.value) }}>
      {options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
    </select>
  </div>
  if (block.kind === "segmented") return <div className="mgu-control">
    <span id={`${id}-label`}>{block.label}</span>
    <div className="mgu-segmented" role="radiogroup" aria-labelledby={`${id}-label`} onKeyDown={radio}>
      {options.map((option, index) => <button key={index} type="button" role="radio" aria-checked={option.value === value} tabIndex={option.value === value || (index === 0 && !options.some((item) => item.value === value)) ? 0 : -1} onClick={() => set(block.bind, option.value)}>{option.label}</button>)}
    </div>
  </div>
  const number = typeof value === "number" ? value : min
  if (block.kind === "number") return <div className="mgu-control">
    <label htmlFor={id}>{block.label}{block.unit ? <span className="mgu-muted"> · {block.unit}</span> : null}</label>
    <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={number} onChange={(event) => { if (event.target.value !== "") set(block.bind, clamp(Number(event.target.value))) }} />
  </div>
  return <div className="mgu-control is-slider">
    <div className="mgu-control__top"><label htmlFor={id}>{block.label}</label><output htmlFor={id}>{showValue(number, { unit: block.unit })}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={number} onChange={(event) => set(block.bind, clamp(Number(event.target.value)))} style={{ ["--mgu-fill" as string]: `${((number - min) / (max - min || 1)) * 100}%` }} />
    <div className="mgu-control__range" aria-hidden="true"><span>{showValue(min, { unit: block.unit })}</span><span>{showValue(max, { unit: block.unit })}</span></div>
  </div>
}

function UiTabs({ tabs }: { tabs: Array<{ label: string; items: Block[] }> }) {
  const { uid } = useContext(UiContext)
  const [selected, setSelected] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const current = Math.min(selected, tabs.length - 1)
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    const index = (next + tabs.length) % tabs.length
    setSelected(index)
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[index]?.focus()
  }
  return <div className="mgu-tabs">
    <div ref={list} className="mgu-tabs__list" role="tablist" onKeyDown={onKey}>
      {tabs.map((tab, index) => <button key={index} type="button" role="tab" id={`${uid}-tab-${index}`} aria-selected={index === current} aria-controls={`${uid}-panel-${index}`} tabIndex={index === current ? 0 : -1} onClick={() => setSelected(index)}>{tab.label}</button>)}
    </div>
    <div className="mgu-tabs__panel" role="tabpanel" id={`${uid}-panel-${current}`} aria-labelledby={`${uid}-tab-${current}`}><UiBlocks blocks={tabs[current].items} /></div>
  </div>
}

/* ------------------------------------------------------- pending, fallback */

const SKELETON: Record<string, number> = { chart: 300, table: 170, flow: 240, tree: 160, image: 220, gallery: 200, card: 150, grid: 170, section: 180, tabs: 200, timeline: 180, metric: 96, control: 64, code: 120 }

function UiSkeleton({ type }: { type?: string }) {
  return <div className="mgu-skeleton" style={{ height: SKELETON[type || ""] || 56 }} aria-hidden="true" />
}

function UiFallback({ children }: { children: ReactNode }) {
  return <div className="mgu-fallback" data-malik-ui-fallback role="note">
    {children}
    <p className="mgu-fallback__note">Визуальный блок не прошёл проверку, поэтому показан его текст.</p>
  </div>
}
