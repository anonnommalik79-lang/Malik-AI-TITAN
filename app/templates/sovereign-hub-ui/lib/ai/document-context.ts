/**
 * Big documents in a limited context, without silent cuts.
 *
 * Attached files used to be joined and cut at a fixed length: a long first
 * file pushed the second one out entirely («сравни два документа» compared
 * one), and the end of a long file - conclusions, totals, appendices - never
 * reached the model, with nothing saying so.
 *
 * Now every file gets a fair share of the budget (water-filling: small files
 * keep all their text, the rest is divided among the large ones). A file that
 * does not fit keeps its beginning and its end, and between them the
 * paragraphs that share the most words with the question - or, for a question
 * without specific words, evenly spaced parts of the whole file. Every gap is
 * marked with how much was left out, and the model is told what it is seeing.
 *
 * Deterministic, no model call, no network: words in, words out.
 */

export type DocumentPart = { label: string; text: string }
export type FittedDocument = { label: string; total: number; shown: number; omittedRanges: number }
export type FittedContext = { text: string; documents: FittedDocument[]; truncated: boolean }

const CHUNK = 2_400
const STOP = new Set([
  "что", "как", "это", "для", "или", "его", "она", "они", "при", "все", "так", "там", "где", "кто", "чем", "уже", "ещё", "еще", "тот", "эта", "эти",
  "этот", "мне", "мой", "моя", "мои", "вам", "вас", "нас", "наш", "без", "под", "над", "про", "через", "после", "перед", "между", "также", "который",
  "которые", "документ", "документы", "документа", "файл", "файла", "файлы", "файле", "текст", "сравни", "сравнить", "покажи", "найди", "расскажи",
  "сделай", "объясни", "проанализируй", "анализ", "разбери", "подробно", "кратко", "пожалуйста",
  "the", "and", "for", "with", "this", "that", "from", "what", "how", "are", "was", "were", "you", "your", "about", "into", "please", "document",
  "documents", "file", "files", "compare", "show", "find", "explain", "analyze", "analyse", "summarize", "summarise",
])

/** Words of at least three letters, cut to a 6-letter stem so «налогов», «налогами» and «налоговый» meet. */
export function questionTerms(question: string) {
  const words = String(question || "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []
  return [...new Set(words.filter((word) => !STOP.has(word)).map((word) => word.slice(0, 6)))].slice(0, 40)
}

/** Paragraph-aligned pieces of about CHUNK characters. */
export function splitIntoChunks(text: string, size = CHUNK) {
  const chunks: Array<{ start: number; end: number }> = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end)
      const line = text.lastIndexOf("\n", end)
      const sentence = text.lastIndexOf(". ", end)
      const cut = [paragraph, line, sentence].find((at) => at > start + size * 0.5)
      if (cut !== undefined && cut > 0) end = cut + 1
    }
    chunks.push({ start, end })
    start = end
  }
  return chunks
}

function scoreChunk(text: string, terms: string[], idf: Map<string, number>) {
  if (!terms.length) return 0
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []
  let score = 0
  const counts = new Map<string, number>()
  for (const word of words) {
    const stem = word.slice(0, 6)
    if (idf.has(stem)) counts.set(stem, (counts.get(stem) || 0) + 1)
  }
  for (const [stem, count] of counts) score += (idf.get(stem) || 0) * (1 + Math.log(count))
  return score
}

/** Water-filling: small parts keep everything; the rest share what is left equally. */
export function fairShares(lengths: number[], budget: number) {
  const shares = lengths.map(() => 0)
  let left = Math.max(0, budget)
  let open = lengths.map((_, index) => index)
  while (open.length && left > 0) {
    const even = Math.floor(left / open.length)
    const small = open.filter((index) => lengths[index] - shares[index] <= even)
    if (!small.length) {
      open.forEach((index) => { shares[index] += even })
      left -= even * open.length
      break
    }
    for (const index of small) {
      left -= lengths[index] - shares[index]
      shares[index] = lengths[index]
    }
    open = open.filter((index) => !small.includes(index))
  }
  return shares
}

function omitted(chars: number) {
  return `[… пропущено ≈${chars.toLocaleString("ru-RU")} символов, не относящихся к вопросу …]`
}

/** Room one gap marker and its paragraph breaks can take; reserved per kept piece so the result never exceeds its allowance. */
const MARKER_COST = 96

/** One document cut to at most `allowance` characters by the rule above, gap markers included. */
export function fitDocument(text: string, question: string, allowance: number): { text: string; shown: number; omittedRanges: number } {
  if (text.length <= allowance) return { text, shown: text.length, omittedRanges: 0 }
  // Too little room for whole paragraphs: its beginning and its end, halved.
  if (allowance < CHUNK * 2 + MARKER_COST * 3) {
    const half = Math.max(0, Math.floor((allowance - MARKER_COST) / 2))
    const head = text.slice(0, half).trimEnd()
    const tail = text.slice(text.length - half).trimStart()
    return { text: `${head}\n\n${omitted(text.length - half * 2)}\n\n${tail}`, shown: half * 2, omittedRanges: 1 }
  }
  const chunks = splitIntoChunks(text)
  const terms = questionTerms(question)
  const documentFrequency = new Map<string, number>()
  const chunkTexts = chunks.map((chunk) => text.slice(chunk.start, chunk.end))
  for (const body of chunkTexts) {
    const lower = body.toLowerCase()
    for (const term of terms) if (lower.includes(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
  }
  const idf = new Map<string, number>()
  for (const term of terms) {
    const df = documentFrequency.get(term) || 0
    // A word in every chunk tells nothing; a word in none is not in the file.
    if (df > 0 && df < chunks.length) idf.set(term, Math.log(chunks.length / df))
  }
  const keep = new Set<number>()
  let used = 0
  // Each kept piece may open one gap before it; the final gap is reserved up front.
  let cost = MARKER_COST
  const take = (index: number) => {
    if (keep.has(index) || index < 0 || index >= chunks.length) return false
    const length = chunks[index].end - chunks[index].start
    if (cost + length + MARKER_COST > allowance) return false
    keep.add(index)
    used += length
    cost += length + MARKER_COST
    return true
  }
  // The beginning (what the document is) and the end (its conclusions).
  take(0)
  take(chunks.length - 1)
  if (idf.size) {
    const ranked = chunkTexts.map((body, index) => ({ index, score: scoreChunk(body, terms, idf) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
    for (const item of ranked) take(item.index)
  }
  // Room left: evenly spaced parts of the whole, so nothing large is unseen.
  const remaining = Math.max(0, Math.floor((allowance - cost) / (CHUNK + MARKER_COST)))
  if (remaining > 0) {
    const step = chunks.length / (remaining + 1)
    for (let at = 1; at <= remaining; at++) take(Math.round(at * step))
  }
  for (let index = 1; index < chunks.length - 1 && cost < allowance - 200; index++) take(index)

  const order = [...keep].sort((a, b) => a - b)
  const pieces: string[] = []
  let omittedRanges = 0
  let cursor = 0
  for (const index of order) {
    const { start, end } = chunks[index]
    if (start > cursor) { pieces.push(omitted(start - cursor)); omittedRanges += 1 }
    pieces.push(text.slice(start, end).trim())
    cursor = end
  }
  if (cursor < text.length) { pieces.push(omitted(text.length - cursor)); omittedRanges += 1 }
  return { text: pieces.join("\n\n"), shown: used, omittedRanges }
}

/**
 * The attachment context for one request. Unchanged when everything fits;
 * otherwise each file is fitted to its fair share and the model is told so.
 */
export function fitDocumentContext(parts: DocumentPart[], question: string, budget: number): FittedContext {
  const total = parts.reduce((sum, part) => sum + part.label.length + part.text.length + 4, 0)
  if (total <= budget) {
    return {
      text: parts.map((part) => `[${part.label}]\n${part.text}`).join("\n\n"),
      documents: parts.map((part) => ({ label: part.label, total: part.text.length, shown: part.text.length, omittedRanges: 0 })),
      truncated: false,
    }
  }
  // The preface and labels come out of the same budget, sized for the worst case.
  const overhead = 480 + parts.reduce((sum, part) => sum + part.label.length * 2 + 80, 0)
  let room = Math.max(1_000, budget - overhead)
  let fitted = fitAll(parts, question, room)
  // A last guard, should the estimate ever be short: shrink until it fits.
  for (let attempt = 0; attempt < 3 && fitted.text.length > budget; attempt++) {
    room = Math.max(500, room - (fitted.text.length - budget) - 256)
    fitted = fitAll(parts, question, room)
  }
  return fitted
}

function fitAll(parts: DocumentPart[], question: string, room: number): FittedContext {
  const shares = fairShares(parts.map((part) => part.text.length), room)
  const documents: FittedDocument[] = []
  const sections = parts.map((part, index) => {
    const fitted = fitDocument(part.text, question, shares[index])
    documents.push({ label: part.label, total: part.text.length, shown: fitted.shown, omittedRanges: fitted.omittedRanges })
    return `[${part.label}]\n${fitted.text}`
  })
  const notes = documents
    .filter((document) => document.omittedRanges)
    .map((document) => `«${document.label}»: показано ≈${document.shown.toLocaleString("ru-RU")} из ${document.total.toLocaleString("ru-RU")} символов`)
  const preface = [
    "[MALIK_DOCUMENT_EXCERPTS]",
    `Файлы больше доступного контекста. ${notes.join("; ")}.`,
    "Показаны начало и конец каждого файла и фрагменты, больше всего связанные с вопросом; пропуски отмечены «[… пропущено …]».",
    "Не утверждай ничего о пропущенных частях. Если для ответа нужен конкретный раздел, назови его и попроси прислать отдельно.",
  ].join("\n")
  return { text: `${preface}\n\n${sections.join("\n\n")}`, documents, truncated: true }
}
