import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const activities=[], limits=new Map()
const load=workTestLoader({
  "@/lib/os/http":{osOwner:async request=>({userId:request.headers.get('x-fixture-owner')||'guest',authenticated:true,plan:'pro'})},
  "@/lib/server/request-frequency":{takeRequestFrequency:(_scope,id)=>{const n=limits.get(id)||0;limits.set(id,n+1);return n<12}},
  "@/lib/work/activity-log":{recordWorkActivity:async(id,record)=>activities.push({id,...record})},
})
const POST=load('app/api/work/skills/run/route.ts').POST
const task={op:'npv',cashflows:[-100,60,60],rate:0.1,period:'year',currency:'USD'}
const req=(body,owner='client-a')=>new Request('http://fixture/api/work/skills/run',{method:'POST',headers:{'content-type':'application/json','x-fixture-owner':owner},body:JSON.stringify(body)})
const first=await POST(req({skill:'petroleum.analyze',task,language:'ar'}));assert.equal(first.status,200)
const payload=await first.json();assert.equal(payload.result.ok,true);assert.ok(payload.report.includes('التقرير الهندسي'))
for(const format of ['docx','pdf','xlsx','md','json','html']){const r=await POST(req({skill:'petroleum.analyze',task,format},'export-'+format));assert.equal(r.status,200);assert.ok(r.headers.get('content-disposition').includes('attachment'));assert.ok((await r.arrayBuffer()).byteLength>50)}
const rtl=await POST(req({skill:'petroleum.analyze',task,format:'html',language:'ar'},'rtl'));assert.ok((await rtl.text()).includes('dir="rtl"'))
assert.equal((await POST(req({skill:'petroleum.analyze',task,format:'pdf',language:'ar'},'arabic-pdf'))).status,422)
assert.equal((await POST(req({skill:'petroleum.analyze',task:{...task,rate:-1}}))).status,400)
assert.equal((await POST(req({skill:'petroleum.analyze',task,ownerId:'client-b'}))).status,400)
assert.ok(activities.every(a=>!JSON.stringify(a).includes('cashflows')))
assert.equal(activities[0].id,'client-a')
assert.equal((await POST(req({skill:'math.compute',task:{op:'evaluate',expression:'2+2'}},'math'))).status,200)
for(let i=0;i<13;i++){const response=await POST(req({skill:'petroleum.analyze',task},'throttle'));if(i===12)assert.equal(response.status,429)}
assert.equal((await POST(new Request('http://fixture',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'}))).status,400)
console.log('PASS: actual skill HTTP handler, 6 exports, Arabic HTML, PDF refusal, schema/owner isolation, throttling and existing math. Auth/rate/storage edges are explicit fixtures; no live account/provider used.')
