import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import path from 'node:path'
import {workTestLoader} from './work-test-loader.mjs'
import {readPackage} from './fixtures/document-package-reader.mjs'
const owner={userId:'universal-owner-fixture',authenticated:true,plan:'pro'},other={...owner,userId:'other-owner-fixture'}
let currentOwner=owner,drafts=[],calls=[],remaining,admit=true
const deferred=[]
const forbidden=()=>{throw Error('Unexpected external/tool boundary')}
class RouteError extends Error{}
const load=workTestLoader({
 'next/server':{after:fn=>deferred.push(fn)},
 '@/lib/malik-god-router':{asPlainText:a=>a.content,sourceContext:()=>'',gatherSourcesForPrompt:forbidden,malikGodAnswer:async(body,selection,_progress,onToken)=>{calls.push({body,selection,onToken});const content=drafts.shift()||'Mock model answer';onToken?.(content);return{content,provider:'fixture-model',model:'fixture',selectedModelId:selection.modelId,usedWeb:false,sources:[],attempts:[]}}},
 '@/lib/server/plugin-runtime':{parsePluginCommand:()=>null},'@/lib/server/plugin-model-answer':{runPluginModelAnswer:forbidden},
 '@/lib/ai/project-builder':{generateProjectWithBrain:forbidden},
 '@/lib/limits/rate-limit':{checkUsageLimit:async()=>({ok:admit,reason:'fixture quota'}),recordChatUsage:async()=>{}},
 '@/lib/server/malik-model-router':{resolveStrictMalikSelection:async()=>({modelId:'malik-max',entitlement:currentOwner}),MalikModelRouteError:RouteError,malikModelErrorPayload:()=>({error:'MODEL_UNAVAILABLE'}),runStrictMalikModel:forbidden},
 '@/lib/server/malik-coder-orchestrator':{runMalikCoderOrchestrator:forbidden},'@/lib/server/malik-agent-runtime':{prepareMalikAgentRuntime:async()=>null},
 '@/lib/server/request-entitlement':{resolveRequestEntitlement:async()=>currentOwner},
 '@/lib/server/work-quota':{reserveWorkQuota:async()=>({ok:true,receipt:{id:'fixture'}}),refundWorkQuota:async()=>{},WorkQuotaError:RouteError},
 '@/lib/server/malik-owner-context':{malikIdentityAnswer:()=>null,withVerifiedOwnerChatContext:b=>b},'@/lib/server/project-artifact-store':{putProjectArtifact:forbidden},
 '@/lib/server/multimodal-router':{estimateMultimodalTokens:()=>0,hasMalikAttachments:a=>Array.isArray(a)&&a.length>0,routeMalikAttachments:forbidden},
 '@/lib/server/daily-multimodal-quota':{DAILY_MULTIMODAL_TOKEN_LIMIT:10000,getDailyMultimodalQuota:()=>({remaining:10000}),recordDailyMultimodalTokens:()=>{}},
 '@/lib/server/daily-text-token-quota':{getDailyTextTokenQuota:()=>remaining===undefined?({unlimited:true}):({unlimited:false,remaining})},
 '@/lib/server/scheduled-tasks':{createScheduledTask:forbidden,scheduledTasksStatus:()=>({ready:false})},
 '@/lib/malik-compute/runtime':{withCompute:h=>h,observeComputeResult:()=>{}},
 '@/lib/os/http':{osOwner:async()=>currentOwner},'@/lib/server/request-frequency':{takeRequestFrequency:()=>true},
})
const store=load('lib/os/store.ts'),backend=store.memoryBackend();store.configureOsBackend(backend)
const {POST}=load('app/api/stream/route-impl.ts'),{GET}=load('app/api/os/artifacts/[id]/export/route.ts')
const {exportDocument}=load('lib/work/documents/export.ts'),{resolveConversationIntent}=load('lib/ai/conversation-intent.ts')
const {deliverConversationDocument,conversationSource}=load('lib/server/conversation-delivery.ts')
const {buildXlsx}=load('lib/work/documents/xlsx.ts')
const {editTool}=load('lib/os/tools/edit-tool.ts'),{validateArtifact}=load('lib/os/validate.ts')
const require=createRequire(path.join(process.env.MALIK_QA_DEPS||process.cwd(),'fixture.cjs'))
const {PDFDocument}=require('pdf-lib')
const source='# Технический отчёт\n\nҚазақша және русский текст. Выручка 120 USD.\n\n## Данные\n\n| Город | Значение |\n|---|---|\n| Алматы | 120 |\n| Астана | 80 |'
const history=[{role:'user',content:'Подготовь отчёт'},{role:'assistant',content:source}]
async function turn(prompt,extra={}){
 calls=[]
 const res=await POST(new Request('http://fixture/api/stream',{method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify({originalQuestion:prompt,prompt,model:'malik-max',stream:true,chatRecovery:true,...extra})}))
 const text=await res.text()
 const events=text.split('\n\n').filter(x=>x.includes('data: ')).map(f=>JSON.parse(f.split('\ndata: ')[1]))
 for(const fn of deferred.splice(0))await fn()
 return{status:res.status,events,text,answer:events.filter(e=>e.type==='content').map(e=>e.content).join('')}
}
function link(answer){const match=answer.match(/\/api\/os\/artifacts\/(art_[\w-]+)\/export\?format=(\w+)/);assert.ok(match,'real saved artifact link');return{id:match[1],format:match[2]}}
async function download(item){return GET(new Request(`http://fixture/api/os/artifacts/${item.id}/export?format=${item.format}`),{params:Promise.resolve({id:item.id})})}
let pdfItem,docxItem
test('actual SSE handler: PDF export uses no model and publishes one saved owner link',async()=>{
 const result=await turn('Сделай это в PDF',{history});assert.equal(result.status,200);assert.equal(calls.length,0);assert.equal(result.events.filter(e=>e.type==='done').length,1);pdfItem=link(result.answer)
 assert.equal(pdfItem.format,'pdf');assert.match(result.answer,/памяти сервера/)
 const trace=result.events.find(e=>e.type==='done').execution
 assert.ok(trace.steps.some(s=>s.tool==='document.export'&&s.state==='completed'))
 const art=await store.getArtifact(owner.userId,pdfItem.id);assert.equal(art.content,source);assert.equal(art.metadata.testsExecuted,false);assert.equal(art.metadata.exportProbe.sourceSha256.length,64)
 const response=await download(pdfItem);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);const bytes=new Uint8Array(await response.arrayBuffer());const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>0)
})
test('PDF → Word exports the actual prior content, not its link/confirmation text',async()=>{
 const prior=`[file](/api/os/artifacts/${pdfItem.id}/export?format=pdf)`
 const result=await turn('Нет, хочу Word',{history:[...history,{role:'user',content:'Сделай это в PDF'},{role:'assistant',content:prior}]});assert.equal(calls.length,0);docxItem=link(result.answer);assert.equal(docxItem.format,'docx')
 const art=await store.getArtifact(owner.userId,docxItem.id);assert.equal(art.content,source);assert.equal(art.version,2);assert.equal(art.links[0].artifactId,pdfItem.id)
 const response=await download(docxItem);assert.equal(response.status,200);const files=readPackage(await response.arrayBuffer());assert.match(files['word/document.xml'].toString(),/Выручка 120 USD/);assert.match(files['word/document.xml'].toString(),/w:tbl/);assert.doesNotMatch(files['word/document.xml'].toString(),/api\/os\/artifacts/)
})
test('same immutable source supports repeated format changes and owner-scoped replay',async()=>{
 for(const format of ['md','txt','html','json','zip']){const res=await turn(`Теперь файл ${format}`,{history:[{role:'assistant',content:`[f](/api/os/artifacts/${docxItem.id}/export?format=docx)`}]});const item=link(res.answer);assert.equal(item.format,format);assert.equal((await download(item)).status,200);assert.equal(calls.length,0)}
 store.configureOsBackend(backend);assert.equal((await store.getArtifact(owner.userId,docxItem.id)).content,source)
})
test('different account cannot read/download/convert a copied owner artifact ID',async()=>{
 currentOwner=other
 try{assert.equal((await download(docxItem)).status,404);const res=await turn('Нет, в PDF',{history:[{role:'assistant',content:`[f](/api/os/artifacts/${docxItem.id}/export?format=docx)`}]});assert.doesNotMatch(res.answer,/Выручка|\/api\/os\/artifacts/);assert.match(res.answer,/недоступен/);assert.equal(calls.length,0)}finally{currentOwner=owner}
})
test('artifact reference lookup enforces server ownership even without the HTTP download handler',async()=>{
 const intent=resolveConversationIntent({prompt:'Нет, в PDF',messages:[{role:'assistant',content:`[f](/api/os/artifacts/${docxItem.id}/export?format=docx)`}]})
 await assert.rejects(conversationSource(intent,other),/SOURCE_NOT_AVAILABLE/);assert.equal((await conversationSource(intent,owner)).content,source)
})
test('guests never receive a saved-file claim or authenticated download',async()=>{
 currentOwner={userId:'guest-fixture',authenticated:false,plan:'free'}
 try{assert.equal((await download(docxItem)).status,404);const res=await turn('Сделай это в PDF',{history});assert.doesNotMatch(res.answer,/\/api\/os\/artifacts/);assert.match(res.answer,/Войдите/);assert.equal(calls.length,0)}finally{currentOwner=owner}
})
test('stale Canvas/project flags cannot steal a document follow-up',async()=>{const res=await turn('Нет, в Word',{history,isProjectRequest:true,forceCanvas:true,isCodeRequest:true,responseMode:'canvas'});assert.equal(calls.length,0);assert.equal(link(res.answer).format,'docx')})
test('fresh requested Word file is created only after the mocked model completes',async()=>{
 drafts=[source];const prompt='Создай документ Word про запуск лаборатории';const res=await turn(prompt);assert.equal(calls.length,1);assert.equal(calls[0].body.originalQuestion,prompt);assert.equal(calls[0].onToken,undefined);assert.equal(res.events.filter(e=>e.type==='content').length,1);const art=await store.getArtifact(owner.userId,link(res.answer).id);assert.equal(art.content,source)
})
test('editing an owned document gives the model its source, retains old version and stores a revision',async()=>{
 const next=source+'\n\nНовая проверенная строка: бюджет 300 USD.';drafts=[next]
 const res=await turn('Добавь бюджет 300 USD, сохрани остальные изменения',{history:[{role:'user',content:'Создай официальный документ Word'},{role:'assistant',content:`[f](/api/os/artifacts/${docxItem.id}/export?format=docx)`}]})
 assert.equal(calls.length,1);assert.equal(calls[0].body.history[1].content,source);const art=await store.getArtifact(owner.userId,link(res.answer).id);assert.equal(art.content,next);assert.equal(art.links[0].relation,'revision-of');assert.equal((await store.getArtifact(owner.userId,docxItem.id)).content,source)
})
test('XLSX real OOXML contains opt-in formulas, numbers and two distinct sheets',async()=>{
 const markdown='# Прогноз\n\n## Revenue\n| Month | USD | Total |\n|---|---|---|\n| 1 | 60 | =SUM(B2:B3) |\n| 2 | 60 | =ROUND(B2*10%,2) |\n\n## Costs\n| Item | USD |\n|---|---|\n| Service | 20 |'
 const file=await exportDocument({format:'xlsx',title:'Формулы',markdown,allowFormulas:true}),pkg=readPackage(file.bytes)
 assert.match(pkg['xl/worksheets/sheet1.xml'].toString(),/<f>SUM\(B2:B3\)<\/f><v>120<\/v>/);assert.match(pkg['xl/worksheets/sheet1.xml'].toString(),/<v>60<\/v>/);assert.ok(pkg['xl/worksheets/sheet2.xml']);assert.match(pkg['xl/worksheets/sheet1.xml'].toString(),/<f>ROUND\(B2\*10%,2\)<\/f><v>6<\/v>/)
})
test('untrusted/default spreadsheets keep formula-looking strings inert',()=>{const pkg=readPackage(buildXlsx([{name:'safe',header:['value'],rows:[['=HYPERLINK(1)']]}]));assert.doesNotMatch(pkg['xl/worksheets/sheet1.xml'].toString(),/<f>/);assert.match(pkg['xl/worksheets/sheet1.xml'].toString(),/HYPERLINK/)})
test('CSV prevents whitespace-prefixed and negative-expression formula injection, preserving real negatives',()=>{
 const {buildCsv}=load('lib/work/documents/xlsx.ts'),csv=buildCsv(['v'],[['  =WEBSERVICE(1)'],['-2+WEBSERVICE(1)'],['-5']])
 assert.match(csv,/' {2}=WEBSERVICE/);assert.match(csv,/'-2\+WEBSERVICE/);assert.ok(csv.endsWith('\r\n-5\r\n'))
})
test('unsafe or malformed opt-in spreadsheet formula fails before a link is saved',async()=>{
 const intent=resolveConversationIntent({prompt:'Создай Excel с формулами'})
 const result=await deliverConversationDocument({owner,intent,markdown:'| value |\n|---|\n| =WEBSERVICE(1) |'});assert.equal(result.ok,false);assert.doesNotMatch(result.content,/\/api\/os\/artifacts/)
 await assert.rejects(exportDocument({format:'xlsx',title:'bad',markdown:'| a |\n|---|\n| =1 2 |',allowFormulas:true}))
})
test('PPTX opens as a CRC-valid native slide package and retains 1-point/6-point/long text',async()=>{
 const long='Факт '.repeat(35).trim(),markdown='# Вступление\n\nОдна строка.\n\n## Данные\n'+Array.from({length:6},(_,n)=>`- ${n===5?long:`Данные ${n+1}`}`).join('\n')
 const file=await exportDocument({format:'pptx',title:'Презентация',markdown}),pkg=readPackage(file.bytes)
 assert.ok(pkg['ppt/presentation.xml']);const first=pkg['ppt/slides/slide1.xml'].toString(),second=pkg['ppt/slides/slide2.xml'].toString();assert.match(first,/Одна строка/);assert.match(second,/Данные 5/);assert.match(second,/Факт/);assert.ok(pkg['ppt/notesSlides/notesSlide2.xml']);assert.match(first,/<p:txBody>/)
 const text=second.replace(/<[^>]*>/g,'');assert.ok(text.includes(long),'no normalized clipping or missing final point')
})
test('dense slides fail explicitly, not export with hidden omissions',async()=>{await assert.rejects(exportDocument({format:'pptx',title:'Dense',markdown:'# Slide\n\n'+Array.from({length:7},(_,i)=>'- Point '+i).join('\n')}))})
test('CSV escaping and ZIP members are checked independently',async()=>{
 const csv=await exportDocument({format:'csv',title:'Escapes',markdown:'| a | b |\n|---|---|\n| =SUM(1) | a,"b" |'});const text=new TextDecoder().decode(csv.bytes);assert.match(text,/'=SUM\(1\)/);assert.match(text,/"a,""b"""/)
 const zip=await exportDocument({format:'zip',title:'Bundle',markdown:source}),pkg=readPackage(zip.bytes);assert.ok(Object.keys(pkg).some(n=>n.endsWith('.docx')));assert.ok(Object.keys(pkg).some(n=>n.endsWith('.pdf')));assert.ok(Object.keys(pkg).some(n=>n.endsWith('.xlsx')));assert.equal(Object.keys(pkg).some(n=>n.endsWith('.pptx')),false)
})
test('missing/oversize source reports failure instead of fabricating a file',async()=>{const a=await turn('Сделай это PDF');assert.match(a.answer,/Пришлите/);assert.equal(calls.length,0);const b=await turn('Сделай это PDF',{history:[{role:'assistant',content:'x'.repeat(400001)}]});assert.doesNotMatch(b.answer,/\/api\/os\/artifacts/)})
test('abort cannot create a successful receipt/link',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(deliverConversationDocument({owner,intent:resolveConversationIntent({prompt:'Создай документ Word'}),markdown:source,signal:controller.signal}),{name:'AbortError'})})
test('strict JSON invalid draft repairs once, preserving the exact latest user request',async()=>{
 drafts=['Not JSON','{"answer":42}'];remaining=1000
 try{const prompt='Выдай строго JSON';const res=await turn(prompt);assert.equal(calls.length,2);assert.equal(calls[1].body.originalQuestion,prompt);assert.equal(calls[1].body.metadata.conversationRepair,'invalid-json');assert.equal(calls[0].body.maxTokens,500);assert.equal(calls[1].body.maxTokens,500);assert.deepEqual(JSON.parse(res.answer),{answer:42});assert.equal(res.events.filter(e=>e.type==='content').length,1)}finally{remaining=undefined}
})
test('repeated invalid JSON stops after one repair with valid machine-readable failure',async()=>{drafts=['wrong','still wrong'];const res=await turn('Выдай строго JSON');assert.equal(calls.length,2);assert.equal(JSON.parse(res.answer).completed,false)})
test('low remaining allowance cannot trigger an extra repair model call',async()=>{drafts=['wrong'];remaining=128;try{const res=await turn('Выдай строго JSON');assert.equal(calls.length,1);assert.equal(JSON.parse(res.answer).completed,false)}finally{remaining=undefined}})
test('validation reuses the existing explicit/plan budget, not an arbitrary 4000-token cap',async()=>{
 drafts=['wrong','{"ok":true}'];const res=await turn('Выдай строго JSON',{maxTokens:12000});assert.equal(calls.length,2);assert.equal(calls[0].body.maxTokens,6000);assert.equal(calls[1].body.maxTokens,6000);assert.deepEqual(JSON.parse(res.answer),{ok:true})
})
test('unchanged correction is never published as a successful edit',async()=>{const old='Объём составляет 45 единиц.';drafts=[old,old];const res=await turn('Исправь ошибку',{history:[{role:'assistant',content:old}]});assert.equal(calls.length,2);assert.match(res.answer,/не завершено/);assert.doesNotMatch(res.answer,/Объём составляет 45/)})
test('ordinary greeting retains streaming and only one model answer',async()=>{drafts=['Привет!'];const res=await turn('Привет');assert.equal(calls.length,1);assert.equal(typeof calls[0].onToken,'function');assert.equal(res.answer,'Привет!')})
test('real Work edit tool merges only changed files and does not fabricate test/build success',async()=>{
 const old={id:'art_sourceCode',projectId:'p',title:'Fixture',kind:'code',version:1,content:JSON.stringify({files:[{path:'app.ts',content:'const n=1'},{path:'keep.txt',content:'unchanged'}]})}
 const context={owner,flow:{goal:'Fix code'},task:{id:'edit',input:{sourceArtifactIds:[old.id],instruction:'Change n to 2'}},project:{},inputs:[old],activity:()=>{},dependency:()=>null,attempt:1,signal:new AbortController().signal,deps:{text:async()=>({content:JSON.stringify({files:[{path:'app.ts',content:'const n=2'}],deleted:[],note:'Updated n'}),provider:'fixture-model'})}}
 const result=await editTool.run(context),draft=result.artifacts[0],files=JSON.parse(draft.content).files
 assert.deepEqual(files,[{path:'app.ts',content:'const n=2'},{path:'keep.txt',content:'unchanged'}]);assert.equal(draft.metadata.qaPassed,false);assert.equal(draft.metadata.testsExecuted,false);assert.equal(draft.metadata.buildExecuted,false);assert.equal(draft.links[0].artifactId,old.id);assert.equal(validateArtifact(draft).ok,true)
 const bad={...draft,metadata:{...draft.metadata,qaPassed:true}};assert.equal(validateArtifact(bad).ok,false)
})
test('typed stop does not claim cancellation of an unrelated task',async()=>{const res=await turn('стоп');assert.equal(calls.length,0);assert.match(res.answer,/не подтверждена/)})
test('quota rejection happens before any document export/model work',async()=>{admit=false;try{const res=await turn('Сделай это в PDF',{history});assert.notEqual(res.status,200);assert.equal(calls.length,0);assert.doesNotMatch(res.text,/\/api\/os\/artifacts/)}finally{admit=true}})
test('delivery verification is not a live-provider or durable-storage certification',async()=>{assert.equal(await store.storeIsDurable(),false);console.log('Boundaries: WorkOS/account/quota/model are explicit fixtures. Actual POST/SSE/export/store/owner checks and file writers run locally. No production model, image or browser success is claimed.')})
