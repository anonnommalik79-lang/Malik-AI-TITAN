import {createHash} from "node:crypto"
import {analyzePetroleumDataset} from "./analysis"
import {petroleumAnalysisRequestSchema,OIL_ANALYSIS_ENGINE_VERSION,type MpceReceipt} from "./analysis-contract"
import {verifyOilAnalysis} from "./verify-analysis"
import {DCA_VERSION} from "./dca"
export const MPCE_VERSION="mpce-1.0.0"
/** Closed deterministic pipeline: untrusted JSON is data, never executable code. */
export function executeMpce(raw:unknown) {
  const start=performance.now()
  const request=petroleumAnalysisRequestSchema.parse(raw)
  const inputHash=createHash("sha256").update(JSON.stringify(request)).digest("hex")
  const result=analyzePetroleumDataset(request)
  const validation=verifyOilAnalysis(request,result)
  const receipt:MpceReceipt={
    version:MPCE_VERSION,inputHash,datasetRef:request.metadata.sourceHash,engineVersion:OIL_ANALYSIS_ENGINE_VERSION,
    durationMs:Math.max(0,performance.now()-start),codeExecuted:true as const,modelCalls:[] as never[],
    functions:[{id:"production-identities",module:"analysis.ts",version:OIL_ANALYSIS_ENGINE_VERSION,executed:true as const},{id:"decline-fit",module:"analysis.ts + dca.ts",version:DCA_VERSION,executed:true as const},{id:"independent-validation",module:"verify-analysis.ts",version:MPCE_VERSION,executed:true as const}],
    parameters:{timeUnit:request.dataset.granularity,forecastTargets:request.parameters.forecastTargets??null,forecastPeriods:request.parameters.forecastPeriods,arpsExponentBounds:[0,1],hyperbolicPointBudget:512},
    validation:{status:validation.ok?"passed" as const:"failed" as const,checked:validation.checked,errors:validation.mismatches.slice(0,60)},
    stages:["SCHEMA_VALIDATED","UNITS_RESOLVED","COMPUTED","NUMERICALLY_VERIFIED"],
  }
  return {request,result,validation,receipt}
}
