import {scienceResultSchema,type ScienceInput} from "./science-schema"
import {SCIENCE_METHODS} from "./science-methods"

/** Independent dimensional identities / physical bounds. Does not import or re-run the calculator. */
export function verifyScience(s:ScienceInput,raw:unknown) {
  let checked=0
  const errors:string[]=[],parsed=scienceResultSchema.safeParse(raw)
  if(!parsed.success)return{ok:false,checked:1,errors:["INVALID_RESULT_SCHEMA"]}
  const r=parsed.data,seen=new Set<string>()
  const check=(condition:boolean,label:string)=>{checked++;if(!condition)errors.push(label)}
  // Absolute floor accommodates accumulated IEEE-754 residuals; not a claim of field accuracy.
  const near=(a:unknown,b:number,label:string)=>check(typeof a==="number"&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=2e-12+2e-8*Math.max(Math.abs(a),Math.abs(b)),label)
  const m=(name:string,expected:number|null,unit:string)=>{seen.add(name);const v=r.metrics[name];check(v?.unit===unit,name+":unit");if(expected===null)check(v?.value===null,name+":null");else near(v?.value,expected,name)}
  const get=(name:string)=>r.metrics[name]?.value
  const table=(rows:(string|number|null)[][],keys:string[])=>{
    check(r.table?.rows.length===rows.length&&r.table.columns.map(c=>c.key).join("|")===keys.join("|"),"table:shape")
    rows.forEach((row,i)=>row.forEach((cell,j)=>{const actual=r.table?.rows[i]?.[j];if(typeof cell==="number")near(actual,cell,`table:${i}:${j}`);else check(actual===cell,`table:${i}:${j}`)}))
  }
  check(r.method===s.method&&r.dataKind===s.dataKind,"input-provenance")
  check(r.status===(SCIENCE_METHODS[s.method].modelled?"MODELLED":"CALCULATED"),"evidence-status")
  check(Boolean(r.curve)===["linear-ipr","vogel","corey"].includes(s.method),"unexpected-or-missing-curve")
  check(Boolean(r.table)===["nodal","capillary","net-pay","allocation","decline-backtest"].includes(s.method),"unexpected-or-missing-table")
  if(r.curve)check(r.curve.xUnit===(s.method==="corey"?"fraction":"Pa")&&r.curve.yUnit===(s.method==="corey"?"fraction":"m3/day"),"curve:units")
  const tableUnits:Record<string,string[]>={nodal:["stock m3/day","Pa absolute","Pa absolute"],capillary:["fraction","Pa"],"net-pay":["m","m","m","label"],allocation:["label","m3"],"decline-backtest":["day","m3/day","m3/day","m3/day"]}
  if(r.table)check(r.table.columns.map(c=>c.unit).join("|")===tableUnits[s.method]?.join("|"),"table:units")
  check(r.execution.modelCalls.length===0&&r.execution.codeExecuted,"execution")
  switch(s.method) {
    case "linear-ipr":case "vogel": {
      const qMax=s.method==="vogel"?s.testQM3Day*s.reservoirPa**2/((s.reservoirPa-s.testFlowingPa)*(s.reservoirPa+.8*s.testFlowingPa)):s.testQM3Day*s.reservoirPa/(s.reservoirPa-s.testFlowingPa)
      const flowFactor=(s.reservoirPa-s.flowingPa)/s.reservoirPa*(s.method==="vogel"?1+.8*s.flowingPa/s.reservoirPa:1)
      m("qMaxM3Day",qMax,"stock m3/day");m("qM3Day",qMax*flowFactor,"stock m3/day")
      if(s.method==="linear-ipr")m("piM3DayPa",s.testQM3Day/(s.reservoirPa-s.testFlowingPa),"stock m3/day/Pa")
      check(r.curve?.series.length===1&&r.curve.series[0].points.length===21,"ipr:curve-shape")
      r.curve?.series[0].points.forEach((p,i)=>{near(p.x,s.reservoirPa*i/20,"ipr:pressure");const rr=i/20;near(p.y,qMax*(s.method==="vogel"?1-.2*rr-.8*rr**2:1-rr),"ipr:curve-rate")})
      break
    }
    case "nodal": {
      // Separate barycentric interpolation; check root equality, table and absence-of-root claim.
      const p=(curve:typeof s.ipr,q:number)=>{const index=curve.findIndex((point,i)=>i>0&&point.qM3Day>=q),b=curve[Math.max(1,index)],a=curve[Math.max(1,index)-1],w=(b.qM3Day-q)/(b.qM3Day-a.qM3Day);return a.pPa*w+b.pPa*(1-w)}
      const lo=Math.max(s.ipr[0].qM3Day,s.vlp[0].qM3Day),hi=Math.min(s.ipr.at(-1)!.qM3Day,s.vlp.at(-1)!.qM3Day),q=get("qM3Day")
      m("sharedMinM3Day",lo,"stock m3/day");m("sharedMaxM3Day",hi,"stock m3/day")
      if(q===null){m("qM3Day",null,"stock m3/day");m("nodePa",null,"Pa absolute");check((p(s.ipr,lo)-p(s.vlp,lo))*(p(s.ipr,hi)-p(s.vlp,hi))>0,"nodal:false-no-root")}
      else {check(typeof q==="number"&&q>=lo&&q<=hi,"nodal:root-domain");const rate=q??NaN;m("qM3Day",rate,"stock m3/day");m("nodePa",p(s.ipr,rate),"Pa absolute");near(p(s.ipr,rate),p(s.vlp,rate),"nodal:pressure-balance")}
      const knots=[...new Set([lo,hi,...s.ipr.map(v=>v.qM3Day),...s.vlp.map(v=>v.qM3Day)].filter(q=>q>=lo&&q<=hi))].sort((a,b)=>a-b)
      table(knots.map(q=>[q,p(s.ipr,q),p(s.vlp,q)]),["qM3Day","iprPa","vlpPa"]);break
    }
    case "giip":m("gasInitiallyInPlaceM3",s.areaM2*s.netPayM*s.porosity*(1-s.waterSaturation)/s.bgReservoirPerStandard,"standard m3");break
    case "recovery-factor":m("recoveryFactor",s.producedM3/s.initialInPlaceM3,"fraction");break
    case "darcy":{const q=s.deltaPa/(s.lengthM/s.areaM2*s.viscosityPaS/s.permeabilityM2);m("qReservoirM3S",q,"reservoir m3/s");m("qReservoirM3Day",q*24*60*60,"reservoir m3/day");break}
    case "corey": {
      m("mobileSaturationRange",1-s.swi-s.sor,"fraction");check(r.curve?.series.length===2,"corey:series")
      r.curve?.series.forEach((series,j)=>{check(series.points.length===21,"corey:points");series.points.forEach((p,i)=>{near(p.x,s.swi+(1-s.swi-s.sor)*i/20,"corey:saturation");near(p.y,j===0?s.krwEndpoint*(i/20)**s.nw:s.kroEndpoint*((20-i)/20)**s.no,"corey:kr");check(p.y>=0&&p.y<=1,"corey:bounds")})});break
    }
    case "capillary":table(s.effectiveSaturation.map(se=>[se,s.entryPa/Math.pow(se,1/s.lambda)]),["effectiveSaturation","capillaryPa"]);break
    case "gas-bg":m("bgReservoirPerStandard",s.z/s.standardZ*s.reservoirK/s.standardK*s.standardPa/s.reservoirPa,"reservoir m3/standard m3");break
    case "gas-z":m("z",s.pressurePa*s.molarVolumeM3Mol/(8.31446261815324*s.temperatureK),"dimensionless");break
    case "gas-density":m("densityKgM3",s.molarMassKgMol/(s.z*8.31446261815324*s.temperatureK/s.pressurePa),"kg/m3");break
    case "oil-bo":m("boReservoirPerStock",s.reservoirOilM3/s.stockTankOilM3,"reservoir m3/stock m3");break
    case "archie":m("waterSaturation",Math.exp((Math.log(s.a)+Math.log(s.waterResistivityOhmM)-s.m*Math.log(s.porosity)-Math.log(s.formationResistivityOhmM))/s.n),"fraction");m("formationFactor",s.a/s.porosity**s.m,"dimensionless");break
    case "density-porosity":{const total=(s.bulkKgM3-s.matrixKgM3)/(s.fluidKgM3-s.matrixKgM3);m("totalDensityPorosity",total,"fraction");m("effectivePorosity",total-s.shaleVolume*s.shalePorosity,"fraction");break}
    case "gamma-ray":m("gammaRayIndex",(s.measuredAPI-s.cleanAPI)/(s.shaleAPI-s.cleanAPI),"fraction");m("linearShaleVolume",(s.measuredAPI-s.cleanAPI)/(s.shaleAPI-s.cleanAPI),"fraction");break
    case "net-pay": {
      let covered=0,unknown=0,pay=0
      const rows=s.intervals.map(p=>{const h=p.baseM-p.topM;covered+=h;let status="NON_PAY_BY_SUPPLIED_CUTOFFS";if([p.porosity,p.waterSaturation,p.shaleVolume].includes(null)){unknown+=h;status="UNCLASSIFIED"}else if(p.porosity!>=s.cutoffs.minPorosity&&p.waterSaturation!<=s.cutoffs.maxWaterSaturation&&p.shaleVolume!<=s.cutoffs.maxShaleVolume){pay+=h;status="PAY_BY_SUPPLIED_CUTOFFS"}return[p.topM,p.baseM,h,status]})
      m("netPayM",pay,"m");m("coveredThicknessM",covered,"m");m("unclassifiedThicknessM",unknown,"m");m("unloggedGapM",s.intervals.at(-1)!.baseM-s.intervals[0].topM-covered,"m");m("netToClassifiedGross",covered===unknown?null:pay/(covered-unknown),"fraction");table(rows,["topM","baseM","thicknessM","classification"]);break
    }
    case "hydrostatic":m("deltaPa",s.tvdM*9.80665*s.densityKgM3,"Pa");m("bottomAbsolutePa",s.surfaceAbsolutePa+s.tvdM*9.80665*s.densityKgM3,"Pa absolute");break
    case "ecd":m("ecdKgM3",s.mudDensityKgM3+s.annularFrictionPa/s.tvdM/9.80665,"kg/m3");break
    case "pressure-window":m("minDensityKgM3",(s.poreAbsolutePa-s.surfaceAbsolutePa+s.lowerMarginPa)/s.tvdM/9.80665,"kg/m3");m("maxDensityKgM3",(s.fractureAbsolutePa-s.surfaceAbsolutePa-s.upperMarginPa)/s.tvdM/9.80665,"kg/m3");break
    case "mud-weight":m("equivalentDensityKgM3",s.hydrostaticDeltaPa/s.tvdM/9.80665,"kg/m3");break
    case "allocation":{const w=s.weights.reduce((a,b)=>a+b.weight,0),rows=s.weights.map(p=>[p.id,s.totalM3*p.weight/w]);m("allocatedM3",s.totalM3,"m3");const residual=get("balanceResidualM3");seen.add("balanceResidualM3");check(r.metrics.balanceResidualM3?.unit==="m3"&&typeof residual==="number"&&Math.abs(residual)<=1e-10*Math.max(1,s.totalM3),"allocation:mass-balance");table(rows,["id","allocatedM3"]);break}
    case "water-cost":m("variableCost",s.waterM3*s.variableCostPerM3,s.currency);m("totalCost",s.fixedCost+s.waterM3*s.variableCostPerM3,s.currency);break
    case "decline-backtest": {
      const n=s.history.length-s.holdout,train=s.history.slice(0,n),t0=train[0].tDays
      let xy=0,xx=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const dt=train[j].tDays-train[i].tDays;xx+=dt*dt;xy+=dt*Math.log(train[j].qM3Day/train[i].qM3Day)}
      const slope=xy/xx,a=train.reduce((sum,p)=>sum+Math.log(p.qM3Day)-slope*(p.tDays-t0),0)/n
      const rows=s.history.slice(n).map(p=>{const pred=Math.exp(a)*Math.exp(slope*(p.tDays-t0));return[p.tDays,p.qM3Day,pred,p.qM3Day-pred]})
      m("trainCount",n,"points");m("holdoutCount",s.holdout,"points");m("nominalDeclinePerDay",-slope,"1/day");m("fittedInitialM3Day",Math.exp(a),"m3/day")
      m("rmseM3Day",Math.sqrt(rows.reduce((sum,r)=>sum+r[3]**2,0)/rows.length),"m3/day");m("mapeFraction",rows.reduce((sum,r)=>sum+Math.abs(r[3]/r[1]),0)/rows.length,"fraction");table(rows,["tDays","observedM3Day","predictedM3Day","residualM3Day"]);break
    }
  }
  for(const key of Object.keys(r.metrics))check(seen.has(key),"UNVERIFIED_METRIC:"+key)
  return{ok:errors.length===0,checked,errors}
}
