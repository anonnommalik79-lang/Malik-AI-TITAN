"use client"

import { Fragment, useState, type ReactNode } from "react"
import { Archive, Check, Copy, Download, ExternalLink, Eye, RefreshCw } from "lucide-react"
import { downloadProjectZip, type ProjectZipFile } from "@/lib/business/project-zip"
import { buildCanvasSrcDoc, createCanvasBlobUrl } from "@/lib/canvas-preview"

/**
 * Renders an assistant answer as structured text.
 *
 * Deliberately dependency-free and deliberately not `dangerouslySetInnerHTML`:
 * model output is parsed into React elements and never injected as HTML.
 */

type Props = { text: string; className?: string }

function isProjectArtifactHref(href: string) {
  return /^\/api\/ai\/project\/artifacts\/[^/]+\/download(?:\?|$)/.test(href)
}

/** `**bold**`, `*italic*`, `code`, and safe http(s)/same-origin API links. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(((?:https?:\/\/|\/api\/)[^\s)]+)\))/g

  let last = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${index++}`

    if (token.startsWith("`")) {
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

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; language: string; filename: string; lines: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }

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
      index += 1
      blocks.push({ kind: "code", language: fence.language || languageFromFilename(fence.filename), filename: fence.filename || pendingFilename, lines: body })
      pendingFilename = ""
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ kind: "hr" })
      index += 1
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

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*•]\s+/, ""))
        index += 1
      }
      blocks.push({ kind: "ul", items })
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""))
        index += 1
      }
      blocks.push({ kind: "ol", items })
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
      && !/^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s|>|```)/.test(lines[index])
      && !isTableStart(lines, index)
    ) {
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

function CodeBlock({ language, filename, code }: { language: string; filename: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const previewable = isPreviewableCode(language, code)
  const previewSrcDoc = previewable ? buildCanvasSrcDoc(code) : ""
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
            <strong>Готово</strong>
            <span>{lineCount} строк · изолированный sandbox · результат показан прямо в Malik AI</span>
          </div>
        </section>
      ) : null}
    </>
  )
}

export function MalikMarkdown({ text, className }: Props) {
  const blocks = parseBlocks(text)
  const codeFiles = codeFilesFrom(blocks)

  const downloadAll = () => {
    if (codeFiles.length === 1) {
      downloadTextArtifact(codeFiles[0].name, codeFiles[0].content)
      return
    }
    if (codeFiles.length > 1) downloadProjectZip("malik-ai-files.zip", codeFiles)
  }

  return (
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

        if (block.kind === "code") {
          return <CodeBlock key={key} language={block.language} filename={block.filename} code={block.lines.join("\n")} />
        }

        if (block.kind === "table") {
          return (
            <div key={key} className="malik-md-table-wrap">
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
          )
        }

        if (block.kind === "h") {
          const level = Math.min(block.level + 1, 6)
          const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6"
          return <Tag key={key} className={`malik-md-h malik-md-h${block.level}`}>{inline(block.text, key)}</Tag>
        }

        if (block.kind === "ul") {
          return (
            <ul key={key} className="malik-md-ul">
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>)}
            </ul>
          )
        }

        if (block.kind === "ol") {
          return (
            <ol key={key} className="malik-md-ol">
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>)}
            </ol>
          )
        }

        if (block.kind === "quote") {
          return <blockquote key={key} className="malik-md-quote">{inline(block.lines.join(" "), key)}</blockquote>
        }

        if (block.kind === "hr") return <hr key={key} className="malik-md-hr" />

        return (
          <p key={key} className="malik-md-p">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {inline(line, `${key}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
