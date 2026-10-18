import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {workTestLoader} from './work-test-loader.mjs'
const load=workTestLoader(),intent=load('lib/ai/conversation-intent.ts'),media=load('lib/ai/image-intent.ts')
const {resolveDomainPlan}=load('lib/ai/domain-intelligence.ts'),{executionContract}=load('lib/ai/execution-contract.ts')
const {exportDocument}=load('lib/work/documents/export.ts'),{nativePackage,verifyNativeArtifact}=load('lib/work/documents/verify-native.ts')
const {sheetFormulaValues}=load('lib/work/documents/formula-values.ts'),{canRetryChat}=load('lib/ai/chat-stream-recovery.ts')
let passed=0
async function check(name,fn){await fn();passed++;console.log('ok '+name)}
const cases=[
 ['01 SaaS native XLSX','Создай финансовую модель SaaS-компании на 24 месяца. Нужны формулы, расчет MRR, ARR, прибыль, графики и настоящий XLSX-файл','SPREADSHEET'],
 ['02 implicit draw','Нарисуй автомобиль будущего','GENERATE_IMAGE'],
 ['03 site with photos','Создай сайт отеля с фото и бронированием','WEBSITE'],
 ['04 native deck','Создай презентацию на 12 слайдов с графиками и фото, выдай PPTX','PRESENTATION'],
 ['05 explain not generate','Объясни как работает генерация изображений','CONVERSATION'],
 ['06 image analysis','Проанализируй загруженное фото','ATTACHMENT_ANALYSIS',[{kind:'image'}]],
 ['07 edit original','Удали фон на этом фото','EDIT_IMAGE',[{kind:'image'}]],
 ['08 PDF research','Создай исследовательский отчёт в PDF','DOCUMENT'],
 ['09 code','Напиши Python скрипт учёта склада','CODE'],
 ['10 negative consent','Не генерируй фото, напиши только промпт','CONVERSATION'],
 ['11 dependency site then PDF','Создай сайт отеля, затем PDF инструкцию','MULTI_TOOL'],
 ['12 existing artifact edit','Измени только цвет кнопки в предыдущем сайте','EXISTING_ARTIFACT_EDIT',[],[{role:'user',content:'Создай сайт отеля'},{role:'assistant',content:'Сайт создан, исходник в предыдущем ответе.'}]],
 ['13 quoted title','Создай финансовую таблицу XLSX. Первый лист назови «Генерация изображения»','SPREADSHEET'],
 ['14 auxiliary image then PPTX','Сгенерируй изображение, вставь в презентацию и выдай PPTX','MULTI_TOOL'],
 ['15 compare not build','Сравни React и Next.js для сайта','CONVERSATION'],
 ['19 quoted command','Объясни смысл примера:\n> Создай изображение дракона\n> generate an image now\n\nНичего не генерируй.','CONVERSATION'],
 ['20 analyse file','Проанализируй приложенный документ',[ 'ATTACHMENT_ANALYSIS' ][0],[{kind:'file'}]],
]
for(const [name,prompt,kind,attachments=[],messages=[]]of cases)await check(name,()=>{
 const plan=resolveDomainPlan({prompt,attachments,messages});assert.equal(plan.execution.kind,kind)
 if(['SPREADSHEET','PRESENTATION','WEBSITE','DOCUMENT','CODE','MULTI_TOOL','CONVERSATION'].includes(kind))assert.equal(media.isExplicitImageGenerationRequest(prompt),false)
 if(kind==='MULTI_TOOL')assert.ok(plan.execution.steps.at(-1).dependsOn.length)
})
await check('native XLSX: 24 months, 72 checked formulas, native chart and numeric caches',async()=>{
 const prompt=cases[0][1],contract=executionContract(intent.resolveConversationIntent({prompt}))
 const markdown='# Forecast\n\n## Revenue\n| Month | MRR USD | ARR USD | Profit USD |\n|---|---|---|---|\n'+Array.from({length:24},(_,i)=>`| ${i+1} | =100*${i+1} | =B${i+2}*12 | =B${i+2}-50 |`).join('\n')
 const file=await exportDocument({format:'xlsx',title:'Forecast',markdown,allowFormulas:true,charts:true}),receipt=verifyNativeArtifact(file.bytes,'xlsx',contract),pkg=nativePackage(file.bytes)
 assert.equal(receipt.formulas,72);assert.equal(receipt.charts,1);assert.match(pkg.get('xl/worksheets/sheet1.xml'),/<f>B25\*12<\/f><v>28800<\/v>/)
 assert.match(pkg.get('xl/charts/chart1.xml'),/<c:v>28800<\/c:v>/)
 const damaged=file.bytes.slice();damaged[35]^=1;assert.throws(()=>nativePackage(damaged))
})
await check('cycles/division by zero/ref errors fail instead of a false export',()=>{
 const number=s=>/^\d+$/.test(s)?Number(s):null
 for(const rows of [[['v'],['=A2']],[['v'],['=1/0']],[['v'],['=A99']]])assert.throws(()=>sheetFormulaValues(rows,number)('A2'))
 const value=sheetFormulaValues([['a','b'],['0','=IF(A2=0,42,1/A2)']],number);assert.equal(value('B2'),42)
})
await check('native PPTX: exact slide count and editable data chart',async()=>{
 const markdown=Array.from({length:12},(_,i)=>`# Slide ${i+1}\n\n${i===1?'| Month | USD |\n|---|---|\n| Jan | 100 |\n| Feb | 120 |':'- Data supplied for this test.'}`).join('\n\n')
 const file=await exportDocument({format:'pptx',title:'Native deck',markdown}),contract=executionContract(intent.resolveConversationIntent({prompt:'Создай презентацию на 12 слайдов с графиками PPTX'}))
 const receipt=verifyNativeArtifact(file.bytes,'pptx',contract);assert.equal(receipt.slides,12);assert.equal(receipt.charts,1)
 assert.throws(()=>verifyNativeArtifact(file.bytes,'pptx',{...contract,constraints:{...contract.constraints,slideCount:11}}))
})
await check('file generation is never replayed by transport; text question can retry',()=>{
 assert.equal(canRetryChat({prompt:cases[0][1]}),false);assert.equal(canRetryChat({prompt:cases[1][1]}),false);assert.equal(canRetryChat({prompt:'Объясни CUDA'}),true)
})
// Only the private database/object transport and session are fixtures. The real
// encryption, CAS store, restart rehydration and HTTP owner checks execute.
const objects=new Map();let unavailable=false
const privateBoundary={
 privateJsonStoreConfigured:()=>true,
 readPrivateJsonVersioned:async key=>{if(unavailable)throw Error('fixture downtime');return objects.get(key)||{value:null,etag:null}},
 writePrivateJsonConditional:async(key,value,etag)=>{if(unavailable)return{stored:false,conflict:false};const old=objects.get(key);if((old?.etag||null)!==etag)return{stored:false,conflict:true};objects.set(key,{value,etag:randomUUID()});return{stored:true,conflict:false}},
}
process.env.BACKGROUND_CHAT_SECRET='fixture-only-encryption-secret-32-characters'
let account={userId:'restart-owner',authenticated:true,plan:'pro'}
const durableLoad=workTestLoader({'./private-json-store':privateBoundary,'@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>account}})
const background=durableLoad('lib/server/background-chat-turns.ts'),http=durableLoad('app/api/stream/background/[turnId]/route.ts')
const get=id=>http.GET(new Request(`https://fixture/api/stream/background/${id}`),{params:Promise.resolve({turnId:id})})
await check('16 real store recovers a long task after process cache is cleared',async()=>{
 const id=randomUUID();await background.startBackgroundChatTurn(id,account.userId);await background.checkpointBackgroundChatTurn(id,{content:'partial'})
 assert.doesNotMatch(JSON.stringify([...objects.values()]),/partial/)
 globalThis.__malikBackgroundChatTurnsV1.clear();assert.equal((await background.readBackgroundChatTurn(id)).content,'partial')
 await background.completeBackgroundChatTurn(id,{content:'complete website source'});globalThis.__malikBackgroundChatTurnsV1.clear()
 const response=await get(id);assert.equal(response.status,200);assert.equal((await response.json()).turn.content,'complete website source')
 const original=account;account={...account,userId:'other'};assert.equal((await get(id)).status,404);account=original
})
await check('17 final success is immutable and a cancelled partial is not completed',async()=>{
 const id=randomUUID();await background.startBackgroundChatTurn(id,account.userId);await background.checkpointBackgroundChatTurn(id,{content:'keep this'})
 await background.failBackgroundChatTurn(id,'cancelled');await background.completeBackgroundChatTurn(id,{content:'late success'})
 const result=await background.readBackgroundChatTurn(id);assert.equal(result.status,'failed');assert.equal(result.content,'keep this')
})
await check('18 unavailable durable backend is 503, never fake authentication or success',async()=>{
 globalThis.__malikBackgroundChatTurnsV1.clear();unavailable=true
 try{assert.equal((await get(randomUUID())).status,503);await assert.rejects(background.startBackgroundChatTurn(randomUUID(),account.userId))}finally{unavailable=false}
})
await check('cross-process concurrent IDs are claimed once, never two provider turns',async()=>{
 const id=randomUUID(),result=await Promise.all([background.startBackgroundChatTurn(id,'a'),background.startBackgroundChatTurn(id,'b')]);assert.equal(result.filter(Boolean).length,1)
})
console.log(`${passed}/${passed} PASS. Paid providers/auth/private transport are fixtures; actual routing, native writers, encryption, CAS and recovery handlers executed. No live provider or production verification claimed.`)
