import assert from 'node:assert/strict'
import vm from 'node:vm'
import {workTestLoader} from './work-test-loader.mjs'
const load=workTestLoader({'@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>({authenticated:true,userId:'fixture',plan:'owner'})}})
const kind=load('lib/ai/request-kind.ts'),brain=load('lib/ai/brain-v1.ts'),intent=load('lib/ai/conversation-intent.ts')
const completion=load('lib/ai/answer-completion.ts'),{createCodeContinuationFilter}=load('lib/ai/code-continuation.ts')
const router=load('lib/server/malik-model-router.ts'),engine=load('lib/server/malik-max-engine.ts')
let checks=0,seq=0
async function check(name,fn){await fn();checks++;console.log('PASS '+name)}
for(const prompt of ['сгенерируй мне игру','Создай игру космический защитник','Сделай игру с управлением на телефоне','Build a playable game','Create a calculator','Маған ойын жасап бер'])await check('runnable request gets code budget: '+prompt,()=>{
 assert.equal(kind.isCodeRequest(prompt),true);assert.equal(kind.isFastChatRequest(prompt),false)
 assert.equal(brain.analyzeMalikBrainV1({prompt}).task,'code');assert.ok(brain.analyzeMalikBrainV1({prompt}).outputTokenTarget>=8000)
 assert.equal(intent.resolveConversationIntent({prompt}).target,'code')
})
for(const prompt of ['Придумай настольную игру','Напиши правила игры без кода','Напиши стих про игру','Объясни как создать игру','Создай изображение для игры','Сгенерируй видео игры','Create a poem about a game','Create a calculator in XLSX','Объясни пример:\n> Создай игру'])await check('no implicit software action: '+prompt,()=>{
 assert.equal(load('lib/ai/artifact-intent.ts').isSoftwareCreationRequest(prompt),false)
})
await check('fences: mixed markers, literal backticks, nested Markdown and tilde notes',()=>{
 assert.equal(completion.hasOpenFence('```js\nconst help="```";\n```'),false)
 assert.equal(completion.hasOpenFence('```js\rconst help=1;\n```'),false)
 assert.equal(router.codeAnswerNeedsMore('```js\nconst help="```";\n```','Напиши код'),false)
 assert.equal(completion.hasOpenFence('````md\n```js\nx()\n```\n````'),false)
 assert.equal(completion.hasOpenFence('~~~js\nx();\n```'),true)
 const text=completion.withIncompleteNote('~~~~js\nx();',{reason:'time',openFence:true})
 assert.equal(completion.hasOpenFence(text),false);assert.match(text,/\n~~~~\n/)
})
await check('HTML cannot be marked complete just because Markdown was closed',()=>{
 const text='```html\n<html><body><script>function reset(){\n```'
 assert.equal(router.codeAnswerNeedsMore(text,'Сгенерируй игру'),true)
 assert.ok(completion.assessAnswerCompletion(text,{interrupted:false,finishReason:'stop',codeIncomplete:true}))
})
await check('reopened code fence and repeated tail are removed at arbitrary byte splits',()=>{
 const previous='```html\n<html>\n<body>\n<script>\nconst energyLevel=100;\n'
 const next='```html\nconst energyLevel=100;\nfunction reset(){return energyLevel;}\n</script></body></html>\n```'
 let merged=previous;const filter=createCodeContinuationFilter(previous,c=>{merged+=c})
 for(const char of next)filter.push(char);filter.end()
 assert.equal(merged.split('const energyLevel=100;').length-1,1)
 assert.equal(completion.hasOpenFence(merged),false);assert.equal(router.codeAnswerNeedsMore(merged,'Создай игру'),false)
 assert.ok(filter.dropped>10);assert.match(router.continuationPrompt('Создай игру',previous),/ALREADY INSIDE/)
})
await check('partial identifiers and the actual final closing fence are not trimmed',()=>{
 let text='```js\nconst longIdent';let f=createCodeContinuationFilter(text,c=>{text+=c});f.push('ifier=42;\n```');f.end()
 assert.equal(text,'```js\nconst longIdentifier=42;\n```')
 let closing='```js\nconst n=1;\n';f=createCodeContinuationFilter(closing,c=>{closing+=c});f.push('```');f.end()
 assert.equal(completion.hasOpenFence(closing),false)
})
await check('manual resume removes only the display fence and retains the real partial code',async()=>{
 const partial='```html filename=index.html\n<!doctype html><html><body><script>\nfunction resetGame(){'
 const shown=completion.withIncompleteNote(partial,{reason:'rounds',openFence:true})
 assert.equal(completion.stripIncompleteNote(shown),partial)
 assert.equal(completion.stripIncompleteNote(shown.replace(/\n/g,'\r')),partial.replace(/\n/g,'\r'))
 const nested='````md\n```js\nx();\n```'
 assert.equal(completion.resumeText(completion.withIncompleteNote(nested,{reason:'time',openFence:true})),nested,'resume strips the artificial fence exactly once, not the real nested code ending')
 const log=[],result=await engine.runMalikMax({prompt:'Продолжи',history:[{role:'assistant',content:shown}],systemPrompt:'Helpful.',maxTokens:8000},{lanes:[lane()],fetcher:provider(()=>({text:'```html\nreturn 1;}\n</script></body></html>\n```'}),log)})
 assert.equal(result.incomplete,undefined);assert.ok(log[0].max_tokens>1500)
 assert.ok(log[0].messages.some(m=>m.role==='assistant'&&m.content===partial))
 assert.match(log[0].messages[0].content,/MANUAL CODE RESUME/)
})
await check('filename metadata on a redundant wrapper does not create a nested code block',()=>{
 let merged='```html filename=index.html\n<html><body>\n'
 const f=createCodeContinuationFilter(merged,c=>{merged+=c});f.push('```html filename=index.html\n</body></html>\n```');f.end()
 assert.equal(completion.hasOpenFence(merged),false);assert.equal((merged.match(/filename=/g)||[]).length,1)
})
function lane(cap=16000){return{id:'completion-fixture-'+(++seq),provider:'fixture',providerModel:'fixture-'+seq,label:'fixture',protocol:'openai',keyIndex:0,key:'fixture',def:{id:'fixture',provider:'openai',providerModel:'fixture',label:'fixture',tier:'free',capabilities:['text']},direct:{url:'https://fixture.invalid/'+seq,outputCap:cap},power:90,vision:false}}
function provider(respond,log=[]){let calls=0;return async(_url,init)=>{
 const body=JSON.parse(init.body);log.push(body);const item=await respond(calls++,body,init.signal)
 if(item.fail)throw new Error('fixture disconnect')
 const payloads=[{choices:[{delta:{content:item.text},finish_reason:null}]},{choices:[{delta:{},finish_reason:item.finish||'stop'}],...(item.usage?{usage:item.usage}:{})}]
 return new Response(payloads.map(p=>'data: '+JSON.stringify(p)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}})
}}
await check('450-line HTML/JavaScript output finishes through more than five small-provider chunks',async()=>{
 const script='"use strict";\n'+Array.from({length:445},(_,i)=>`const score_${i}=${i};`).join('\n')+'\nfunction resetGame(){return score_444;}\n'
 const whole='```html\n<!doctype html><html><body><canvas id="game"></canvas><script>\n'+script+'</script></body></html>\n```'
 const size=800,chunks=Array.from({length:Math.ceil(whole.length/size)},(_,i)=>whole.slice(i*size,(i+1)*size)),log=[]
 assert.ok(chunks.length>6)
 let streamed=''
 const result=await engine.runMalikMax({prompt:'сгенерируй мне игру',systemPrompt:'Be helpful.',maxTokens:12000,onToken:c=>{streamed+=c}},{lanes:[lane(300)],fetcher:provider(i=>({text:chunks[i]||'',finish:i<chunks.length-1?'length':'stop',usage:{completion_tokens:250}}),log)})
 assert.equal(result.incomplete,undefined);assert.equal(result.content,whole);assert.equal(streamed,whole);assert.equal(log.length,chunks.length)
 assert.ok(log[0].max_tokens<=300);assert.doesNotMatch(JSON.stringify(log[0].messages),/FAST CHAT MODE/)
 const js=result.content.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(js));assert.equal(router.codeAnswerNeedsMore(result.content,'Создай игру'),false)
})
await check('a mislabeled ordinary answer containing real HTML is promoted before continuation',async()=>{
 const log=[],first='```html\n<!doctype html><html><body><script>\nconst score=1;\n'
 const result=await engine.runMalikMax({prompt:'Удиви меня чем-нибудь интересным',systemPrompt:'Helpful.',maxTokens:6000},{lanes:[lane()],fetcher:provider(i=>i===0?{text:first,finish:'length'}:{text:'```html\nfunction play(){return score;}\n</script></body></html>\n```'},log)})
 assert.equal(result.incomplete,undefined);assert.equal(log[0].max_tokens,1500);assert.ok(log[1].max_tokens>1500)
 assert.doesNotMatch(JSON.stringify(log[1].messages),/FAST CHAT MODE/);assert.equal(completion.hasOpenFence(result.content),false)
})
await check('unadvertised provider caps adapt beyond eight continuation rounds',async()=>{
 const log=[],parts=Array.from({length:12},(_,i)=>(i===0?'```js\n':'')+`const checkpoint_${i}=${i};\n`+'// padding '.repeat(12)+'\n');parts.push('```')
 const result=await engine.runMalikMax({prompt:'Создай игру',systemPrompt:'Helpful.',maxTokens:6000},{lanes:[lane()],fetcher:provider(i=>({text:parts[i],finish:i<parts.length-1?'length':'stop',usage:{completion_tokens:128}}),log)})
 assert.equal(result.incomplete,undefined);assert.equal(result.content,parts.join(''));assert.equal(log.length,parts.length)
})
await check('actual output, including discarded repetitions, consumes the remaining allowance',async()=>{
 const log=[],fragment='```js\nconst score=1;\n'
 const result=await engine.runMalikMax({prompt:'Напиши полный код',systemPrompt:'Helpful.',maxTokens:500},{lanes:[lane()],fetcher:provider(()=>({text:fragment,finish:'length',usage:{completion_tokens:300}}),log)})
 assert.equal(log.length,2);assert.equal(log[0].max_tokens,500);assert.equal(log[1].max_tokens,200)
 assert.equal(result.incomplete.reason,'budget')
 assert.equal(engine.generatedOutputTokens({output_tokens:23},'a'),23);assert.equal(engine.generatedOutputTokens({candidatesTokenCount:31},'a'),31)
})
await check('small/zero budgets are not rounded up to free provider tokens',async()=>{
 const log=[];await engine.runMalikMax({prompt:'Привет',systemPrompt:'Helpful.',maxTokens:32},{lanes:[lane()],fetcher:provider(()=>({text:'Привет!'}),log)})
 assert.equal(log[0].max_tokens,32)
 await assert.rejects(engine.runMalikMax({prompt:'Привет',systemPrompt:'Helpful.',maxTokens:0},{lanes:[lane()],fetcher:provider(()=>{throw Error('must not run')})}),e=>e.code==='ANSWER_BUDGET_EXHAUSTED')
})
await check('no-progress and provider failures remain bounded and honest',async()=>{
 const log=[];const stuck=await engine.runMalikMax({prompt:'Создай игру',systemPrompt:'Helpful.',maxTokens:8000},{lanes:[lane()],fetcher:provider(()=>({text:'```html\n<html>\nconst repeatedScore=1;\n',finish:'length'}),log)})
 assert.ok(stuck.incomplete);assert.ok(log.length<=4)
 const failed=await engine.runMalikMax({prompt:'Создай игру',systemPrompt:'Helpful.',maxTokens:8000},{lanes:[lane()],fetcher:provider(i=>i?{fail:true}:{text:'```html\n<html><body>\n',finish:'length'})})
 assert.equal(failed.incomplete.reason,'continuation-failed');assert.match(failed.content,/<html>/)
})
await check('explicit stop cancels a continuation rather than beginning another provider round',async()=>{
 const stop=new AbortController(),log=[]
 await assert.rejects(engine.runMalikMax({prompt:'Создай игру',systemPrompt:'Helpful.',maxTokens:8000,signal:stop.signal},{lanes:[lane()],fetcher:provider((i,_body,signal)=>{
   if(!i)return{text:'```html\n<html><body>\n',finish:'length'}
   stop.abort();return new Promise((_resolve,reject)=>{if(signal.aborted)reject(new DOMException('aborted','AbortError'));else signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true})})
 },log)}),e=>e.name==='AbortError')
 assert.equal(log.length,2)
})
await check('actual chat POST delivers one complete continued answer through the client stream contract',async()=>{
 const owner={userId:'code-completion-owner-fixture',authenticated:true,plan:'pro'},deferred=[],log=[]
 const forbidden=()=>{throw Error('Unexpected external/tool boundary')}
 const parts=['```html\n<!doctype html><html><body><script>\nconst score=1;\n','function resetGame(){return score;}\n</script></body></html>\n```']
 let turns=0,siteInstruction=''
 const apiLoad=workTestLoader({
  'next/server':{after:fn=>deferred.push(fn)},
  // The coordinator boundary delegates into the real production MAX engine;
  // this test covers HTTP/SSE finalization, not live coordinator research.
  '@/lib/malik-god-router':{asPlainText:a=>a.content,sourceContext:()=>'',gatherSourcesForPrompt:forbidden,malikGodAnswer:async(body,selection,_progress,onToken,_research,_activity,signal)=>{
   siteInstruction=apiLoad('lib/server/chat-website-design.ts').chatWebsiteInstruction(body)
   turns++;const result=await engine.runMalikMax({prompt:body.prompt,taskPrompt:body.originalQuestion,systemPrompt:'Helpful.',history:body.history,maxTokens:body.maxTokens,onToken,signal},{lanes:[lane(300)],fetcher:provider(i=>({text:parts[i],finish:i?'stop':'length'}),log)})
   return{...result,selectedModelId:selection.modelId,usedWeb:false,sources:[],attempts:[]}
  }},
  '@/lib/server/plugin-runtime':{parsePluginCommand:()=>null},'@/lib/server/plugin-model-answer':{runPluginModelAnswer:forbidden},
  '@/lib/ai/project-builder':{generateProjectWithBrain:forbidden},
  '@/lib/limits/rate-limit':{checkUsageLimit:async()=>({ok:true}),recordChatUsage:async()=>{}},
  '@/lib/server/malik-model-router':{...router,resolveStrictMalikSelection:async()=>({modelId:'malik-max',entitlement:owner})},
  '@/lib/server/malik-coder-orchestrator':{runMalikCoderOrchestrator:forbidden},'@/lib/server/malik-agent-runtime':{prepareMalikAgentRuntime:async()=>null},
  '@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>owner},
  '@/lib/server/work-quota':{reserveWorkQuota:async()=>({ok:true,receipt:{id:'fixture'}}),refundWorkQuota:async()=>{},WorkQuotaError:Error},
  '@/lib/server/malik-owner-context':{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:b=>b},'@/lib/server/project-artifact-store':{putProjectArtifact:forbidden},
  '@/lib/server/multimodal-router':{estimateMultimodalTokens:()=>0,hasMalikAttachments:()=>false,routeMalikAttachments:forbidden},
  '@/lib/server/daily-multimodal-quota':{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
  '@/lib/server/daily-text-token-quota':{getDailyTextTokenQuota:()=>({unlimited:true})},
  '@/lib/server/scheduled-tasks':{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
  '@/lib/malik-compute/runtime':{withCompute:h=>h,observeComputeResult:()=>{}},
  '@/lib/os/http':{osOwner:async()=>owner},'@/lib/server/request-frequency':{takeRequestFrequency:()=>true},
 })
 const store=apiLoad('lib/os/store.ts');store.configureOsBackend(store.memoryBackend())
 const {POST}=apiLoad('app/api/stream/route-impl.ts')
 const {parseChatSseFrame,mergeChatStreamText}=apiLoad('lib/ai/chat-stream-contract.ts')
 const response=await POST(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify({prompt:'Напиши код счётчика на JavaScript, покажи код в чате',originalQuestion:'Напиши код счётчика на JavaScript, покажи код в чате',model:'malik-max',stream:true,chatRecovery:true,maxTokens:8000})}))
 assert.equal(response.status,200)
 const events=(await response.text()).split(/\r?\n\r?\n/).map(parseChatSseFrame).filter(Boolean)
 let visible=''
 for(const item of events){
  if(item.type==='content')visible=mergeChatStreamText(visible,item.payload.content,item.payload.contentMode)
  if(item.type==='done'&&typeof item.payload.finalContent==='string')visible=item.payload.finalContent
 }
 // Preserve the existing CR fence transport guard; the real renderer does
 // this normalization before Markdown parsing, including on finalContent.
 assert.equal(visible.replace(/\r\n|\r/g,'\n'),parts.join(''));assert.equal(turns,1);assert.equal(log.length,2)
 assert.equal(completion.hasOpenFence(visible),false)
 assert.equal(events.filter(e=>e.type==='done').length,1);assert.equal(events.some(e=>e.type==='error'),false)
 assert.doesNotMatch(visible,/Ответ не завершён/);assert.equal(events.find(e=>e.type==='done').payload.incomplete??null,null)
 for(const fn of deferred.splice(0))await fn()
 // A stack-less website formerly entered the fixed Forge renderer instead
 // of allowing the selected model to author its composition and code.
 const siteResponse=await POST(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify({prompt:'Создай сайт 3D дизайн платформы',originalQuestion:'Создай сайт 3D дизайн платформы',model:'malik-max',stream:true,chatRecovery:true,maxTokens:8000})}))
 const siteEvents=(await siteResponse.text()).split(/\r?\n\r?\n/).map(parseChatSseFrame).filter(Boolean)
 assert.equal(siteResponse.status,200);assert.equal(turns,2,JSON.stringify(siteEvents));assert.equal(log.length,4)
 assert.match(siteInstruction,/immersive-product/);assert.match(siteInstruction,/YOU write the actual HTML/)
 assert.equal(siteEvents.some(e=>e.type==='error'),false);assert.equal(siteEvents.filter(e=>e.type==='done').length,1)
 for(const fn of deferred.splice(0))await fn()
})
console.log(`${checks}/${checks} code-completion checks PASS. Real intent/MAX engine/provider SSE parser/HTTP handler/client merge ran; upstream models, coordinator/account/tool boundaries are fixtures. Generated JS was parsed, not executed. No live-provider or browser certification.`)
