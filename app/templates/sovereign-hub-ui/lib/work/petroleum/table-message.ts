import { createHash } from "node:crypto"
import type { PetroleumReceipt } from "./engine"
import { routePetroleum } from "./router"
import { petroleumLanguage, petroleumReport } from "./report"
import type { analyzeProduction } from "./production"
import { parseProductionTable, readPrice, type TableParse } from "./table-input"
import { analyzePetroleumDataset } from "./analysis"
import { oilReportFence } from "./visual-report"
import { oilNeedsInput, oilWord } from "./analysis-i18n"
import { OIL_ANALYSES, OIL_ANALYSIS_ENGINE_VERSION, OIL_ANALYSIS_SCHEMA_VERSION, petroleumAnalysisRequestSchema, type OilLanguage, type PetroleumAnalysisRequest } from "./analysis-contract"

/**
 * Chat entry points of the visual oil report (server side).
 *
 * 1. A production table pasted into the message is computed locally and
 *    answered with the report; no model and no provider is called.
 * 2. A CSV/XLSX/DOCX production receipt from the upload engine gets the same
 *    visual report on top of its calculation protocol.
 */

export type OilTableAnswer = { ok: boolean; content: string; version: string; inputHash: string | null }
type Scope = PetroleumAnalysisRequest["authenticatedContext"]["scope"]
const MAX_FENCE_CHARS = 900_000
const SYNTHETIC = /синтетич|synthetic|тестов\p{L}*\s+данн|test\s+data|demo|демо|вымышлен|fictional|اصطناعي|синтетикалық/iu

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

function needsInputAnswer(parsed: Extract<TableParse, { kind: "needs-input" }>) {
  const language = parsed.language
  return [`**${oilWord(language, "needsTitle")}**`, "", oilNeedsInput(language, parsed.code, parsed.columns), "", oilWord(language, "needsExample")].join("\n")
}

/** Keeps the report inside the chat answer limit: the wells with the largest oil loss stay. */
function boundedFence(request: PetroleumAnalysisRequest) {
  let current = request
  for (let attempt = 0; attempt < 8; attempt++) {
    const fence = oilReportFence(current, analyzePetroleumDataset(current))
    if (fence.length <= MAX_FENCE_CHARS || current.dataset.wells.length <= 1) return fence
    const keep = Math.max(1, Math.floor(current.dataset.wells.length * 0.6))
    const ranked = [...current.dataset.wells].sort((a, b) => (b.oil[0] - b.oil[b.oil.length - 1]) - (a.oil[0] - a.oil[a.oil.length - 1]) || a.id.localeCompare(b.id))
    current = { ...current, dataset: { ...current.dataset, wells: ranked.slice(0, keep) }, metadata: { ...current.metadata, omittedWells: current.metadata.omittedWells + current.dataset.wells.length - keep } }
  }
  return oilReportFence(current, analyzePetroleumDataset(current))
}

/** A pasted production table → the visual report, or a request for the missing units. */
export function executePetroleumTable(input: { prompt: string; selectedSkillId?: unknown; scope?: Scope }): OilTableAnswer | null {
  const route = routePetroleum(input.prompt, input.selectedSkillId)
  if (route.engine !== "petroleum" && route.engine !== "chat") return null
  const parsed = parseProductionTable(input.prompt, { scope: input.scope || "guest" })
  if (!parsed) return null
  if (parsed.kind === "needs-input") {
    // Only an oil request is answered with questions; other tables keep the normal chat path.
    if (route.engine !== "petroleum") return null
    return { ok: false, content: needsInputAnswer(parsed), version: OIL_ANALYSIS_ENGINE_VERSION, inputHash: null }
  }
  const sourceHash = sha256(parsed.tableText)
  const request: PetroleumAnalysisRequest = { ...parsed.request, metadata: { ...parsed.request.metadata, sourceHash } }
  return { ok: true, content: boundedFence(request), version: OIL_ANALYSIS_ENGINE_VERSION, inputHash: sourceHash }
}

type ProductionResult = ReturnType<typeof analyzeProduction>

/** The upload engine's production receipt as an analysis request (its rows are already validated, bbl/day and scf/day). */
export function requestFromProductionReceipt(receipt: PetroleumReceipt, prompt: string, options: { scope?: Scope; source?: PetroleumAnalysisRequest["metadata"]["source"] } = {}): PetroleumAnalysisRequest | null {
  const task = receipt.task as { op?: string; forecastMonths?: number; gasReference?: string; sourceDocument?: { type?: string; sha256?: string } } | null
  const result = receipt.result as ProductionResult | undefined
  if (!receipt.ok || task?.op !== "production" || !result?.wells?.length) return null
  const days = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000
  const monthly = result.wells.every((well) => well.history.every((point) => point.date.endsWith("-01")))
  const toT = (date: string) => monthly ? Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 : days(date)
  const ranked = [...result.wells].sort((a, b) => (b.firstRate - b.lastRate) - (a.firstRate - a.lastRate) || a.well.localeCompare(b.well))
  const kept = ranked.slice(0, 120)
  const hasGas = kept.some((well) => well.history.some((point) => point.gas !== null))
  const language = petroleumLanguage(prompt) as OilLanguage
  const parsed = petroleumAnalysisRequestSchema.safeParse({
    schemaVersion: OIL_ANALYSIS_SCHEMA_VERSION,
    taskType: "production-history",
    authenticatedContext: { scope: options.scope || "guest" },
    dataset: {
      granularity: monthly ? "month" : "day",
      calendar: true,
      wells: kept.sort((a, b) => a.well.localeCompare(b.well)).map((well) => ({
        id: well.well,
        t: well.history.map((point) => toT(point.date)),
        period: well.history.map((point) => point.date),
        oil: well.history.map((point) => point.oil),
        water: well.history.some((point) => point.water !== null) ? well.history.map((point) => point.water) : null,
        gas: hasGas && well.history.some((point) => point.gas !== null) ? well.history.map((point) => point.gas) : null,
      })),
    },
    metadata: {
      source: options.source || (task.sourceDocument?.type === "pdf" ? "pdf" : task.sourceDocument?.type === "docx" ? "docx" : "csv"),
      dataKind: SYNTHETIC.test(prompt) ? "synthetic" : "user",
      sourceHash: task.sourceDocument?.sha256 && /^[a-f0-9]{64}$/.test(task.sourceDocument.sha256) ? task.sourceDocument.sha256 : receipt.inputHash,
      acceptedRows: result.audit.acceptedRows,
      rejectedRows: result.audit.rejectedRows,
      issues: result.audit.issues.slice(0, 60).map((issue) => ({ row: issue.row, code: /^[A-Z0-9_]{2,48}$/.test(issue.code) ? issue.code : "ROW_REJECTED", ...(issue.code === "MISSING_INVALID_RATE" ? { column: issue.detail.slice(0, 80) } : {}) })),
      notes: [],
      omittedWells: result.wells.length - kept.length,
    },
    units: { liquid: "bbl/day", gas: hasGas ? "scf/day" : null, gasReference: task.gasReference?.slice(0, 160) || null, oilDensityKgM3: null },
    parameters: { forecastPeriods: Math.max(0, Math.min(24, Number(task.forecastMonths ?? 12))), price: readPrice(prompt) },
    requestedAnalyses: [...OIL_ANALYSES],
    language,
  })
  return parsed.success ? parsed.data : null
}

/** Adds the visual report to an upload-engine answer; its calculation protocol stays, collapsed. */
export function withOilVisual(petroleum: { receipt: PetroleumReceipt; content: string }, prompt: string, scope?: Scope) {
  const request = requestFromProductionReceipt(petroleum.receipt, prompt, { scope })
  if (!request) return petroleum.content
  const language = request.language
  const protocol = petroleumReport(petroleum.receipt, language, false)
  return [boundedFence(request), "", `<details><summary>${oilWord(language, "protocol", { version: petroleum.receipt.version })}</summary>`, "", protocol, "", "</details>"].join("\n")
}
