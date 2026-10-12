import { z } from "zod"
import { petroleumUnits } from "./units"
import { fieldTaskSchema } from "./field-schema"
const n = z.number().finite().min(0).max(1e15), signed = z.number().finite().min(-1e15).max(1e15)
const unit = z.enum(petroleumUnits as [typeof petroleumUnits[number], ...typeof petroleumUnits[number][]])
const quantity = z.object({ value: n, unit, reference: z.string().min(1).max(160).optional() }).strict()
export const economicsSchema = z.object({ volumes: z.array(n).min(1).max(1200), price: n, variableOpex: n, fixedOpex: n, capex: n, discountRate: z.number().finite().gt(-1).max(100), period: z.enum(["year", "month"]), currency: z.string().regex(/^[A-Z]{3}$/) }).strict()
export const petroleumTaskSchema = z.discriminatedUnion("op", [
  fieldTaskSchema,
  z.object({ op: z.literal("document-audit"), text: z.string().min(1).max(1_000_000), sourceType: z.enum(["pdf", "docx"]), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), extractionMethod: z.string().min(5).max(500) }).strict(),
  z.object({ op: z.literal("convert"), value: n, from: unit, to: unit, reference: z.string().max(160).optional() }).strict(),
  z.object({ op: z.literal("water-cut"), oil: quantity, water: quantity }).strict(),
  z.object({ op: z.literal("gor"), oil: quantity, gas: quantity }).strict(),
  z.object({ op: z.literal("decline"), qi: n, declinePerDay: n, days: z.array(n).min(1).max(1200), b: z.number().finite().min(0).max(1), applicable: z.literal(true) }).strict(),
  z.object({ op: z.literal("npv"), cashflows: z.array(signed).min(1).max(1201), rate: z.number().finite().gt(-1).max(100), period: z.enum(["year", "month"]), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
  z.object({ op: z.literal("economics"), input: economicsSchema }).strict(),
  z.object({ op: z.literal("production"), csv: z.string().min(1).max(4_000_000), forecastMonths: z.number().int().min(0).max(24).default(12), gasReference: z.string().max(160).optional(), sourceDocument: z.object({ type: z.enum(["pdf", "docx"]), sha256: z.string().regex(/^[a-f0-9]{64}$/), method: z.string().max(500) }).strict().optional(), economics: economicsSchema.optional() }).strict(),
  z.object({ op: z.literal("balance"), inputs: z.array(quantity).min(1).max(100), outputs: z.array(quantity).min(1).max(100), unit }).strict(),
  z.object({ op: z.literal("methane"), activity: n, factorKgPerUnit: n, activityUnit: z.string().min(1).max(80), methodology: z.string().min(10).max(500), factorSource: z.string().min(5).max(500), relativeUncertainty: z.number().min(0).max(1).optional() }).strict(),
])
export type PetroleumTask = z.infer<typeof petroleumTaskSchema>
