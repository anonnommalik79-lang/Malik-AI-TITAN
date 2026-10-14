import type {PetroleumAnalysisRequest,PetroleumAnalysisResult} from "./analysis-contract"
export const SCIENTIFIC_STATUSES=["MEASURED","CALCULATED","MODELLED","INFERRED","HYPOTHESIS","UNKNOWN","VERIFIED"] as const
export type ScientificStatus=typeof SCIENTIFIC_STATUSES[number]
export type OilEvidenceEntry={id:string;status:ScientificStatus;scope:string;ref:string;qualification:string}
/** Verification scope must be explicit: verified arithmetic is not verified field data. */
export function oilEvidenceLedger(request:PetroleumAnalysisRequest,result:PetroleumAnalysisResult):OilEvidenceEntry[] {
  return [
    {id:"input",status:request.metadata.dataKind==="synthetic"?"HYPOTHESIS":"MEASURED",scope:"User-supplied production history",ref:request.metadata.sourceHash||result.analysisId,qualification:request.metadata.dataKind==="synthetic"?"Synthetic fixture, not field measurements":"Reported measurements; calibration, identity and provenance NOT verified"},
    {id:"identities",status:"CALCULATED",scope:"Liquid, WC, WOR, GOR, oil change, pressure mean",ref:result.analysisId,qualification:"Derived from supplied normalized values, no external citations required"},
    {id:"dca",status:"MODELLED",scope:"Empirical decline and conditional extrapolation",ref:result.engineVersion,qualification:"Fit to history, not a measured future or reserves classification"},
    {id:"screening",status:"INFERRED",scope:"Uncalibrated relative screening index",ref:"production-screen-1.0.0",qualification:"Not failure probability, economic rank or authority to intervene"},
    {id:"mechanism",status:"HYPOTHESIS",scope:"Water/gas coning, depletion, measurement changes",ref:"Required measurements in hypotheses section",qualification:"Production relationships do not establish a unique physical mechanism"},
    {id:"economics",status:"UNKNOWN",scope:"Profitability/intervention optimum",ref:"Supplied price/cost/cash-flow contract required",qualification:"Rates alone cannot establish NPV, IRR, inefficiency or treatment value"},
  ]
}
