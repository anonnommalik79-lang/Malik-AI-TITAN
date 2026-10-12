import assert from 'node:assert/strict'
import { workTestLoader } from './work-test-loader.mjs'
const stored=new Map(),activities=[]
let configured=true
const privateStore={
  privateJsonStoreConfigured:()=>configured,
  readPrivateJsonVersioned:async key=>({value:stored.has(key)?JSON.parse(stored.get(key)):null,etag:stored.has(key)?'fixture-etag':null}),
  writePrivateJsonConditional:async(key,value,etag)=>{assert.equal(etag,null);if(stored.has(key))return {stored:false,conflict:true};stored.set(key,JSON.stringify(value));return {stored:true,conflict:false}},
  deletePrivateJson:async key=>{stored.delete(key);return true},
}
const load=workTestLoader({
  '@/lib/os/http':{osOwner:async request=>({userId:request.headers.get('x-fixture-owner')||'client-A',authenticated:request.headers.get('x-fixture-guest')!=='true',plan:'pro'})},
  '@/lib/server/request-frequency':{takeRequestFrequency:()=>true},
  '@/lib/work/activity-log':{recordWorkActivity:async(id,entry)=>activities.push({id,...entry})},
  '../../server/private-json-store':privateStore,
})
const snapshots=load('app/api/work/petroleum/snapshots/route.ts'),skill=load('app/api/work/skills/run/route.ts')
const csv='well_id,date,oil_bbl_day,water_bbl_day\nA,2026-01-01,100,20\nA,2026-02-01,80,40'
const task={op:'field-surveillance',csv}
const body={task,authorizedImport:true,consentToConfiguredPrivateStorage:true}
const req=(value,owner='client-A',method='POST',id='',guest=false)=>new Request('http://fixture/api/work/petroleum/snapshots'+(id?'?id='+id:''),{method,headers:{'content-type':'application/json','x-fixture-owner':owner,'x-fixture-guest':String(guest)},...(method==='POST'?{body:JSON.stringify(value)}:{})})
const response=await snapshots.POST(req(body));assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.durable,true);assert.equal(stored.size,1)
assert.equal((await snapshots.POST(req(body))).status,200);assert.equal(stored.size,1)
const a=await snapshots.GET(req(null,'client-A','GET',saved.id));assert.equal(a.status,200);const result=await a.json();assert.equal(result.snapshot.result.processedWells,1)
assert.equal((await snapshots.GET(req(null,'client-B','GET',saved.id))).status,404)
assert.equal((await snapshots.DELETE(req(null,'client-B','DELETE',saved.id))).status,200);assert.equal(stored.size,1)
assert.equal((await snapshots.POST(req(body,'client-A','POST','',true))).status,401)
assert.equal((await snapshots.POST(req({...body,ownerId:'client-B'}))).status,400)
assert.equal((await snapshots.POST(req({task,authorizedImport:true}))).status,400)
assert.equal((await snapshots.POST(req({task,consentToConfiguredPrivateStorage:true}))).status,400)
assert.equal((await snapshots.GET(req(null,'client-A','GET','../foreign'))).status,400)
const [key,raw]=[...stored.entries()][0],tampered=JSON.parse(raw);tampered.result.wells[0].metrics.oil.value=999;stored.set(key,JSON.stringify(tampered));assert.equal((await snapshots.GET(req(null,'client-A','GET',saved.id))).status,503);stored.set(key,raw)
const expired=JSON.parse(raw);expired.expiresAt='2000-01-01T00:00:00.000Z';stored.set(key,JSON.stringify(expired));assert.equal((await snapshots.GET(req(null,'client-A','GET',saved.id))).status,404);assert.equal(stored.size,0)
await snapshots.POST(req(body));assert.equal((await snapshots.DELETE(req(null,'client-A','DELETE',saved.id))).status,200);assert.equal(stored.size,0)
configured=false
const noStore=await snapshots.POST(req(body));assert.equal(noStore.status,503);assert.equal((await noStore.json()).code,'PRIVATE_STORAGE_NOT_CONFIGURED');assert.equal(stored.size,0)
const computed=await skill.POST(req({skill:'petroleum.analyze',task}));assert.equal(computed.status,200);const computedBody=await computed.json();assert.equal(computedBody.engineering.counts.processed,1);assert.ok(computedBody.report.includes('Field intelligence'))
assert.ok(activities.every(a=>!JSON.stringify(a).includes(csv)));assert.ok(activities.every(a=>a.id==='client-A'||a.id==='client-B'))
console.log('PASS 16 actual HTTP/storage boundary checks: authenticated consent, caller-scoped keys, foreign owner isolation/deletion, immutable replay, tamper/expiry, no storage fallback, local skill computation and typed engineering response. Auth and object store are explicit fixtures, not a live corporate security test.')

const after=[],forbidden=()=>{throw new Error('Provider or external tool invoked on a local field calculation')}
class RouteError extends Error {}
const owner={userId:'fixture-account',authenticated:true,plan:'pro'}
const streamLoad=workTestLoader({
  'next/server':{after:fn=>after.push(fn)},
  '@/lib/malik-god-router':{asPlainText:a=>a.content,malikGodAnswer:forbidden,gatherSourcesForPrompt:forbidden,sourceContext:()=>''},
  '@/lib/server/plugin-runtime':{parsePluginCommand:()=>null},
  '@/lib/server/plugin-model-answer':{runPluginModelAnswer:forbidden},
  '@/lib/ai/project-builder':{generateProjectWithBrain:forbidden},
  '@/lib/limits/rate-limit':{checkUsageLimit:async()=>({ok:true}),recordChatUsage:async()=>{}},
  '@/lib/server/malik-model-router':{resolveStrictMalikSelection:async()=>({modelId:'malik-20b',entitlement:owner}),MalikModelRouteError:RouteError,malikModelErrorPayload:e=>({error:e.message})},
  '@/lib/server/malik-coder-orchestrator':{runMalikCoderOrchestrator:forbidden},
  '@/lib/server/malik-agent-runtime':{prepareMalikAgentRuntime:forbidden},
  '@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>owner},
  '@/lib/server/work-quota':{reserveWorkQuota:async()=>({ok:true,receipt:{id:'fixture'}}),refundWorkQuota:async()=>{},WorkQuotaError:RouteError},
  '@/lib/server/malik-owner-context':{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:b=>b},
  '@/lib/server/project-artifact-store':{putProjectArtifact:forbidden},
  '@/lib/server/multimodal-router':{estimateMultimodalTokens:()=>0,hasMalikAttachments:a=>Array.isArray(a)&&a.length>0,routeMalikAttachments:forbidden},
  '@/lib/server/daily-multimodal-quota':{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
  '@/lib/server/daily-text-token-quota':{getDailyTextTokenQuota:()=>({unlimited:true})},
  '@/lib/server/scheduled-tasks':{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
  '@/lib/malik-compute/runtime':{withCompute:h=>h,observeComputeResult:()=>{}},
})
const stream=streamLoad('app/api/stream/route-impl.ts').POST
for(const structured of [false,true]) {
  const prompt=structured?'@Malik Oil AI Analyze production loss\n```petroleum\n'+JSON.stringify(task)+'\n```':'@Malik Oil AI production loss surveillance'
  const request=new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({originalQuestion:prompt,selectedSkillId:'petroleum.analyze',...(structured?{}:{attachments:[{name:'history.csv',mime:'text/csv',kind:'file',text:csv}]}),workspaceMode:'work',isProjectRequest:true,forceCanvas:true,stream:true})})
  const response=await stream(request);assert.equal(response.status,200)
  const events=(await response.text()).split('\n\n').filter(s=>s.includes('data: ')).map(s=>JSON.parse(s.split('\ndata: ')[1]))
  const done=events.filter(e=>e.type==='done');assert.equal(done.length,1);assert.equal(done[0].provider,'malik-petroleum-local')
  const text=events.filter(e=>e.type==='content').map(e=>e.content).join('');assert.ok(text.includes('Field intelligence'));assert.equal(text.match(/# Malik Oil AI/g).length,1)
  assert.ok(events.some(e=>e.type==='progress'&&e.phase==='petroleum'&&e.processed===1&&e.requested===1))
  assert.ok(events.some(e=>e.type==='activity'&&e.step.tool==='petroleum.field'))
  for(const fn of after.splice(0))await fn()
}
console.log('PASS 2 actual chat HTTP/SSE queries: uploaded and typed field tasks; one local answer/completion, real progress/activity counts, existing project flags do not steal routing. No model, web, private service or equipment command was called.')
const visualResponse=await stream(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({originalQuestion:'@Malik Oil AI Analyze oil production',selectedSkillId:'petroleum.analyze',attachments:[{name:'history.csv',mime:'text/csv',kind:'file',text:csv}],stream:true})}))
const visualEvents=(await visualResponse.text()).split('\n\n').filter(s=>s.includes('data: ')).map(s=>JSON.parse(s.split('\ndata: ')[1]))
assert.equal(visualEvents.filter(e=>e.type==='done').length,1)
assert.ok(visualEvents.filter(e=>e.type==='content').map(e=>e.content).join('').includes('```malik-oil-report'))
for(const fn of after.splice(0))await fn()
console.log('PASS existing Claude visual report upload path retained after main integration; no UI source was replaced.')
