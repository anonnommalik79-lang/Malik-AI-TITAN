"use client"

import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Archive, Check, Copy, Download, ExternalLink, Eye, RefreshCw } from "lucide-react"
import { downloadProjectZip, type ProjectZipFile } from "@/lib/business/project-zip"
import { buildCanvasProjectSrcDoc, buildCanvasSrcDoc, createCanvasBlobUrl } from "@/lib/canvas-preview"
import { INLINE_MATH, TexMath, looksLikeMath } from "./malik-tex"
import { MalikReferenceImages, MalikVisualGallery, isSafeVisualUrl, type MalikVisualImage } from "./MalikVisualGallery"
import { MalikAnswerVisual } from "./MalikAnswerVisual"
import { MalikAnswerChecklist } from "./MalikAnswerChecklist"
import { parseAnswerVisual, inferTableVisual, inferListVisual, inferComparisonTable, wantsAnswerVisuals, wantsAnswerChecklist, type AnswerVisual } from "@/lib/ai/answer-visuals"
import { parseAnswerEntity } from "@/lib/ai/answer-entities"
import { planAnswerVisualSlots, visualSegmentLabel, type AnswerVisualSegment, type AnswerVisualSlot, type ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { groundedAnswerPhotoPlans, isPhotoLineup, parseAnswerPhotoHints } from "@/lib/ai/answer-photo-hints"

/**
 * Renders an assistant answer as structured text.
 *
 * Deliberately dependency-free and deliberately not `dangerouslySetInnerHTML`:
 * model output is parsed into React elements and never injected as HTML.
 */

export type MalikCitation = { url: string; title?: string; domain?: string }

type Props = { text: string; className?: string; allowImages?: boolean; autoPreview?: boolean; citations?: MalikCitation[]; visualContext?: { question: string; messageId?: string; previousQuestion?: string; previousAnswer?: string; hasAttachment?: boolean; isLatest?: boolean; streaming?: boolean } }

function isProjectArtifactHref(href: string) {
  return /^\/api\/ai\/project\/artifacts\/[^/]+\/download(?:\?|$)/.test(href)
}

/**
 * A line of text: inline maths ($…$, \(…\)) set as formulas, everything
 * else through the ordinary inline rules. Code spans are left alone, so a
 * `$HOME` in backticks stays code.
 */
/**
 * Web sources for [n] markers, read by the chip itself so inline() keeps its
 * simple signature everywhere it is used.
 */
const CitationContext = createContext<MalikCitation[] | null>(null)

const KNOWN_SOURCE_NAMES: Record<string, string> = {
  "wikipedia.org": "Wikipedia", "britannica.com": "Britannica", "github.com": "GitHub", "youtube.com": "YouTube",
  "openai.com": "OpenAI", "anthropic.com": "Anthropic", "google.com": "Google", "gov.kz": "gov.kz", "akorda.kz": "Akorda",
  "tengrinews.kz": "Tengrinews", "kapital.kz": "Kapital.kz", "forbes.kz": "Forbes.kz", "reuters.com": "Reuters", "bbc.com": "BBC",
}

function citationName(source: MalikCitation) {
  let host = String(source.domain || "")
  if (!host) { try { host = new URL(source.url).hostname } catch { host = "" } }
  host = host.replace(/^www\./, "").toLowerCase()
  const parts = host.split(".").filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    const tail = parts.slice(index).join(".")
    if (KNOWN_SOURCE_NAMES[tail]) return KNOWN_SOURCE_NAMES[tail]
  }
  const root = parts.length > 1 ? parts[parts.length - 2] : parts[0] || "Источник"
  return root.charAt(0).toUpperCase() + root.slice(1)
}

function safeHttps(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "" } catch { return "" }
}

/**
 * «[2][3]» after a claim becomes a small source chip - «Anthropic +1» - that
 * opens the first source, the way ChatGPT shows evidence in the text. A
 * number with no matching source is dropped rather than printed raw.
 */
function CitationChip({ numbers, raw }: { numbers: number[]; raw: string }) {
  const sources = useContext(CitationContext)
  if (!sources) return <>{raw}</>
  const found = numbers.map((number) => sources[number - 1]).filter((source): source is MalikCitation => Boolean(source && safeHttps(source.url)))
  if (!found.length) return null
  const first = found[0]
  const label = citationName(first) + (found.length > 1 ? ` +${found.length - 1}` : "")
  return (
    <a href={safeHttps(first.url)} target="_blank" rel="noreferrer noopener" className="malik-md-cite" title={found.map((source) => source.title || citationName(source)).join("\n")}>
      {label}
    </a>
  )
}

function citationNumbers(token: string) {
  return [...new Set((token.match(/\d{1,2}/g) || []).map(Number).filter((number) => number > 0))]
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  if (!/[$\\]/.test(text)) return inlineBase(text, keyPrefix)
  const out: ReactNode[] = []
  const parts = text.split(/(`[^`\n]+`)/)
  parts.forEach((part, partIndex) => {
    if (!part) return
    if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
      out.push(...inlineBase(part, `${keyPrefix}-c${partIndex}`))
      return
    }
    let last = 0
    let piece = 0
    const pattern = new RegExp(INLINE_MATH.source, "g")
    let match: RegExpExecArray | null
    while ((match = pattern.exec(part)) !== null) {
      const tex = match[1] ?? match[2] ?? match[3] ?? ""
      if (match[2] !== undefined && !looksLikeMath(tex)) continue
      if (match.index > last) out.push(...inlineBase(part.slice(last, match.index), `${keyPrefix}-${partIndex}-${piece++}`))
      out.push(<TexMath key={`${keyPrefix}-${partIndex}-m${piece++}`} tex={tex} display={match[1] !== undefined} />)
      last = match.index + match[0].length
    }
    if (last < part.length) out.push(...inlineBase(part.slice(last), `${keyPrefix}-${partIndex}-${piece}`))
  })
  return out.length ? out : [text]
}

/** `**bold**`, `*italic*`, `code`, and safe http(s)/same-origin API links. */
function inlineBase(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(((?:https?:\/\/|\/api\/)[^\s)]+)\))|((?:\s?\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\])+(?!\())/g

  let last = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${index++}`

    if (match[7]) {
      nodes.push(<CitationChip key={key} numbers={citationNumbers(token)} raw={token} />)
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key} className="malik-md-code">{token.slice(1, -1)}</code>)
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key} className="malik-md-strong">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"))
      const href = match[6] || "#"
      if (isProjectArtifactHref(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            download
            className="my-1 inline-flex max-w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-2.5 text-sm font-medium text-zinc-100 no-underline transition hover:border-white/20 hover:bg-white/[0.075]"
            aria-label={`${label}. Скачать ZIP`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-zinc-300">
              <Archive className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate">{label}</span>
            <Download className="ml-1 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          </a>,
        )
      } else {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="malik-md-link">{label}</a>,
        )
      }
    } else {
      nodes.push(<em key={key} className="malik-md-em">{token.slice(1, -1)}</em>)
    }

    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

type ListItem = { text: string; checked: boolean | null; children: ListBlock[] }
type ListBlock = { ordered: boolean; start: number; items: ListItem[]; indent: number }

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "list"; list: ListBlock }
  | { kind: "math"; tex: string }
  | { kind: "visual"; visual: AnswerVisual | null; pending: boolean }
  | { kind: "photos"; subjects: ReturnType<typeof parseAnswerPhotoHints>; lineup: boolean }
  | { kind: "code"; language: string; filename: string; lines: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "images"; images: MalikVisualImage[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }

const LIST_ITEM = /^(\s*)([-*•+]|\d{1,3}[.)])\s+(.*)$/

function indentOf(value: string) {
  return value.replace(/\t/g, "    ").length
}

function taskState(text: string): { text: string; checked: boolean | null } {
  const match = /^\[([ xX])\]\s+(.*)$/.exec(text)
  return match ? { text: match[2], checked: match[1] !== " " } : { text, checked: null }
}

/**
 * A list with its nesting: indented items become a sub-list of the item
 * above them, numbered lists keep their starting number (a list split by a
 * blank line no longer restarts at 1), and "- [x]" becomes a checked box.
 */
function parseList(lines: string[], start: number): { block: ListBlock; next: number } {
  const first = LIST_ITEM.exec(lines[start])!
  const root: ListBlock = { ordered: /\d/.test(first[2]), start: /\d/.test(first[2]) ? Number.parseInt(first[2], 10) || 1 : 1, items: [], indent: indentOf(first[1]) }
  const stack: ListBlock[] = [root]
  let lastItem: ListItem | null = null
  let index = start
  while (index < lines.length) {
    const line = lines[index]
    const match = LIST_ITEM.exec(line)
    if (!match) {
      if (!line.trim()) {
        // A blank line inside a list: it continues when the next line is
        // another item or an indented continuation.
        let ahead = index + 1
        while (ahead < lines.length && !lines[ahead].trim()) ahead += 1
        const nextLine = lines[ahead] || ""
        const nextItem = LIST_ITEM.exec(nextLine)
        if (nextItem && (indentOf(nextItem[1]) > root.indent || /\d/.test(nextItem[2]) === root.ordered)) {
          index = ahead
          continue
        }
        break
      }
      if (lastItem && /^\s{2,}\S/.test(line) && !/^\s*```/.test(line)) {
        lastItem.text = `${lastItem.text} ${line.trim()}`
        index += 1
        continue
      }
      break
    }
    const indent = indentOf(match[1])
    const ordered = /\d/.test(match[2])
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop()
    let top = stack[stack.length - 1]
    if (indent >= top.indent + 2 && lastItem) {
      const child: ListBlock = { ordered, start: ordered ? Number.parseInt(match[2], 10) || 1 : 1, items: [], indent }
      lastItem.children.push(child)
      stack.push(child)
      top = child
    } else if (stack.length === 1 && indent <= root.indent && ordered !== root.ordered) {
      // A different kind of list at the top level starts a new block.
      break
    }
    const task = taskState(match[3])
    const item: ListItem = { text: task.text, checked: task.checked, children: [] }
    top.items.push(item)
    lastItem = item
    index += 1
  }
  return { block: root, next: index }
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isTableStart(lines: string[], index: number) {
  return Boolean(lines[index]?.includes("|") && lines[index + 1]?.includes("|") && isTableSeparator(lines[index + 1]))
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: "sh", c: "c", cpp: "cpp", csharp: "cs", css: "css", csv: "csv", dockerfile: "Dockerfile",
  go: "go", html: "html", java: "java", javascript: "js", js: "js", json: "json", jsx: "jsx",
  kotlin: "kt", markdown: "md", md: "md", mermaid: "mmd", php: "php", powershell: "ps1",
  python: "py", py: "py", react: "tsx", ruby: "rb", rust: "rs", shell: "sh", sh: "sh", sql: "sql",
  swift: "swift", text: "txt", ts: "ts", tsx: "tsx", typescript: "ts", xml: "xml", yaml: "yaml", yml: "yml",
}

function sanitizeArtifactFilename(value: string) {
  const raw = String(value || "")
    .trim()
    .replace(/^(?:filename|file|path)\s*=\s*/i, "")
    .replace(/^[`"']+|[`"',;]+$/g, "")
    .replace(/\\/g, "/")
  const safeParts = raw.split("/")
    .map((part) => part.trim().replace(/\.\.+/g, ".").replace(/[^\p{L}\p{N}._@+ -]/gu, "-"))
    .filter((part) => part && part !== "." && part !== "..")
  return safeParts.join("/").slice(0, 180)
}

function languageFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || ""
  const entry = Object.entries(LANGUAGE_EXTENSIONS).find(([, ext]) => ext.toLowerCase() === extension)
  return entry?.[0] || "text"
}

function parseFenceInfo(line: string) {
  const raw = line.replace(/^\s*```/, "").trim()
  if (!raw) return { language: "", filename: "" }
  const [first = "", ...rest] = raw.split(/\s+/)
  if (/^(?:filename|file|path)=/i.test(first)) {
    const filename = sanitizeArtifactFilename([first, ...rest].join(" "))
    return { language: languageFromFilename(filename), filename }
  }
  const colon = first.match(/^([\w+.-]+):(.+\.[\w-]+)$/)
  if (colon) return { language: colon[1].toLowerCase(), filename: sanitizeArtifactFilename(colon[2]) }
  if (/^[\w./@+ -]+\.[a-z0-9]{1,12}$/i.test(first) && !rest.length) {
    const filename = sanitizeArtifactFilename(first)
    return { language: languageFromFilename(filename), filename }
  }
  const language = first.replace(/[^\w+.-]/g, "").toLowerCase()
  const filename = sanitizeArtifactFilename(rest.join(" "))
  return { language, filename }
}

function filenameHint(value: string) {
  const match = String(value || "").match(/(?:^|[`\s])([\w@+./ -]+\.[a-z0-9]{1,12})(?:$|[`\s])/i)
  return sanitizeArtifactFilename(match?.[1] || "")
}

function defaultCodeFilename(language: string, index: number) {
  const normalized = language.toLowerCase()
  if (normalized === "html" && index === 0) return "index.html"
  if (normalized === "css" && index <= 1) return "styles.css"
  if (["javascript", "js"].includes(normalized) && index <= 2) return "script.js"
  if (normalized === "json") return index ? `data-${index + 1}.json` : "data.json"
  if (normalized === "csv") return index ? `data-${index + 1}.csv` : "data.csv"
  if (normalized === "mermaid") return index ? `diagram-${index + 1}.mmd` : "diagram.mmd"
  const extension = LANGUAGE_EXTENSIONS[normalized] || "txt"
  if (extension === "Dockerfile") return index ? `Dockerfile.${index + 1}` : "Dockerfile"
  return `file-${index + 1}.${extension}`
}

function normalizeCodeFilenames(blocks: Block[]) {
  const used = new Set<string>()
  let codeIndex = 0
  return blocks.map((block) => {
    if (block.kind !== "code") return block
    let filename = sanitizeArtifactFilename(block.filename) || defaultCodeFilename(block.language, codeIndex)
    const original = filename
    let suffix = 2
    while (used.has(filename.toLowerCase())) {
      const dot = original.lastIndexOf(".")
      filename = dot > 0 ? `${original.slice(0, dot)}-${suffix}${original.slice(dot)}` : `${original}-${suffix}`
      suffix += 1
    }
    used.add(filename.toLowerCase())
    codeIndex += 1
    return { ...block, filename }
  })
}

/** A verified photo line becomes a gallery tile, never raw model-supplied HTML. */
function parseImageLine(line: string): MalikVisualImage | null {
  const match = /^\s*!\[([^\]\n]{0,140})\]\((https:\/\/[^\s)]+)(?:\s+"([^"\n]{0,100})")?\)\s*$/.exec(line)
  if (!match || !isSafeVisualUrl(match[2])) return null
  return { alt: match[1].trim() || "Изображение", url: match[2], credit: match[3]?.trim() }
}

const EMPTY_IMAGE_LINE = /^\s*!\[[^\]\n]*\]\(\s*\)\s*$/u

function parseBlocks(source: string): Block[] {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let index = 0
  let pendingFilename = ""

  while (index < lines.length) {
    const line = lines[index]
    const fence = /^\s*```/.test(line) ? parseFenceInfo(line) : null
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      const closed = index < lines.length
      index += 1
      if (fence.language === "malik-visual") {
        blocks.push({ kind: "visual", visual: closed ? parseAnswerVisual(body.join("\n")) : null, pending: !closed })
        pendingFilename = ""
        continue
      }
      if (fence.language === "malik-photos") {
        blocks.push({ kind: "photos", subjects: closed ? parseAnswerPhotoHints(body.join("\n")) : [], lineup: closed && isPhotoLineup(body.join("\n")) })
        pendingFilename = ""
        continue
      }
      blocks.push({ kind: "code", language: fence.language || languageFromFilename(fence.filename), filename: fence.filename || pendingFilename, lines: body })
      pendingFilename = ""
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    if (EMPTY_IMAGE_LINE.test(line)) { index += 1; continue }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ kind: "hr" })
      index += 1
      continue
    }

    // Display maths: $$ … $$ or \[ … \], on one line or several. An unclosed
    // block (the answer is still streaming) stays text until it closes.
    const trimmed = line.trim()
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const close = trimmed.startsWith("$$") ? "$$" : "\\]"
      const opening = trimmed.slice(2)
      if (opening.trim().endsWith(close) && opening.trim().length > close.length) {
        blocks.push({ kind: "math", tex: opening.trim().slice(0, -close.length) })
        index += 1
        continue
      }
      const body = [opening]
      let end = index + 1
      while (end < lines.length && !lines[end].includes(close)) {
        body.push(lines[end])
        end += 1
      }
      if (end < lines.length) {
        body.push(lines[end].slice(0, lines[end].indexOf(close)))
        blocks.push({ kind: "math", tex: body.join("\n").trim() })
        index = end + 1
        continue
      }
      // Not closed yet (still streaming): the rest is shown as it is.
      blocks.push({ kind: "p", lines: lines.slice(index).filter((item) => item.trim()) })
      index = lines.length
      continue
    }

    const firstImage = parseImageLine(line)
    if (firstImage) {
      const images: MalikVisualImage[] = [firstImage]
      index += 1
      while (index < lines.length) {
        const next = parseImageLine(lines[index])
        if (!next) break
        images.push(next)
        index += 1
      }
      blocks.push({ kind: "images", images })
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = tableCells(lines[index])
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = tableCells(lines[index])
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] || ""))
        index += 1
      }
      blocks.push({ kind: "table", headers, rows })
      continue
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2].trim() })
      pendingFilename = filenameHint(heading[2])
      index += 1
      continue
    }

    if (LIST_ITEM.test(line)) {
      const parsed = parseList(lines, index)
      blocks.push({ kind: "list", list: parsed.block })
      index = Math.max(index + 1, parsed.next)
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ""))
        index += 1
      }
      blocks.push({ kind: "quote", lines: body })
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length
      && lines[index].trim()
      && !/^\s*(#{1,6}\s|[-*•+]\s|\d+[.)]\s|>|```|\$\$|\\\[)/.test(lines[index])
      && !isTableStart(lines, index)
      && !parseImageLine(lines[index])
      && !EMPTY_IMAGE_LINE.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    // Every pass must consume at least one line, whatever the line is.
    if (!paragraph.length) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ kind: "p", lines: paragraph })
  }

  return normalizeCodeFilenames(blocks)
}

const CODE_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "default", "delete",
  "do", "else", "export", "extends", "false", "finally", "for", "from", "function", "if", "import",
  "in", "interface", "let", "new", "null", "return", "static", "super", "switch", "this", "throw",
  "true", "try", "type", "typeof", "undefined", "var", "void", "while", "yield",
])

function coloredCodeLine(line: string, language: string, key: string): ReactNode[] {
  const markup = /^(html|xml|svg|jsx|tsx)$/.test(language) && /^\s*<[/!?a-z]/i.test(line)
  const pythonOrShell = /^(python|py|bash|sh|shell|zsh)$/.test(language)
  const tokenPattern = markup
    ? /(<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*|<!DOCTYPE|\/?>|[\w:-]+(?=\s*=)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi
    : /(\/\/.*$|\/\*.*?\*\/|#[0-9a-fA-F]{3,8}\b|#[^\n]*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b)/g
  const nodes: ReactNode[] = []
  let previous = 0
  let match: RegExpExecArray | null
  let part = 0
  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > previous) nodes.push(line.slice(previous, match.index))
    const token = match[0]
    let tone = ""
    if (markup) {
      if (token.startsWith("<") || token === ">" || token === "/>") tone = "tag"
      else if (/^["']/.test(token)) tone = "string"
      else tone = "attribute"
    } else if (token.startsWith("//") || token.startsWith("/*") || (pythonOrShell && token.startsWith("#"))) {
      tone = "comment"
    } else if (/^["'`]/.test(token)) {
      tone = "string"
    } else if (/^#[0-9a-fA-F]{3,8}$/.test(token) || /^\d/.test(token)) {
      tone = "number"
    } else if (CODE_KEYWORDS.has(token)) {
      tone = "keyword"
    } else if (/^\s*\(/.test(line.slice(tokenPattern.lastIndex))) {
      tone = "function"
    } else if (/^\s*:/.test(line.slice(tokenPattern.lastIndex))) {
      tone = "attribute"
    }
    nodes.push(tone ? <span className={`malik-md-token-${tone}`} key={`${key}-${part++}`}>{token}</span> : token)
    previous = tokenPattern.lastIndex
  }
  if (previous < line.length) nodes.push(line.slice(previous))
  return nodes.length ? nodes : [line]
}

function highlightedCode(code: string, language: string) {
  const lines = code.split("\n")
  const baseLanguage = language.toLowerCase()
  let embeddedLanguage = baseLanguage
  return lines.map((line, index) => {
    if (baseLanguage === "html" && /<\/\s*(?:style|script)\s*>/i.test(line)) embeddedLanguage = "html"
    const currentLanguage = embeddedLanguage
    const content = coloredCodeLine(line, currentLanguage, `line-${index}`)
    if (baseLanguage === "html" && /<\s*style\b[^>]*>/i.test(line)) embeddedLanguage = "css"
    if (baseLanguage === "html" && /<\s*script\b[^>]*>/i.test(line)) embeddedLanguage = "javascript"
    return (
      <span className="malik-md-code-line" key={index}>
        <span className="malik-md-code-line-number" aria-hidden="true">{index + 1}</span>
        <span className="malik-md-code-line-text">{content || " "}</span>
      </span>
    )
  })
}

function artifactMime(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase()
  if (extension === "html") return "text/html;charset=utf-8"
  if (extension === "css") return "text/css;charset=utf-8"
  if (["js", "mjs", "cjs", "jsx"].includes(extension || "")) return "text/javascript;charset=utf-8"
  if (["json", "jsonl"].includes(extension || "")) return "application/json;charset=utf-8"
  if (extension === "csv") return "text/csv;charset=utf-8"
  if (extension === "svg") return "image/svg+xml;charset=utf-8"
  if (["yaml", "yml"].includes(extension || "")) return "application/yaml;charset=utf-8"
  if (extension === "xml") return "application/xml;charset=utf-8"
  return "text/plain;charset=utf-8"
}

function downloadTextArtifact(filename: string, content: string) {
  const blob = new Blob([content], { type: artifactMime(filename) })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.split("/").pop() || "malik-ai-file.txt"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function codeFilesFrom(blocks: Block[]): ProjectZipFile[] {
  return blocks.flatMap((block) => block.kind === "code"
    ? [{ name: block.filename, content: block.lines.join("\n") }]
    : [])
}

function isPreviewableCode(language: string, code: string) {
  const normalized = String(language || "").toLowerCase()
  if (["html", "htm", "svg", "jsx", "tsx", "react"].includes(normalized)) return true
  return /<!doctype html|<(?:html|body|main|section|div|svg|canvas)[\s>]|export\s+default\s+(?:function|class)|\breturn\s*\(\s*</i.test(code)
}

function CodeBlock({ language, filename, code, previewFiles, autoPreview = false }: { language: string; filename: string; code: string; previewFiles: ProjectZipFile[]; autoPreview?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const previewable = isPreviewableCode(language, code)
  const previewSrcDoc = previewable
    ? /\.html?$/i.test(filename) && previewFiles.length > 1
      ? buildCanvasProjectSrcDoc(previewFiles, filename)
      : buildCanvasSrcDoc(code)
    : ""
  useEffect(() => {
    if (autoPreview && previewable && previewSrcDoc) setPreviewOpen(true)
  }, [autoPreview, previewable, previewSrcDoc])
  const lineCount = Math.max(1, code.split("\n").length)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const openPreviewInNewTab = () => {
    if (!previewSrcDoc) return
    const url = createCanvasBlobUrl(previewSrcDoc)
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <div className={"malik-md-codeblock" + (previewOpen ? " has-live-preview" : "")}>
        <div className="malik-md-codebar">
          <span title={filename}>{filename || language || "code"}</span>
          <div className="malik-md-codebar-actions">
            {previewable ? (
              <button
                type="button"
                className={previewOpen ? "is-active" : undefined}
                onClick={() => setPreviewOpen((value) => !value)}
                aria-expanded={previewOpen}
                aria-label={previewOpen ? "Скрыть предпросмотр" : "Открыть предпросмотр"}
              >
                <Eye aria-hidden="true" />
                {previewOpen ? "Скрыть" : "Предпросмотр"}
              </button>
            ) : null}
            <button type="button" onClick={() => downloadTextArtifact(filename, code)} aria-label={"Скачать " + filename}>
              <Download aria-hidden="true" />
              Скачать
            </button>
            <button type="button" onClick={() => void copy()} aria-label="Копировать код">
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </div>
        <pre className="malik-md-pre" data-language={language || undefined} data-filename={filename}>
          <code>{highlightedCode(code, language)}</code>
        </pre>
      </div>

      {previewOpen && previewSrcDoc ? (
        <section className="malik-md-live-preview" aria-label="Предпросмотр результата кода">
          <div className="malik-md-live-preview__bar">
            <div className="malik-md-live-preview__title">
              <span className="malik-md-live-preview__mark" aria-hidden="true" />
              <strong>LIVE PREVIEW</strong>
              <span title={filename}>{filename || "generated artifact"}</span>
            </div>
            <div className="malik-md-live-preview__actions">
              <button type="button" onClick={() => setPreviewKey((value) => value + 1)} aria-label="Обновить предпросмотр">
                <RefreshCw aria-hidden="true" />
                Обновить
              </button>
              <button type="button" onClick={openPreviewInNewTab} aria-label="Открыть предпросмотр в новой вкладке">
                <ExternalLink aria-hidden="true" />
                Открыть
              </button>
            </div>
          </div>
          <div className="malik-md-live-preview__stage">
            <iframe
              key={"preview-" + previewKey}
              srcDoc={previewSrcDoc}
              title={"Предпросмотр " + (filename || "кода")}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
            />
          </div>
          <div className="malik-md-live-preview__report" role="status">
            <span className="malik-md-live-preview__report-label">ОТЧЁТ</span>
            <strong>Предпросмотр</strong>
            <span>{lineCount} строк · изолированный sandbox · работу кода проверьте в окне выше</span>
          </div>
        </section>
      ) : null}
    </>
  )
}

function MarkdownList({ list, keyPrefix, visualSlots, isLatest = false }: { list: ListBlock; keyPrefix: string; visualSlots?: Map<string, AnswerVisualSlot>; isLatest?: boolean }) {
  const items = list.items.map((item, itemIndex) => {
    const key = `${keyPrefix}-${itemIndex}`
    return (
      <li key={key} className={item.checked === null ? undefined : "malik-md-task"}>
        {item.checked === null ? null : <span className={`malik-md-check${item.checked ? " is-checked" : ""}`} aria-label={item.checked ? "выполнено" : "не выполнено"} role="img">{item.checked ? "✓" : ""}</span>}
        {visualSlots?.has(key) ? <MalikReferenceImages question="" planOverride={visualSlots.get(key)!.plan} row isLatest={isLatest}>{inline(item.text, key)}</MalikReferenceImages> : inline(item.text, key)}
        {item.children.map((child, childIndex) => <MarkdownList key={`${key}-c${childIndex}`} list={child} keyPrefix={`${key}-c${childIndex}`} />)}
      </li>
    )
  })
  return list.ordered
    ? <ol className="malik-md-ol" start={list.start !== 1 ? list.start : undefined}>{items}</ol>
    : <ul className="malik-md-ul">{items}</ul>
}

function AnswerEntityCard({ text, description = "" }: { text: string; description?: string }) {
  const entity = parseAnswerEntity(text)
  const [failed, setFailed] = useState(false)
  if (!entity) return null
  const details = [entity.description, description].filter(Boolean).join(" ")
  return <div data-malik-answer-entity className="my-5 flex items-start gap-4">
    <a href={entity.href} target="_blank" rel="noopener noreferrer" aria-label={"Официальный сайт " + entity.name} className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white sm:h-20 sm:w-20">
      {failed ? <span className="text-2xl font-semibold text-black">{entity.name[0]}</span> : <img src={entity.icon} alt={entity.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-12 w-12 object-contain sm:h-14 sm:w-14" onError={() => setFailed(true)} />}
    </a>
    <div className="min-w-0"><a href={entity.href} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-white">{entity.name}</a>
      {details ? <p className="mt-1 text-base leading-7 text-zinc-100">{inline(details, "entity-" + entity.name)}</p> : null}
    </div>
  </div>
}

/** Match full subject names, not substrings (iPhone 16 must not match iPhone 16 Pro). */
function hasVisualSubject(content: string, topic: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\u0060*_]/gu, "").replace(/\s+/gu, " ").trim()
  const haystack = normalize(content)
  const needle = normalize(topic)
  if (!needle) return false
  let offset = haystack.indexOf(needle)
  while (offset >= 0) {
    const before = haystack[offset - 1] || ""
    const after = haystack[offset + needle.length] || ""
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true
    offset = haystack.indexOf(needle, offset + 1)
  }
  return false
}

/** A single-person/product request gets the hero. Collections stay compact rows. */
function isMultiSubjectVisualQuestion(question: string): boolean {
  return /(?:список|перечисли|все(?:х|ми)?\b|нескольк|сравни|сравнение|участник[ио]|спикер[ыо]|кто\s+(?:будет|был|приехал|выступал)|какие\s+(?:люди|модели|виды)|\b(?:list|all|compare|versus|speakers|participants|attendees|several|multiple|top\s+\d+)\b)/iu.test(question)
}

export function MalikMarkdown({ text, className, allowImages = true, autoPreview = false, citations, visualContext }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  const question = visualContext?.question || ""
  const previousQuestion = visualContext?.previousQuestion || ""
  const previousAnswer = visualContext?.previousAnswer || ""
  const hasAttachment = Boolean(visualContext?.hasAttachment)
  const streaming = Boolean(visualContext?.streaming)
  const checklistPosition = useMemo(() => {
    if (!wantsAnswerChecklist(question) || blocks.some((block) => block.kind === "visual" && block.visual?.type === "checklist")) return -1
    let selected = -1
    blocks.forEach((block, index) => {
      if (block.kind === "list" && block.list.items.length <= 20 && block.list.items.every((item) => !item.children.length)
        && (selected < 0 || block.list.items.length > (blocks[selected] as Extract<Block, { kind: "list" }>).list.items.length)) selected = index
    })
    return selected
  }, [blocks, question])
  const fallbackVisualSlots = useMemo(() => {
    // Event lineups need explicit subject metadata: a guessed portrait is not attendance evidence.
    if (!question || /(?:спикер|выступ|участни|приехал|присутств|speaker|attend|participant|lineup)/iu.test(question)) return new Map<string, AnswerVisualSlot>()
    const segments: AnswerVisualSegment[] = []
    blocks.forEach((block, position) => {
      // The last streamed block can still change its subject; anchor only settled blocks.
      if (streaming && position === blocks.length - 1) return
      const key = `b${position}`
      if (block.kind === "h") segments.push({ key, text: block.text, kind: "heading" })
      if (block.kind === "p") segments.push({ key, text: block.lines.join(" "), kind: "paragraph" })
      if (block.kind === "list") block.list.items.forEach((item, index) => segments.push({ key: `${key}-${index}`, text: item.text, kind: "item" }))
    })
    return new Map(planAnswerVisualSlots(question, segments, previousQuestion, hasAttachment, previousAnswer).map((slot) => [slot.key, slot]))
  }, [blocks, question, previousQuestion, previousAnswer, hasAttachment, streaming])
  const photoPlans = useMemo(() => {
    const plans = new Map<number, ReturnType<typeof groundedAnswerPhotoPlans>>()
    // A verified full product collection keeps every exact model, including >12 items.
    if ([...fallbackVisualSlots.values()].some((slot) => slot.plan.subjects?.length)) return plans
    const seen = new Set<string>()
    blocks.forEach((block, position) => {
      if (block.kind !== "photos") return
      const grounded = groundedAnswerPhotoPlans(block.subjects, question, text, hasAttachment).filter((plan) => {
        const name = plan.topic.toLowerCase()
        if (seen.has(name) || seen.size >= 12) return false
        seen.add(name)
        return true
      })
      if (grounded.length) plans.set(position, grounded)
    })
    return plans
  }, [blocks, fallbackVisualSlots, question, text, hasAttachment])
  const hintedAnchors = useMemo(() => {
    const slots = new Map<string, AnswerVisualSlot>()
    const consumed = new Set<number>()
    const unanchored = new Map<number, ReferenceVisualPlan[]>()
    const occupied = new Set<string>()
    photoPlans.forEach((plans, position) => {
      // A lineup is shown together, side by side, where the model put it.
      const block = blocks[position]
      if (block?.kind === "photos" && block.lineup) { unanchored.set(position, plans); return }
      const remaining: ReferenceVisualPlan[] = []
      for (const plan of plans) {
        const candidates: Array<{ key: string; position: number; priority: number }> = []
        // A fence belongs to its nearby item/heading, never an arbitrary earlier mention.
        for (let index = position - 1; index >= Math.max(0, position - 4); index--) {
          const block = blocks[index]
          if (block.kind === "photos" || block.kind === "visual" || block.kind === "hr") break
          if (block.kind === "h" && hasVisualSubject(block.text, plan.topic) && !parseAnswerEntity(block.text)) {
            candidates.push({ key: `b${index}`, position: index, priority: 0 })
          }
          if (block.kind === "list") block.list.items.forEach((item, itemIndex) => {
            if (hasVisualSubject(item.text, plan.topic) && !item.children.length) {
              candidates.push({ key: `b${index}-${itemIndex}`, position: index, priority: 1 })
            }
          })
          if (block.kind === "p" && hasVisualSubject(block.lines.join(" "), plan.topic)) {
            candidates.push({ key: `b${index}`, position: index, priority: 2 })
          }
        }
        // Headings own their descriptions; list items own their own photos.
        candidates.sort((a, b) => a.priority - b.priority || b.position - a.position)
        const target = candidates.find((candidate) => !occupied.has(candidate.key))
        if (!target) { remaining.push(plan); continue }
        occupied.add(target.key)
        slots.set(target.key, { key: target.key, plan, row: true })
      }
      if (remaining.length) unanchored.set(position, remaining)
      else consumed.add(position)
    })
    return { slots, consumed, unanchored }
  }, [blocks, photoPlans])
  const visualSlots = photoPlans.size ? hintedAnchors.slots : fallbackVisualSlots
  const photoCount = photoPlans.size
    ? [...photoPlans.values()].reduce((total, plans) => total + plans.length, 0)
    : [...fallbackVisualSlots.values()].reduce((total, slot) => total + (slot.plan.subjects?.length || 1), 0)
  const singleVisualSubject = photoCount === 1 && !isMultiSubjectVisualQuestion(question)
  const dataVisuals = useMemo(() => {
    const visuals = new Map<number, AnswerVisual>()
    if (!wantsAnswerVisuals(question)) return visuals
    blocks.forEach((block, position) => {
      if (block.kind === "visual" && block.visual && visuals.size < 2) visuals.set(position, block.visual)
    })
    if (visuals.size || streaming) return visuals
    let title = ""
    blocks.forEach((block, position) => {
      if (block.kind === "h") title = block.text
      if (visuals.size >= 2) return
      const visual = block.kind === "table" ? inferTableVisual(block.headers, block.rows, question, title)
        : block.kind === "list" ? inferListVisual(block.list.items.map((item) => item.text), question, title) : null
      if (visual) visuals.set(position, visual)
    })
    return visuals
  }, [blocks, question, streaming])
  const codeFiles = codeFilesFrom(blocks)
  const primaryPreviewFilename = codeFiles.find((file) => /\.html?$/i.test(file.name))?.name
    || codeFiles.find((file) => isPreviewableCode(languageFromFilename(file.name), file.content))?.name

  const downloadAll = () => {
    if (codeFiles.length === 1) {
      downloadTextArtifact(codeFiles[0].name, codeFiles[0].content)
      return
    }
    if (codeFiles.length > 1) downloadProjectZip("malik-ai-files.zip", codeFiles)
  }

  return (
    <CitationContext.Provider value={citations?.length ? citations : null}>
    <div className={className ? `malik-md ${className}` : "malik-md"}>
      {codeFiles.length > 1 ? (
        <div className="malik-md-artifact-toolbar" role="group" aria-label="Файлы ответа">
          <span><Archive aria-hidden="true" /> {codeFiles.length} файлов готовы</span>
          <button type="button" onClick={downloadAll}>
            <Download aria-hidden="true" /> Скачать все ZIP
          </button>
        </div>
      ) : null}
      {blocks.map((block, position) => {
        const key = `b${position}`
        const previous = blocks[position - 1]
        const next = blocks[position + 1]
        const slot = visualSlots.get(key)
        const dataVisual = dataVisuals.get(position)
        if (block.kind === "photos") {
          if (hintedAnchors.consumed.has(position)) return null
          const plans = hintedAnchors.unanchored.get(position)
          if (!plans?.length) return null
          if (block.lineup && plans.length >= 2) {
            return <section key={key} data-malik-photo-lineup className={`malik-answer-lineup is-${Math.min(plans.length, 4)}`} aria-label="Сравниваемые варианты">
              {plans.slice(0, 4).map((plan) => <MalikReferenceImages key={plan.topic} question="" planOverride={plan} compact lineup isLatest={visualContext?.isLatest} />)}
            </section>
          }
          // Even an unanchored model hint is a captioned subject row, never a bottom photo grid.
          return <section key={key} data-malik-photo-hints className="my-5 space-y-4" aria-label="Фотографии по теме ответа">
            {plans.map((plan) => <MalikReferenceImages key={plan.topic} question="" planOverride={plan} row={!singleVisualSubject} hero={singleVisualSubject} isLatest={visualContext?.isLatest} />)}
          </section>
        }
        if (block.kind === "visual") {
          if (dataVisual) return <MalikAnswerVisual key={key} visual={dataVisual} stateKey={visualContext?.messageId ? `${visualContext.messageId}:${key}` : undefined} />
          if (block.pending && streaming && wantsAnswerVisuals(question)) return <p key={key} className="malik-md-p" role="status">Подготавливаю визуальный блок…</p>
          return null
        }
        // A photographed heading owns its immediately following description.
        if (block.kind === "p" && previous?.kind === "h" && visualSlots.get(`b${position - 1}`)?.row) return null
        // Compact entity rows retain the model's own description, not canned copy.
        if (block.kind === "p" && previous?.kind === "h" && parseAnswerEntity(previous.text)) {
          // The heading row already includes this paragraph.
          return null
        }
        if (block.kind === "h" && parseAnswerEntity(block.text)) {
          return <AnswerEntityCard key={key} text={block.text} description={next?.kind === "p" ? next.lines.join(" ") : ""} />
        }
        if (block.kind === "p" && parseAnswerEntity(block.lines.join("\n"))) return <AnswerEntityCard key={key} text={block.lines.join("\n")} />

        if (block.kind === "images") return allowImages ? <MalikVisualGallery key={key} images={block.images} /> : null

        if (block.kind === "code") {
          return <CodeBlock key={key} language={block.language} filename={block.filename} code={block.lines.join("\n")} previewFiles={codeFiles} autoPreview={autoPreview && block.filename === primaryPreviewFilename} />
        }

        if (block.kind === "table") {
          const comparison = inferComparisonTable(block.headers, block.rows, question, previous?.kind === "h" ? previous.text : "")
          if (comparison) return <MalikAnswerVisual key={key} visual={comparison} />
          return (
            <Fragment key={key}>
              {dataVisual ? <MalikAnswerVisual visual={dataVisual} /> : null}
            <div className="malik-md-table-wrap">
              <table className="malik-md-table">
                <thead>
                  <tr>{block.headers.map((header, cellIndex) => <th key={`${key}-h${cellIndex}`}>{inline(header, `${key}-h${cellIndex}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-r${rowIndex}`}>
                      {row.map((cell, cellIndex) => <td key={`${key}-r${rowIndex}-c${cellIndex}`}>{inline(cell, `${key}-r${rowIndex}-c${cellIndex}`)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </Fragment>
          )
        }

        if (block.kind === "h") {
          // The checklist carries this exact heading inside its own header.
          if (next?.kind === "list" && checklistPosition === position + 1) return null
          const level = Math.min(block.level + 1, 6)
          const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6"
          const heading = <Tag className={`malik-md-h malik-md-h${block.level}`}>{inline(block.text, key)}</Tag>
          return slot ? <MalikReferenceImages key={key} question={question} planOverride={slot.plan} row={slot.row || !singleVisualSubject} hero={singleVisualSubject} isLatest={visualContext?.isLatest}>
            {heading}{next?.kind === "p" ? <p className="malik-md-p">{inline(next.lines.join(" "), key + "-description")}</p> : null}
          </MalikReferenceImages> : <Fragment key={key}>{heading}</Fragment>
        }

        if (block.kind === "list") {
          if (wantsAnswerVisuals(question) && block.list.items.length <= 20 && (checklistPosition === position || block.list.items.every((item) => item.checked !== null && !item.children.length))) {
            const items = block.list.items.map((item) => {
              const heading = /^\*\*([^*]+)\*\*\s*[:—–-]?\s*([\s\S]*)$/u.exec(item.text)
                || /^([^:—–\n]{3,100})\s*[:—–]\s+([\s\S]+)$/u.exec(item.text)
              return { label: heading ? heading[1] : item.text, detail: heading?.[2] || undefined, checked: item.checked === true }
            })
            return <MalikAnswerChecklist key={key} title={previous?.kind === "h" && (checklistPosition === position || /чек|checklist|тізім/iu.test(previous.text)) ? previous.text : "Чек-лист"} items={items} stateKey={visualContext?.messageId ? `${visualContext.messageId}:${key}` : undefined} renderLabel={(label, index) => inline(label, `${key}-task-${index}`)} />
          }
          return <Fragment key={key}>{dataVisual ? <MalikAnswerVisual visual={dataVisual} /> : null}<MarkdownList list={block.list} keyPrefix={key} visualSlots={visualSlots} isLatest={visualContext?.isLatest} /></Fragment>
        }

        if (block.kind === "math") return <TexMath key={key} tex={block.tex} display />

        if (block.kind === "quote") {
          return <blockquote key={key} className="malik-md-quote">{inline(block.lines.join(" "), key)}</blockquote>
        }

        if (block.kind === "hr") return <hr key={key} className="malik-md-hr" />

        const paragraph = (
          <p className="malik-md-p">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {inline(line, `${key}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        )
        return slot ? <MalikReferenceImages key={key} question={question} planOverride={slot.plan} row={slot.row || !singleVisualSubject} hero={singleVisualSubject} isLatest={visualContext?.isLatest}>{paragraph}</MalikReferenceImages> : <Fragment key={key}>{paragraph}</Fragment>
      })}
    </div>
    </CitationContext.Provider>
  )
}
