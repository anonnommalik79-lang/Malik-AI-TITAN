import {petroleumAnalysisRequestSchema,petroleumAnalysisResultSchema} from "./analysis-contract"
import {analyzePetroleumDataset} from "./analysis"
import {verifyOilAnalysis} from "./verify-analysis"
import {runPetroleum} from "./engine"
import {volumetricOil} from "./volumetric"
import {SCIENCE_METHODS} from "./science-methods"
import {executeScience} from "./science"
import type {ScienceMethod} from "./science-schema"
export const OIL_CAPABILITY_VERSION="mpce-catalog-1.2.0"
export const CAPABILITY_STATUSES=["IMPLEMENTED & VERIFIED","IMPLEMENTED VALIDATION PENDING","PROTOTYPE","NOT IMPLEMENTED","NOT APPLICABLE"] as const
export type CapabilityStatus=typeof CAPABILITY_STATUSES[number]
const groups={
  A:["Oil production","Gas production","Water production","Liquid production","Water cut","GOR","WOR","Well comparison","Anomaly screening","Field aggregation"],
  B:["IPR","Vogel IPR","Productivity index","Nodal analysis","VLP","Choke","Artificial lift","ESP","Gas lift","Intervention screening"],
  C:["OOIP","GIIP","Recovery factor","Material balance","Pressure analysis","Drive mechanisms","Darcy flow","Relative permeability","Capillary pressure","Sensitivity"],
  D:["Linear DCA","Exponential DCA","Harmonic DCA","Hyperbolic DCA","Model comparison","Residual analysis","Production forecast","Forecast uncertainty","Parameter estimation","Time-series backtesting"],
  E:["Drawdown test","Buildup test","Horner plot","Well-test permeability","Skin","Pressure derivative","Reservoir boundaries","Flow regimes","Interference","Well-test quality"],
  F:["Oil formation volume factor","Gas formation volume factor","Oil viscosity","Gas viscosity","Z factor","Bubble point","Solution GOR","Density","PVT visualization","Correlation comparison"],
  G:["Archie saturation","Porosity","Shale volume","Gamma ray","Density-neutron","Resistivity","Net pay","Formation classification","Log visualization","Petrophysical uncertainty"],
  H:["Hydrostatic pressure","ECD","Drilling hydraulics","Pressure window","Mud weight","Wellbore stability","Completion","Tubing","Formation damage","Well integrity"],
  I:["Waterflood screening","Water injection performance","Polymer flooding","CO2 flooding","Miscibility","Thermal recovery","EOR sensitivity","Injection allocation","Breakthrough analysis","EOR uncertainty"],
  J:["Development scenarios","Production allocation","Revenue scenario","Water-handling costs","CAPEX/OPEX scenario","NPV","IRR","Break-even","Monte Carlo","Integrated report"],
} as const
const production=new Set(["A01","A02","A03","A04","A05","A06","A07","A08","A09","A10","C25","D31","D32","D33","D34","D35","D36","D37","D39","J100"])
const economic=new Set(["J93","J95","J96","J97","J98"])
const refs={dca:"https://stat.ethz.ch/CRAN/web/packages/aRpsDCA/refman/aRpsDCA.html",units:"https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors",volumetric:"https://pubs.usgs.gov/of/1986/0097/report.pdf"}
const scientific=new Map(Object.entries(SCIENCE_METHODS).flatMap(([method,definition])=>definition.ids.map(id=>[id,method as ScienceMethod] as const)))
/** Inventory of THIS executable MPCE release, not a claim that a paper/plugin is integrated. */
export const OIL_CAPABILITIES=Object.entries(groups).flatMap(([group,names],gi)=>names.map((name,i)=>{
  const id=group+String(gi*10+i+1).padStart(2,"0"),implemented=production.has(id)||economic.has(id)||id==="C21"
  const scienceMethod=scientific.get(id)
  if(scienceMethod){const d=SCIENCE_METHODS[scienceMethod];return{id,name,group,status:"IMPLEMENTED & VERIFIED" as CapabilityStatus,callable:"invokeOilCapability",version:OIL_CAPABILITY_VERSION,inputSchema:`scienceInputSchema: ${scienceMethod}`,outputSchema:"scienceResultSchema + independent numerical identities",equation:d.equation,units:"Explicit SI keys and physical datum/reference; see strict method schema",assumptions:["User/synthetic input provenance unverified",d.scope],errors:["INVALID_SCHEMA","PHYSICAL_DOMAIN_ERROR","SCIENCE_VALIDATION_FAILED"],references:[d.reference],tests:["verify-oil-science.mjs"],ui:"Existing petroleum chat, scientific receipt, numerical table/chart and file exports",limitation:d.scope,scienceMethod}}
  return {id,name,group,status:(implemented?"IMPLEMENTED & VERIFIED":"NOT IMPLEMENTED") as CapabilityStatus,
    callable:implemented?"invokeOilCapability":null,version:OIL_CAPABILITY_VERSION,
    inputSchema:implemented?id==="C21"?"volumetricSchema":economic.has(id)?"petroleumTaskSchema: npv/economics":"petroleumAnalysisRequestSchema":"Not available",
    outputSchema:implemented?id==="C21"?"volumetricOil deterministic typed result":economic.has(id)?"PetroleumReceipt":"petroleumAnalysisResultSchema + selected data":"Not available",
    equation:!implemented?null:id==="C21"?"N=A*h*phi*(1-Sw)/Bo":id==="A05"?"WC=qw/(qo+qw)":id==="A06"?"GOR=qg/qo":id==="A07"?"WOR=qw/qo":group==="D"?"linear a+bt; exponential qi*exp(-Dt); Arps qi*(1+bDt)^(-1/b); OLS/profile log fit":economic.has(id)?"CF=V(P-variable OPEX)-fixed OPEX; NPV=sum(CFt/(1+r)^t); IRR root":"See analysis.ts: normalized history identities",
    units:implemented?id==="C21"?"Area m2, net pay m, porosity/Sw fractions, Bo reservoir m3/stock-tank m3":economic.has(id)?"Supplied currency, per-period cash flows/rate; no FX":"Declared rates; psi with datum; time explicitly month/day/index":"Not validated",
    assumptions:["User/synthetic inputs are not verified measurements",implemented?economic.has(id)?"Declared prices/costs and period; scenario not economic advice":"Comparable production history; empirical DCA not reserves classification":"Requires implementation, domain reference and independent validation"],
    errors:implemented?["INVALID_SCHEMA","MISSING_INPUT","UNIT_OR_TIME_CONFLICT","VALIDATION_FAILED"]:["CAPABILITY_NOT_IMPLEMENTED"],
    references:implemented?[id==="C21"?refs.volumetric:group==="D"?refs.dca:refs.units]:[],
    tests:implemented?["verify-mpce.mjs",economic.has(id)?"verify-petroleum.mjs":"verify-oil-report.mjs"]:[],
    ui:implemented?id==="C21"?"Existing typed petroleum chat/skill receipt (op=volumetric-oil)":economic.has(id)?"Existing work skill receipts/exports":"Existing chat Oil report":"No claim in UI",
    limitation:implemented?"Verified synthetic/numerical scope only; not validated against actual reservoir measurements":"Deferred: not enabled by a label, literature reference or model narrative",
  }
}))
/** Fail closed. The catalogue's callable field is tied to a real typed dispatcher. */
export function invokeOilCapability(id:string,input:unknown) {
  const cap=OIL_CAPABILITIES.find(c=>c.id===id)
  if(!cap?.callable) throw new RangeError("CAPABILITY_NOT_IMPLEMENTED: "+id)
  const scienceMethod=scientific.get(id)
  if(scienceMethod){
    if(!input||typeof input!=="object"||(input as {method?:unknown}).method!==scienceMethod)throw new RangeError("CAPABILITY_METHOD_MISMATCH")
    const requiredPurpose:Record<string,string>={B20:"intervention",I87:"eor",J91:"development",I90:"eor",J99:"finance"}
    if(requiredPurpose[id]&&(input as {purpose?:unknown}).purpose!==requiredPurpose[id])throw new RangeError("CAPABILITY_PURPOSE_MISMATCH")
    return executeScience(input)
  }
  if(id==="C21")return volumetricOil(input)
  if(economic.has(id)) {
    if(!input||typeof input!=="object"||!["npv","economics"].includes(String((input as {op?:unknown}).op))) throw new RangeError("INVALID_ECONOMICS_TASK")
    const receipt=runPetroleum(input)
    if(!receipt.ok) throw new RangeError(receipt.error)
    if(["J93","J95","J98"].includes(id)&&(input as {op:string}).op!=="economics")throw new RangeError("ECONOMICS_SCENARIO_REQUIRED")
    return receipt
  }
  const request=petroleumAnalysisRequestSchema.parse(input),result=petroleumAnalysisResultSchema.parse(analyzePetroleumDataset(request))
  if(!verifyOilAnalysis(request,result).ok)throw new RangeError("VALIDATION_FAILED")
  if(id==="D36")return result.wells.map(w=>({well:w.id,unit:request.units.liquid,residuals:w.models.filter(f=>f.valid).map(f=>({model:f.model,values:w.t.map((t,i)=>{
    const x=t-w.t[0],pred=f.model==="linear"?f.a!+f.b!*x:f.model==="exponential"?f.qi!*Math.exp(-f.D!*x):f.model==="harmonic"?f.qi!/(1+f.D!*x):(f.arpsB??0)<1e-8?f.qi!*Math.exp(-f.D!*x):f.qi!*Math.pow(1+f.arpsB!*f.D!*x,-1/f.arpsB!)
    return w.oil[i]!-pred
  })}))}))
  return {capability:id,result}
}
export function oilCapabilityCounts(){return Object.fromEntries(CAPABILITY_STATUSES.map(status=>[status,OIL_CAPABILITIES.filter(c=>c.status===status).length]))}
