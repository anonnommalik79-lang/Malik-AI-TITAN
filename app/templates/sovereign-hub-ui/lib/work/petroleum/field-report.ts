import type { FieldResult } from "./field"

const safe=(value:unknown)=>String(value??"—").replace(/[\r\n|<>`]/g," ").slice(0,300)
const fmt=(v:number|null|undefined)=>v === null || v === undefined ? "—" : Number(v.toPrecision(8)).toString()
/** Additive data contract for the existing engineering UI; no visual component is replaced. */
export function fieldUiContract(result: FieldResult) {
  return { schemaVersion:1, header:{title:"Malik Oil — Verified Production & Loss Intelligence",revision:result.revision,algorithm:result.version,status:result.status,asOf:result.asOf},
    quality:result.quality,counts:{requested:result.requestedWells,processed:result.processedWells,succeeded:result.succeededWells,failed:result.failedWells,unprocessed:result.unprocessedWells},
    assets:result.aggregates, wells:result.wells.map(w=>({id:w.id,kpis:w.metrics,baseline:w.baseline,losses:w.losses,hypotheses:w.signals,scenarios:w.scenarios,warnings:w.warnings,decision:w.decision,
      charts:[{id:`${w.id}:production`,dataKind:"user-unverified",x:"date",series:w.history}],forecast:[],forecastStatus:"Use existing decline operation with applicability checks; this loss workflow does not invent forecasts"})),
    formulas:result.methods,evidence:result.evidence,warnings:result.limitations,confidence:{kind:"not-calibrated",statement:"No arbitrary probabilities or calibrated confidence intervals"},errors:result.errors }
}
export function fieldReport(result: FieldResult, charts=true) {
  const lines=["## Field intelligence", "", `${result.status}: ${result.processedWells}/${result.requestedWells} processed; ${result.succeededWells} succeeded; ${result.failedWells} failed; ${result.unprocessedWells} unprocessed.`,
    `Dataset revision: ${result.revision}; rate basis: ${result.rateBasis}; as of ${result.asOf || "no successful history"}.`,
    "", "User measurements are unverified. A signal is not a diagnosis. Baseline gaps and downtime-supported estimates are not measured losses; recovery is a scenario requiring engineer review.",
    "", "| Well | Oil (bbl/day) | Water cut (%) | GOR (scf/bbl) | Baseline | Gap | Downtime estimate | Unassigned gap |", "|---|---|---|---|---|---|---|---|",
    ...result.wells.slice(0,100).map(w=>`| ${safe(w.id)} | ${fmt(w.metrics.oil.value)} | ${fmt(w.metrics.waterCut.value===null?null:w.metrics.waterCut.value*100)} | ${fmt(w.metrics.gor.value)} | ${fmt(w.baseline.value)} ${w.losses.rateUnit} | ${fmt(w.losses.gapVolume??w.losses.rateGap)} ${w.losses.gapVolume===null?w.losses.rateUnit:w.losses.volumeUnit} | ${fmt(w.losses.downtimeSupportedEstimate)} ${w.losses.volumeUnit} | ${fmt(w.losses.unassignedGap)} ${w.losses.volumeUnit} |`),
    "", `Displayed ${Math.min(100,result.wells.length)}/${result.wells.length} successful wells; full structured result is available through the existing skill API JSON.`,
  ]
  for (const w of result.wells.slice(0,10)) {
    lines.push("",`### ${safe(w.id)}`,safe(w.baseline.reason),safe(w.losses.limitation),...w.warnings.map(v=>`- ${safe(v)}`),...w.signals.map(s=>`- ${safe(s.code)}: ${fmt(s.actual)} vs ${fmt(s.reference)} ${s.unit}; ${s.method}; ${safe(s.baselinePeriod.start)}–${safe(s.baselinePeriod.end)}; ${safe(s.conclusion)}`))
    for (const scenario of w.scenarios) lines.push(scenario.status === "calculated" ? `- Scenario ${safe(scenario.id)}: ${fmt(scenario.volume)} ${scenario.volumeUnit}; NPV ${fmt(scenario.npv)} ${scenario.currency}; ${scenario.durationDays} days; CAPEX ${fmt(scenario.capex)}; no guaranteed recovery.` : `- Scenario ${safe(scenario.id)}: ${safe(scenario.reason)}`)
  }
  if (charts) for (const w of result.wells.slice(0,2)) if (w.history.some(r=>r.oil!==null || r.gas!==null)) {
    const gas=result.phase === "gas", points=w.history.filter(p=>(gas?p.gas:p.oil)!==null).slice(-400)
    lines.push("", "```malik-visual", JSON.stringify({version:2,type:"chart",chart:"line",title:safe(w.id),dataKind:"user",unit:gas?"scf/day":"bbl/day",labels:points.map(p=>p.date),series:[{name:gas?"Gas":"Oil",values:points.map(p=>(gas?p.gas:p.oil)??0)}],note:"Only known phase values; user readings unverified, not a forecast"}), "```")
  }
  for (const error of result.errors.slice(0,30)) lines.push(`- ${safe(error.wellId)}: ${safe(error.code)}`)
  lines.push("", "### Reproducible methods", ...result.methods.map(m=>`- ${m.id} v${m.version}: ${m.equation}; ${m.units}; ${m.applicability}`), "", ...result.limitations.map(l=>`- ${l}`))
  return lines.join("\n")
}
