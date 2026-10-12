import { parseCsv } from "../../os/data/table"
import { convert, waterCut, gasOilRatio, finite, type PetroleumUnit } from "./units"
import { fitExponential, decline } from "./reservoir"

export type ProductionRow = { well: string; date: string; day: number; oil: number; oilKnown?: boolean; water?: number; gas?: number; downtime?: number; period?: number; injection?: number; sourceRow: number }
export type DataIssue = { row: number; code: string; detail: string }
export function validateCsvQuoteClosure(csv: string) {
  let quoted=false
  for (let i=0;i<csv.length;i++) if (csv[i] === '"') { if (quoted && csv[i+1] === '"') i++; else quoted=!quoted }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE")
}
export function normalizeDigits(text: string) { return text.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0)-(c <= "٩" ? 0x660 : 0x6f0))).replace(/٫/g,".") }
export function strictDate(text: string): string | null {
  const match = normalizeDigits(text).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3])))
  return date.toISOString().slice(0,10) === match[0] ? match[0] : null
}
function number(text: string) {
  const value = normalizeDigits(text).trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  try { return finite(Number(value)) } catch { return null }
}
/** Deliberate narrow import contract: unit-bearing headers, ISO dates, no guessed units or Excel epochs. */
export function auditProduction(csv: string, gasReference?: string, options?: { gasOnly?: boolean }) {
  if (!csv.trim() || csv.length > 4_000_000) throw new Error("CSV empty or exceeds 4 MB text limit")
  validateCsvQuoteClosure(csv)
  const table = parseCsv(csv, { rows: 20001, columns: 31, cellChars: 500 })
  if (table.length < 2 || table.length > 20001) throw new Error("1..20000 data rows required; truncation rejected")
  const header = table[0].map(v => v.trim().toLowerCase()), allowed = /^(well_id|date|(?:oil|water|injection)_(?:bbl|m3)_day|gas_(?:scf|sm3)_day|downtime_hours|period_hours)$/
  if (header.length > 30 || new Set(header).size !== header.length || header.some(h => !allowed.test(h))) throw new Error("Unknown/duplicate header; use well_id,date,oil_bbl_day (or oil_m3_day), optional water/gas/injection rates and downtime_hours,period_hours")
  const indices = (prefix: string) => header.map((h,i) => h.startsWith(prefix) ? i : -1).filter(i => i>=0)
  const oilColumns=indices("oil_"), waterColumns=indices("water_"), gasColumns=indices("gas_"), injectionColumns=indices("injection_")
  const gasOnly = options?.gasOnly === true && oilColumns.length === 0 && gasColumns.length === 1
  if (!header.includes("well_id") || !header.includes("date") || (!gasOnly && oilColumns.length !== 1) || waterColumns.length > 1 || gasColumns.length > 1 || injectionColumns.length > 1) throw new Error("Exactly one oil rate column (or explicit gas-only history) and well_id,date required; mixed units must be normalized per column")
  if (gasColumns.length && !gasReference?.trim()) throw new Error("Gas reference conditions required for GOR")
  if (header.includes("downtime_hours") !== header.includes("period_hours")) throw new Error("Both downtime_hours and period_hours required for availability")
  const issues: DataIssue[]=[], candidates: ProductionRow[]=[]
  for (let i=1;i<table.length;i++) {
    const row=table[i], sourceRow=i+1
    if (row.length !== header.length || row.some(c=>c.length>500)) { issues.push({row:sourceRow,code:"ROW_SHAPE",detail:"Wrong column count or oversized cell"}); continue }
    const well=row[header.indexOf("well_id")].trim(), date=strictDate(row[header.indexOf("date")].trim())
    if (!/^[\p{L}\p{N}_. -]{1,80}$/u.test(well) || !date) { issues.push({row:sourceRow,code:"IDENTITY_DATE",detail:"Well identifier/ISO date invalid; instructions are never executable"}); continue }
    let invalid=false
    const readRate = (cols: number[], to: PetroleumUnit) => {
      if (!cols.length) return undefined
      const col=cols[0], raw=number(row[col])
      if(raw===null) { issues.push({row:sourceRow,code:"MISSING_INVALID_RATE",detail:header[col]}); invalid=true; return undefined }
      const from=header[col].replace(/^(oil|water|gas|injection)_/,'').replace('_day','/day') as PetroleumUnit
      return convert(raw,from,to,gasReference)
    }
    const oil=gasOnly ? 0 : readRate(oilColumns,"bbl/day"), water=readRate(waterColumns,"bbl/day"), gas=readRate(gasColumns,"scf/day"), injection=readRate(injectionColumns,"bbl/day")
    let downtime: number|undefined, period: number|undefined
    if(header.includes("downtime_hours")) {
      downtime=number(row[header.indexOf("downtime_hours")])??undefined; period=number(row[header.indexOf("period_hours")])??undefined
      if(downtime===undefined || !period || downtime>period) { invalid=true; issues.push({row:sourceRow,code:"INVALID_DOWNTIME",detail:"0 <= downtime <= period; period > 0"}) }
    }
    if(!invalid && oil!==undefined) candidates.push({well,date,day:Date.parse(date)/86400000,oil,...(gasOnly ? { oilKnown: false } : {}),water,gas,injection,downtime,period,sourceRow})
  }
  const groups=new Map<string,ProductionRow[]>()
  for(const row of candidates) { const key=`${row.well}\0${row.date}`; const group = groups.get(key) || []; group.push(row); groups.set(key, group) }
  const rows: ProductionRow[]=[]
  for(const duplicate of groups.values()) {
    if(duplicate.length===1) rows.push(duplicate[0])
    else for(const row of duplicate) issues.push({row:row.sourceRow,code:"DUPLICATE_CONFLICT",detail:"All duplicate well/date records excluded; reconcile upstream"})
  }
  rows.sort((a,b)=>a.well.localeCompare(b.well)||a.day-b.day)
  if (!rows.length) throw new Error("No valid unique production rows")
  return { rows, issues, inputRows:table.length-1, acceptedRows:rows.length, rejectedRows:table.length-1-rows.length, inputUnits:header.filter(h=>h.includes("_day")), gasReference }
}
export function analyzeProduction(csv: string, months: number, gasReference?: string) {
  const audit=auditProduction(csv,gasReference), buckets=new Map<string,ProductionRow[]>()
  for(const row of audit.rows) { const group=buckets.get(row.well)||[]; group.push(row); buckets.set(row.well,group) }
  const wells=[...buckets.entries()].map(([well, rows])=> {
    const first=rows[0], last=rows[rows.length-1], issues: string[]=[], changes: Array<{date:string;change:number;flag:string}>=[]
    for(let i=1;i<rows.length;i++) {
      const previous=rows[i-1], current=rows[i], gap=current.day-previous.day
      if(gap>45) issues.push(`Gap of ${gap} days before ${current.date}; no interpolation`)
      if(previous.oil>0) { const change=(current.oil-previous.oil)/previous.oil; if(Math.abs(change)>=0.3) changes.push({date:current.date,change,flag:"30% adjacent change screening; not a causal diagnosis"}) }
    }
    const wc=(r:ProductionRow)=>r.water===undefined ? null : waterCut({value:r.oil,unit:"bbl/day"},{value:r.water,unit:"bbl/day"})
    const gor=(r:ProductionRow)=>r.gas===undefined ? null : gasOilRatio({value:r.oil,unit:"bbl/day"},{value:r.gas,unit:"scf/day",reference:gasReference})
    const fit=fitExponential(rows.map(r=>({day:r.day,rate:r.oil})))
    const forecast=fit.ok && !issues.length && !changes.length && audit.rejectedRows===0 ? Array.from({length:months},(_,i)=> {
      const days=(i+1)*365.25/12
      return {month:i+1,days,low:decline(fit.qi,fit.declinePerDay*1.2,fit.lastDay+days),base:decline(fit.qi,fit.declinePerDay,fit.lastDay+days),high:decline(fit.qi,fit.declinePerDay*0.8,fit.lastDay+days)}
    }) : []
    const totalHours=rows.reduce((a,r)=>a+(r.period||0),0), downHours=rows.reduce((a,r)=>a+(r.downtime||0),0)
    return {well,records:rows.length,firstDate:first.date,lastDate:last.date,firstRate:first.oil,lastRate:last.oil,changeFraction:first.oil>0 ? (last.oil-first.oil)/first.oil : null,
      waterCutFirst:wc(first),waterCutLast:wc(last),gorFirst:gor(first),gorLast:gor(last),gorChange:gor(first)!==null && gor(first)!>0 && gor(last)!==null ? gor(last)!/gor(first)!-1 : null,
      availability:totalHours>0?1-downHours/totalHours:null,injectionLast:last.injection??null,changes,issues,fit,forecast,
      forecastBlocked:forecast.length===0?(!fit.ok?fit.reason:"Anomalies, gaps, rejected data or zero horizon require review"):undefined,
      history:rows.map(r=>({date:r.date,oil:r.oil,water:r.water??null,gas:r.gas??null})) }
  })
  return { audit:{...audit,rows:undefined},wells,unit:"bbl/day",gasUnit:"scf/day",assumptions:["Input measurements are user supplied and unverified; no calibration evidence checked", "Rates are snapshots; summing them is not cumulative production", "Forecast is an empirical conditional scenario; stable operating conditions and boundary-dominated flow require engineer confirmation", "30.4375 days per forecast month; decline ±20% scenarios are not confidence intervals", "No proven reserves, EOR effectiveness, physical failure cause or safety clearance inferred"] }
}
