import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const deferred=[],storage=new Map(),calls=[],conversationDrafts=[]
const forbidden=()=>{throw new Error("Unexpected external operation")}
let question="",answer="17 * 23 = 391"
const files=[
  ["PLAN.json",JSON.stringify({title:"Slug CLI",requirements:["CLI with tests"],steps:["Write CLI","Run tests"]})],
  ["package.json",'{"name":"slug-cli","type":"module"}'],
  ["slug.mjs",'export const slug=s=>s.trim().toLowerCase()'],
  ["cli.mjs",'import {slug} from "./slug.mjs";console.log(slug(process.argv[2] || ""))'],
  ["slug.test.mjs",'import test from "node:test";import assert from "node:assert/strict";import {slug} from "./slug.mjs";test("trim",()=>assert.equal(slug(" X "),"x"))'],
  ["README.md","node cli.mjs hello\nnode --test"],
]
const blocks=files.map(([name,content])=>`<<<FILE:${name}>>>\n${content}\n<<<END_FILE>>>`).join("\n")
const load=workTestLoader({
  "next/server":{after:fn=>deferred.push(fn)},
  "@/lib/malik-god-router":{asPlainText:result=>result.content,malikGodAnswer:async body=>{conversationDrafts.push(body);return{content:answer,provider:"fixture",model:"fixture",usedWeb:false,sources:[],attempts:[]}},gatherSourcesForPrompt:forbidden,sourceContext:()=>""},
  "@/lib/server/plugin-runtime":{parsePluginCommand:()=>null},
  "@/lib/server/plugin-model-answer":{runPluginModelAnswer:forbidden},
  "@/lib/ai/project-builder":{generateProjectWithBrain:forbidden},
  "@/lib/limits/rate-limit":{checkUsageLimit:async()=>({ok:true}),recordChatUsage:async()=>{}},
  "@/lib/server/malik-model-router":{
    resolveStrictMalikSelection:async()=>({modelId:"malik-max",entitlement:{userId:"fixture-owner",authenticated:true,plan:"pro"}}),
    runStrictMalikModel:async input=>{calls.push(input);return{content:blocks,provider:"fixture-llm",model:"fixture-coder"}},
    MalikModelRouteError:class extends Error{},malikModelErrorPayload:error=>({error:error.message}),
  },
  "@/lib/server/malik-coder-orchestrator":{runMalikCoderOrchestrator:forbidden},
  "@/lib/server/malik-agent-runtime":{prepareMalikAgentRuntime:async()=>null},
  "@/lib/server/request-entitlement":{resolveRequestEntitlement:async()=>({userId:"fixture-owner",authenticated:true,plan:"pro"})},
  "@/lib/server/work-quota":{reserveWorkQuota:async()=>({ok:true,receipt:{id:"fixture"}}),refundWorkQuota:async()=>{},WorkQuotaError:class extends Error{}},
  "@/lib/server/malik-owner-context":{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:body=>body},
  "@/lib/server/multimodal-router":{estimateMultimodalTokens:()=>0,hasMalikAttachments:items=>Array.isArray(items)&&items.length>0,routeMalikAttachments:forbidden},
  "@/lib/server/daily-multimodal-quota":{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
  "@/lib/server/daily-text-token-quota":{getDailyTextTokenQuota:()=>({unlimited:true})},
  "@/lib/server/scheduled-tasks":{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
  "@/lib/malik-compute/runtime":{withCompute:fn=>fn,observeComputeResult:()=>{}},
  "@/lib/server/private-json-store":{writePrivateJson:async(key,value)=>storage.set(key,value),readPrivateJson:async key=>storage.get(key),deletePrivateJson:async key=>storage.delete(key)},
  "@/lib/server/render-bandwidth":{renderResponseFitsBudget:()=>true,renderBandwidthBlocked:forbidden},
})
const {POST}=load("app/api/stream/route-impl.ts")
const {normalizeFactAudit}=load("lib/ai/fact-audit.ts")
const {readProjectZip}=load("lib/work/code/zip-read.ts")
const {GET}=load("app/api/ai/project/artifacts/[id]/download/route.ts")
async function stream(prompt){
  question=prompt
  const response=await POST(new Request("https://fixture/api/stream",{method:"POST",headers:{"content-type":"application/json",accept:"text/event-stream"},body:JSON.stringify({stream:true,workspaceMode:"chat",originalQuestion:prompt})}))
  assert.equal(response.status,200)
  const events=(await response.text()).split("\n\n").filter(frame=>frame.includes("data: ")).map(frame=>JSON.parse(frame.split("\ndata: ")[1]))
  assert.equal(events.filter(event=>event.type==="done").length,1,JSON.stringify(events))
  for(const fn of deferred.splice(0))await fn()
  return {events,done:events.find(event=>event.type==="done"),text:events.filter(event=>event.type==="content").map(event=>event.content).join("")}
}
test("main HTTP/SSE -> Self-Build source -> owner download -> actual ZIP passport; no executor is honestly PARTIAL",async()=>{
  const saved=[process.env.WEBSITE_EXECUTOR_URL,process.env.WEBSITE_EXECUTOR_TOKEN]
  delete process.env.WEBSITE_EXECUTOR_URL;delete process.env.WEBSITE_EXECUTOR_TOKEN
  try{
    const result=await stream("Сделай CLI-утилиту с тестами на Node.js")
    assert.equal(calls.length,1);assert.equal(calls[0].modelId,"malik-max")
    assert.match(result.text,/Паспорт проверок.*PARTIAL/)
    assert.ok(result.events.some(event=>event.type==="activity"&&event.step.tool==="selfbuild.test"))
    assert.equal(result.done.provider,"fixture-llm")
    const response=await GET(new Request("https://fixture"+result.done.projectArtifact.downloadUrl),{params:Promise.resolve({id:result.done.projectArtifact.id})})
    assert.equal(response.status,200)
    const files=readProjectZip(Buffer.from(await response.arrayBuffer())).files
    const passport=JSON.parse(files.find(file=>file.path==="PROOF_PASSPORT.json").content)
    assert.equal(passport.kind,"selfbuild");assert.equal(passport.status,"PARTIAL")
    assert.equal(passport.checks.find(check=>check.id==="unit").status,"not_run")
  }finally{for(const [i,name]of["WEBSITE_EXECUTOR_URL","WEBSITE_EXECUTOR_TOKEN"].entries()){if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i]}}
})
test("main HTTP/SSE -> final arithmetic ledger -> serialized message restoration, no source fabrication",async()=>{
  const result=await stream("Реши 17 * 23")
  assert.equal(result.done.usedWeb,false)
  assert.equal(result.done.truthLedger.claims[0].status,"VERIFIED")
  const restored=normalizeFactAudit(JSON.parse(JSON.stringify(result.done.factAudit)))
  assert.equal(restored.ledger.claims[0].evidence[0].method,"deterministic")
  assert.equal(restored.ledger.claims[0].evidence[0].url,undefined)
})
test("authenticated on-demand arithmetic verification uses the same ledger, not an unnecessary web search",async()=>{
  const {POST:verify}=load("app/api/ai/verify/route.ts")
  const response=await verify(new Request("https://fixture/api/ai/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:"Реши 17 * 23",answer:"17 * 23 = 391"})}))
  assert.equal(response.status,200)
  const body=await response.json()
  assert.deepEqual(body.sources,[])
  assert.equal(body.audit.ledger.claims[0].status,"VERIFIED")
})
// These are deliberately invalid drafts testing the rejection path, not model
// answers used to claim conversational quality in the before/after benchmark.
for(const [language,prompt,invalid,honest]of[
  ["ru","Ты действительно запускал тесты?","Я запустил тесты, всё прошло успешно.","Я не запускал тесты; могу разобрать предоставленный лог."],
  ["kk","Сен тесттерді іске қостың ба?","Мен тесттерді іске қостым.","Мен тесттерді іске қосқан жоқпын."],
  ["en","Did you actually run the tests?","I ran the tests successfully.","I have not run the tests; I can inspect the supplied log."],
]){
  test(`${language} HTTP/SSE: an unverified execution claim never reaches the user; one repair maximum`,async()=>{
    const previous=answer
    try{
      answer=invalid;conversationDrafts.length=0
      const result=await stream(prompt)
      assert.equal(conversationDrafts.length,2)
      assert.equal(conversationDrafts[1].metadata.conversationRepair,"unsupported-action-claim")
      assert.ok(!result.text.includes(invalid))
      assert.match(result.text,/подтвердить|растай|confirm/)
      assert.equal(result.events.filter(event=>event.type==="done").length,1)
    }finally{answer=previous}
  })
  test(`${language} HTTP/SSE: honest nonexecution needs no repair`,async()=>{
    const previous=answer
    try{
      answer=honest;conversationDrafts.length=0
      const result=await stream(prompt)
      assert.equal(conversationDrafts.length,1)
      assert.ok(result.text.includes(honest))
    }finally{answer=previous}
  })
}
