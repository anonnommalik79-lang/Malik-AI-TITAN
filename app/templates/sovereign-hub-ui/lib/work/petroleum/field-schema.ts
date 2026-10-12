import { z } from "zod"

const value = z.number().finite().min(0).max(1e12)
const identifier = (kind: string) => z.string().regex(new RegExp(`^${kind}:[\\p{L}\\p{N}_. -]{1,80}$`, "u"))
export const fieldId = identifier("field").brand<"FieldId">()
export const reservoirId = identifier("reservoir").brand<"ReservoirId">()
export const padId = identifier("pad").brand<"PadId">()
export const wellId = identifier("well").brand<"WellId">()
export const equipmentId = identifier("equipment").brand<"EquipmentId">()
export type WellId = z.infer<typeof wellId>
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rate = z.object({ value, unit: z.enum(["bbl/day", "m3/day", "scf/day", "sm3/day"]) }).strict()

export const assetManifestSchema = z.object({
  portfolioId: identifier("portfolio"),
  fields: z.array(z.object({ id: fieldId, name: z.string().min(1).max(100) }).strict()).min(1).max(100),
  reservoirs: z.array(z.object({ id: reservoirId, fieldId }).strict()).max(500),
  pads: z.array(z.object({ id: padId, fieldId }).strict()).max(500),
  wells: z.array(z.object({ id: wellId, sourceId: z.string().min(1).max(80), fieldId, reservoirId: reservoirId.optional(), padId: padId.optional() }).strict()).min(1).max(500),
  equipment: z.array(z.object({ id: equipmentId, wellId, type: z.string().min(1).max(80) }).strict()).max(1000).default([]),
  constraints: z.array(z.object({ id: z.string().min(1).max(80), wellId: wellId.optional(), description: z.string().min(5).max(500) }).strict()).max(1000).default([]),
}).strict()
export type AssetManifest = z.infer<typeof assetManifestSchema>

export const fieldTaskSchema = z.object({
  op: z.literal("field-surveillance"),
  csv: z.string().min(1).max(4_000_000),
  phase: z.enum(["oil", "gas"]).default("oil"),
  rateBasis: z.enum(["snapshot", "calendar-average", "operating-average"]).default("snapshot"),
  interval: z.enum(["day", "month"]).optional(),
  wellId: wellId.optional(), // Required only for the explicit single-well Month contract.
  gasReference: z.string().min(1).max(160).optional(),
  manifest: assetManifestSchema.optional(),
  thresholds: z.object({
    window: z.number().int().min(3).max(24).default(6),
    maxGapDays: z.number().min(1).max(366).default(45),
    maxSpanDays: z.number().min(1).max(366).default(210),
    rateDropFraction: z.number().min(0).max(1).default(0.2),
    waterCutIncreasePoints: z.number().min(0).max(100).default(10),
    gorChangeFraction: z.number().min(0).max(10).default(0.3),
    downtimeIncreasePoints: z.number().min(0).max(100).default(10),
    pressureChangeFraction: z.number().min(0).max(10).default(0.2),
    powerChangeFraction: z.number().min(0).max(10).default(0.25),
    liftEfficiencyDropPoints: z.number().min(0).max(100).default(10),
    modifiedZ: z.number().min(2).max(10).default(3.5),
  }).strict().default({}),
  baseline: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("historical-median"), minSamples: z.number().int().min(3).max(24).default(6), maxDriftFraction: z.number().min(0).max(1).default(0.2), maxSpreadFraction: z.number().min(0).max(1).default(0.2) }).strict(),
    z.object({ kind: z.literal("supplied"), values: z.array(z.object({ wellId, rate, rationale: z.string().min(10).max(500), source: z.string().min(5).max(500) }).strict()).min(1).max(500) }).strict(),
  ]).optional(),
  plan: z.array(z.object({ wellId, rate, date, source: z.string().min(5).max(500) }).strict()).max(500).default([]),
  telemetry: z.array(z.object({ wellId, date, pressure: z.object({ value, unit: z.enum(["psi", "bar", "kPa", "MPa"]), basis: z.enum(["absolute", "gauge"]) }).strict().optional(), powerKw: value.optional(), liftEfficiency: z.number().min(0).max(1).optional() }).strict()).max(20_000).default([]),
  scenarios: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    recoveryFraction: z.number().min(0).max(1),
    durationDays: z.number().finite().gt(0).max(3650),
    pricePerUnit: value, variableCostPerUnit: value, priceVolumeUnit: z.enum(["bbl", "scf"]), waterDisposalPerBbl: value.default(0),
    fixedCost: value.default(0), capex: value,
    annualDiscountRate: z.number().finite().gt(-1).max(10), currency: z.string().regex(/^[A-Z]{3}$/),
    priceSource: z.string().min(5).max(500), costSource: z.string().min(5).max(500),
  }).strict()).max(10).default([]),
}).strict()
export type FieldTask = z.infer<typeof fieldTaskSchema>
