/**
 * MALIK OIL & GAS — topic-gated petroleum engineering expertise.
 * No external API, field-controller, or simulation is implied.
 */
import { petroleumKnowledgeInstruction } from "../work/petroleum/knowledge"

export const PETROLEUM_BARREL_M3 = 0.158987294928
export type OilVolumeUnit = "bbl" | "m3" | "bbl/day" | "m3/day"

const TOPIC = /(?:нефт(?:ь|и|ью|яной|яная|яные|яного|егаз|едобыч|епровод|епереработ)|газодобыч|газоконденсат|газопровод|газохранилищ|скважин|буров(?:ая|ой|ые)|бурени|дебит(?:а|ы|ом)?|пластов(?:ое|ого|ой|ых)?|нефтепродукт|НПЗ|мұнай|ұңғым|бұрғыла|газ\s+өндіру|petroleum|crude\s+oil|oilfield|oil\s+field|oil\s+well|oil\s+reservoir|oil\s+production|oil\s+refin(?:ery|ing)|oil\s+pipeline|wellbore|well\s+control|hydrocarbon\s+reservoir|gas\s+field|gas\s+well|gas\s+production|drilling\s+(?:rig|mud|fluid|operation)|reservoir\s+engineering|formation\s+evaluation|petrophysics|upstream\s+oil|midstream\s+oil|downstream\s+oil)/iu

export function isOilGasRequest(prompt: string): boolean {
  return TOPIC.test(String(prompt || "").slice(0, 30000)) || /@Malik Oil AI|النفط|الغاز الطبيعي|إنتاج النفط|البئر|الآبار|مكمن|الغاز المسال|\bLNG\b|water\s*cut|gas.oil ratio|H2S.*(?:alarm|emergency)|сероводород.*(?:авари|срочно)/iu.test(prompt)
}

/** Physical oil barrels and stock-tank volumes only, NOT boe or reservoir barrels. */
export function convertOilVolume(value: number, from: OilVolumeUnit, to: OilVolumeUnit): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Volume must be finite and non-negative")
  const units: readonly OilVolumeUnit[] = ["bbl", "m3", "bbl/day", "m3/day"]
  if (!units.includes(from) || !units.includes(to)) throw new RangeError("Unknown oil-volume unit")
  if (from.endsWith("/day") !== to.endsWith("/day")) throw new RangeError("Cannot convert total volume to flow rate")
  const m3 = from.startsWith("bbl") ? value * PETROLEUM_BARREL_M3 : value
  const result = to.startsWith("bbl") ? m3 / PETROLEUM_BARREL_M3 : m3
  if (!Number.isFinite(result)) throw new RangeError("Volume overflow")
  return result
}

/** API gravity requires specific gravity at 60°F/60°F. */
export function apiGravity(sg60: number): number {
  if (!Number.isFinite(sg60) || sg60 <= 0) throw new RangeError("SG must be positive")
  return 141.5 / sg60 - 131.5
}

export function specificGravity(api: number): number {
  if (!Number.isFinite(api) || api <= -131.5) throw new RangeError("API gravity must be above -131.5")
  return 141.5 / (api + 131.5)
}

function verifiedReceipt(prompt: string): string {
  const text = prompt.slice(0, 3000)
  const bblToM3 = text.match(/(\d+(?:[\s_]\d{3})*(?:[.,]\d+)?)\s*(?:bbl|barrels?|баррел(?:ь|я|ей|ях|ям|ями)).{0,45}?(?:\s+в\s+|\s+to\s+|\s+into\s+|→|->)\s*(?:m3|m³|м3|м³|кубическ(?:их|ие)\s+метр(?:ов|а|ы)?)(?![\p{L}\d])/iu)
  const m3ToBbl = bblToM3 ? null : text.match(/(\d+(?:[\s_]\d{3})*(?:[.,]\d+)?)\s*(?:m3|m³|м3|м³|кубическ(?:их|ие)\s+метр(?:ов|а|ы)?).{0,45}?(?:\s+в\s+|\s+to\s+|\s+into\s+|→|->)\s*(?:bbl|barrels?|баррел(?:ь|я|ей|ях|ям|ями))(?![\p{L}\d])/iu)
  const v = bblToM3 || m3ToBbl
  if (v) {
    const input = Number(v[1].replace(/[\s_]/g, "").replace(",", "."))
    if (Number.isFinite(input) && input >= 0 && input <= 1e12) {
      const from: OilVolumeUnit = bblToM3 ? "bbl" : "m3"
      const to: OilVolumeUnit = bblToM3 ? "m3" : "bbl"
      return "VERIFIED PETROLEUM VOLUME: " + input + " " + from + " = " +
        Number(convertOilVolume(input, from, to).toFixed(8)) + " " + to +
        " (1 petroleum bbl = 0.158987294928 m3; stock volume, not boe)."
    }
  }
  const sg = text.match(/(?:\bSG\b|specific\s+gravity|sp\.?\s*gr\.?|относительн(?:ая|ой)\s+плотност[ьи])\s*(?:=|:|of|равна|составляет)?\s*(\d+(?:[.,]\d+)?)/iu)
  if (sg && /\bAPI\b/iu.test(text)) {
    const input = Number(sg[1].replace(",", "."))
    if (input > 0 && input <= 2) {
      return "VERIFIED API GRAVITY: SG(60°F/60°F)=" + input +
        " => " + Number(apiGravity(input).toFixed(4)) + " °API (141.5 / SG - 131.5)."
    }
  }
  return ""
}

export function buildOilGasSkillInstruction(prompt: string): string {
  if (!isOilGasRequest(prompt)) return ""
  const receipt = verifiedReceipt(prompt)
  return [
    "MALIK OIL & GAS EXPERT — PETROLEUM ENGINEERING SKILL:",
    petroleumKnowledgeInstruction(),
    "Respond as a careful petroleum-industry analyst in the user's language (KK/RU/EN), without claiming professional licensure or field certification.",
    "DISCIPLINES: upstream exploration/geology, logs and petrophysics, reservoir characterization and PVT, drilling and completions, well testing, artificial lift and production optimization, gas processing, LNG, refining and petrochemistry, pipeline integrity, energy economics, emissions and Kazakhstan-specific industry context.",
    "ENGINEERING: identify asset and objective; show assumptions, formula, input units, reference temperature/pressure and dimensional/plausibility checks. Distinguish reported well data, inferred parameters, forecasts and illustrative estimates. If critical inputs are missing, request only the decisive input or provide a labeled scenario, never fabricate logs, fluid properties, reserves, rates or simulation results.",
    "DISTINCTIONS: stock-tank bbl vs reservoir barrels vs boe; oil vs gas volume at stated reference conditions; flow rate vs volume; SG measured at 60°F/60°F for API gravity. Never silently substitute one for another.",
    "RESERVES: distinguish OOIP/GIIP, contingent/prospective resources, recoverable resources and commercial reserves per applicable SPE-PRMS definitions. Proved reserves need supporting maturity and commercial criteria.",
    "PROJECT ECONOMICS: when relevant, show CAPEX, OPEX, price assumptions, royalties and tax basis, discount rate, time horizon, decline profile and sensitivity ranges. Do not invent today's oil price, Kazakhstan legislation, compliance evidence or operator financials.",
    "EVIDENCE: prefer primary regulatory/operator records, SPE, API and ISO standards with edition and jurisdiction, plus well-documented engineering literature. Cite actual retrieved sources only. OSHA is US guidance; verify Kazakhstan rules separately where applicable.",
    "SAFETY: H2S, well control, high pressure, ignition risks, confined spaces and releases are high consequence. Prioritize on-site emergency procedures, shutdown/evacuation when indicated, and qualified supervisory review. Never present unverified BOP settings, kill procedures or equipment setpoints as actionable field orders.",
    "DATA: for CSVs/logs preserve well identifiers, timestamp, depth datum and units; examine missing data, sensor calibration, leakage between wells/time ranges and prediction uncertainty. Never claim an operation or simulation actually ran unless evidence confirms it.",
    ...(receipt ? [receipt, "For that explicit calculation, retain the verified number and unit basis; if context is ambiguous, say so."] : []),
  ].join("\n")
}
