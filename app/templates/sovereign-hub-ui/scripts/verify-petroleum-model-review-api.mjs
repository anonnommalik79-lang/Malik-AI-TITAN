import test from 'node:test'
import assert from 'node:assert/strict'
import {workTestLoader} from './work-test-loader.mjs'
import {scienceCases,scienceInput} from './fixtures/oil-science.mjs'
const owner={userId:'fixture-account',authenticated:true,plan:'pro'},after=[],calls=[]
let mode='valid',remaining
class RouteError extends Error{}
const forbidden=()=>{throw Error('Unrelated web/media/plugin/agent boundary invoked')}
const draft=facts=>({conclusion:'Интерпретация относится только к представленным данным.',findings:[{kind:'interpretation',factIds:[facts[0].id],text:'Значение связано с условиями расчёта и не подтверждает полевой результат.'}],assumptions:[],missingData:['Не подтверждено происхождение измерений.'],nextChecks:['Сверить исходные данные и область применимости.'],limitations:['Необходима проверка уполномоченным инженером.']})
const load=workTestLoader({
 'next/server':{after:fn=>after.push(fn)},
 '@/lib/malik-god-router':{asPlainText:a=>a.content,malikGodAnswer:forbidden,gatherSourcesForPrompt:forbidden,sourceContext:()=>''},
 '@/lib/server/plugin-runtime':{parsePluginCommand:()=>null},'@/lib/server/plugin-model-answer':{runPluginModelAnswer:forbidden},
 '@/lib/ai/project-builder':{generateProjectWithBrain:forbidden},
 '@/lib/limits/rate-limit':{checkUsageLimit:async()=>({ok:true}),recordChatUsage:async()=>{}},
 '@/lib/server/malik-model-router':{
  resolveStrictMalikSelection:async(_req,body)=>({modelId:body.model||'malik-max',entitlement:owner}),MalikModelRouteError:RouteError,malikModelErrorPayload:e=>({error:e.message}),
  runStrictMalikModel:async input=>{
   calls.push(input)
   if(mode==='offline')throw Error('PROVIDER_SECRET_NOT_PUBLIC')
   const data=JSON.parse(input.prompt)
   assert.equal(input.responseContract,'petroleum-evidence-review-v1');assert.deepEqual(input.attachments,[]);assert.deepEqual(input.history,[]);assert.equal(input.onToken,undefined)
   let value=draft(data.verifiedEngineEvidence.facts)
   if(mode==='invalid'||mode==='repair'&&calls.length===1)value.conclusion='Подтверждён доход 999999 USD.'
   return{content:JSON.stringify(value),provider:'mock-actual-model',model:'mock-review',selectedModelId:input.modelId,latencyMs:1,usage:{participantModels:[{id:'ling-3.1-flash'},{id:'nvidia-nemotron-ultra-550b'},{id:'malik-max'}],synthesized:true}}
  },
 },
 '@/lib/server/malik-coder-orchestrator':{runMalikCoderOrchestrator:forbidden},'@/lib/server/malik-agent-runtime':{prepareMalikAgentRuntime:forbidden},
 '@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>owner},
 '@/lib/server/work-quota':{reserveWorkQuota:async()=>({ok:true,receipt:{id:'fixture'}}),refundWorkQuota:async()=>{},WorkQuotaError:RouteError},
 '@/lib/server/malik-owner-context':{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:b=>b},'@/lib/server/project-artifact-store':{putProjectArtifact:forbidden},
 '@/lib/server/multimodal-router':{estimateMultimodalTokens:()=>0,hasMalikAttachments:a=>Array.isArray(a)&&a.length>0,routeMalikAttachments:forbidden},
 '@/lib/server/daily-multimodal-quota':{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
 '@/lib/server/daily-text-token-quota':{getDailyTextTokenQuota:()=>remaining===undefined?({unlimited:true}):({unlimited:false,remaining})},
 '@/lib/server/scheduled-tasks':{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
 '@/lib/malik-compute/runtime':{withCompute:h=>h,observeComputeResult:()=>{}},
})
const {POST}=load('app/api/stream/route-impl.ts')
async function turn(prompt,model='malik-max',attachments){
 calls.length=0
 const response=await POST(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({originalQuestion:prompt,model,selectedSkillId:'petroleum.analyze',workspaceMode:'work',stream:true,attachments})}))
 assert.equal(response.status,200)
 const events=(await response.text()).split('\n\n').filter(x=>x.includes('data: ')).map(frame=>JSON.parse(frame.split('\ndata: ')[1]))
 assert.equal(events.filter(e=>e.type==='done').length,1)
 const answer=events.filter(e=>e.type==='content').map(e=>e.content).join('')
 for(const deferred of after.splice(0))await deferred()
 return{answer,events}
}
for(const model of ['malik-max','malik-oil-1tb'])for(const example of scienceCases)test(`${model}: ${example.method} invokes actual review wrapper after numerical verification`,async()=>{
 mode='valid';const {answer}=await turn('@Malik Oil AI\n```petroleum\n'+JSON.stringify({op:'scientific',input:scienceInput(example)})+'\n```',model)
 assert.equal(calls.length,1);assert.equal(calls[0].modelId,model);assert.match(answer,/Numerical checks: PASS/);assert.match(answer,/Model engineering review/);assert.match(answer,/accepted review: yes/);assert.match(answer,/model calls: 0/);assert.equal((answer.match(/# Malik Oil AI/g)||[]).length,1)
 if(model==='malik-oil-1tb')assert.match(answer,/3\/3/)
})
const npv='@Malik Oil AI Рассчитай NPV: cashflows=[-100,60,60] rate=10% period=year currency=USD'
test('NPV returns one final answer, real review/validation stages, no unverified numeric draft',async()=>{mode='repair';const {answer,events}=await turn(npv);assert.equal(calls.length,2);assert.ok(answer.includes('4.132231404958667'));assert.doesNotMatch(answer,/999999/);assert.equal(events.filter(e=>e.type==='content').length,1);const text=JSON.stringify(events);assert.match(text,/MODEL_MODEL/);assert.match(text,/MODEL_VALIDATION/);assert.match(text,/MODEL_RETRY/)})
test('outage preserves verified NPV but never claims an accepted model review',async()=>{mode='offline';const {answer}=await turn(npv,'malik-oil-1tb');assert.equal(calls.length,1);assert.ok(answer.includes('4.132231404958667'));assert.match(answer,/Разбор принят: нет/);assert.doesNotMatch(answer,/PROVIDER_SECRET_NOT_PUBLIC|Разбор принят: да/)})
test('invalid repeated model output stops at one repair and preserves deterministic report',async()=>{mode='invalid';const {answer}=await turn(npv);assert.equal(calls.length,2);assert.match(answer,/Разбор принят: нет/);assert.doesNotMatch(answer,/999999/)})
test('invalid calculation does not call models or manufacture a review',async()=>{mode='valid';const {answer}=await turn(npv.replace('rate=10%','rate=100000%'));assert.equal(calls.length,0);assert.doesNotMatch(answer,/accepted review: yes/)})
test('explicit calculation-only request remains zero-model',async()=>{mode='valid';const {answer}=await turn(npv+' Только расчёт');assert.equal(calls.length,0);assert.ok(answer.includes('4.132231404958667'))})

test('HTTP route forwards daily output remainder, retaining the calculation without an over-budget model call',async()=>{mode='valid';try{remaining=512;await turn(npv);assert.equal(calls.length,1);assert.equal(calls[0].maxTokens,512);remaining=128;const {answer}=await turn(npv);assert.equal(calls.length,0);assert.ok(answer.includes('4.132231404958667'));assert.match(answer,/Разбор принят: нет/)}finally{remaining=undefined}})
test('unrelated file cannot replace the requested operation or be sent to a model',async()=>{mode='valid';const {answer}=await turn(npv,'malik-max',[{name:'reference.csv',kind:'file',text:'SECRET_RAW_FILE'}]);assert.equal(calls.length,0);assert.match(answer,/ATTACHMENT_TASK_CONFLICT/)})
test('pasted production table uses the same bounded review path without raw file text',async()=>{
 mode='valid';const text='@Malik Oil AI Проанализируй нефтяную добычу. Нефть и вода в bbl/day.\n| well | month | oil | water |\n|---|---|---|---|\n| A | 2026-01 | 80 | 20 |\n| A | 2026-02 | 60 | 40 |'
 const {answer}=await turn(text);assert.equal(calls.length,1);assert.match(answer,/разбор|review/);assert.ok(JSON.parse(calls[0].prompt).verifiedEngineEvidence.facts.length>0)
})
