import { parseMarkdown, tablesOf } from "./markdown"
export const DOCUMENT_FORMATS = ["docx", "pdf", "xlsx", "csv", "md", "txt", "html", "json", "zip"] as const
export type DocumentFormat = typeof DOCUMENT_FORMATS[number]
export function hasDocumentTable(markdown: string) { return tablesOf(parseMarkdown(markdown)).length > 0 }
export function artifactFormats(kind: string, content?: string): string[] {
  if (!content) return []
  if (kind === "dataset") return ["csv", "xlsx"]
  if (kind === "presentation") return ["pptx", "json"]
  if (kind === "code") return ["zip"]
  if (kind === "website") return ["html"]
  if (["text", "document", "analysis", "business-plan"].includes(kind)) return DOCUMENT_FORMATS.filter((format) => !["csv", "xlsx"].includes(format) || hasDocumentTable(content))
  return []
}
