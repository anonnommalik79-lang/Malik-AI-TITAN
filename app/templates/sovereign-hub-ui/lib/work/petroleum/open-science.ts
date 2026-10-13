/**
 * Malik Oil AI: curated, audited DISCOVERY catalogue for petroleum science.
 * URLs are public home/docs/dataset pages, NOT live tool receipts.
 * License obligations remain with the operator; no GPL code is bundled.
 */
export type PetroleumResource = {
  id: string
  name: string
  kind: "simulator" | "research-library" | "open-dataset" | "official-data-api"
  url: string
  access: string
  license: string
  topics: readonly string[]
  caveat: string
}
export const PETROLEUM_OPEN_RESOURCES: readonly PetroleumResource[] = [
  {
    id: "opm-flow", name: "OPM Flow", kind: "simulator",
    url: "https://github.com/OPM/opm-simulators",
    access: "Self-hosted; no managed free cloud API",
    license: "GPL-3.0; check redistribution/integration obligations",
    topics: ["reservoir", "simulation", "waterflood", "polymer", "forecast", "history-matching"],
    caveat: "Not installed, executed, trained or benchmarked merely by mentioning it.",
  },
  {
    id: "porepy", name: "PorePy", kind: "simulator",
    url: "https://github.com/pmgbergen/porepy",
    access: "Self-hosted Python or container; computational resources required",
    license: "GPL-3.0; check commercial integration obligations",
    topics: ["fracture", "carbonate", "reservoir", "simulation", "multiphase"],
    caveat: "A research solver, not evidence about any specific field or validated fracture geometry.",
  },
  {
    id: "deepxde", name: "DeepXDE", kind: "research-library",
    url: "https://github.com/lululxvi/deepxde",
    access: "Open Python library; training GPU/CPU not included",
    license: "LGPL-2.1; follow license requirements",
    topics: ["pinn", "surrogate", "fno", "inverse", "simulation", "machine-learning"],
    caveat: "Library availability does not establish a trained, physics-certified surrogate.",
  },
  {
    id: "opm-norne", name: "Norne benchmark (OPM)",
    kind: "open-dataset", url: "https://github.com/OPM/opm-data",
    access: "Download benchmark simulation decks; no live telemetry API",
    license: "ODbL 1.0 for decks / DbCL 1.0 contents; check file-specific restrictions",
    topics: ["reservoir", "history-matching", "forecast", "simulation", "validation"],
    caveat: "Norwegian field benchmark, not an Abu Dhabi carbonate-asset record.",
  },
  {
    id: "volve", name: "Equinor Volve open field data",
    kind: "open-dataset", url: "https://www.equinor.com/energy/volve-data-sharing",
    access: "Equinor data platform; external sign-up may be required",
    license: "Equinor Open Data Licence; read terms before redistribution",
    topics: ["well", "production", "reservoir", "seismic", "field-data", "validation"],
    caveat: "Dataset must be downloaded and validated; user data are not automatically available.",
  },
  {
    id: "sodir", name: "SODIR FactPages",
    kind: "official-data-api", url: "https://factpages.sodir.no/en/field/tableview/production/saleable/monthly",
    access: "Public monthly field production, export CSV/XML/Excel; separate official GIS APIs",
    license: "Norwegian Licence for Open Government Data (NLOD); attribution required",
    topics: ["production", "field-data", "norway", "history", "watercut"],
    caveat: "Public production aggregates, not confidential per-well reservoir pressure or UAE telemetry.",
  },
  {
    id: "eia", name: "US EIA API v2",
    kind: "official-data-api", url: "https://www.eia.gov/opendata/",
    access: "Free registration; API key EIA_API_KEY required for live programmatic queries",
    license: "EIA open-data terms; use attribution",
    topics: ["oil-price", "brent", "wti", "energy-market", "npv", "economics"],
    caveat: "Official spot time series only when actually fetched; publication can lag the market.",
  },
]
const SEARCH_MATCH: ReadonlyArray<[RegExp, string]> = [
  [/PINN|surrogat|суррогат|нейросет|machine.learn|AI.Proxy|physics.informed|DeepONet/iu,"pinn"],
  [/FNO|Fourier.neural|оператор.Фурье/iu,"fno"],
  [/карбонат|carbonate|трещин|fractur|прорыв.вод/iu,"fracture"],
  [/полимер|polymer|EOR|заводнен|waterflood/iu,"polymer"],
  [/history.match|истори.*разработ|калибров|прогноз|forecast/iu,"history-matching"],
  [/гидродинамич|пласт|reservoir|simulat|симуляц/iu,"reservoir"],
  [/добыч|дебит|production|скважин|well/iu,"production"],
  [/сейсми|seismic/iu,"seismic"],
  [/цен.нефт|Brent|WTI|котировк|spot.price|crude.price|нефт.*цен/iu,"oil-price"],
  [/NPV|экономик|экономическ|discount|OPEX|CAPEX/iu,"economics"],
  [/Норвеги|норвеж|Norway|Norwegian|sodir/iu,"norway"],
]
/** Source recommendations are discovery pointers, never evidence that tools ran. */
export function selectPetroleumResources(prompt: string, limit=4): PetroleumResource[] {
  const text = String(prompt || "").slice(0,30_000)
  const tags = new Set(SEARCH_MATCH.filter(([re])=>re.test(text)).map(([,tag])=>tag))
  if (!tags.size) return []
  const scores = PETROLEUM_OPEN_RESOURCES.map((resource,i)=>({
    resource,i,score:resource.topics.reduce((count,topic)=>count+(tags.has(topic)?1:0),0),
  }))
  return scores.filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score || a.i-b.i)
    .slice(0,Math.max(0,Math.min(6,Math.floor(limit))))
    .map(item=>item.resource)
}
export function petroleumOpenScienceInstruction(prompt: string): string {
  const selected=selectPetroleumResources(prompt,4)
  if(!selected.length)return ""
  return [
    "PETROLEUM OPEN SCIENCE CATALOGUE — DISCOVERY ONLY, NOT FETCHED/LIVE EVIDENCE:",
    ...selected.map(x=>`- ${x.name} (${x.kind}): ${x.url}; availability: ${x.access}; license: ${x.license}; restriction: ${x.caveat}`),
    "Recommend the most relevant open tool/data source as NEXT VALIDATION STEP. Do not claim to have opened a dataset, trained a model, performed OPM/PorePy simulations, accessed EIA/SODIR records or validated a number without the actual execution receipt.",
    "Use open-source license diligence, field-data rights and privacy before commercial use. Keep field intervention / well control to authorized engineers.",
  ].join("\n")
}
