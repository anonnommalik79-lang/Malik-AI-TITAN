import { exprVariables, parseExpr } from "./expr"
import { BLOCK_TYPES, UI_LIMITS, UI_VERSION, type Block, type BlockType, type DataOrigin, type Format, type ImageRef, type UiDocument, type Value } from "./protocol"

/**
 * Validation, repair and quality control of a model's composition before the
 * chat draws it. Everything is checked against a closed list: unknown blocks
 * and fields are dropped, text is clipped, numbers must be finite, every
 * expression must parse and read only declared state, a chart must say where
 * its numbers come from (otherwise it is labelled an illustration), ragged
 * tables and charts are squared, links must be https and citations must match
 * the answer's real sources. Fixes are listed so tests and logs can see them;
 * what cannot be repaired is removed. Pure: the server and the browser run it.
 */

export type UiSource = { url?: string; title?: string }
export type UiCheck = { doc: UiDocument | null; issues: string[]; fixes: string[] }

type Ctx = { issues: string[]; fixes: string[]; state: Record<string, number | string | boolean>; blocks: number; images: number; sources: UiSource[] }

// eslint-disable-next-line no-control-regex -- control characters are removed on purpose
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu
const str = (value: unknown, max: number) => (typeof value === "string" || typeof value === "number" ? String(value) : "").replace(CONTROL, "").trim().slice(0, max)
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {})
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const oneOf = <T extends string | number>(value: unknown, options: readonly T[], fallback?: T): T | undefined => ((options as readonly unknown[]).includes(value) ? value as T : fallback)
const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : null)

const FORMATS: readonly Format[] = ["number", "percent", "currency", "compact", "text"]
const ORIGINS: readonly DataOrigin[] = ["user", "sources", "computed", "illustrative"]

function checkExpr(source: string, ctx: Ctx, where: string): string | null {
  const text = str(source, 400)
  if (!text) return null
  try {
    const missing = [...exprVariables(parseExpr(text))].filter((name) => !Object.prototype.hasOwnProperty.call(ctx.state, name))
    if (missing.length) { ctx.issues.push(`${where}: unknown variable ${missing.join(", ")}`); return null }
    return text
  } catch (error) {
    ctx.issues.push(`${where}: ${error instanceof Error ? error.message : "bad expression"}`)
    return null
  }
}

function value(raw: unknown, ctx: Ctx, where: string, max: number = UI_LIMITS.text): Value | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { expr?: unknown }).expr === "string") {
    const expr = checkExpr((raw as { expr: string }).expr, ctx, where)
    return expr ? { expr } : null
  }
  const n = typeof raw === "number" ? (Number.isFinite(raw) ? raw : null) : null
  if (n !== null) return n
  const text = str(raw, max)
  return text || null
}

function image(raw: unknown, ctx: Ctx, where: string): ImageRef | null {
  const data = obj(raw)
  const query = str(data.query ?? data.subject ?? data.search, 120)
  if (!query || /^(?:https?:|data:|\/\/)/iu.test(query)) {
    ctx.issues.push(`${where}: an image needs a search subject, not a URL`)
    return null
  }
  if (ctx.images >= UI_LIMITS.images) { ctx.fixes.push(`${where}: image dropped (limit ${UI_LIMITS.images})`); return null }
  ctx.images += 1
  return { query, ...(str(data.alt, 160) ? { alt: str(data.alt, 160) } : {}), ...(str(data.caption, 160) ? { caption: str(data.caption, 160) } : {}) }
}

function safeHref(raw: unknown, allowAppPaths = false) {
  const text = str(raw, 600)
  if (!text) return undefined
  if (allowAppPaths && /^\/(?!\/)[\w\-./?=&%]*$/u.test(text)) return text
  try {
    const url = new URL(text)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

function sameSource(url: string, sources: UiSource[]) {
  try {
    const target = new URL(url)
    return sources.some((source) => {
      if (!source.url) return false
      try { const known = new URL(source.url); return known.hostname.replace(/^www\./u, "") === target.hostname.replace(/^www\./u, "") && (known.pathname === target.pathname || target.pathname === "/" || known.pathname.startsWith(target.pathname)) } catch { return false }
    })
  } catch { return false }
}

function children(raw: unknown, ctx: Ctx, depth: number, where: string): Block[] {
  if (depth >= UI_LIMITS.depth) { if (arr(raw).length) ctx.fixes.push(`${where}: nested blocks below depth ${UI_LIMITS.depth} dropped`); return [] }
  return arr(raw).map((item, index) => block(item, ctx, depth + 1, `${where}.${index}`)).filter((item): item is Block => Boolean(item))
}

function block(raw: unknown, ctx: Ctx, depth: number, where: string): Block | null {
  const data = obj(raw)
  const type = data.type as BlockType
  if (!BLOCK_TYPES.includes(type)) { ctx.issues.push(`${where}: unknown block type ${JSON.stringify(data.type)}`); return null }
  if (ctx.blocks >= UI_LIMITS.blocks) { ctx.fixes.push(`${where}: block limit ${UI_LIMITS.blocks} reached`); return null }
  ctx.blocks += 1
  const base: { id?: string; when?: string } = {}
  if (str(data.id, 40)) base.id = str(data.id, 40)
  if (typeof data.when === "string") { const when = checkExpr(data.when, ctx, `${where}.when`); if (when) base.when = when }
  const at = (name: string) => `${where}(${type}).${name}`

  switch (type) {
    case "heading": {
      const text = value(data.text, ctx, at("text"), 200)
      return text === null ? null : { ...base, type, text, level: oneOf(data.level, [1, 2, 3] as const, 2), ...(str(data.eyebrow, 80) ? { eyebrow: str(data.eyebrow, 80) } : {}) }
    }
    case "text": {
      const text = value(data.text, ctx, at("text"))
      return text === null ? null : { ...base, type, text, tone: oneOf(data.tone, ["body", "lead", "muted", "small"] as const, "body") }
    }
    case "badge": { const text = value(data.text, ctx, at("text"), 40); return text === null ? null : { ...base, type, text } }
    case "divider": return { ...base, type }
    case "list": {
      const items = arr(data.items).slice(0, 30).map((item) => typeof item === "string" ? str(item, 400) : (() => { const o = obj(item); const title = str(o.title ?? o.label, 160); return title ? { title, ...(str(o.text ?? o.detail, 400) ? { text: str(o.text ?? o.detail, 400) } : {}) } : "" })()).filter(Boolean) as Array<string | { title: string; text?: string }>
      return items.length ? { ...base, type, items, style: oneOf(data.style, ["bullet", "number", "check"] as const, "bullet") } : null
    }
    case "quote": { const text = str(data.text, 600); return text ? { ...base, type, text, ...(str(data.author, 80) ? { author: str(data.author, 80) } : {}), ...(str(data.label, 80) ? { label: str(data.label, 80) } : {}) } : null }
    case "callout": {
      const text = value(data.text, ctx, at("text"))
      return text === null ? null : { ...base, type, text, tone: oneOf(data.tone, ["note", "info", "success", "warning"] as const, "note"), ...(str(data.title, 120) ? { title: str(data.title, 120) } : {}) }
    }
    case "image": { const img = image(data.image ?? data, ctx, at("image")); return img ? { ...base, type, image: img, aspect: oneOf(data.aspect, ["wide", "square", "portrait", "banner"] as const, "wide") } : null }
    case "gallery": {
      const images = arr(data.images).slice(0, 8).map((item, index) => image(item, ctx, at(`images.${index}`))).filter((item): item is ImageRef => Boolean(item))
      return images.length ? { ...base, type, images } : null
    }
    case "metric": {
      const label = str(data.label, 80)
      const metricValue = value(data.value, ctx, at("value"), 40)
      if (!label || metricValue === null) { ctx.issues.push(`${at("value")}: a metric needs a label and a value`); return null }
      const delta = data.delta === undefined ? null : value(data.delta, ctx, at("delta"), 24)
      return { ...base, type, label, value: metricValue, ...(str(data.unit, 16) ? { unit: str(data.unit, 16) } : {}), ...(oneOf(data.format, FORMATS) ? { format: oneOf(data.format, FORMATS) } : {}), ...(finite(data.digits) !== null ? { digits: Math.max(0, Math.min(6, finite(data.digits)!)) } : {}), ...(delta !== null ? { delta } : {}), ...(str(data.hint, 160) ? { hint: str(data.hint, 160) } : {}) }
    }
    case "progress": {
      const label = str(data.label, 120)
      const progressValue = value(data.value, ctx, at("value"), 20)
      if (!label || progressValue === null) return null
      return { ...base, type, label, value: progressValue, max: Math.max(1, finite(data.max) ?? 100), status: oneOf(data.status, ["pending", "running", "done", "failed"] as const, "running") }
    }
    case "code": { const code = String(data.code ?? "").replace(CONTROL, "").slice(0, 20_000); return code.trim() ? { ...base, type, code, ...(str(data.language, 24) ? { language: str(data.language, 24) } : {}), ...(str(data.filename, 120) ? { filename: str(data.filename, 120) } : {}) } : null }
    case "file": {
      const name = str(data.name, 160)
      if (!name) return null
      const href = safeHref(data.href, true)
      if (data.href && !href) ctx.fixes.push(`${at("href")}: unsafe link removed`)
      return { ...base, type, name, ...(str(data.note, 200) ? { note: str(data.note, 200) } : {}), ...(str(data.size, 24) ? { size: str(data.size, 24) } : {}), ...(href ? { href } : {}) }
    }
    case "citation": {
      const ref = finite(data.ref)
      if (ref !== null) {
        if (ref >= 1 && ref <= ctx.sources.length) return { ...base, type, ref, ...(str(data.label, 120) ? { label: str(data.label, 120) } : {}) }
        ctx.issues.push(`${at("ref")}: source [${ref}] does not exist in this answer`)
        return null
      }
      const url = safeHref(data.url)
      if (!url) return null
      const known = sameSource(url, ctx.sources)
      if (!known) ctx.fixes.push(`${at("url")}: link is not one of the answer's sources — shown as unverified`)
      return { ...base, type, url, ...(str(data.label, 120) ? { label: str(data.label, 120) } : {}), ...(known ? {} : { unverified: true }) }
    }
    case "table": {
      let columns = arr(data.columns).slice(0, UI_LIMITS.tableColumns).map((column) => {
        const o = typeof column === "string" ? { key: column, label: column } : obj(column)
        const key = str(o.key ?? o.label, 40)
        return key ? { key, label: str(o.label ?? key, 60) || key, ...(oneOf(o.align, ["left", "right", "center"] as const) ? { align: oneOf(o.align, ["left", "right", "center"] as const) } : {}), ...(oneOf(o.format, FORMATS) ? { format: oneOf(o.format, FORMATS) } : {}), ...(finite(o.digits) !== null ? { digits: Math.max(0, Math.min(6, finite(o.digits)!)) } : {}), ...(str(o.unit, 12) ? { unit: str(o.unit, 12) } : {}) } : null
      }).filter((column): column is NonNullable<typeof column> => Boolean(column))
      const seen = new Set<string>()
      columns = columns.filter((column) => (seen.has(column.key) ? false : (seen.add(column.key), true)))
      let rawRows = arr(data.rows)
      if (rawRows.length > UI_LIMITS.tableRows) { ctx.fixes.push(`${at("rows")}: ${rawRows.length - UI_LIMITS.tableRows} rows beyond the limit dropped`); rawRows = rawRows.slice(0, UI_LIMITS.tableRows) }
      if (!columns.length && rawRows.length) {
        const first = Array.isArray(rawRows[0]) ? (rawRows[0] as unknown[]).map((_, index) => `c${index + 1}`) : Object.keys(obj(rawRows[0]))
        columns = first.slice(0, UI_LIMITS.tableColumns).map((key) => ({ key, label: key }))
        ctx.fixes.push(`${at("columns")}: columns derived from the first row`)
      }
      if (!columns.length) { ctx.issues.push(`${at("columns")}: a table needs columns`); return null }
      let ragged = false
      const rows = rawRows.map((row) => {
        const cells = Array.isArray(row) ? Object.fromEntries((row as unknown[]).map((cell, index) => [columns[index]?.key, cell]).filter(([key]) => key)) : obj(row)
        if (Object.keys(cells).some((key) => !seen.has(key) && !columns.some((column) => column.key === key)) || columns.some((column) => !(column.key in cells))) ragged = true
        return Object.fromEntries(columns.map((column) => [column.key, cells[column.key] === undefined || cells[column.key] === null || cells[column.key] === "" ? null : value(cells[column.key], ctx, at(`cell ${column.key}`), 200)]))
      })
      if (ragged) ctx.fixes.push(`${at("rows")}: rows squared to the columns (missing cells shown as —)`)
      return { ...base, type, columns, rows, ...(str(data.caption, 200) ? { caption: str(data.caption, 200) } : {}), sortable: data.sortable !== false, filterable: rows.length > 8 ? data.filterable !== false : data.filterable === true, ...(finite(data.highlight) !== null ? { highlight: finite(data.highlight)! } : {}), ...(oneOf(data.origin, ORIGINS) ? { origin: oneOf(data.origin, ORIGINS) } : {}) }
    }
    case "chart": {
      const kind = oneOf(data.kind, ["bar", "hbar", "line", "area", "pie", "donut", "scatter"] as const, "bar")!
      let labels = arr(data.labels).slice(0, UI_LIMITS.chartPoints).map((label) => str(label, 40))
      let series = arr(data.series).slice(0, UI_LIMITS.chartSeries).map((item, index) => { const o = obj(item); return { name: str(o.name, 60) || `#${index + 1}`, raw: arr(o.values ?? o.data) } })
      // A single list of {label, value} points is accepted too.
      if (!series.length && arr(data.data).length) {
        const points = arr(data.data).slice(0, UI_LIMITS.chartPoints).map(obj)
        labels = points.map((point) => str(point.label ?? point.x ?? point.name, 40))
        series = [{ name: str(data.title, 60) || "", raw: points.map((point) => point.value ?? point.y) }]
      }
      if (!labels.length || !series.length) { ctx.issues.push(`${at("data")}: a chart needs labels and at least one series`); return null }
      const fixedSeries = series.map((item) => {
        let values = item.raw.slice(0, labels.length).map((raw, index) => value(raw, ctx, at(`${item.name}[${index}]`), 40))
        if (values.length < labels.length) { ctx.fixes.push(`${at("series")}: «${item.name}» padded to ${labels.length} points`); values = [...values, ...Array(labels.length - values.length).fill(null)] }
        if (item.raw.length > labels.length) ctx.fixes.push(`${at("series")}: «${item.name}» trimmed to ${labels.length} points`)
        const bad = values.filter((entry) => entry === null || (typeof entry === "string")).length
        if (bad) ctx.fixes.push(`${at("series")}: «${item.name}» has ${bad} missing or non-numeric values (gaps)`)
        return { name: item.name, values: values.map((entry) => (entry === null || typeof entry === "string" ? 0 : entry)) as Value[] }
      })
      if (fixedSeries.every((item) => item.values.every((entry) => entry === 0))) { ctx.issues.push(`${at("series")}: no numeric data — a chart without data is not drawn`); return null }
      let origin = oneOf(data.origin, ORIGINS)
      if (!origin) { origin = "illustrative"; ctx.fixes.push(`${at("origin")}: data origin not stated — labelled as an illustration, not measured data`) }
      const pie = kind === "pie" || kind === "donut"
      return {
        ...base, type, kind, labels, series: pie ? fixedSeries.slice(0, 1) : fixedSeries, origin,
        ...(str(data.title, 120) ? { title: str(data.title, 120) } : {}), ...(str(data.unit, 16) ? { unit: str(data.unit, 16) } : {}),
        ...(oneOf(data.format, FORMATS) ? { format: oneOf(data.format, FORMATS) } : {}), ...(finite(data.digits) !== null ? { digits: Math.max(0, Math.min(6, finite(data.digits)!)) } : {}),
        ...(str(data.xLabel, 60) ? { xLabel: str(data.xLabel, 60) } : {}), ...(str(data.yLabel, 60) ? { yLabel: str(data.yLabel, 60) } : {}), ...(str(data.note, 200) ? { note: str(data.note, 200) } : {}),
      }
    }
    case "timeline": {
      const items = arr(data.items).slice(0, UI_LIMITS.timelineItems).map(obj).map((item) => ({ date: str(item.date ?? item.when, 40), title: str(item.title ?? item.label, 160), ...(str(item.text ?? item.detail, 400) ? { text: str(item.text ?? item.detail, 400) } : {}), ...(oneOf(item.status, ["done", "active", "next"] as const) ? { status: oneOf(item.status, ["done", "active", "next"] as const) } : {}) })).filter((item) => item.title)
      return items.length ? { ...base, type, items } : null
    }
    case "flow": {
      const ids = new Set<string>()
      const nodes = arr(data.nodes).slice(0, UI_LIMITS.flowNodes).map(obj).map((node, index) => ({ id: str(node.id, 40) || `n${index + 1}`, label: str(node.label ?? node.title, 60), ...(str(node.detail ?? node.text, 160) ? { detail: str(node.detail ?? node.text, 160) } : {}) })).filter((node) => node.label && !ids.has(node.id) && ids.add(node.id))
      if (nodes.length < 2) { ctx.issues.push(`${at("nodes")}: a diagram needs at least two nodes`); return null }
      const edges = arr(data.edges).slice(0, 60).map(obj).map((edge) => ({ from: str(edge.from, 40), to: str(edge.to, 40), ...(str(edge.label, 40) ? { label: str(edge.label, 40) } : {}) }))
      const valid = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
      if (valid.length < edges.length) ctx.fixes.push(`${at("edges")}: ${edges.length - valid.length} links to unknown nodes removed`)
      return { ...base, type, nodes, edges: valid, direction: oneOf(data.direction, ["down", "right"] as const, "down") }
    }
    case "tree": {
      let count = 0
      type Node = { label: string; detail?: string; children?: Node[] }
      const walk = (raw: unknown, level: number): Node | null => {
        const o = obj(raw)
        const label = str(o.label ?? o.title, 80)
        if (!label || count >= UI_LIMITS.treeNodes || level > 5) return null
        count += 1
        const kids = arr(o.children).map((child) => walk(child, level + 1)).filter((child): child is NonNullable<typeof child> => Boolean(child))
        return { label, ...(str(o.detail ?? o.text, 160) ? { detail: str(o.detail ?? o.text, 160) } : {}), ...(kids.length ? { children: kids } : {}) }
      }
      const root = walk(data.root ?? data, 0)
      return root ? { ...base, type, root } : null
    }
    case "control": {
      const kind = oneOf(data.kind, ["slider", "number", "select", "toggle", "segmented"] as const, "slider")!
      const bind = str(data.bind, 40)
      const label = str(data.label, 80)
      if (!bind || !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(bind) || !label) { ctx.issues.push(`${at("bind")}: a control needs a variable name and a label`); return null }
      const options = arr(data.options).slice(0, 12).map(obj).map((option) => ({ label: str(option.label ?? option.value, 40), value: (typeof option.value === "number" ? option.value : str(option.value ?? option.label, 40)) as string | number })).filter((option) => option.label)
      let min = finite(data.min) ?? 0
      let max = finite(data.max) ?? 100
      if (max <= min) { ctx.fixes.push(`${at("range")}: min/max swapped or empty, repaired`); [min, max] = max < min ? [max, min] : [min, min + 1] }
      const step = Math.max((max - min) / 1000, Math.abs(finite(data.step) ?? (max - min) / 100) || 1)
      if ((kind === "select" || kind === "segmented") && !options.length) { ctx.issues.push(`${at("options")}: a choice needs options`); return null }
      if (!Object.prototype.hasOwnProperty.call(ctx.state, bind)) {
        ctx.state[bind] = kind === "toggle" ? false : (kind === "select" || kind === "segmented") ? options[0].value : min
        ctx.fixes.push(`${at("bind")}: «${bind}» added to the state`)
      }
      return { ...base, type, kind, bind, label, ...(kind === "slider" || kind === "number" ? { min, max, step } : {}), ...(options.length ? { options } : {}), ...(str(data.unit, 12) ? { unit: str(data.unit, 12) } : {}) }
    }
    case "card": {
      const title = data.title === undefined ? null : value(data.title, ctx, at("title"), 160)
      const body = data.body === undefined ? null : value(data.body ?? data.text, ctx, at("body"), 800)
      const img = data.image ? image(data.image, ctx, at("image")) : null
      const href = safeHref(data.href)
      const items = children(data.items ?? data.children, ctx, depth, at("items"))
      if (title === null && body === null && !img && !items.length) return null
      return { ...base, type, ...(title !== null ? { title } : {}), ...(body !== null ? { body } : {}), ...(img ? { image: img } : {}), ...(str(data.eyebrow, 80) ? { eyebrow: str(data.eyebrow, 80) } : {}), ...(str(data.badge, 40) ? { badge: str(data.badge, 40) } : {}), ...(str(data.footer, 200) ? { footer: str(data.footer, 200) } : {}), ...(str(data.number, 8) ? { number: str(data.number, 8) } : {}), ...(href ? { href } : {}), variant: oneOf(data.variant, ["plain", "outline", "hero", "emphasis", "numbered"] as const, "plain"), ...(items.length ? { items } : {}) }
    }
    case "grid": {
      const items = children(data.items ?? data.children, ctx, depth, at("items"))
      if (!items.length) return null
      const columns = finite(data.columns)
      const clamped = Math.max(1, Math.min(4, Math.round(columns ?? Math.min(3, items.length)))) as 1 | 2 | 3 | 4
      if (columns !== null && columns !== clamped) ctx.fixes.push(`${at("columns")}: ${columns} columns clamped to ${clamped}`)
      return { ...base, type, columns: clamped, items }
    }
    case "stack": {
      const items = children(data.items ?? data.children, ctx, depth, at("items"))
      return items.length ? { ...base, type, items, gap: oneOf(data.gap, ["tight", "normal", "loose"] as const, "normal") } : null
    }
    case "section": {
      const items = children(data.items ?? data.children, ctx, depth, at("items"))
      return items.length ? { ...base, type, items, ...(str(data.title, 160) ? { title: str(data.title, 160) } : {}), ...(str(data.eyebrow, 80) ? { eyebrow: str(data.eyebrow, 80) } : {}), ...(str(data.number, 8) ? { number: str(data.number, 8) } : {}) } : null
    }
    case "tabs": {
      const tabs = arr(data.tabs).slice(0, 8).map(obj).map((tab, index) => ({ label: str(tab.label ?? tab.title, 40) || `${index + 1}`, items: children(tab.items ?? tab.children, ctx, depth, at(`tabs.${index}`)) })).filter((tab) => tab.items.length)
      return tabs.length ? { ...base, type, tabs } : null
    }
    case "accordion": {
      const items = arr(data.items).slice(0, 16).map(obj).map((item, index) => {
        const text = str(item.text, 1200)
        const blocks = children(item.items ?? item.children, ctx, depth, at(`items.${index}`))
        return { title: str(item.title ?? item.label, 160), items: blocks.length ? blocks : text ? [{ type: "text", text } as Block] : [], ...(item.open === true ? { open: true } : {}) }
      }).filter((item) => item.title && item.items.length)
      return items.length ? { ...base, type, items } : null
    }
  }
  return null
}

/** The model's JSON checked, repaired and limited. null when nothing drawable is left. */
export function validateUi(raw: unknown, options: { sources?: UiSource[] } = {}): UiCheck {
  const data = obj(raw)
  const ctx: Ctx = { issues: [], fixes: [], state: {}, blocks: 0, images: 0, sources: options.sources || [] }
  if (data.v !== undefined && data.v !== UI_VERSION) ctx.fixes.push(`version ${String(data.v)} read as ${UI_VERSION}`)
  for (const [key, entry] of Object.entries(obj(data.state)).slice(0, UI_LIMITS.stateKeys)) {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(key)) { ctx.issues.push(`state: bad variable name «${key}»`); continue }
    if (typeof entry === "number" && Number.isFinite(entry)) ctx.state[key] = entry
    else if (typeof entry === "boolean") ctx.state[key] = entry
    else if (typeof entry === "string") ctx.state[key] = entry.slice(0, 80)
    else ctx.issues.push(`state: «${key}» must be a number, text or true/false`)
  }
  const rawBlocks = Array.isArray(raw) ? raw : arr(data.blocks)
  const blocks = rawBlocks.map((item, index) => block(item, ctx, 0, `blocks.${index}`)).filter((item): item is Block => Boolean(item))
  if (!blocks.length) return { doc: null, issues: ctx.issues.length ? ctx.issues : ["no drawable blocks"], fixes: ctx.fixes }
  const title = str(data.title, 160)
  return { doc: { v: UI_VERSION, ...(title ? { title } : {}), ...(Object.keys(ctx.state).length ? { state: ctx.state } : {}), blocks }, issues: ctx.issues, fixes: ctx.fixes }
}
