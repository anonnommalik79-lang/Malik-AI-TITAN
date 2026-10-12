import { isOilGasRequest, buildOilGasSkillInstruction } from "../../ai/oil-gas-skill"
import { taskFromPetroleumPrompt } from "./message"
import { runPetroleum } from "./engine"
import { petroleumReport } from "./report"
/** Server-side supplement to the existing presentation engine, not a second output engine. */
export function petroleumPresentationInstruction(topic:string) {
  if(!isOilGasRequest(topic))return ""
  const task=taskFromPetroleumPrompt(topic)
  const receipt=task?runPetroleum(task):null
  return [buildOilGasSkillInstruction(topic),"PETROLEUM DECK: keep requested presentation JSON/schema. Do not fabricate field facts or arithmetic. Label assumptions, missing data and engineering review in slide notes.",receipt?"ACTUAL DETERMINISTIC RECEIPT (not source verification):\n"+petroleumReport(receipt,"en",false).slice(0,14000):"No petroleum numerical receipt was produced. Do not invent NPV/IRR, forecasts or tool execution."].join("\n\n")
}
