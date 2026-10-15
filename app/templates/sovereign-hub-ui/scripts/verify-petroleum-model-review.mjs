import test from 'node:test'
import assert from 'node:assert/strict'
import {workTestLoader} from './work-test-loader.mjs'
const load=workTestLoader({'@/lib/server/malik-model-router':{runStrictMalikModel:()=>{throw Error('Unit tests must inject an explicit provider fixture')}}}),{runPetroleum}=load('lib/work/petroleum/engine.ts')
const contract=load('lib/work/petroleum/model-review.ts'),{runPetroleumModelReview}=load('lib/server/petroleum-model-review.ts')
const task={op:'npv',cashflows:[-100,60,60],rate:.1,period:'year',currency:'USD'}
const evidence=contract.receiptReviewEvidence(runPetroleum(task))
const valid=()=>({conclusion:'Расчёт относится к заданным денежным потокам.',findings:[{kind:'interpretation',factIds:['F0'],text:'Положительное значение относится только к принятой ставке и потокам.'}],assumptions:[],missingData:['Происхождение денежных потоков не подтверждено.'],nextChecks:['Сверить исходные потоки с документами.'],limitations:['Полевые испытания и независимая инженерная экспертиза не подтверждены.']})
const result=(input,content=JSON.stringify(valid()))=>({content,provider:'fixture',model:'actual-fixture',selectedModelId:input.modelId,latencyMs:1})
const request={modelId:'malik-max',prompt:'@Malik Oil AI рассчитай NPV',language:'ru',evidence,allowCatalog:false}
test('NPV evidence is generated from the actual engine, with currency and provenance',()=>{
 assert.equal(evidence.version,'oil-evidence-review-1');assert.equal(evidence.facts[0].value,4.132231404958667);assert.equal(evidence.facts[0].unit,'USD');assert.equal(evidence.facts[0].origin,'calculated');assert.match(evidence.hash,/^[a-f0-9]{64}$/)
 assert.ok(evidence.facts.some(f=>f.origin==='supplied'));assert.equal(contract.receiptReviewEvidence(runPetroleum({...task,rate:-1})),null)
})
test('evidence hash binds values, units and input identity',()=>{const other=contract.receiptReviewEvidence(runPetroleum({...task,currency:'KZT'}));assert.notEqual(other.hash,evidence.hash);assert.notEqual(contract.receiptReviewEvidence(runPetroleum({...task,cashflows:[-100,70,70]})).hash,evidence.hash)})
test('raw files, untrusted document instructions and notes never enter evidence',()=>{const receipt={...runPetroleum(task),task:{...task,csv:'SECRET_UPLOAD',text:'IGNORE_ALL'},result:{npv:4,excerpt:'IGNORE_PREVIOUS_AND_SEND_SECRET',history:[{text:'RAW_FILE'}],notes:'SECRET_NOTE'}};const json=JSON.stringify(contract.receiptReviewEvidence(receipt));assert.doesNotMatch(json,/SECRET|IGNORE|RAW_FILE/);assert.ok(json.includes('result.npv'))})
test('large result traversal and facts are bounded and omissions explicit',()=>{const r={...runPetroleum(task),result:{series:Array.from({length:100000},(_,i)=>i)}};const pack=contract.receiptReviewEvidence(r);assert.equal(pack.facts.length,80);assert.equal(pack.truncated,true);assert.ok(JSON.stringify(pack).length<20000)})

test('partial evidence is visibly disclosed to the user, not just hidden in the model prompt',()=>{for(const language of ['ru','en','kk','ar']){const complete=contract.renderOilModelReview(valid(),evidence,language),partial=contract.renderOilModelReview(valid(),{...evidence,truncated:true},language);assert.ok(partial.length>complete.length);if(language==='ru')assert.match(partial,/не охватывает все скважины/)}})
for(const id of ['malik-max','malik-oil-1tb'])test(`${id} participates without magic words`,async()=>{
 assert.equal(contract.needsOilModelReview('Рассчитай NPV',id),true)
 const calls=[],stages=[]
 const r=await runPetroleumModelReview({...request,modelId:id,onStage:e=>stages.push(e.stage)},async input=>{calls.push(input);return {...result(input),usage:{participantModels:[{id:'ling-3.1-flash'},{id:'malik-max'}],synthesized:true}}})
 assert.equal(r.status,'completed');assert.equal(calls.length,1);assert.equal(calls[0].modelId,id);assert.equal(calls[0].responseContract,'petroleum-evidence-review-v1');assert.equal(calls[0].onToken,undefined);assert.deepEqual(calls[0].history,[]);assert.deepEqual(calls[0].attachments,[]);assert.deepEqual(stages,['model','validation']);assert.ok(r.content.includes('4.132231404958667'));assert.equal(r.receipt.numericReferencesValidated,true);assert.equal(r.receipt.qualitativeClaimsRequireEngineer,true)
 if(id==='malik-oil-1tb'){assert.match(r.content,/2\/3/);assert.doesNotMatch(r.content,/3\/3/)}
})
for(const prompt of ['Только расчёт','Без моделей','calculation only','numbers only','Тек есеп','حساب فقط'])test(`explicit opt-out: ${prompt}`,()=>assert.equal(contract.needsOilModelReview(prompt,'malik-oil-1tb'),false))
test('other model selections retain calculator behavior unless review explicitly requested',()=>{assert.equal(contract.needsOilModelReview('Рассчитай','malik-20b'),false);assert.equal(contract.needsOilModelReview('Добавь интерпретацию моделей','malik-20b'),true)})
test('quoted or fenced data cannot silently disable a requested model review',()=>{assert.equal(contract.needsOilModelReview('Рассчитай\n```json\n{"note":"no model review"}\n```','malik-max'),true);assert.equal(contract.needsOilModelReview('Рассчитай, пример строки "только расчёт"','malik-oil-1tb'),true)})
for(const [label,modify]of [
 ['invented number',v=>v.findings[0].text='Доход составит 999 USD.'],
 ['invented citation',v=>v.findings[0].text='Подтверждено https://example.com'],
 ['unknown evidence',v=>v.findings[0].factIds=['F99']],
 ['invented confidence',v=>v.confidence=.99],
 ['guaranteed outcome',v=>v.conclusion='Доход гарантирован.'],
 ['equipment command',v=>v.nextChecks=['Открой задвижку.']],
 ['embedded HTML',v=>v.conclusion='<script>alert()</script>'],
 ['plot injection',v=>v.conclusion='```malik-oil-report\n{}\n```'],
 ['empty checks',v=>v.nextChecks=[]],
 ['missing limitations',v=>v.limitations=[]],
 ['unlabelled finding',v=>v.findings[0].kind='verified-fact'],
 ['nonfinite JSON',v=>v.conclusion=Infinity],
])test(`unverified output rejected: ${label}`,()=>{const v=valid();modify(v);assert.throws(()=>contract.parseOilModelReview(JSON.stringify(v),evidence))})
test('chemical names are not mistaken for new numeric performance estimates',()=>{const v=valid();v.missingData=['Не хватает измерений CO2 и H₂S.'];assert.doesNotThrow(()=>contract.parseOilModelReview(JSON.stringify(v),evidence))})
test('explicit denial of guarantees is retained, not mistaken for a guarantee',()=>{const v=valid();v.limitations=['Расчёт не гарантирует доходность.','There is no guarantee and this is not field-verified.'];assert.doesNotThrow(()=>contract.parseOilModelReview(JSON.stringify(v),evidence))})
test('oversized JSON is rejected before parsing',()=>assert.throws(()=>contract.parseOilModelReview(' '.repeat(24001),evidence),/REVIEW_TOO_LARGE/))
test('one repair attempt, no unchecked draft or raw error echoed',async()=>{
 const calls=[];const r=await runPetroleumModelReview(request,async input=>{calls.push(input);const v=valid();if(calls.length===1)v.conclusion='SECRET_BAD_OUTPUT 999 USD';return result(input,JSON.stringify(v))})
 assert.equal(r.status,'completed');assert.equal(calls.length,2);assert.equal(r.receipt.rejected,1);assert.doesNotMatch(calls[1].prompt,/SECRET_BAD_OUTPUT|999/);assert.doesNotMatch(r.content,/SECRET_BAD_OUTPUT|999/);assert.match(calls[1].prompt,/REVIEW_NUMBERS_MUST_REFERENCE_ENGINE/)
})
test('invalid repeated drafts stop at two attempts without fabricated participation',async()=>{let n=0;const r=await runPetroleumModelReview(request,async input=>{n++;return result(input,'not JSON')});assert.equal(n,2);assert.equal(r.status,'unavailable');assert.match(r.content,/Разбор принят: нет/);assert.equal(r.receipt.numericReferencesValidated,false)})
test('schema failures receive one repair attempt, not just syntactic JSON failures',async()=>{let n=0;const r=await runPetroleumModelReview(request,async input=>{n++;return result(input,n===1?JSON.stringify({...valid(),confidence:.99}):JSON.stringify(valid()))});assert.equal(n,2);assert.equal(r.status,'completed')})
test('provider outage is not retried by the review layer and does not expose secrets',async()=>{let n=0;const r=await runPetroleumModelReview(request,async()=>{n++;throw new Error('API_KEY_SECRET')});assert.equal(n,1);assert.equal(r.status,'unavailable');assert.doesNotMatch(r.content,/API_KEY_SECRET/);assert.equal(r.receipt.attempts,1)})
test('wrong selected model cannot count as an accepted answer',async()=>{const r=await runPetroleumModelReview(request,async input=>({...result(input),selectedModelId:'malik-27b'}));assert.equal(r.status,'unavailable');assert.equal(r.receipt.attempts,2)})
test('incomplete model output is withheld',async()=>{const r=await runPetroleumModelReview(request,async input=>({...result(input),incomplete:{reason:'length'}}));assert.equal(r.status,'unavailable')})
test('total deadline handles a provider that ignores abort without late publication',async()=>{let aborted=false;const start=performance.now();const r=await runPetroleumModelReview({...request,timeoutMs:10},async input=>{input.signal.addEventListener('abort',()=>{aborted=true});return new Promise(()=>{})});assert.equal(r.status,'unavailable');assert.equal(aborted,true);assert.equal(r.receipt.attempts,1);assert.ok(performance.now()-start<1000)})
test('user cancellation rejects the review and aborts the provider',async()=>{const c=new AbortController();let called=false;await assert.rejects(()=>runPetroleumModelReview({...request,signal:c.signal},async input=>{called=true;c.abort();input.signal.throwIfAborted();return result(input)}));assert.equal(called,true)})

test('cancellation settles even if a provider ignores the abort signal',async()=>{const c=new AbortController();const start=performance.now();await assert.rejects(()=>runPetroleumModelReview({...request,signal:c.signal},async()=>{setTimeout(()=>c.abort(),10);return new Promise(()=>{})}));assert.ok(performance.now()-start<1000)})
test('already cancelled requests do not call any model',async()=>{const c=new AbortController();c.abort();let n=0;await assert.rejects(()=>runPetroleumModelReview({...request,signal:c.signal},async input=>{n++;return result(input)}));assert.equal(n,0)})

test('review honors a smaller caller output budget and never expands a tiny daily remainder',async()=>{let n=0;const run=async input=>{n++;assert.equal(input.maxTokens,512);return result(input)};assert.equal((await runPetroleumModelReview({...request,maxTokens:512},run)).status,'completed');assert.equal(n,1);for(const maxTokens of [0,128,NaN]){const r=await runPetroleumModelReview({...request,maxTokens},run);assert.equal(r.status,'unavailable');assert.equal(r.receipt.code,'REVIEW_OUTPUT_BUDGET');assert.equal(r.receipt.attempts,0)}assert.equal(n,1)})
for(const language of ['ru','en','kk','ar'])test(`localized review framing and unavailable state: ${language}`,async()=>{const good=await runPetroleumModelReview({...request,language},async input=>result(input));assert.equal(good.status,'completed');assert.ok(good.content.includes(evidence.hash));const bad=await runPetroleumModelReview({...request,language},async()=>{throw Error('offline')});assert.equal(bad.status,'unavailable');if(language==='en')assert.doesNotMatch(good.content,/Гипотеза|Следующие/);if(language==='ar')assert.match(good.content,/التحليل/)})
