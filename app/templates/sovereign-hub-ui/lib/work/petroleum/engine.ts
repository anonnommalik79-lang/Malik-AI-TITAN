import { createHash } from "node:crypto"
import { petroleumTaskSchema, type PetroleumTask } from "./schema"
import { convert, waterCut, gasOilRatio, finite } from "./units"
import { npv, irr, economics } from "./economics"
import { decline } from "./reservoir"
import { analyzeProduction } from "./production"
export const PETROLEUM_ALGORITHM_VERSION="malik-petroleum-1.0.0"
export type EvidenceClass = "Verified Measurement" | "Verified External Source" | "Deterministic Calculation" | "Statistical Estimate" | "Engineering Assumption" | "AI Hypothesis" | "Missing Evidence"
export type PetroleumReceipt = {ok:boolean;version:string;inputHash:string;task:unknown;result?:unknown;error?:string;method:string;variables:string;units:string;assumptions:string[];evidence:EvidenceClass[];humanReview:boolean;uncertainty:string;limitations:string[]}
const methods:Record<PetroleumTask["op"],[string,string,string]>={
  convert:["value_to = value_from × factor_from / factor_to","value: supplied quantity; factors: SI conversion constants","Dimension-preserving; gas T/P reference unchanged; pressure must use same absolute/gauge basis"],
  "water-cut":["WC = qw / (qo + qw)","qo: stock oil rate; qw: water rate at matching measurement conditions","fraction; multiply by 100 for %; zero total => undefined"],
  gor:["GOR = qg / qo","qg: gas rate at declared reference conditions; qo: stock oil rate","scf/bbl; zero oil => undefined"],
  decline:["q(t)=qi exp(-D t) if b=0; q(t)=qi/(1+b D t)^(1/b) otherwise","qi: initial rate; D: nominal initial decline/day; t: elapsed days; b: Arps exponent","qi and q same rate units; D: 1/day; t: day; b: dimensionless"],
  npv:["NPV = Σ CFt/(1+r)^t; IRR solves NPV=0 by bracketed bisection","CFt: periodic cashflow; r: per-period discount rate; t: period index starting 0","Single supplied currency; period explicit; no XNPV/XIRR"],
  economics:["CF0=-CAPEX; CFt=Vt(P-variableOPEX)-fixedOPEX; NPV=Σ CFt/(1+r)^t","Vt: period volume; P: supplied price/unit; CAPEX: t0 investment","Supplied currency; price/OPEX per supplied volume unit; r per period"],
  production:["WC=qw/(qo+qw); GOR=qg/qo; log(q)=a-Dt (OLS); availability=1-Σ downtime/Σ period","qo,qw: stock liquid rates; qg: standard gas rate; t: actual elapsed days","bbl/day, scf/day, scf/bbl, fraction; no cumulative volume from snapshot rates"],
  balance:["residual = Σ inputs - Σ outputs","All streams on same physical dimension, phase and reference basis; no inventory accumulation included","Specified common unit; positive residual is unaccounted flow, not automatically leakage"],
  methane:["CH4 kg = activity × emission factor","factor: supplied kg CH4/activity-unit; activity: supplied activity; methodology/source explicitly supplied","kg CH4; scenario range from supplied relative bound; no CO2e without GWP basis"],
}
export function runPetroleum(raw: unknown): PetroleumReceipt {
  const serialized=JSON.stringify(raw), inputHash=createHash("sha256").update(serialized??"undefined").digest("hex")
  const parsed=petroleumTaskSchema.safeParse(raw)
  const base={version:PETROLEUM_ALGORITHM_VERSION,inputHash,task:raw,humanReview:true,uncertainty:"Not quantified without defensible input uncertainty; scenario bounds are not confidence intervals",limitations:["Analytical decision support only; no equipment control or certification", "Input data require authorized engineer review"],evidence:["Deterministic Calculation","Engineering Assumption","Missing Evidence"] as EvidenceClass[],assumptions:["User input provenance/calibration unverified"]}
  if(!parsed.success) return {...base,ok:false,error:"INVALID_TASK: "+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ').slice(0,1500),method:"Not executed",variables:"",units:""}
  const task=parsed.data,[method,variables,units]=methods[task.op]
  try {
    let result:unknown
    switch(task.op) {
      case "convert":result={value:convert(task.value,task.from,task.to,task.reference),unit:task.to};break
      case "water-cut":result={fraction:waterCut(task.oil,task.water)};break
      case "gor":result={value:gasOilRatio(task.oil,task.gas),unit:"scf/bbl",reference:task.gas.reference};break
      case "decline":result={curve:task.days.map(day=>({day,rate:decline(task.qi,task.declinePerDay,day,task.b)})),applicability:"User attested empirical applicability; no transient fit or reserves extrapolation validated"};break
      case "npv":result={npv:npv(task.cashflows,task.rate),irr:irr(task.cashflows),period:task.period,currency:task.currency};break
      case "economics":result=economics(task.input);break
      case "production":result={...analyzeProduction(task.csv,task.forecastMonths,task.gasReference),...(task.economics?{economics:economics(task.economics),economicsBasis:"Independent supplied volumes; not derived from production forecast"}:{})};base.evidence.push("Statistical Estimate");break
      case "balance": {
        const streams=[...task.inputs,...task.outputs],refs=new Set(streams.map(s=>s.reference).filter(Boolean))
        if(refs.size>1)throw new Error("Conflicting stream reference conditions")
        const input=task.inputs.reduce((a,s)=>a+convert(s.value,s.unit,task.unit,s.reference),0),output=task.outputs.reduce((a,s)=>a+convert(s.value,s.unit,task.unit,s.reference),0)
        result={input:finite(input),output:finite(output),residual:finite(input-output,"residual",false),relativeResidual:input>0?(input-output)/input:null,unit:task.unit};break
      }
      case "methane": {const kg=finite(task.activity*task.factorKgPerUnit); result={kg,methodology:task.methodology,factorSource:task.factorSource,bounds:task.relativeUncertainty===undefined?null:[kg*(1-task.relativeUncertainty),kg*(1+task.relativeUncertainty)],boundsKind:"User supplied relative scenario bound, not statistical confidence"};break}
    }
    return {...base,ok:true,method,variables,units,result}
  }catch(error){return {...base,ok:false,method,variables,units,error:error instanceof Error?error.message:"ENGINE_FAILED"}}
}
