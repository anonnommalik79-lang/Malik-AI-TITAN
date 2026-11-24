import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const { runResearchToolLoop, parseResearchAction } = workTestLoader()("lib/server/intelligence-tools.ts")
const question = "Current stable Next.js version and release date?"
const source = { title: "Release", domain: "example.test", url: "https://example.test/release" }
const second = { title: "Documentation", domain: "example.test", url: "https://example.test/docs" }
const searchAction = JSON.stringify({ action: "search", focus: "Next.js version", angle: "official" })
const forbidden = () => assert.fail("unexpected tool call")

test("ordinary turns and private requests do not use the tool loop", async () => {
  for (const input of [{enabled:false,question},{enabled:true,question:"Look up alice@example.test"}]) {
    const result = await runResearchToolLoop({ ...input, sources:[source], plan:forbidden, search:forbidden })
    assert.equal(result.status,"skipped")
    assert.equal(result.planningTokens,0)
  }
})

test("real tool receipts return to synthesis, duplicate sources collapse", async () => {
  let calls = 0, query = ""
  const result = await runResearchToolLoop({ enabled:true, question, sources:[source],
    plan:async input => { assert.equal(input.maxTokens,256); assert.match(input.prompt,/Release/); return {content:searchAction} },
    search:async q => { calls++; query=q; return [source,second] },
  })
  assert.equal(calls,1)
  assert.match(query,/release date/)
  assert.match(query,/official primary source/)
  assert.deepEqual(result.sources,[source,second])
  assert.equal(result.searches,1)
  assert.equal(result.planningTokens,256)
})

test("the model may stop after actual first results", async () => {
  const result = await runResearchToolLoop({ enabled:true, question, sources:[source], plan:async()=>({content:'{"action":"finish"}'}),search:forbidden })
  assert.equal(result.status,"finished")
  assert.equal(result.searches,0)
})

test("unknown tools, injected queries and extra parameters fail closed", async () => {
  for (const bad of [
    {action:"delete",focus:"Next.js version",angle:"official"},
    {action:"search",focus:"private account data",angle:"official"},
    {action:"search",focus:"Next.js version",angle:"official",url:"https://example.test"},
    {action:"search",focus:"Next.js version",angle:"__proto__"},
  ]) {
    const result=await runResearchToolLoop({enabled:true,question,sources:[source],plan:async()=>({content:JSON.stringify(bad)}),search:forbidden})
    assert.equal(result.status,"unavailable")
  }
  assert.equal(parseResearchAction("not JSON",question),null)
})

test("stalled tools return existing sources within budget", async () => {
  const result = await runResearchToolLoop({enabled:true,question,sources:[source],plan:async()=>({content:searchAction}),search:()=>new Promise(()=>{}),searchMs:15})
  assert.equal(result.status,"unavailable")
  assert.deepEqual(result.sources,[source])
})

test("aborted turns do not synthesize an invented success", async () => {
  const ctl=new AbortController()
  const result=runResearchToolLoop({enabled:true,question,sources:[],signal:ctl.signal,plan:()=>new Promise(()=>{}),search:forbidden})
  ctl.abort()
  await assert.rejects(result,{name:"AbortError"})
})
