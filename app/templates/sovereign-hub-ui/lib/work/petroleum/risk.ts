import type { PetroleumAnalysisRequest, PetroleumAnalysisResult } from "./analysis-contract"
export const RISK_POLICY = {
  version:"production-screen-1.0.0", weights:{waterCut:.35,oilDecline:.30,gorGrowth:.20,pressureDrop:.15},
  scales:{waterCut:.50,oilDecline:.30,gorGrowth:1,pressureDrop:500}, thresholds:{medium:35,high:65},
  meaning:"Uncalibrated screening index, NOT probability, diagnosis, economic ranking or intervention authority",
} as const
export type OilRisk = {well:string;index:number|null;category:"low"|"medium"|"high"|"unknown";dataQuality:"complete"|"incomplete";components:Array<{id:string;value:number|null;normalized:number|null;weight:number;scale:number;unit:string;refs:string[]}>}
/** Common normalized inputs only. Missing components never become zero risk. */
export function screenProductionRisk(request:PetroleumAnalysisRequest,result:PetroleumAnalysisResult):OilRisk[] {
  return result.wells.map(w=>{
    const first=result.calculatedMetrics.find(m=>m.well===w.id&&m.id==="pressure_first")?.value??null
    const last=result.calculatedMetrics.find(m=>m.well===w.id&&m.id==="pressure_last")?.value??null
    const inputs={waterCut:w.last.wc??null,oilDecline:w.decline.total,gorGrowth:w.change.gorRel,pressureDrop:first!==null&&last!==null?first-last:null}
    const components=(Object.keys(inputs) as Array<keyof typeof inputs>).map(id=>{
      const value=inputs[id], scale=RISK_POLICY.scales[id]
      return {id,value,normalized:value===null?null:Math.min(1,Math.max(0,value/scale)),weight:RISK_POLICY.weights[id],scale,unit:id==="pressureDrop"?request.units.pressure?.datum==="absolute"?"psia":"psi":"fraction",refs:[`${w.id}:first`,`${w.id}:last`]}
    })
    const complete=components.every(c=>c.normalized!==null), index=complete?components.reduce((s,c)=>s+c.normalized!*c.weight*100,0):null
    return {well:w.id,index,category:index===null?"unknown":index>=RISK_POLICY.thresholds.high?"high":index>=RISK_POLICY.thresholds.medium?"medium":"low",dataQuality:complete?"complete":"incomplete",components}
  })
}
