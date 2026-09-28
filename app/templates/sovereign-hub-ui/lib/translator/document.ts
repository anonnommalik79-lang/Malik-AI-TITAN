/** Browser-side TXT/Markdown translation: text goes to the translator; files stay in the browser. */
export type DocumentPart = { prefix: string; text: string; ending: string; translate: boolean }
export type PreparedDocument = { extension: "txt" | "md"; parts: DocumentPart[]; translatableCount: number }

const MAX_DOCUMENT_CHARS = 40_000
const MAX_TRANSLATABLE_LINES = 80
const MAX_LINE_CHARS = 4_500

export function prepareDocument(name: string, content: string): PreparedDocument {
  const extension = /\.md$/i.test(name) ? "md" : /\.txt$/i.test(name) ? "txt" : null
  if (!extension) throw new Error("Поддерживаются только документы TXT и Markdown (.md). DOCX и PDF пока недоступны без потери форматирования.")
  if (!content.trim() || content.includes("\0")) throw new Error("Файл пустой или не является текстовым UTF-8 документом.")
  if (content.length > MAX_DOCUMENT_CHARS) throw new Error(`Документ слишком длинный: максимум ${MAX_DOCUMENT_CHARS} символов.`)
  const lines = content.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) || []
  const parts: DocumentPart[] = []
  let inCode = false
  let inFrontmatter = extension === "md" && /^---(?:\r?\n|$)/.test(content)
  let frontmatterStarted = false
  for (const raw of lines) {
    const ending = raw.match(/\r\n|\n|\r$/)?.[0] || ""
    const line = ending ? raw.slice(0, -ending.length) : raw
    if (line.length > MAX_LINE_CHARS) throw new Error(`Строка длиннее ${MAX_LINE_CHARS} символов. Разбейте её перед переводом.`)
    const trim = line.trim()
    if (inFrontmatter) {
      parts.push({ prefix: "", text: line, ending, translate: false })
      if (trim === "---") { if (frontmatterStarted) inFrontmatter = false; else frontmatterStarted = true }
      continue
    }
    if (extension === "md" && /^\s*(```|~~~)/.test(line)) {
      inCode = !inCode
      parts.push({ prefix: "", text: line, ending, translate: false })
      continue
    }
    if (!trim || inCode || (extension === "md" && (/^\s*(?:\|\s*[-:]|<[^>]+>|!\[|\[[^\]]+\]:)/.test(line) || /`[^`]+`/.test(line)))) {
      parts.push({ prefix: "", text: line, ending, translate: false })
      continue
    }
    const match = extension === "md" ? line.match(/^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+))(.*)$/) : null
    const prefix = match?.[1] || ""
    const text = match ? match[2] : line
    parts.push({ prefix, text, ending, translate: Boolean(text.trim()) })
  }
  const translatableCount = parts.filter((part) => part.translate).length
  if (translatableCount > MAX_TRANSLATABLE_LINES) throw new Error(`Слишком много строк для одного перевода: максимум ${MAX_TRANSLATABLE_LINES}. Разделите документ.`)
  return { extension, parts, translatableCount }
}

export async function translatePreparedDocument(
  document: PreparedDocument,
  translate: (text: string) => Promise<string>,
  onProgress?: (completed: number, total: number) => void,
): Promise<string> {
  const result = document.parts.map((part) => part.text)
  let completed = 0
  for (let offset = 0; offset < document.parts.length; offset += 3) {
    const batch = document.parts.slice(offset, offset + 3)
    await Promise.all(batch.map(async (part, index) => {
      if (!part.translate) return
      const translated = await translate(part.text)
      if (!translated.trim()) throw new Error("Переводчик вернул пустую строку. Документ не изменён.")
      result[offset + index] = translated.trim()
      completed += 1
      onProgress?.(completed, document.translatableCount)
    }))
  }
  return document.parts.map((part, index) => `${part.prefix}${result[index]}${part.ending}`).join("")
}
