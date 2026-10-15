import test from 'node:test'
import assert from 'node:assert/strict'
import {workTestLoader} from './work-test-loader.mjs'
import {advancedScienceCases} from './fixtures/oil-science-advanced.mjs'
import {scienceInput} from './fixtures/oil-science.mjs'
const load=workTestLoader()
const {executePetroleumMessage,executePetroleumMessageAsync}=load('lib/work/petroleum/message.ts')
const {executeScience}=load('lib/work/petroleum/science.ts')
const {verifyScience}=load('lib/work/petroleum/science-verify.ts')
const {economics}=load('lib/work/petroleum/economics.ts')
const {decimalCashflows}=load('lib/work/petroleum/decimal-cashflow.ts')
const by=method=>scienceInput(advancedScienceCases.find(v=>v.method===method))
const prompt='@Malik Oil AI method=waterflood dataKind=synthetic waterRelPerm=0.2 oilRelPerm=0.8 waterViscosityPaS=0.001 oilViscosityPaS=0.004 injectedReservoirM3=1200 producedReservoirM3=1000 poreVolumeM3=10000'
for(const asyncMode of [false,true])for(const task of [undefined,{op:'scientific',input:by('waterflood')}])test(`explicit task plus unrelated attachment cannot replace operation (${asyncMode}/${Boolean(task)})`,async()=>{
 const run=asyncMode?executePetroleumMessageAsync:executePetroleumMessage
 const result=await run({prompt,task,attachments:[{name:'reference.csv',text:'well_id,date,oil_bbl_day\nA,2026-01-01,10'}]})
 assert.equal(result.receipt.ok,false)
 assert.match(result.receipt.error,/ATTACHMENT_TASK_CONFLICT/)
 assert.equal(result.receipt.result,undefined)
})
test('legacy economics and baseline sensitivity use identical decimal cash flows',()=>{
 const r=economics({volumes:[1,1],price:1e15,variableOpex:999999999999999.9,fixedOpex:0,capex:0,discountRate:0,period:'year',currency:'USD'})
 assert.deepEqual(r.cashflows,[-0,.1,.1]);assert.equal(r.npv,.2);assert.equal(r.sensitivity[1].npv,.2)
})
for(const [v,p,c,f,scale,expected]of [[.1,.2,0,.02,1,0],[3,.3,.1,.2,1,.4],[1e-200,1e200,0,0,1,1],[.1,20,19,0,.5,.05],[1,0,10,2,1,-12],[0,20,10,2,1,-2]])test(`decimal cash-flow identity ${[v,p,c,f,scale]}`,()=>{
 assert.deepEqual(decimalCashflows([v],p,c,f,scale),[expected])
})
test('cash-flow primitive rejects nonfinite inputs and overflowing results',()=>{
 for(const bad of [NaN,Infinity,-Infinity])assert.throws(()=>decimalCashflows([1],bad,0,0),/NONFINITE/)
 assert.throws(()=>decimalCashflows([1e300],1e300,0,0),/NONFINITE/)
})
test('loss keyword in reference prose cannot replace explicit scientific operation',async()=>{
 const r=await executePetroleumMessageAsync({prompt:prompt+' production loss reference',attachments:[{name:'reference.csv',text:'well_id,date,oil_bbl_day\nA,2026-01-01,10'}]})
 assert.equal(r.receipt.ok,false);assert.match(r.receipt.error,/ATTACHMENT_TASK_CONFLICT/)
})
test('leading decimal point and signed exponent notation remain deterministic',()=>{
 const r=executePetroleumMessage({prompt:prompt.replace('0.2','.2').replace('0.8','+.8').replace('0.001','1e-3').replace('0.004','.004')})
 assert.equal(r.receipt.ok,true,r.receipt.error);assert.equal(r.receipt.result.metrics.mobilityRatio.value,1)
})
for(const token of ['1,000','0,2','NaN','Infinity','0.2m'])test(`ambiguous/invalid scalar stays rejected: ${token}`,()=>{
 const r=executePetroleumMessage({prompt:prompt.replace('waterRelPerm=0.2','waterRelPerm='+token)})
 assert.equal(r.receipt.ok,false)
})
for(const method of ['scenario-compare','monte-carlo'])for(const volume of [1,3,0.1,1e-6])test(`${method}: canonical decimal cancellation at volume ${volume}`,()=>{
 const s=by(method)
 if(method==='scenario-compare')s.scenarios=s.scenarios.map(v=>({...v,capex:0,pricePerM3:1e15,variablePerM3:999999999999999.9,fixedPerPeriod:0,volumesM3:[volume,volume]}))
 else Object.assign(s,{pricePerM3:{min:1e15,mode:1e15,max:1e15},variablePerM3:{min:999999999999999.9,mode:999999999999999.9,max:999999999999999.9},capex:{min:0,mode:0,max:0},fixedPerPeriod:0,volumesM3:[volume,volume]})
 s.discountPerPeriod=0
 const r=executeScience(s),key=method==='scenario-compare'?'baselineNpv':'p50',expected=volume*0.2
 assert.ok(Math.abs(r.metrics[key].value-expected)<=Math.abs(expected)*1e-12,JSON.stringify(r.metrics))
 assert.equal(verifyScience(s,r).ok,true)
 const corrupt=structuredClone(r);corrupt.metrics[key].value*=1.25;assert.equal(verifyScience(s,corrupt).ok,false)
})
