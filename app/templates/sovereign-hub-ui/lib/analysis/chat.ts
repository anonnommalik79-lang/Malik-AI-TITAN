import { createHash } from "node:crypto"
import { parseCsv, toTable } from "@/lib/os/data/table"
import { readXlsx } from "@/lib/os/data/xlsx"
import { analysisLocale, findMessageTable, wantsAnalysis, type FoundTable } from "./detect"
import { analyzeTable, type AnalysisLocale } from "./engine"
import { analysisCopy, renderAnalysisReport } from "./report"

/**
 * Malik Analyst in the chat: data in, verified report out.
 *
 * The chat route calls this before the model. When the message carries a
 * table (or one CSV/XLSX file) and asks something about it, the numbers are
 * computed here, shown at once as a report, and handed to the model as
 * evidence for the written takeaways. Anything else returns null and the chat
 * answers as before.
 */

type Attachment = { name?: string; mime?: string; text?: string; base64?: string; size?: number; kind?: string }

export type ChatDataAnalysis = {
  report: string
  evidence: string
  locale: AnalysisLocale
  rows: number
  measures: number
  inputHash: string
  narrativeHeading: string
  narrativeUnavailable: string
  source: "message" | "file"
}

const MAX_FILE_BYTES = 8 * 1024 * 1024
const TABLE_FILE = /\.(?:csv|tsv|xlsx)$/i

function fileTable(file: Attachment): FoundTable | null {
  const name = String(file.name || "")
  if (!TABLE_FILE.test(name) && !/text\/csv|tab-separated|spreadsheetml/i.test(String(file.mime || ""))) return null
  if (file.size && file.size > MAX_FILE_BYTES) return null
  let rows: string[][]
  if (/\.xlsx$/i.test(name) || /spreadsheetml/i.test(String(file.mime || ""))) {
    if (!file.base64 || file.base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4) return null
    try { rows = readXlsx(Buffer.from(file.base64, "base64"), { rows: 20_000, columns: 60 }) } catch { return null }
  } else {
    const text = typeof file.text === "string" ? file.text : file.base64 ? Buffer.from(file.base64, "base64").toString("utf8") : ""
    if (!text || text.length > MAX_FILE_BYTES) return null
    rows = parseCsv(text)
  }
  const table = toTable(rows)
  if (!table.rows.length) return null
  return { header: table.header, rows: table.rows, truncated: table.truncated, source: "file", name, rest: "" }
}

/** The report and the model evidence for a data question, or null for anything else. */
export function analyzeChatData(input: { prompt: string; attachments?: unknown }): ChatDataAnalysis | null {
  const prompt = String(input.prompt || "")
  const attachments = (Array.isArray(input.attachments) ? input.attachments : []).filter((item): item is Attachment => Boolean(item) && typeof item === "object")
  let found: FoundTable | null = null
  if (attachments.length === 1) {
    const table = fileTable(attachments[0])
    if (table) found = { ...table, rest: prompt }
  }
  // Other attachments (photos, documents) belong to the multimodal path.
  if (!found && attachments.length) return null
  if (!found) found = findMessageTable(prompt)
  if (!found || !wantsAnalysis(found.rest, found.source)) return null

  // The request decides the language; the data's own labels break a tie («Қаңтар»).
  const locale = found.rest.trim() && analysisLocale(found.rest) !== "ru" ? analysisLocale(found.rest) : analysisLocale(`${found.rest}\n${prompt.slice(0, 2000)}`)
  const analysis = analyzeTable(found, { locale, focus: found.rest })
  if (!analysis) return null
  const hash = createHash("sha256").update(JSON.stringify([found.header, found.rows])).digest("hex")
  const title = found.name ? found.name.replace(/\.[a-z]+$/i, "") : undefined
  const report = renderAnalysisReport(analysis, { locale, title, hash })
  const copy = analysisCopy(locale)
  return {
    report: report.markdown,
    evidence: report.evidence,
    locale,
    rows: analysis.rows,
    measures: analysis.measures.length,
    inputHash: hash,
    narrativeHeading: `### ${copy.narrative}`,
    narrativeUnavailable: copy.narrativeUnavailable,
    source: found.source,
  }
}

/**
 * What the model is told when it writes the takeaways: the computed facts,
 * and that they are final. Shared by the main chat engine and MalikCoder.
 */
export function computedEvidenceInstruction(metadata: unknown) {
  const evidence = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).computedEvidence : undefined
  if (typeof evidence !== "string" || !evidence.trim()) return ""
  return [
    "MALIK ANALYST VERIFIED RESULTS (computed in code from the user's own data; the user already sees them as a report with charts and a table above your answer):",
    evidence.slice(0, 14_000),
    "Write only the takeaways that follow the report, in the user's language: what the numbers mean, the most likely explanations (marked as hypotheses), risks, and 3-5 concrete next steps. Quote figures exactly as computed above; never recompute, round differently or invent figures, periods or categories that are not there. Do not repeat the report, its tables or its charts. No heading at the top: the chat already shows one.",
  ].join("\n\n")
}
