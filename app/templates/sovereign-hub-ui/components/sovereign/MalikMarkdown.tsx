"use client"

import { Fragment, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"

/**
 * Renders an assistant answer as structured text.
 *
 * The chat used to print the model's reply into a `whitespace-pre-wrap` div, so
 * everything arrived as one unbroken wall: headings, lists and code all landed
 * as the same run of prose, and any markdown the model produced showed up as
 * literal asterisks. Two answers of identical quality read completely
 * differently depending only on this.
 *
 * Deliberately dependency-free and deliberately not `dangerouslySetInnerHTML`:
 * the text comes from a model, which means it can contain anything, so it is
 * parsed into React elements and never into HTML. A construct this parser does
 * not know stays visible as the plain text it was, which is the right failure
 * for a chat - nothing is ever silently swallowed.
 */

type Props = { text: string; className?: string }

/** `**bold**`, `*italic*`, `` `code` ``, and [links](url), in one pass. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Ordered by precedence: code first, so **bold** inside `code` stays literal.
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g

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
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="malik-md-link">{label}</a>,
      )
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
  | { kind: "code"; language: string; lines: string[] }
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

/** Groups the answer into blocks. Line-based, because that is how models write. */
function parseBlocks(source: string): Block[] {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    // Fenced code. An unterminated fence runs to the end rather than eating the
    // rest of the answer as prose - a truncated stream is a normal event here.
    const fence = line.match(/^\s*```(\w*)\s*$/)
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ kind: "code", language: fence[1] || "", lines: body })
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

  return blocks
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="malik-md-codeblock">
      <div className="malik-md-codebar">
        <span>{language || "code"}</span>
        <button type="button" onClick={() => void copy()} aria-label="Копировать код">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre className="malik-md-pre" data-language={language || undefined}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function MalikMarkdown({ text, className }: Props) {
  const blocks = parseBlocks(text)

  return (
    <div className={className ? `malik-md ${className}` : "malik-md"}>
      {blocks.map((block, position) => {
        const key = `b${position}`

        if (block.kind === "code") {
          return <CodeBlock key={key} language={block.language} code={block.lines.join("\n")} />
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
