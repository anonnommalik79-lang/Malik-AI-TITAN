import { evaluate, type ExprScope } from "./expr"
import { parsePartialUi } from "./partial"
import { validateUi } from "./validate"
import type { Block, UiDocument, Value } from "./protocol"

/**
 * A composition as plain Markdown: what a copy, a share, an export or a
 * screen reader gets, and what the chat shows when a fence cannot be drawn.
 * When the JSON itself is broken, the visible strings are still recovered so
 * the answer never turns into a code dump or an empty space.
 */

export function resolveValue(value: Value | null | undefined, scope: ExprScope): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "object") return evaluate(value.expr, scope)
  return value
}

const plain = (value: Value | null | undefined, scope: ExprScope) => {
  const resolved = resolveValue(value, scope)
  return resolved === null ? "—" : String(resolved)
}

const cell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ")

function blockText(block: Block, scope: ExprScope, out: string[]) {
  if (block.when && !evaluate(block.when, scope)) return
  switch (block.type) {
    case "heading": out.push(`${"#".repeat((block.level || 2) + 1)} ${plain(block.text, scope)}`); return
    case "text": case "badge": out.push(plain(block.text, scope)); return
    case "callout": out.push(`> ${block.title ? `**${block.title}** ` : ""}${plain(block.text, scope)}`); return
    case "quote": out.push(`> ${block.text}${block.author ? ` — ${block.author}` : ""}`); return
    case "divider": out.push("---"); return
    case "list": out.push(block.items.map((item, index) => `${block.style === "number" ? `${index + 1}.` : block.style === "check" ? "- [ ]" : "-"} ${typeof item === "string" ? item : `**${item.title}**${item.text ? ` — ${item.text}` : ""}`}`).join("\n")); return
    case "image": out.push(`*Фото: ${block.image.caption || block.image.alt || block.image.query}*`); return
    case "gallery": out.push(block.images.map((image) => `*Фото: ${image.caption || image.alt || image.query}*`).join("\n")); return
    case "metric": out.push(`**${block.label}:** ${plain(block.value, scope)}${block.unit ? ` ${block.unit}` : ""}${block.hint ? ` (${block.hint})` : ""}`); return
    case "progress": out.push(`**${block.label}:** ${plain(block.value, scope)} / ${block.max ?? 100}`); return
    case "code": out.push(`\`\`\`${block.language || ""}\n${block.code}\n\`\`\``); return
    case "file": out.push(`📄 ${block.name}${block.note ? ` — ${block.note}` : ""}`); return
    case "citation": out.push(block.ref ? `[${block.ref}]` : block.url ? `[${block.label || block.url}](${block.url})` : ""); return
    case "table": {
      const head = `| ${block.columns.map((column) => cell(column.label)).join(" | ")} |`
      const rule = `| ${block.columns.map(() => "---").join(" | ")} |`
      const rows = block.rows.map((row) => `| ${block.columns.map((column) => cell(plain(row[column.key], scope))).join(" | ")} |`)
      out.push([block.caption ? `**${block.caption}**` : "", head, rule, ...rows].filter(Boolean).join("\n"))
      return
    }
    case "chart": {
      const lines = block.labels.map((label, index) => `- ${label}: ${block.series.map((series) => `${block.series.length > 1 ? `${series.name} ` : ""}${plain(series.values[index], scope)}${block.unit ? ` ${block.unit}` : ""}`).join(", ")}`)
      out.push([`**${block.title || "График"}**${block.origin === "illustrative" ? " (иллюстрация, не измеренные данные)" : ""}`, ...lines].join("\n"))
      return
    }
    case "timeline": out.push(block.items.map((item) => `- **${item.date ? `${item.date} — ` : ""}${item.title}**${item.text ? `: ${item.text}` : ""}`).join("\n")); return
    case "flow": {
      const label = new Map(block.nodes.map((node) => [node.id, node.label]))
      out.push([...block.nodes.map((node) => `- **${node.label}**${node.detail ? ` — ${node.detail}` : ""}`), ...block.edges.map((edge) => `- ${label.get(edge.from)} → ${label.get(edge.to)}${edge.label ? ` (${edge.label})` : ""}`)].join("\n"))
      return
    }
    case "tree": {
      const walk = (node: { label: string; detail?: string; children?: typeof node[] }, depth: number): string[] => [`${"  ".repeat(depth)}- **${node.label}**${node.detail ? ` — ${node.detail}` : ""}`, ...(node.children || []).flatMap((child) => walk(child, depth + 1))]
      out.push(walk(block.root, 0).join("\n"))
      return
    }
    case "control": out.push(`**${block.label}:** ${String(scope[block.bind] ?? "—")}${block.unit ? ` ${block.unit}` : ""}`); return
    case "card": {
      const head = [block.number ? `${block.number}.` : "", block.title !== undefined ? `**${plain(block.title, scope)}**` : ""].filter(Boolean).join(" ")
      if (head) out.push(head)
      if (block.body !== undefined) out.push(plain(block.body, scope))
      block.items?.forEach((child) => blockText(child, scope, out))
      return
    }
    case "section":
      if (block.title) out.push(`### ${block.number ? `${block.number}. ` : ""}${block.title}`)
      block.items.forEach((child) => blockText(child, scope, out))
      return
    case "grid": case "stack": block.items.forEach((child) => blockText(child, scope, out)); return
    case "tabs": block.tabs.forEach((tab) => { out.push(`**${tab.label}**`); tab.items.forEach((child) => blockText(child, scope, out)) }); return
    case "accordion": block.items.forEach((item) => { out.push(`**${item.title}**`); item.items.forEach((child) => blockText(child, scope, out)) }); return
  }
}

/** The composition as Markdown, evaluated with the given (or initial) state. */
export function uiToText(doc: UiDocument, scope: ExprScope = doc.state || {}): string {
  const out: string[] = doc.title ? [`## ${doc.title}`] : []
  doc.blocks.forEach((block) => blockText(block, scope, out))
  return out.filter((line) => line.trim()).join("\n\n")
}

/** Visible strings recovered from JSON that does not parse. */
export function rawFallbackText(raw: string): string {
  const found: string[] = []
  const pattern = /"(?:title|heading|text|body|label|caption|detail|name|eyebrow)"\s*:\s*"((?:[^"\\]|\\.){1,1200})"/gu
  for (const match of String(raw || "").slice(0, 64 * 1024).matchAll(pattern)) {
    let decoded = match[1]
    try { decoded = JSON.parse(`"${match[1]}"`) } catch { /* keep the raw characters */ }
    const text = decoded.replace(/\s+/gu, " ").trim()
    if (text && !/^(?:https?:|data:)/iu.test(text) && !found.includes(text)) found.push(text)
    if (found.length >= 40) break
  }
  return found.join("\n\n")
}

const UI_FENCE_PATTERN = /^[ \t]*```malik-ui[ \t]*\r?\n([\s\S]*?)(?:\r?\n[ \t]*```[ \t]*$|(?![\s\S]))/gmu

/**
 * Every ```malik-ui fence of an answer written out as text: for copying,
 * reading aloud, sharing, export and for checking the figures against the
 * sources. An unfinished fence keeps its complete blocks.
 */
export function uiFencesToText(answer: string): string {
  return String(answer || "").replace(UI_FENCE_PATTERN, (_whole, body: string) => {
    try {
      const check = validateUi(JSON.parse(body))
      if (check.doc) return uiToText(check.doc)
    } catch { /* unfinished or broken: read what is complete */ }
    const partial = parsePartialUi(body)
    return partial.doc ? uiToText(partial.doc) : rawFallbackText(body)
  })
}
