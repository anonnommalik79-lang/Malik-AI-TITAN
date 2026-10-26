// Real route and owner policy, fixture auth/usage only; no real user data.
import assert from "node:assert/strict"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"
let user=null, reads=0
const previousOwner=process.env.MALIK_OWNER_EMAIL, previousKey=process.env.WORKOS_API_KEY
process.env.MALIK_OWNER_EMAIL='audit-owner@example.test'
process.env.WORKOS_API_KEY=''
const usage={userCount:0,tokensUsed:0,chatCount:0,projectCount:0,imageCount:0,videoCount:0,uploadCount:0,topUsers:[]}
const load=workTestLoader({
 '@/lib/auth/server':{getOptionalWorkOSAuth:async()=>({user})},
 '@/lib/ai/usage':{getUsageOverview:()=>{reads++;return usage}},
 '@/lib/server/usage-persistence':{getPersistedUsageOverview:()=>{reads++;return usage}},
 '@/lib/server/request-safety':{requestSafetySnapshot:()=>({}),fetchWithTimeout:()=>{throw Error('No external WorkOS request allowed')}}
})
const {GET}=load('app/api/founder/overview/route.ts')
test.after(()=>{for(const [key,value]of [['MALIK_OWNER_EMAIL',previousOwner],['WORKOS_API_KEY',previousKey]]){if(value===undefined)delete process.env[key];else process.env[key]=value}})
for(const viewer of [null,{email:'other@example.test',emailVerified:true},{email:'other@example.test',role:'owner'}])test('untrusted overview request remains denied, uncached and reads no data',async()=>{
 user=viewer;const before=reads,response=await GET()
 assert.equal(response.status,403);assert.equal(reads,before)
 assert.match(response.headers.get('cache-control'),/private.*no-store/)
 assert.match(response.headers.get('vary'),/Cookie/i)
 assert.deepEqual(await response.json(),{ok:false,error:'FOUNDER_ONLY'})
})
test('authorized fixture response is private and uncached too',async()=>{
 user={email:'audit-owner@example.test',emailVerified:true}
 const response=await GET();assert.equal(response.status,200)
 assert.match(response.headers.get('cache-control'),/private.*no-store/)
 assert.match(response.headers.get('vary'),/Cookie/i)
 assert.equal((await response.json()).ok,true)
})
