import assert from "node:assert/strict"
import { runMalikOilEnsemble, validOilParticipantText } from "../lib/server/malik-oil-ensemble.ts"
const base = {
  modelId: "malik-oil-1tb",
  prompt: "@Malik Oil AI Рассчитай нефтяной дебит, обводненность и анализ трещин",
  systemPrompt: "Test engineering task",
  maxTokens: 4000,
}
{
  const calls = [], chunks = []
  const result = await runMalikOilEnsemble({ ...base, onToken: c=>chunks.push(c) }, async (request, allowFallback) => {
    calls.push({ modelId: request.modelId, allowFallback, visible: Boolean(request.onToken) })
    return { content:"Engineering answer from "+request.modelId, provider:"fixture",model:request.modelId,selectedModelId:request.modelId,latencyMs:4 }
  })
  assert.deepEqual(calls.map(x=>x.modelId),["ling-3.1-flash","nvidia-nemotron-ultra-550b","malik-max","malik-max"])
  assert.deepEqual(calls.map(x=>x.allowFallback),[false,false,true,true])
  assert.ok(calls.every(x=>!x.visible), "No competing partial responses")
  assert.equal(chunks.length,1)
  assert.equal(result.content,chunks[0])
  assert.match(result.content,/3\/3/)
  assert.equal(result.selectedModelId, "malik-oil-1tb")
}
{
  const seen=[]
  const result=await runMalikOilEnsemble(base,async req=>{
    seen.push(req.modelId)
    if(req.modelId==="nvidia-nemotron-ultra-550b")throw Error("403")
    return {content:"Engineering valid response "+req.modelId,provider:"mock",model:req.modelId,selectedModelId:req.modelId}
  })
  assert.deepEqual(seen,["ling-3.1-flash","nvidia-nemotron-ultra-550b","malik-max","malik-max"])
  assert.match(result.content,/2\/3/)
  assert.match(result.content,/NVIDIA Nemotron 3 Ultra 550B: не участвовала/)
  assert.doesNotMatch(result.content,/3\/3/)
}
{
  const calls=[]
  const result=await runMalikOilEnsemble({...base,prompt:"Привет"}, async req=>{calls.push(req.modelId); throw Error("Unexpected")})
  assert.equal(calls.length,0)
  assert.match(result.content,/нефтегазовых задач/)
}
{
  await assert.rejects(()=>runMalikOilEnsemble(base, async()=>{throw Error("403")}),/ни один из трёх/)
}

{
  // Error envelopes from real HTTP gateways must not be counted as successful votes.
  for (const bad of ["", "Error: 403 Forbidden", "HTTP 429 Too Many Requests", '{"error":{"message":"quota"}}', "Unauthorized", "Insufficient credits", "Quota exceeded"]) {
    assert.equal(validOilParticipantText(bad), "", "Must reject upstream failure: " + bad)
  }
  assert.match(validOilParticipantText("Error analysis and rate forecast with verified inputs"), /Error analysis/)
  const seen=[]
  const result=await runMalikOilEnsemble(base,async req=>{
    seen.push(req.modelId)
    if (req.modelId === "nvidia-nemotron-ultra-550b") {
      return {content:"Error: 403 Forbidden",provider:"nvidia",model:"nvidia",selectedModelId:req.modelId}
    }
    if (seen.length===4) {
      return {content:"HTTP 502 Bad Gateway",provider:"bad",model:"gateway",selectedModelId:req.modelId}
    }
    return {content:"Validated engineering content "+req.modelId,provider:"mock",model:req.modelId,selectedModelId:req.modelId}
  })
  assert.deepEqual(seen,["ling-3.1-flash","nvidia-nemotron-ultra-550b","malik-max","malik-max"])
  assert.match(result.content,/2\/3/)
  assert.equal(result.usage.synthesized,false,"A failed synthesis must not be reported as completed")
  assert.doesNotMatch(result.content,/HTTP 502/)
  assert.equal(result.content.match(/Проверка участия моделей/g)?.length,1,"Exactly one authoritative status section")
}

{
  const payload=JSON.stringify({conclusion:"Evidence-bound engineering review",findings:[]})
  const calls=[],chunks=[]
  const result=await runMalikOilEnsemble({...base,responseContract:"petroleum-evidence-review-v1",maxTokens:512,onToken:c=>chunks.push(c)},async req=>{
    calls.push(req)
    return {content:payload,provider:"fixture",model:req.modelId,selectedModelId:req.modelId}
  })
  assert.equal(result.content,payload,"Structured review must not be corrupted with appended Markdown")
  assert.deepEqual(JSON.parse(result.content),JSON.parse(payload))
  assert.equal(result.usage.participantModels.length,3)
  assert.equal(result.usage.synthesized,true)
  assert.equal(chunks.length,1)
  assert.ok(calls.every(c=>!c.onToken&&c.responseContract==="petroleum-evidence-review-v1"))
  assert.ok(calls.every(c=>c.maxTokens===512),"Neither participants nor synthesis may increase the caller budget")
  assert.match(calls[3].prompt,/ONE JSON object/)
}
{
  let n=0
  const payload=JSON.stringify({conclusion:"Actual participant review",findings:[]})
  const result=await runMalikOilEnsemble({...base,responseContract:"petroleum-evidence-review-v1"},async req=>{
    n++
    if(req.modelId==="nvidia-nemotron-ultra-550b"||n===4)throw Error("fixture unavailable")
    return {content:payload,provider:"fixture",model:req.modelId,selectedModelId:req.modelId}
  })
  assert.equal(result.content,payload,"Degraded structured fallback must remain parsable")
  assert.equal(result.usage.synthesized,false)
  assert.deepEqual(result.usage.participantModels.map(p=>p.id),["ling-3.1-flash","malik-max"])
  assert.doesNotMatch(result.content,/3\/3|Проверка участия/)
}
console.log("Malik Oil 1TB ensemble orchestration: PASS")
