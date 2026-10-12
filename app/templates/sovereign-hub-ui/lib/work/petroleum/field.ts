import { createHash } from "node:crypto"
import { parseCsv } from "../../os/data/table"
import { auditProduction, strictDate, validateCsvQuoteClosure, type ProductionRow } from "./production"
import { convert, waterCut, gasOilRatio, finite } from "./units"
import { FIELD_METHODS, type EvidenceReference } from "./methods"
import { fieldTaskSchema, wellId, type FieldTask, type WellId, type AssetManifest } from "./field-schema"
import { baselineFor, intervalDays, lossesFor, recoveryScenarios, phaseRate, median } from "./field-loss"

export const FIELD_VERSION = "malik-field-1.0.0"
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v)).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export const fieldRevision = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
type Metric = { value: number | null; unit: string; first: number | null; changeFraction: number | null; direction: "up" | "down" | "flat" | "undefined"; refs: string[] }
export type FieldSignal = { code: string; method: string; actual: number; reference: number; deviation: number; relative: number | null; unit: string; deviationUnit: string; score: number | null; threshold: number; baselinePeriod: { start: string; end: string; samples: number }; quality: "screened-user-data"; priority: "review" | "high"; refs: string[]; explanations: string[]; missing: string[]; conclusion: string }
const safeText = (text: string) => text.replace(/[\r\n|<>`]/g, " ").slice(0,500)
const wc = (r: ProductionRow) => r.oilKnown === false || r.water === undefined ? null : waterCut({ value: r.oil, unit: "bbl/day" }, { value: r.water, unit: "bbl/day" })
const gor = (r: ProductionRow, reference?: string) => r.oilKnown === false || r.gas === undefined ? null : gasOilRatio({ value: r.oil, unit: "bbl/day" }, { value: r.gas, unit: "scf/day", reference })
const ratio = (r: ProductionRow) => r.period && r.downtime !== undefined ? r.downtime / r.period : null
function metric(first: number | null, last: number | null, unit: string, refs: string[]): Metric {
  return { value: last, first, unit, changeFraction: first !== null && first > 0 && last !== null ? last / first - 1 : null, direction: first === null || last === null ? "undefined" : last === first ? "flat" : last > first ? "up" : "down", refs }
}

/** A separate, explicit single-well monthly contract; never guesses a well or locale date. */
function normalizeHistory(task: FieldTask) {
  const header = task.csv.split(/\r?\n/,1)[0].replace(/^\uFEFF/, "").trim().toLowerCase()
  if (!header.startsWith("month,")) return task.csv
  validateCsvQuoteClosure(task.csv)
  if (!task.wellId || task.interval !== "month") throw new Error("MONTH_TABLE_REQUIRES_WELL_ID_AND_MONTH_INTERVAL")
  const rows = parseCsv(task.csv, { rows: 20001, columns: 31, cellChars: 500 })
  const aliases: Record<string,string> = { month: "date", oil_rate_bbl_day: "oil_bbl_day", water_rate_bbl_day: "water_bbl_day", gas_rate_scf_day: "gas_scf_day" }
  const columns = rows[0].map(h => aliases[h.trim().toLowerCase()] ?? h.trim().toLowerCase())
  if (columns.includes("well_id")) throw new Error("MONTH_TABLE_ALREADY_HAS_WELL_ID")
  const out = [["well_id", ...columns], ...rows.slice(1).map(row => [task.wellId!.slice(5), ...row.map((v,i) => i === 0 && /^\d{4}-\d{2}$/.test(v.trim()) ? v.trim() + "-01" : v)])]
  return out.map(row => row.map(cell => `"${cell.replaceAll('"','""')}"`).join(",")).join("\n")
}
function validateManifest(manifest: AssetManifest | undefined) {
  if (!manifest) return
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_ASSET_ID") }
  unique(manifest.fields.map(f=>f.id)); unique(manifest.reservoirs.map(r=>r.id)); unique(manifest.pads.map(p=>p.id)); unique(manifest.wells.map(w=>w.id)); unique(manifest.wells.map(w=>w.sourceId)); unique(manifest.equipment.map(e=>e.id)); unique(manifest.constraints.map(c=>c.id))
  const fields = new Set(manifest.fields.map(f=>f.id)), wells = new Set(manifest.wells.map(w=>w.id))
  const reservoirs = new Map(manifest.reservoirs.map(r=>[r.id,r.fieldId])), pads = new Map(manifest.pads.map(p=>[p.id,p.fieldId]))
  if ([...reservoirs.values(), ...pads.values()].some(id=>!fields.has(id))) throw new Error("UNKNOWN_PARENT_FIELD")
  for (const w of manifest.wells) if (!fields.has(w.fieldId) || w.reservoirId && reservoirs.get(w.reservoirId) !== w.fieldId || w.padId && pads.get(w.padId) !== w.fieldId) throw new Error("CROSS_FIELD_OR_UNKNOWN_PARENT")
  if (manifest.equipment.some(e=>!wells.has(e.wellId)) || manifest.constraints.some(c=>c.wellId && !wells.has(c.wellId))) throw new Error("UNKNOWN_WELL_REFERENCE")
}
type TelemetryPoint = FieldTask["telemetry"][number] & { evidenceRef: string }
function analyzeWell(task: FieldTask, id: WellId, rows: ProductionRow[], telemetry: TelemetryPoint[], rejected: boolean) {
  const first = rows[0], last = rows.at(-1)!, prior = rows.slice(-(task.thresholds.window + 1), -1), refs = [`input:row:${first.sourceRow}`, `input:row:${last.sourceRow}`, "method:production-kpi"]
  const pressureBasis = new Set(telemetry.filter(t=>t.pressure).map(t=>t.pressure!.basis))
  const at = new Map(telemetry.map(t=>[t.date,t]))
  if (phaseRate(last,task.phase) === null) throw new Error("MISSING_TARGET_PHASE_RATE")
  const metrics = {
    oil: metric(first.oilKnown === false ? null : first.oil, last.oilKnown === false ? null : last.oil, "bbl/day", refs),
    water: metric(first.water ?? null, last.water ?? null, "bbl/day", refs),
    gas: metric(first.gas ?? null, last.gas ?? null, "scf/day", refs),
    liquid: metric(first.water === undefined || first.oilKnown === false ? null : finite(first.oil + first.water), last.water === undefined || last.oilKnown === false ? null : finite(last.oil + last.water), "bbl/day", refs),
    waterCut: metric(wc(first), wc(last), "fraction", refs),
    gor: metric(gor(first,task.gasReference), gor(last,task.gasReference), "scf/bbl", refs),
    downtime: metric(ratio(first), ratio(last), "fraction", refs),
  }
  const warnings: string[] = [], signals: FieldSignal[] = []
  const gaps = rows.some((r,i)=>i>0 && r.day-rows[i-1].day>task.thresholds.maxGapDays)
  if (gaps) warnings.push("Gapped history; no interpolation or statistical continuity assumed")
  if (rejected) warnings.push("Input contains rejected records; counterfactual and statistics need review")
  if (pressureBasis.size > 1) warnings.push("Gauge and absolute pressures mixed; no pressure comparison made")
  const screen = (code: string, select: (row: ProductionRow)=>number|null, unit: string, threshold: number, direction: "drop"|"rise"|"either", absolute = false, sensor = false) => {
    const samples = prior.map(r=>({row:r,value:select(r)})).filter((x): x is {row:ProductionRow;value:number}=>x.value!==null)
    const actual = select(last), center = median(samples.map(x=>x.value))
    if (samples.length < 3 || center === null || actual === null || gaps || rejected || last.day - samples[0].row.day > task.thresholds.maxSpanDays) return
    const deviation = actual - center, relative = center > 0 ? deviation / center : null
    const magnitude = absolute ? deviation : relative
    const thresholdMet = magnitude !== null && (direction === "drop" ? magnitude <= -threshold : direction === "rise" ? magnitude >= threshold : Math.abs(magnitude) >= threshold) && deviation !== 0
    const mad = median(samples.map(x=>Math.abs(x.value-center)))!, z = samples.length >= 6 && mad > 0 ? 0.6745 * deviation / mad : null
    if (!thresholdMet && !(z !== null && Math.abs(z) >= task.thresholds.modifiedZ)) return
    const sampleRefs=[last,...samples.map(s=>s.row)].map(r=>sensor ? at.get(r.date)!.evidenceRef : `input:row:${r.sourceRow}`)
    signals.push({ code, method: thresholdMet ? "median-screen" : "modified-z", actual, reference: center, deviation, relative, unit, deviationUnit:absolute?"percentage-points":unit,score:thresholdMet?magnitude:z,threshold:thresholdMet?threshold:task.thresholds.modifiedZ, baselinePeriod: { start:samples[0].row.date, end:samples.at(-1)!.row.date, samples:samples.length }, quality:"screened-user-data", priority: relative !== null && Math.abs(relative) >= 0.5 ? "high" : "review", refs:[...sampleRefs, thresholdMet ? "method:median-screen" : "method:modified-z", "input:thresholds"], explanations:["Meter/basis changes", "Operating or intervention changes", "Reservoir/production changes require independent evidence"], missing:["Calibration and interventions", "Operating constraints and pressure/PVT context"], conclusion:"Mathematical deviation only; no technical failure or cause established" })
  }
  screen("rate-drop", r=>phaseRate(r,task.phase), task.phase === "gas" ? "scf/day" : "bbl/day", task.thresholds.rateDropFraction, "drop")
  screen("water-cut-rise", r=>wc(r) === null ? null : wc(r)! * 100, "%", task.thresholds.waterCutIncreasePoints, "rise", true)
  screen("gor-change", r=>gor(r,task.gasReference), "scf/bbl", task.thresholds.gorChangeFraction, "either")
  screen("downtime-rise", r=>ratio(r) === null ? null : ratio(r)! * 100, "%", task.thresholds.downtimeIncreasePoints, "rise", true)
  if (pressureBasis.size <= 1) screen("pressure-change", r=>{ const p=at.get(r.date)?.pressure; return p ? convert(p.value,p.unit,"kPa") : null }, "kPa", task.thresholds.pressureChangeFraction, "either", false, true)
  screen("power-change", r=>at.get(r.date)?.powerKw ?? null, "kW", task.thresholds.powerChangeFraction, "either", false, true)
  screen("lift-efficiency-drop", r=>at.get(r.date)?.liftEfficiency === undefined ? null : at.get(r.date)!.liftEfficiency! * 100, "%", task.thresholds.liftEfficiencyDropPoints, "drop", true, true)
  const baseline = baselineFor(task,id,rows)
  if (rejected && baseline.valid && baseline.kind === "historical-median") { baseline.valid=false; baseline.value=null; baseline.reason="Rejected records make historical baseline unsafe" }
  const losses = lossesFor(task,id,last,baseline), scenarios = recoveryScenarios(task,last,losses)
  return { id, sourceId:last.well, records:rows.length, asOf:last.date, metrics, baseline, losses, signals, scenarios, warnings,
    history:rows.map(r=>({ date:r.date, oil:r.oilKnown === false ? null : r.oil, water:r.water ?? null, gas:r.gas ?? null, liquid:r.water === undefined || r.oilKnown === false ? null : finite(r.oil+r.water), waterCut:wc(r), gor:gor(r,task.gasReference), dataKind:"user-unverified" as const, ref:`input:row:${r.sourceRow}` })),
    decision:{ observedRefs:refs, hypothesisRefs:signals.flatMap(s=>s.refs), missing:["Calibrated measurement provenance", "Intervention/constraint and geological context",...(!baseline.valid?[`Usable counterfactual: ${baseline.reason}`]:[]),...(task.scenarios.length?[]:["Recovery fraction, horizon, price/cost sources, currency and discount rate for economics"])], conclusion:signals.length ? "Prioritize independent engineering review of flagged deviations" : "No configured screening signal; absence of a signal is not proof of safe operation", engineerReviewRequired:true as const },
  }
}
export type FieldWellResult = ReturnType<typeof analyzeWell>
export type FieldProgress = { stage: "validate"|"analyze"|"complete"; processed: number; requested: number; failed: number }
export type FieldRunOptions = { signal?: AbortSignal; deadlineAt?: number }

/** Generator keeps one bounded dataset; async consumers yield to cancellation every well. */
export function* fieldSteps(task: FieldTask, options: FieldRunOptions = {}): Generator<FieldProgress, FieldResult> {
  validateManifest(task.manifest)
  const revision = fieldRevision(task), csv = normalizeHistory(task), audit = auditProduction(csv, task.gasReference, { gasOnly:task.phase === "gas" })
  const buckets = new Map<string,ProductionRow[]>()
  for (const row of audit.rows) { const group=buckets.get(row.well) ?? []; group.push(row); buckets.set(row.well,group) }
  if (buckets.size > 500) throw new Error("MAX_500_WELLS")
  const sources = task.manifest ? task.manifest.wells : [...buckets.keys()].map(sourceId=>({ id:wellId.parse(`well:${sourceId}`), sourceId }))
  if (task.manifest && [...buckets.keys()].some(sourceId=>!sources.some(w=>w.sourceId===sourceId))) throw new Error("UNMAPPED_HISTORY_WELL")
  const ids = new Set(sources.map(s=>s.id)), telemetry = new Map<WellId,TelemetryPoint[]>(), seen = new Set<string>()
  for (const [index,item] of task.telemetry.entries()) {
    if (!ids.has(item.wellId) || !strictDate(item.date) || seen.has(`${item.wellId}|${item.date}`)) throw new Error("INVALID_TELEMETRY_REFERENCE_OR_DUPLICATE")
    seen.add(`${item.wellId}|${item.date}`); const group=telemetry.get(item.wellId) ?? []; group.push({...item,evidenceRef:`input:telemetry:${index}`}); telemetry.set(item.wellId,group)
  }
  for (const plan of task.plan) if (!ids.has(plan.wellId) || !strictDate(plan.date)) throw new Error("INVALID_PLAN_REFERENCE_DATE")
  if (new Set(task.plan.map(p=>`${p.wellId}|${p.date}`)).size !== task.plan.length) throw new Error("DUPLICATE_PLAN")
  if (new Set(task.scenarios.map(s=>s.id)).size !== task.scenarios.length) throw new Error("DUPLICATE_SCENARIO")
  if (task.baseline?.kind === "supplied" && (task.baseline.values.some(v=>!ids.has(v.wellId)) || new Set(task.baseline.values.map(v=>v.wellId)).size !== task.baseline.values.length)) throw new Error("INVALID_BASELINE_WELL_REFERENCE")
  if (task.rateBasis !== "snapshot") {
    if (!task.interval) throw new Error("AVERAGING_INTERVAL_REQUIRED")
    for (const rows of buckets.values()) for (let i=0;i<rows.length;i++) if (i>0 && rows[i].day < rows[i-1].day+intervalDays(rows[i-1].date,task.interval)) throw new Error("OVERLAPPING_PRODUCTION_INTERVALS")
  }
  const wells:FieldWellResult[]=[], errors:Array<{wellId:WellId;code:string}>=[]
  let status:FieldResult["status"]="completed", processed=0
  yield {stage:"validate",processed,requested:sources.length,failed:0}
  for (const source of sources) {
    if (options.signal?.aborted || options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) { status=options.signal?.aborted ? "cancelled" : "time-limited"; break }
    const rows=buckets.get(source.sourceId)
    if (!rows) errors.push({wellId:source.id,code:"NO_VALID_HISTORY"})
    else try { wells.push(analyzeWell(task,source.id,rows,telemetry.get(source.id) ?? [],audit.rejectedRows>0)) }
    catch (error) { errors.push({wellId:source.id,code:safeText(error instanceof Error ? error.message : "WELL_FAILED")}) }
    processed++
    yield {stage:"analyze",processed,requested:sources.length,failed:errors.length}
  }
  if (errors.length && status === "completed") status="partial"
  const asOf=wells.reduce((d,w)=>w.asOf>d?w.asOf:d,"")
  const summarize=(members:WellId[])=>{
    const selected=wells.filter(w=>members.includes(w.id) && w.asOf===asOf)
    const sum=(key:"oil"|"water"|"gas")=>{ const known=selected.filter(w=>w.metrics[key].value!==null); return {value:known.length ? finite(known.reduce((a,w)=>a+w.metrics[key].value!,0),"aggregate") : null,knownWells:known.length,unit:key==="gas"?"scf/day":"bbl/day"} }
    const oil=sum("oil"),water=sum("water"),gas=sum("gas")
    const sameLiquid=selected.filter(w=>w.metrics.oil.value!==null && w.metrics.water.value!==null)
    const qo=sameLiquid.reduce((a,w)=>a+w.metrics.oil.value!,0),qw=sameLiquid.reduce((a,w)=>a+w.metrics.water.value!,0)
    return {asOf,expectedWells:members.length,includedWells:selected.length,oil,water,gas,waterCut:qo+qw>0?qw/(qo+qw):null,waterCutKnownWells:sameLiquid.length,refs:selected.flatMap(w=>w.metrics.oil.refs),note:"Same-date subtotal, not mixed-date total; missing phases are not zero; water cut is flow weighted"}
  }
  const groups = task.manifest ? [
    {id:task.manifest.portfolioId,members:sources.map(s=>s.id)},
    ...task.manifest.fields.map(f=>({id:f.id,members:task.manifest!.wells.filter(w=>w.fieldId===f.id).map(w=>w.id)})),
    ...task.manifest.reservoirs.map(r=>({id:r.id,members:task.manifest!.wells.filter(w=>w.reservoirId===r.id).map(w=>w.id)})),
    ...task.manifest.pads.map(p=>({id:p.id,members:task.manifest!.wells.filter(w=>w.padId===p.id).map(w=>w.id)})),
  ] : [{id:"provided-well-group",members:sources.map(s=>s.id)}]
  const evidence:EvidenceReference[] = [
    ...FIELD_METHODS.map((m,i)=>({id:`method:${m.id}`,kind:"method" as const,path:`result.methods.${i}`})),
    {id:"input:thresholds",kind:"assumption",path:"task.thresholds"},
    ...audit.rows.map(r=>({id:`input:row:${r.sourceRow}`,kind:"input" as const,path:`task.csv#row=${r.sourceRow}`,value:JSON.stringify({well:r.well,date:r.date,oil:r.oilKnown===false?null:r.oil,water:r.water,gas:r.gas,downtime:r.downtime,period:r.period}),unit:"Normalized bbl/day, scf/day, hour; user readings unverified"})),
    ...(task.baseline?.kind === "supplied" ? task.baseline.values.map((b,i)=>({id:`input:baseline:${i}`,kind:"assumption" as const,path:`task.baseline.values.${i}`,value:b.rate.value,unit:b.rate.unit})) : []),
    ...task.plan.map((p,i)=>({id:`input:plan:${i}`,kind:"input" as const,path:`task.plan.${i}`,value:p.rate.value,unit:p.rate.unit})),
    ...task.scenarios.map((s,i)=>({id:`input:scenario:${i}`,kind:"assumption" as const,path:`task.scenarios.${i}`})),
    ...task.telemetry.map((t,i)=>({id:`input:telemetry:${i}`,kind:"input" as const,path:`task.telemetry.${i}`,value:JSON.stringify(t)})),
  ]
  return {version:FIELD_VERSION,revision,status,requestedWells:sources.length,processedWells:processed,succeededWells:wells.length,failedWells:errors.length,unprocessedWells:sources.length-processed,asOf,rateBasis:task.rateBasis,phase:task.phase,quality:{inputRows:audit.inputRows,acceptedRows:audit.acceptedRows,rejectedRows:audit.rejectedRows,issues:audit.issues,calibration:"unverified"},wells,errors,aggregates:groups.map(g=>({id:g.id,...summarize(g.members)})),priority:wells.filter(w=>w.signals.length).sort((a,b)=>b.signals.filter(s=>s.priority==="high").length-a.signals.filter(s=>s.priority==="high").length||b.signals.length-a.signals.length||a.id.localeCompare(b.id)).map(w=>({wellId:w.id,signals:w.signals.length,criterion:"Configured screening priority/count, not causal risk probability"})),evidence,methods:FIELD_METHODS,limitations:["Analytical asset model, not a calibrated physical digital twin", "Measurements and reference achievability are unverified", "No equipment control; constraints are recorded, not operational clearance", "Recovery economics are scenarios, not observed financial results", "No organization RBAC, certified reserves or standards conformance claimed"]}
}
export type FieldResult = {version:string;revision:string;status:"completed"|"partial"|"cancelled"|"time-limited";requestedWells:number;processedWells:number;succeededWells:number;failedWells:number;unprocessedWells:number;asOf:string;rateBasis:FieldTask["rateBasis"];phase:FieldTask["phase"];quality:{inputRows:number;acceptedRows:number;rejectedRows:number;issues:ReturnType<typeof auditProduction>["issues"];calibration:string};wells:FieldWellResult[];errors:Array<{wellId:WellId;code:string}>;aggregates:Array<{id:string;asOf:string;expectedWells:number;includedWells:number;oil:{value:number|null;knownWells:number;unit:string};water:{value:number|null;knownWells:number;unit:string};gas:{value:number|null;knownWells:number;unit:string};waterCut:number|null;waterCutKnownWells:number;refs:string[];note:string}>;priority:Array<{wellId:WellId;signals:number;criterion:string}>;evidence:EvidenceReference[];methods:typeof FIELD_METHODS;limitations:string[]}
export function analyzeField(raw: unknown, options: FieldRunOptions = {}): FieldResult {
  const steps=fieldSteps(fieldTaskSchema.parse(raw),options)
  let next=steps.next()
  while (!next.done) next=steps.next()
  return next.value
}
export async function analyzeFieldAsync(raw: unknown, options: FieldRunOptions & {onProgress?:(event:FieldProgress)=>void} = {}): Promise<FieldResult> {
  const steps=fieldSteps(fieldTaskSchema.parse(raw),options)
  let next=steps.next()
  while (!next.done) { options.onProgress?.(next.value); await new Promise<void>(resolve=>setImmediate(resolve)); next=steps.next() }
  options.onProgress?.({stage:"complete",processed:next.value.processedWells,requested:next.value.requestedWells,failed:next.value.failedWells})
  return next.value
}
