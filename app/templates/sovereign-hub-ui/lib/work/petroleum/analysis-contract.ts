import { z } from "zod"

/**
 * The contract between the petroleum calculations and the visual oil report.
 *
 * PetroleumAnalysisRequest carries validated inputs only: production series in
 * declared units, where they came from, and what to compute. Every number a
 * person sees in the report is produced from it by analyzePetroleumDataset()
 * in lib/work/petroleum/analysis.ts - on the server for the receipt, and again
 * in the browser before drawing. A language model never writes these numbers;
 * a block whose stored metrics disagree with the recalculation is shown with
 * the recalculated values and a visible warning.
 *
 * Text is language-neutral: results carry codes and numbers, the report
 * translates the codes (RU / EN / KK / AR). Translation cannot change a value,
 * a unit or a formula.
 */

export const OIL_ANALYSIS_SCHEMA_VERSION = "malik-oil-analysis/1" as const
export const OIL_ANALYSIS_ENGINE_VERSION = "malik-oil-analysis-1.0.0" as const
export const OIL_REPORT_FENCE = "malik-oil-report" as const
export const OIL_LANGUAGES = ["ru", "en", "kk", "ar"] as const
export type OilLanguage = typeof OIL_LANGUAGES[number]

/** Each analysis is a section of the report; the first six mirror the owner's reference report. */
export const OIL_ANALYSES = [
  "summary", "rates", "water-cut", "gor", "forecast", "table",
  // Fifteen further analyses.
  "wor", "liquid", "oil-decline", "decline-models", "period-changes", "anomalies", "data-quality",
  "cumulative", "gas", "water-oil-balance", "hypotheses", "multiwell", "economics", "chan", "formulas",
] as const
export type OilAnalysisId = typeof OIL_ANALYSES[number]

export const LIQUID_UNITS = ["bbl/day", "m3/day", "t/day"] as const
export const GAS_UNITS = ["scf/day", "sm3/day"] as const
export type LiquidUnit = typeof LIQUID_UNITS[number]
export type GasUnit = typeof GAS_UNITS[number]

export const EVIDENCE = ["Deterministic Calculation", "Statistical Estimate", "Engineering Assumption", "Engineering Hypothesis", "Missing Evidence"] as const
export type OilEvidence = typeof EVIDENCE[number]

const rate = z.number().finite().min(0).max(1e12)
const issue = z.object({
  row: z.number().int().min(0).max(1_000_000),
  code: z.string().regex(/^[A-Z0-9_]{2,48}$/),
  column: z.string().max(80).optional(),
}).strict()

export const oilWellSeriesSchema = z.object({
  id: z.string().min(1).max(80),
  /** Time axis: months (year*12+month-1) or days since 1970 when calendar=true, else a period index. */
  t: z.array(z.number().finite().min(-1e7).max(1e7)).min(1).max(5000),
  /** The period exactly as the source wrote it. */
  period: z.array(z.string().min(1).max(40)),
  oil: z.array(rate),
  water: z.array(rate.nullable()).nullable(),
  gas: z.array(rate.nullable()).nullable(),
}).strict().superRefine((well, context) => {
  const n = well.t.length
  for (const [name, values] of [["period", well.period], ["oil", well.oil], ["water", well.water], ["gas", well.gas]] as const) {
    if (values && values.length !== n) context.addIssue({ code: "custom", message: `${name} length must equal t length`, path: [name] })
  }
  for (let index = 1; index < n; index++) {
    if (!(well.t[index] > well.t[index - 1])) { context.addIssue({ code: "custom", message: "t must strictly increase", path: ["t", index] }); break }
  }
})

export const petroleumAnalysisRequestSchema = z.object({
  schemaVersion: z.literal(OIL_ANALYSIS_SCHEMA_VERSION),
  taskType: z.literal("production-history"),
  /** Only the kind of caller; account identifiers never enter a chat message. */
  authenticatedContext: z.object({ scope: z.enum(["account", "guest", "api", "fixture"]) }).strict(),
  dataset: z.object({
    granularity: z.enum(["month", "day", "index"]),
    calendar: z.boolean(),
    wells: z.array(oilWellSeriesSchema).min(1).max(120),
  }).strict(),
  metadata: z.object({
    source: z.enum(["chat-table", "csv", "xlsx", "docx", "pdf", "api"]),
    dataKind: z.enum(["user", "synthetic"]),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    acceptedRows: z.number().int().min(0),
    rejectedRows: z.number().int().min(0),
    issues: z.array(issue).max(60),
    /** Codes for what the import did: conversions, units taken from the message, derived columns. */
    notes: z.array(z.string().regex(/^[A-Z0-9_]{2,48}$/)).max(24),
    omittedWells: z.number().int().min(0),
  }).strict(),
  units: z.object({
    liquid: z.enum(LIQUID_UNITS),
    gas: z.enum(GAS_UNITS).nullable(),
    gasReference: z.string().max(160).nullable(),
    oilDensityKgM3: z.number().finite().positive().max(2000).nullable(),
  }).strict(),
  parameters: z.object({
    forecastPeriods: z.number().int().min(0).max(24),
    price: z.object({
      value: z.number().finite().positive().max(1e6),
      currency: z.string().regex(/^[A-Z]{3}$/),
      per: z.enum(["bbl", "m3", "t"]),
    }).strict().nullable(),
  }).strict(),
  requestedAnalyses: z.array(z.enum(OIL_ANALYSES)).min(1),
  language: z.enum(OIL_LANGUAGES),
}).strict()

export type PetroleumAnalysisRequest = z.infer<typeof petroleumAnalysisRequestSchema>
export type OilWellSeries = z.infer<typeof oilWellSeriesSchema>

const num = z.number().finite().nullable()
const series = z.array(num)
const modelId = z.enum(["linear", "exponential", "harmonic"])

export const oilModelFitSchema = z.object({
  model: modelId,
  valid: z.boolean(),
  reason: z.string().optional(),
  /** linear: q = a + b·τ; exponential: q = qi·e^(−D·τ); harmonic: q = qi / (1 + D·τ). τ counts periods from the first. */
  a: num, b: num, qi: num, D: num,
  r2: num, rmse: num, n: z.number().int().min(0),
}).strict()

export const oilWellAnalysisSchema = z.object({
  id: z.string(),
  isField: z.boolean(),
  wellsInField: z.number().int().min(0),
  t: z.array(z.number().finite()),
  period: z.array(z.string()),
  oil: series, water: series, gas: series, liquid: series, wc: series, gor: series, wor: series, worDerivative: series,
  first: z.record(num), last: z.record(num), change: z.record(num),
  elapsed: z.number().finite(),
  liquidStats: z.object({ mean: z.number(), std: z.number(), cv: num, stable: z.boolean() }).strict().nullable(),
  balance: z.object({ deltaOil: z.number(), deltaWater: z.number(), deltaLiquid: z.number(), replacement: num, liquidConserved: z.boolean() }).strict().nullable(),
  decline: z.object({ total: num, perPeriod: num, effectiveAnnual: num, declining: z.boolean() }).strict(),
  models: z.array(oilModelFitSchema),
  selected: modelId.nullable(),
  forecast: z.object({
    t: z.array(z.number()),
    linear: series, exponential: series, harmonic: series,
    linearClamped: z.boolean(),
    linearZeroT: num,
  }).strict().nullable(),
  forecastBlocked: z.string().nullable(),
  periodChanges: z.array(z.object({ t: z.number(), oil: num, water: num, gas: num, liquid: num, wcPP: num, gorRel: num }).strict()),
  anomalies: z.array(z.object({ code: z.string(), t: z.number(), value: num }).strict()),
  cumulative: z.object({ oil: z.number(), water: num, gas: num, days: z.number(), basis: z.enum(["calendar-month", "daily"]) }).strict().nullable(),
  economics: z.object({
    dailyGap: num, monthGap: num, historicalGap: num,
    forecastRevenue: z.object({ linear: num, exponential: num, harmonic: num }).strict().nullable(),
  }).strict().nullable(),
  hypotheses: z.object({ water: z.array(z.string()), gas: z.array(z.string()), productivity: z.array(z.string()), measurements: z.array(z.string()) }).strict(),
  chan: z.object({ slope: num, derivativeTrend: z.enum(["rising", "falling", "flat"]).nullable() }).strict().nullable(),
}).strict()

export const petroleumAnalysisResultSchema = z.object({
  schemaVersion: z.literal(OIL_ANALYSIS_SCHEMA_VERSION),
  analysisId: z.string().regex(/^oa-[0-9a-f]{16}$/),
  engineVersion: z.literal(OIL_ANALYSIS_ENGINE_VERSION),
  language: z.enum(OIL_LANGUAGES),
  sourceSummary: z.object({
    wells: z.number().int(), periods: z.number().int(), rows: z.number().int(),
    granularity: z.enum(["month", "day", "index"]), calendar: z.boolean(),
    source: z.string(), dataKind: z.enum(["user", "synthetic"]), sourceHash: z.string().nullable(),
    firstT: z.number(), lastT: z.number(), omittedWells: z.number().int(),
  }).strict(),
  validatedInputs: z.object({
    acceptedRows: z.number().int(), rejectedRows: z.number().int(),
    units: z.object({ liquid: z.string(), gas: z.string().nullable(), gor: z.string().nullable(), gasReference: z.string().nullable(), basis: z.enum(["volume", "mass"]) }).strict(),
    notes: z.array(z.string()),
  }).strict(),
  calculatedMetrics: z.array(z.object({ id: z.string(), well: z.string(), value: num, unit: z.string(), evidence: z.enum(EVIDENCE) }).strict()),
  analysisSections: z.array(z.object({ id: z.enum(OIL_ANALYSES), status: z.enum(["computed", "insufficient-data", "not-applicable"]), reason: z.string().nullable() }).strict()),
  chartSeries: z.array(z.object({
    id: z.string(), well: z.string(), unit: z.string(), x: z.array(z.number()),
    series: z.array(z.object({ id: z.string(), values: series, role: z.enum(["fact", "model"]), style: z.enum(["solid", "dash", "dot", "dashdot"]) }).strict()),
    forecastFrom: z.number().nullable(),
  }).strict()),
  tableDatasets: z.array(z.object({ id: z.string(), well: z.string().nullable(), columns: z.array(z.object({ id: z.string(), unit: z.string() }).strict()), rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))) }).strict()),
  formulaDefinitions: z.array(z.object({ id: z.string(), tex: z.string(), variables: z.array(z.string()) }).strict()),
  modelOutputs: z.array(z.object({ well: z.string(), models: z.array(oilModelFitSchema), selected: modelId.nullable() }).strict()),
  economicOutputs: z.object({ currency: z.string(), per: z.string(), price: z.number(), wells: z.array(z.object({ well: z.string(), dailyGap: num, monthGap: num, historicalGap: num }).strict()) }).strict().nullable(),
  qualityFlags: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "critical"]), well: z.string().nullable(), t: z.number().nullable(), row: z.number().nullable(), column: z.string().nullable() }).strict()),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  provenance: z.object({
    engineVersion: z.string(), schemaVersion: z.string(), analysisId: z.string(),
    evidence: z.record(z.enum(EVIDENCE)),
    deterministic: z.literal(true),
  }).strict(),
  /** Per-well detail for the visual report (field total first when there are several wells). */
  wells: z.array(oilWellAnalysisSchema),
}).strict()

export type PetroleumAnalysisResult = z.infer<typeof petroleumAnalysisResultSchema>
export type OilWellAnalysis = z.infer<typeof oilWellAnalysisSchema>
export type OilModelFit = z.infer<typeof oilModelFitSchema>
export type OilModelId = OilModelFit["model"]

/** What travels inside a chat answer: the validated request and the metrics it produced. */
export const oilReportBlockSchema = z.object({
  kind: z.literal("malik-oil-report"),
  request: petroleumAnalysisRequestSchema,
  /** Metric values computed when the answer was written; the report recalculates and compares. */
  metrics: z.array(z.tuple([z.string(), num])).max(20_000),
}).strict()
export type OilReportBlock = z.infer<typeof oilReportBlockSchema>
