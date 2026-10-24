import test from "node:test"
import assert from "node:assert/strict"
import {workTestLoader} from "./work-test-loader.mjs"
const load=workTestLoader({})
const {buildClaimLedger,normalizeClaimLedger,labelledMetricDisagreements}=load("lib/ai/claim-ledger.ts")
const {normalizeFactAudit}=load("lib/ai/fact-audit.ts")

test("recognized arithmetic is deterministic VERIFIED without web citations",()=>{
  const ledger=buildClaimLedger({answer:"17 * 23 = 391",prompt:"Реши 17 * 23"})
  assert.equal(ledger.claims[0].status,"VERIFIED")
  assert.equal(ledger.claims[0].origin,"calculation")
  assert.equal(ledger.claims[0].evidence[0].method,"deterministic")
  assert.equal(ledger.claims[0].evidence[0].url,undefined)
})
test("wrong arithmetic is not VERIFIED and stale input reports cannot override it",()=>{
  const ledger=buildClaimLedger({answer:"17 * 23 = 999",prompt:"Реши 17 * 23",accuracy:{claims:[{evidence:"deterministic",text:"17 * 23 = 999"}]}})
  assert.ok(ledger.claims.every(claim=>claim.status!=="VERIFIED"))
})
test("calculation alongside an unsupported world claim does not verify the entire sentence",()=>{
  const ledger=buildClaimLedger({answer:"2 + 2 = 4; the tax rate is 99%.",prompt:"Calculate and tell me tax"})
  assert.ok(ledger.claims.every(claim=>claim.status!=="VERIFIED"))
})
test("exact source text gets a narrowly scoped match receipt with URL and read date",()=>{
  const text="The published sample contains 1200 measurements."
  const ledger=buildClaimLedger({answer:`${text} [1]`,prompt:"Summarize the sample",sources:[{url:"https://source.example/report",snippet:text,readAt:"2026-10-24T10:00:00Z"}]})
  assert.equal(ledger.claims[0].status,"VERIFIED")
  assert.equal(ledger.claims[0].evidence[0].method,"source-text-match")
  assert.equal(ledger.claims[0].evidence[0].observedAt,"2026-10-24T10:00:00Z")
  assert.match(ledger.limits.join(" "),/не истинность/)
})
test("matching a number, title or un-read search snippet is not full verification",()=>{
  for(const source of [{url:"https://source.example",snippet:"Revenue is 1200",readAt:"2026-10-24T10:00:00Z"},{url:"https://source.example",snippet:"The profit is 1200 USD."}]){
    const ledger=buildClaimLedger({answer:"The profit is 1200 USD. [1]",prompt:"Profit?",sources:[source]})
    assert.equal(ledger.claims[0].status,"SUPPORTED")
  }
})
test("absent or invalid citations remain unverified",()=>{
  const ledger=buildClaimLedger({answer:"The profit is 1200 USD. [9]",prompt:"Profit?",sources:[{url:"javascript:alert(1)",snippet:"1200"}]})
  assert.equal(ledger.claims[0].status,"UNVERIFIED")
})
test("assumptions and forecasts are explicit uncertainty, not external facts requiring web",()=>{
  const ledger=buildClaimLedger({answer:"Допущение: конверсия составит 5%.\nПрогноз: выручка 1200 USD.",prompt:"Сделай сценарий"})
  assert.deepEqual(ledger.claims.map(claim=>claim.origin),["assumption","forecast"])
  assert.ok(ledger.claims.every(claim=>claim.status==="UNCERTAIN"))
})
test("bounded expert discrepancy uses same metric/unit, not scenario differences or a majority vote",()=>{
  assert.equal(labelledMetricDisagreements(["Revenue: $1000","Revenue: $1200"]),1)
  assert.equal(labelledMetricDisagreements(["Revenue: $1000","Revenue: $1000"]),0)
  assert.equal(labelledMetricDisagreements(["Revenue: $1000","Price: $1200"]),0)
  assert.equal(labelledMetricDisagreements(["Scenario revenue: $1000","Revenue: $1200"]),0)
  const ledger=buildClaimLedger({answer:"Revenue: $1000",prompt:"Revenue?",expertDisagreements:1})
  assert.equal(ledger.claims.at(-1).status,"UNCERTAIN")
  assert.equal(ledger.claims.at(-1).evidence[0].method,"expert-disagreement")
})
test("done payload and message restoration retain arithmetic evidence even without web research",()=>{
  const ledger=buildClaimLedger({answer:"17 * 23 = 391",prompt:"Calculate"})
  const message=JSON.parse(JSON.stringify({checked:0,supported:0,missing:0,brokenCitations:0,claims:[],status:"unchecked",ledger}))
  const restored=normalizeFactAudit(message)
  assert.equal(restored.ledger.claims[0].status,"VERIFIED")
  assert.deepEqual(restored.ledger.counts,ledger.counts)
  assert.equal(normalizeClaimLedger({...ledger,counts:{VERIFIED:900}}).counts.VERIFIED,1)
})
test("limits and no artificial ledger for code or small talk",()=>{
  assert.equal(buildClaimLedger({answer:"Привет! Чем помочь?",prompt:"Привет"}),null)
  assert.equal(buildClaimLedger({answer:"```js\nconst port=1200\n```",prompt:"Write code"}),null)
  assert.equal(normalizeClaimLedger({version:"malik-claim-ledger/1",claims:[null]}),null)
  const ledger=buildClaimLedger({answer:Array.from({length:150},(_,i)=>`Revenue ${1200+i} USD.`).join("\n"),prompt:"Report"})
  assert.ok(ledger.claims.length<=32)
})
test("restoration whitelists fields and cannot retain VERIFIED without its required evidence",()=>{
  const ledger=buildClaimLedger({answer:"17 * 23 = 391",prompt:"Calculate"})
  const raw={...ledger,claims:[{...ledger.claims[0],hiddenReasoning:"must not survive",evidence:[{method:"none",url:"javascript:alert(1)",secret:"never"}]}]}
  const restored=normalizeClaimLedger(raw)
  assert.equal(restored.claims[0].status,"UNVERIFIED")
  assert.doesNotMatch(JSON.stringify(restored),/hiddenReasoning|secret|javascript:/)
})
test("a broken audit input cannot take answer delivery down or invent success",()=>{
  assert.equal(buildClaimLedger({answer:"17 * 23 = 391",prompt:null}),null)
  assert.equal(buildClaimLedger({answer:null,prompt:"Calculate"}),null)
})
