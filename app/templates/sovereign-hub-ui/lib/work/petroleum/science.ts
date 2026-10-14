import {performance} from "node:perf_hooks"
import {scienceInputSchema,scienceResultSchema,type ScienceInput,type ScienceResult} from "./science-schema"
import {SCIENCE_METHODS} from "./science-methods"
import {verifyScience} from "./science-verify"
import {q,mul,add,toNumber,type Q} from "../math/rational"

const G=9.80665,R=8.31446261815324
type Payload=Omit<ScienceResult,"execution">
function requireDomain(condition:boolean,code:string):asserts condition {if(!condition)throw new RangeError(code)}
function sum(values:number[]) {let total=0,correction=0;for(const v of values){const y=v-correction,t=total+y;correction=(t-total)-y;total=t}return total}
/** Exact over the accepted JSON number's canonical decimal, not arbitrary-precision source text. */
function decimalNumber(value:number):Q {
  const [mantissa,exponent="0"]=String(value).split("e"),places=(mantissa.split(".")[1]?.length??0)-Number(exponent)
  const digits=BigInt(mantissa.replace(".","")),scale=BigInt("1"+"0".repeat(Math.abs(places)))
  return places>=0?q(digits,scale):q(digits*scale)
}
function interpolate(points:{qM3Day:number;pPa:number}[],q:number) {
  requireDomain(q>=points[0].qM3Day&&q<=points.at(-1)!.qM3Day,"NO_EXTRAPOLATION")
  let i=1;while(i<points.length-1&&q>points[i].qM3Day)i++
  const a=points[i-1],b=points[i];return a.pPa+(b.pPa-a.pPa)*(q-a.qM3Day)/(b.qM3Day-a.qM3Day)
}
/** Closed deterministic numerical kernels. No eval, network, subprocesses, file access or LLM arithmetic. */
function calculate(s:ScienceInput):Payload {
  const result:Payload={kind:"mpce-science",version:"oil-science-1.0.0",method:s.method,dataKind:s.dataKind,status:SCIENCE_METHODS[s.method].modelled?"MODELLED":"CALCULATED",metrics:{},warnings:["INPUT_PROVENANCE_UNVERIFIED", "AUTHORIZED_ENGINEER_REVIEW_REQUIRED"]}
  const metric=(name:string,value:number|null,unit:string)=>{result.metrics[name]={value,unit}}
  const table=(columns:[string,string][],rows:(number|string|null)[][])=>{result.table={columns:columns.map(([key,unit])=>({key,unit})),rows}}
  switch(s.method) {
    case "linear-ipr":case "vogel": {
      requireDomain(s.testFlowingPa<s.reservoirPa&&s.flowingPa<=s.reservoirPa,"FLOWING_PRESSURE_OUTSIDE_IPR")
      if(s.method==="vogel")requireDomain(s.reservoirPa<=s.bubblePointPa,"VOGEL_REQUIRES_SATURATED_RESERVOIR")
      // Direct pressure difference avoids cancellation in 1-Pwf/Pr near shut-in.
      const factor=(p:number)=>{const drawdown=(s.reservoirPa-p)/s.reservoirPa;return drawdown*(s.method==="vogel"?1.8-.8*drawdown:1)}
      const qmax=s.testQM3Day/factor(s.testFlowingPa),rate=(p:number)=>qmax*factor(p)
      metric("qM3Day",rate(s.flowingPa),"stock m3/day");metric("qMaxM3Day",qmax,"stock m3/day")
      if(s.method==="linear-ipr")metric("piM3DayPa",s.testQM3Day/(s.reservoirPa-s.testFlowingPa),"stock m3/day/Pa")
      result.curve={xLabel:"Flowing pressure",xUnit:"Pa",yLabel:"Oil rate",yUnit:"m3/day",series:[{name:s.method,points:Array.from({length:21},(_,i)=>{const x=s.reservoirPa*i/20;return{x,y:rate(x)}})}]}
      result.warnings.push("ONE_TEST_EMPIRICAL_CURVE_NOT_FIELD_VALIDATED")
      break
    }
    case "nodal": {
      for(const [curve,direction]of [[s.ipr,-1],[s.vlp,1]] as const)for(let i=1;i<curve.length;i++)requireDomain(curve[i].qM3Day>curve[i-1].qM3Day&&direction*(curve[i].pPa-curve[i-1].pPa)>0,"NODAL_CURVES_MUST_BE_STRICTLY_MONOTONE")
      const low=Math.max(s.ipr[0].qM3Day,s.vlp[0].qM3Day),high=Math.min(s.ipr.at(-1)!.qM3Day,s.vlp.at(-1)!.qM3Day)
      requireDomain(high>low,"NODAL_NO_SHARED_RATE_INTERVAL")
      const knots=[...new Set([low,high,...s.ipr.map(p=>p.qM3Day),...s.vlp.map(p=>p.qM3Day)].filter(q=>q>=low&&q<=high))].sort((a,b)=>a-b)
      const delta=(q:number)=>interpolate(s.ipr,q)-interpolate(s.vlp,q)
      let root:number|null=null
      for(let i=0;i<knots.length;i++){const a=knots[i],da=delta(a);if(da===0){root=a;break}if(i+1<knots.length){const b=knots[i+1],db=delta(b);if(da>0&&db<0){root=a+(b-a)*da/(da-db);break}}}
      metric("qM3Day",root,"stock m3/day");metric("nodePa",root===null?null:interpolate(s.ipr,root),"Pa absolute")
      metric("sharedMinM3Day",low,"stock m3/day");metric("sharedMaxM3Day",high,"stock m3/day")
      if(root===null)result.warnings.push("NO_INTERSECTION_IN_SHARED_DOMAIN")
      table([["qM3Day","stock m3/day"],["iprPa","Pa absolute"],["vlpPa","Pa absolute"]],knots.map(q=>[q,interpolate(s.ipr,q),interpolate(s.vlp,q)]))
      break
    }
    case "giip":metric("gasInitiallyInPlaceM3",s.areaM2*s.netPayM*s.porosity*(1-s.waterSaturation)/s.bgReservoirPerStandard,"standard m3");result.warnings.push("IN_PLACE_NOT_RECOVERABLE_RESERVES");break
    case "recovery-factor":requireDomain(s.producedM3<=s.initialInPlaceM3,"PRODUCED_EXCEEDS_INITIAL_IN_PLACE");metric("recoveryFactor",s.producedM3/s.initialInPlaceM3,"fraction");break
    case "darcy":{const q=s.permeabilityM2*s.areaM2*s.deltaPa/(s.viscosityPaS*s.lengthM);metric("qReservoirM3S",q,"reservoir m3/s");metric("qReservoirM3Day",q*86400,"reservoir m3/day");break}
    case "corey": {
      requireDomain(s.swi+s.sor<1,"RESIDUAL_SATURATIONS_LEAVE_NO_MOBILE_PORE_SPACE")
      const water={name:"krw",points:[] as {x:number;y:number}[]},oil={name:"kro",points:[] as {x:number;y:number}[]}
      for(let i=0;i<=20;i++){const se=i/20,x=s.swi+(1-s.swi-s.sor)*se;water.points.push({x,y:s.krwEndpoint*se**s.nw});oil.points.push({x,y:s.kroEndpoint*(1-se)**s.no})}
      metric("mobileSaturationRange",1-s.swi-s.sor,"fraction")
      result.curve={xLabel:"Water saturation",xUnit:"fraction",yLabel:"Relative permeability",yUnit:"fraction",series:[water,oil]};break
    }
    case "capillary":table([["effectiveSaturation","fraction"],["capillaryPa","Pa"]],s.effectiveSaturation.map(se=>[se,s.entryPa*se**(-1/s.lambda)]));break
    case "gas-bg":metric("bgReservoirPerStandard",s.z*s.reservoirK/s.reservoirPa/(s.standardZ*s.standardK/s.standardPa),"reservoir m3/standard m3");break
    case "gas-z":metric("z",s.pressurePa*s.molarVolumeM3Mol/(R*s.temperatureK),"dimensionless");result.warnings.push("Z_FROM_SUPPLIED_VOLUME_NOT_EOS_PREDICTION");break
    case "gas-density":metric("densityKgM3",s.pressurePa*s.molarMassKgMol/(s.z*R*s.temperatureK),"kg/m3");break
    case "oil-bo":metric("boReservoirPerStock",s.reservoirOilM3/s.stockTankOilM3,"reservoir m3/stock m3");break
    case "archie": {
      const sw=(s.a*s.waterResistivityOhmM/(s.porosity**s.m*s.formationResistivityOhmM))**(1/s.n)
      requireDomain(sw<=1,"ARCHIE_SATURATION_EXCEEDS_ONE_CHECK_UNITS_CALIBRATION_TEMPERATURE")
      metric("waterSaturation",sw,"fraction");metric("formationFactor",s.a/s.porosity**s.m,"dimensionless");break
    }
    case "density-porosity": {
      requireDomain(s.matrixKgM3>s.fluidKgM3,"MATRIX_DENSITY_MUST_EXCEED_FLUID_DENSITY")
      const total=(s.matrixKgM3-s.bulkKgM3)/(s.matrixKgM3-s.fluidKgM3),effective=total-s.shaleVolume*s.shalePorosity
      requireDomain(total>=0&&total<=1&&effective>=0&&effective<=total,"POROSITY_OUTSIDE_PHYSICAL_RANGE")
      metric("totalDensityPorosity",total,"fraction");metric("effectivePorosity",effective,"fraction");break
    }
    case "gamma-ray": {
      requireDomain(s.shaleAPI>s.cleanAPI,"GAMMA_ENDPOINTS_MUST_INCREASE")
      requireDomain(s.measuredAPI>=s.cleanAPI&&s.measuredAPI<=s.shaleAPI,"GAMMA_OUTSIDE_LOCAL_ENDPOINTS")
      const igr=(s.measuredAPI-s.cleanAPI)/(s.shaleAPI-s.cleanAPI);metric("gammaRayIndex",igr,"fraction");metric("linearShaleVolume",igr,"fraction");break
    }
    case "net-pay": {
      const pay:number[]=[],unknown:number[]=[],thickness:number[]=[],rows:(number|string)[][]=[]
      for(let i=0;i<s.intervals.length;i++){
        const p=s.intervals[i];requireDomain(p.baseM>p.topM&&(i===0||p.topM>=s.intervals[i-1].baseM),"INTERVALS_MUST_BE_ORDERED_NONOVERLAPPING_POSITIVE_THICKNESS")
        const h=p.baseM-p.topM;thickness.push(h)
        const missing=p.porosity===null||p.waterSaturation===null||p.shaleVolume===null
        const isPay=!missing&&p.porosity!>=s.cutoffs.minPorosity&&p.waterSaturation!<=s.cutoffs.maxWaterSaturation&&p.shaleVolume!<=s.cutoffs.maxShaleVolume
        if(missing)unknown.push(h);else if(isPay)pay.push(h)
        rows.push([p.topM,p.baseM,h,missing?"UNCLASSIFIED":isPay?"PAY_BY_SUPPLIED_CUTOFFS":"NON_PAY_BY_SUPPLIED_CUTOFFS"])
      }
      const covered=sum(thickness),unclassified=sum(unknown),span=s.intervals.at(-1)!.baseM-s.intervals[0].topM
      metric("netPayM",sum(pay),"m");metric("coveredThicknessM",covered,"m");metric("unclassifiedThicknessM",unclassified,"m");metric("unloggedGapM",span-covered,"m")
      metric("netToClassifiedGross",covered===unclassified?null:sum(pay)/(covered-unclassified),"fraction")
      if(unclassified>0||span>covered)result.warnings.push("INCOMPLETE_COVERAGE_NET_PAY_IS_PARTIAL_NOT_FULL_INTERVAL")
      table([["topM","m"],["baseM","m"],["thicknessM","m"],["classification","label"]],rows);break
    }
    case "hydrostatic":{const delta=s.densityKgM3*G*s.tvdM;metric("deltaPa",delta,"Pa");metric("bottomAbsolutePa",s.surfaceAbsolutePa+delta,"Pa absolute");break}
    case "ecd":metric("ecdKgM3",s.mudDensityKgM3+s.annularFrictionPa/(G*s.tvdM),"kg/m3");break
    case "pressure-window": {
      const low=s.poreAbsolutePa+s.lowerMarginPa-s.surfaceAbsolutePa,high=s.fractureAbsolutePa-s.upperMarginPa-s.surfaceAbsolutePa
      requireDomain(s.fractureAbsolutePa>s.poreAbsolutePa&&low>=0&&high>low,"NO_POSITIVE_STATIC_WINDOW_WITH_SUPPLIED_MARGINS")
      metric("minDensityKgM3",low/(G*s.tvdM),"kg/m3");metric("maxDensityKgM3",high/(G*s.tvdM),"kg/m3");result.warnings.push("STATIC_WINDOW_NOT_SAFE_OPERATING_INSTRUCTION");break
    }
    case "mud-weight":metric("equivalentDensityKgM3",s.hydrostaticDeltaPa/(G*s.tvdM),"kg/m3");result.warnings.push("ARITHMETIC_EQUIVALENCE_NOT_KILL_WEIGHT_RECOMMENDATION");break
    case "allocation": {
      requireDomain(new Set(s.weights.map(w=>w.id)).size===s.weights.length,"DUPLICATE_ALLOCATION_ID")
      const totalWeight=sum(s.weights.map(w=>w.weight));requireDomain(totalWeight>0,"ALLOCATION_REQUIRES_POSITIVE_TOTAL_WEIGHT")
      const rows=s.weights.map(w=>[w.id,s.totalM3*(w.weight/totalWeight)] as [string,number])
      metric("allocatedM3",sum(rows.map(r=>r[1])),"m3");metric("balanceResidualM3",s.totalM3-sum(rows.map(r=>r[1])),"m3")
      table([["id","label"],["allocatedM3","m3"]],rows);result.warnings.push("ALLOCATED_NOT_INDIVIDUALLY_MEASURED");break
    }
    case "water-cost":{const variable=mul(decimalNumber(s.waterM3),decimalNumber(s.variableCostPerM3));metric("variableCost",toNumber(variable),s.currency);metric("totalCost",toNumber(add(variable,decimalNumber(s.fixedCost))),s.currency);break}
    case "decline-backtest": {
      const n=s.history.length-s.holdout;requireDomain(n>=4,"BACKTEST_REQUIRES_FOUR_TRAINING_AND_TWO_TEST_POINTS")
      for(let i=1;i<s.history.length;i++)requireDomain(s.history[i].tDays>s.history[i-1].tDays,"BACKTEST_TIME_MUST_STRICTLY_INCREASE")
      const t0=s.history[0].tDays,train=s.history.slice(0,n),mx=sum(train.map(p=>p.tDays-t0))/n,my=sum(train.map(p=>Math.log(p.qM3Day)))/n
      const xx=sum(train.map(p=>(p.tDays-t0-mx)**2));requireDomain(xx>0,"BACKTEST_TIME_VARIANCE_ZERO")
      const slope=sum(train.map(p=>(p.tDays-t0-mx)*(Math.log(p.qM3Day)-my)))/xx,a=my-slope*mx
      requireDomain(slope<=0,"DECLINE_NOT_DEMONSTRATED_IN_TRAINING_DATA")
      const rows=s.history.slice(n).map(p=>{const predicted=Math.exp(a+slope*(p.tDays-t0));return[p.tDays,p.qM3Day,predicted,p.qM3Day-predicted]})
      metric("trainCount",n,"points");metric("holdoutCount",s.holdout,"points");metric("nominalDeclinePerDay",-slope,"1/day");metric("fittedInitialM3Day",Math.exp(a),"m3/day")
      metric("rmseM3Day",Math.sqrt(sum(rows.map(r=>r[3]**2))/rows.length),"m3/day");metric("mapeFraction",sum(rows.map(r=>Math.abs(r[3])/r[1]))/rows.length,"fraction")
      table([["tDays","day"],["observedM3Day","m3/day"],["predictedM3Day","m3/day"],["residualM3Day","m3/day"]],rows);result.warnings.push("HOLDOUT_IS_NOT_A_CALIBRATED_FUTURE_CONFIDENCE_INTERVAL");break
    }
  }
  return result
}

export function executeScience(raw:unknown):ScienceResult {
  const started=performance.now(),input=scienceInputSchema.parse(raw),payload=calculate(input)
  const result=scienceResultSchema.parse({...payload,execution:{codeExecuted:true,modelCalls:[],durationMs:Math.max(0,performance.now()-started),validation:{ok:true,checked:1}}})
  const validation=verifyScience(input,result)
  if(!validation.ok)throw new Error("SCIENCE_VALIDATION_FAILED: "+validation.errors.join(", ").slice(0,500))
  result.execution.validation={ok:true,checked:validation.checked}
  result.execution.durationMs=Math.max(0,performance.now()-started)
  return result
}
