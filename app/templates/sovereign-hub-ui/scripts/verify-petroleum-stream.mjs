import assert from 'node:assert/strict'
import { workTestLoader } from './work-test-loader.mjs'
const owner={userId:'fixture-account',authenticated:true,plan:'pro'},after=[],forbidden=()=>{throw new Error('Forbidden provider/tool invoked during petroleum calculation')}
class RouteError extends Error {}
const load=workTestLoader({
  'next/server':{after:fn=>after.push(fn)},
  '@/lib/malik-god-router':{asPlainText:answer=>answer.content,malikGodAnswer:forbidden,gatherSourcesForPrompt:forbidden,sourceContext:()=>''},
  '@/lib/server/plugin-runtime':{parsePluginCommand:()=>null},
  '@/lib/server/plugin-model-answer':{runPluginModelAnswer:forbidden},
  '@/lib/ai/project-builder':{generateProjectWithBrain:forbidden},
  '@/lib/limits/rate-limit':{checkUsageLimit:async()=>({ok:true}),recordChatUsage:async()=>{}},
  '@/lib/server/malik-model-router':{resolveStrictMalikSelection:async()=>({modelId:'malik-20b',entitlement:owner}),MalikModelRouteError:RouteError,malikModelErrorPayload:error=>({error:error.message})},
  '@/lib/server/malik-coder-orchestrator':{runMalikCoderOrchestrator:forbidden},
  '@/lib/server/malik-agent-runtime':{prepareMalikAgentRuntime:forbidden},
  '@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>owner},
  '@/lib/server/work-quota':{reserveWorkQuota:async()=>({ok:true,receipt:{id:'fixture'}}),refundWorkQuota:async()=>{},WorkQuotaError:RouteError},
  '@/lib/server/malik-owner-context':{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:body=>body},
  '@/lib/server/project-artifact-store':{putProjectArtifact:forbidden},
  '@/lib/server/multimodal-router':{estimateMultimodalTokens:()=>0,hasMalikAttachments:items=>Array.isArray(items)&&items.length>0,routeMalikAttachments:forbidden},
  '@/lib/server/daily-multimodal-quota':{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
  '@/lib/server/daily-text-token-quota':{getDailyTextTokenQuota:()=>({unlimited:true})},
  '@/lib/server/scheduled-tasks':{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
  '@/lib/malik-compute/runtime':{withCompute:handler=>handler,observeComputeResult:()=>{}},
})
const POST=load('app/api/stream/route-impl.ts').POST
const csv='well_id,date,oil_bbl_day,water_bbl_day\nA,2025-01-01,80,20\nA,2025-02-01,60,40'
for(const language of ['ru','ar','en','kk']) {
  const text={ru:'Проанализируй нефтяную скважину',ar:'حلل إنتاج النفط',en:'Analyze oil well production',kk:'Мұнай ұңғымаларын талда'}[language]
  const response=await POST(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify({originalQuestion:text,selectedSkillId:'petroleum.analyze',attachments:[{name:'production.csv',mime:'text/csv',kind:'file',text:csv}],workspaceMode:'work',isProjectRequest:true,forceCanvas:true,responseMode:'canvas',stream:true})}))
  assert.equal(response.status,200)
  const events=(await response.text()).split('\n\n').filter(x=>x.includes('data: ')).map(frame=>JSON.parse(frame.split('\ndata: ')[1]))
  const contents=events.filter(e=>e.type==='content'),done=events.filter(e=>e.type==='done')
  assert.equal(done.length,1);assert.equal(done[0].provider,'malik-petroleum-local');assert.ok(contents.length>=1)
  const answer=contents.map(e=>e.content).join('');assert.ok(answer.includes('SHA-256'));assert.equal(answer.match(/# Malik Oil AI/g).length,1)
  assert.ok(!answer.includes('generatedMedia'));assert.equal(done[0].sources.length,0)
  for(const deferred of after.splice(0))await deferred()
}
console.log('PASS actual stream HTTP/SSE path in RU/AR/EN/KK, attached CSV, Work quota admission, project/media isolation, one completion and one answer. Model/media/provider boundaries throw if invoked; auth/quota fixtures explicit.')
