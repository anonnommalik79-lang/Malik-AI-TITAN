/**
 * 30 independent numerical/guardrail acceptance cases for an investor pilot.
 * SYNTHETIC INPUTS ONLY. These tests do NOT train or validate a PINN, history
 * match, EOR operation, drilling controller or a field-grade reservoir model.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {convert,waterCut,gasOilRatio} from "../lib/work/petroleum/units.ts"
import {decline,declineVolume,fitExponential} from "../lib/work/petroleum/reservoir.ts"
import {npv,irr,economics} from "../lib/work/petroleum/economics.ts"
import {auditTwoContinuumMass,rawStateMemoryBytes,petroleumProxyPhysicsInstruction} from "../lib/work/petroleum/pinn-physics.ts"
import {runPetroleum} from "../lib/work/petroleum/engine.ts"

const close=(a,b,tol=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`ACTUAL ${a}; GOLDEN ${b}; tol ${tol}`)
const qty=(value,unit,reference)=>({value,unit,...(reference?{reference}:{})})
const refs="60F 14.7psia"
const oil={matrix:{deltaStorageKg:70,injectionKg:100,productionKg:10,boundaryInKg:0,boundaryOutKg:0},fracture:{deltaStorageKg:10,injectionKg:0,productionKg:10,boundaryInKg:0,boundaryOutKg:0},matrixToFractureKg:20}
const water={matrix:{deltaStorageKg:15,injectionKg:25,productionKg:5,boundaryInKg:0,boundaryOutKg:0},fracture:{deltaStorageKg:0,injectionKg:0,productionKg:5,boundaryInKg:0,boundaryOutKg:0},matrixToFractureKg:5}
const finance={volumes:[1000],price:70,variableOpex:20,fixedOpex:1000,capex:40000,discountRate:0.1,period:"year",currency:"USD"}
const cases=[
["01 oil/water rates, WC 20%",()=>close(waterCut(qty(80,"bbl/day"),qty(20,"bbl/day")),0.2)],
["02 water dominance, WC 60%",()=>close(waterCut(qty(40,"bbl/day"),qty(60,"bbl/day")),0.6)],
["03 mixed surface-volume units cannot distort WC",()=>close(waterCut(qty(80,"bbl/day"),qty(20*0.158987294928,"m3/day")),0.2)],
["04 shut-in: 0/0 WC is missing, not zero",()=>assert.equal(waterCut(qty(0,"bbl/day"),qty(0,"bbl/day")),null)],
["05 gas/oil ratio, 500 scf/bbl",()=>close(gasOilRatio(qty(100,"bbl/day"),qty(50000,"scf/day",refs)),500)],
["06 no oil flow: undefined GOR",()=>assert.equal(gasOilRatio(qty(0,"bbl/day"),qty(50000,"scf/day",refs)),null)],
["07 missing standard-gas basis must fail closed",()=>assert.throws(()=>gasOilRatio(qty(100,"bbl/day"),qty(1000,"scf/day")))],
["08 dimension collision: volume vs rate refused",()=>assert.throws(()=>convert(1,"bbl","m3/day"),/DIMENSION_MISMATCH/)],
["09 exact stock barrel to cubic meter",()=>close(convert(1000,"bbl","m3"),158.987294928)],
["10 scf to standard cubic meter (same stated basis)",()=>close(convert(1000,"scf","sm3",refs),28.316846592)],
["11 exponential decline independent analytical rate",()=>close(decline(100,0.01,100),100/Math.E)],
["12 hyperbolic b=0.5 analytical rate",()=>close(decline(100,0.01,100,0.5),100/(1+0.5)**2)],
["13 harmonic b=1 analytical rate",()=>close(decline(100,0.01,100,1),50)],
["14 unsupported transient b>1 must be refused",()=>assert.throws(()=>decline(100,0.01,100,1.5),/Hyperbolic/)],
["15 cumulative volume over constant-rate interval",()=>close(declineVolume(100,0,0,30),3000)],
["16 independent exponential quadrature identity",()=>close(declineVolume(100,0.01,0,30),100*(1-Math.exp(-0.3))/0.01)],
["17 history-match screening recovers known decline",()=>{const points=Array.from({length:8},(_,i)=>({day:30*i,rate:100*Math.exp(-0.002*30*i)}));const r=fitExponential(points);assert.ok(r.ok);close(r.declinePerDay,0.002);close(r.qi,100);close(r.r2,1)}],
["18 an unobserved shut-in cannot silently vanish from fit",()=>assert.equal(fitExponential([{day:0,rate:100},{day:30,rate:90},{day:60,rate:0},{day:90,rate:70},{day:120,rate:60},{day:150,rate:50}]).ok,false)],
["19 rising-rate time series must not fake depletion fit",()=>assert.equal(fitExponential(Array.from({length:8},(_,i)=>({day:i*30,rate:100+i*5}))).ok,false)],
["20 NPV independently discounted periodic cashflows",()=>close(npv([-1000,600,600],0.10),-1000+600/1.1+600/(1.1**2))],
["21 IRR cross-check with exact quadratic root",()=>{const r=irr([-100,60,60]);close(r.rate,(60+Math.sqrt(60**2+4*100*60))/(2*100)-1,1e-7)}],
["22 multiple cashflow sign changes require IRR refusal",()=>assert.equal(irr([-100,230,-132]).rate,null)],
["23 project economic one-year cash flow, USD",()=>assert.deepEqual(economics(finance).cashflows,[-40000,49000])],
["24 one-year NPV and break-even price verified",()=>{const x=economics(finance);close(x.npv,-40000+49000/1.1);close(x.breakEvenPrice,65)}],
["25 oil-price downside/upside sensitivity order",()=>{const p=economics(finance).sensitivity;assert.equal(p.length,3);assert.ok(p[0].npv<p[1].npv&&p[1].npv<p[2].npv)}],
["26 fractured dual-continuum oil/water conservation",()=>{const a=auditTwoContinuumMass({oil,water});assert.equal(a.ok,true);a.phases.forEach(p=>{close(p.globalResidualKg,0);assert.equal(p.localConservation,true)})}],
["27 global balance zero cannot conceal offsetting local errors",()=>{const wrong={...oil,matrix:{...oil.matrix,deltaStorageKg:71},fracture:{...oil.fracture,deltaStorageKg:9}};const x=auditTwoContinuumMass({oil:wrong,water});assert.equal(x.ok,false);close(x.phases[0].globalResidualKg,0);assert.equal(x.phases[0].localConservation,false)}],
["28 negative phase mass injection must be rejected",()=>assert.throws(()=>auditTwoContinuumMass({oil:{...oil,matrix:{...oil.matrix,injectionKg:-1}},water}),/Negative/)],
["29 10-million-cell raw-state GPU-memory floor, not training budget",()=>{assert.equal(rawStateMemoryBytes(10_000_000,4,4),160_000_000);assert.throws(()=>rawStateMemoryBytes(-1,4,4))}],
["30 PVT/PINN/optimizer claims require real data and validation",()=>{for(const op of ["pvt","pinn-train","history-match","eor-injection-optimizer","drilling-control"]){const r=runPetroleum({op});assert.equal(r.ok,false);assert.match(r.error,/INVALID_TASK/)}const c=petroleumProxyPhysicsInstruction("PINN fractures history matching");assert.match(c,/NOT DEMONSTRATED/);assert.match(c,/mass/)}],
]
assert.equal(cases.length,30)
for(const [name,run] of cases)test(name,run)
