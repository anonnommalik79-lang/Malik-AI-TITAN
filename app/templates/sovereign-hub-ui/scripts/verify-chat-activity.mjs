// Real presentation helpers and real gatherSources orchestration. External
// network/account/model boundaries are fixtures; no live search is claimed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { workTestLoader } from './work-test-loader.mjs'
const load=workTestLoader(), receipts=load('lib/ai/chat-execution.ts')
const {activitySummary,activityStepNote,filterActivitySteps,compactSearchReceipt}=load('lib/ai/chat-activity.ts')
const step=(kind,state='completed',extra={})=>({id:kind,title:'Действие '+kind,kind,state,startedAt:100,endedAt:state==='running'?undefined:200,...extra})
const trace=(steps,state='running')=>({version:1,id:'qa',startedAt:100,state,steps})
const source=(path,domain='example.org')=>({url:`https://${domain}/${path}`,title:`Источник ${path}`,domain})
const search=items=>step('search','completed',{output:JSON.stringify({sources:items})})

test('ordinary conversation has no invented research, counters or journal',()=>{
 const result=activitySummary(trace([step('status')]))
 assert.equal(result.hasResearch,false);assert.equal(result.read,0);assert.equal(result.found,0);assert.deepEqual(result.journal,[])
})
test('a running search is visible before any result exists',()=>{
 const result=activitySummary(trace([step('search','running')]))
 assert.equal(result.found,0);assert.match(result.title,/Ищу/);assert.equal(result.journal[0].state,'running')
})
test('found links, distinct sites and read pages are three different counts',()=>{
 const one=source('a'),two=source('b'),three=source('c','docs.example.org')
 const result=activitySummary(trace([search([one,two,three,one]),step('read','completed',{url:one.url}),step('read','failed',{id:'failed',url:two.url})]))
 assert.equal(result.found,3);assert.equal(result.sites,2);assert.equal(result.read,1);assert.equal(result.unavailable,1)
 assert.deepEqual(result.readUrls,[one.url])
})
test('failed/running search receipts cannot claim completed search evidence',()=>{
 for(const state of ['failed','running','cancelled','interrupted'])assert.equal(activitySummary(trace([{...search([source('a')]),state}])).found,0)
})
test('repeated reads do not inflate the read-page count',()=>{
 assert.equal(activitySummary(trace([step('read','completed',{id:'1',url:source('a').url}),step('read','completed',{id:'2',url:source('a').url})])).read,1)
})
test('answer citations without a search receipt are not presented as fresh web work',()=>{
 const result=activitySummary(trace([step('model')],'completed'),[source('a')])
 assert.equal(result.sources.length,1);assert.equal(result.hasResearch,false);assert.equal(result.found,0);assert.equal(result.read,0)
})
test('a missing journal never borrows another answer\'s sources or actions',()=>{
 const result=activitySummary(undefined,[source('a')]);assert.deepEqual(result.sources,[]);assert.equal(result.current,undefined)
})
test('real tools outrank the parent model span in the active heading',()=>{
 const result=activitySummary(trace([step('read','running'),step('model','running')]))
 assert.equal(result.current.kind,'read');assert.match(result.title,/Читаю/)
})
test('live journal is bounded to three real non-status operations',()=>{
 const result=activitySummary(trace(Array.from({length:80},(_,i)=>step(i%2?'status':'code','completed',{id:String(i)}))))
 assert.equal(result.journal.length,3);assert.ok(result.journal.every(item=>item.kind==='code'))
})
test('historical or terminal traces have no invented active title',()=>{
 assert.doesNotMatch(activitySummary(trace([step('search')],'completed')).title,/Ищу/)
})
for(const state of ['failed','cancelled','interrupted'])test('problem filtering includes '+state,()=>{
 assert.equal(filterActivitySteps([step('read',state),step('model')],'problems').length,1)
 assert.equal(activitySummary(trace([step('read',state)],state)).problems,1)
})
test('source and tool filters exclude unrelated activity',()=>{
 const items=['search','read','code','plugin','file','media','model','status'].map(kind=>step(kind))
 assert.deepEqual(filterActivitySteps(items,'sources').map(item=>item.kind),['search','read'])
 assert.deepEqual(filterActivitySteps(items,'tools').map(item=>item.kind),['code','plugin','file','media'])
})
test('text filtering matches Cyrillic and multiple words without regex execution',()=>{
 assert.equal(filterActivitySteps([step('read','completed',{title:'Чтение страницы Астана',url:source('а').url})],'all','ЧТЕНИЕ АСТАНА').length,1)
 assert.deepEqual(filterActivitySteps([step('read')],'all','[.*'),[])
})
test('unavailable pages expose their limitation rather than a read-success claim',()=>{
 const item=step('read','failed',{output:JSON.stringify({limitation:'Доступен только поисковый фрагмент'})})
 assert.match(activityStepNote(item),/только поисковый фрагмент/)
})
test('raw hidden reasoning is never used as a public model explanation',()=>{
 assert(!activityStepNote(step('model','completed',{output:JSON.stringify({reasoning:'PRIVATE_THOUGHTS'})})).includes('PRIVATE_THOUGHTS'))
})
test('a fetched page excerpt is bounded, redacted and stays plain text',()=>{
 const note=activityStepNote(step('read','completed',{output:JSON.stringify({excerpt:'<script>alert(1)</script> token=PRIVATE '+'a'.repeat(1000)})}))
 assert.ok(note.length<340);assert(!note.includes('PRIVATE'));assert(note.includes('<script>')) // React renders as text, not markup.
})
test('cached search is labelled as cache, not a new paid provider call',()=>{
 assert.match(activityStepNote(step('search','completed',{output:JSON.stringify({cacheHits:1,sources:[source('a')]})})),/кэша/)
})
test('malformed or numeric search payloads do not invent link counts',()=>{
 for(const output of ['{bad','{"sources":22}',JSON.stringify({sources:['https://example.org']})])assert.equal(activitySummary(trace([step('search','completed',{output})])).found,0)
})
test('unsafe links do not become source cards',()=>{
 const result=activitySummary(trace([search([{url:'javascript:alert(1)'},{url:'data:text/html,test'}])]))
 assert.equal(result.sources.length,0);assert.equal(result.found,0)
})
test('secret-bearing URLs and outputs remain redacted in presentation',()=>{
 const report=receipts.createExecutionReporter(()=>{})
 const id=report.start('Search','search','web.search')
 report.finish(id,{sources:[{url:'https://example.org/?token=PRIVATE',title:'API key=PRIVATE'}],reasoning:'THOUGHTS'})
 assert(!JSON.stringify(activitySummary(report.snapshot())).includes('PRIVATE'))
 assert(!receipts.executionMarkdown(report.snapshot()).includes('THOUGHTS'))
})
test('terminal summary counts only confirmed tool completions',()=>{
 assert.equal(activitySummary(trace([step('code'),step('read','failed'),step('model')],'completed')).completed,1)
})
test('UI has honest hide controls, filters, copy/export and no fake skip action',()=>{
 const ui=fs.readFileSync('components/sovereign/ChatExecution.tsx','utf8')
 for(const text of ['Скрыть действия','Найти действие','Копировать отчёт','Markdown','JSON','чтение не подтверждено'])assert(ui.includes(text))
 assert(!ui.includes('Пропустить'));assert(ui.includes('active && !writing && activity.journal.length > 0'))
})

const ast=ts.createSourceFile('router.ts',fs.readFileSync('lib/malik-god-router.ts','utf8'),ts.ScriptTarget.Latest,true)
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='gatherSources')
const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function researchFixture({indexOnly=false,indexFails=false,searchFails=false,readFails=false,readNull=false,cancel=false,empty=false}={}){
 const activity=receipts.createExecutionReporter(()=>{}),events=[],controller=new AbortController()
 const item=source('fact'),fallback=()=>[]
 const deps={
  classifyFreshness:()=>({needsSearch:true}),buildQueries:()=>['query'],publicSearchText:text=>text,
  env:()=>'',needsCurrentEvidence:()=>false,KNOWLEDGE_FEEDS:[],
  compactSearchReceipt,
  searchOfficialReleases:fallback,searchSerper:fallback,searchTavily:fallback,searchBrave:fallback,searchOfficialFeed:fallback,
  searchBingRss:fallback,searchGoogleNews:fallback,searchJina:fallback,searchWikipedia:fallback,searchGdelt:fallback,
  runLiveSearch:async()=>{
   assert.equal(activity.snapshot().steps[0].state,'running','search must start before network I/O')
   if(searchFails)throw Error('PRIVATE_PROVIDER_ERROR')
   return{sources:empty||indexOnly?[]:[item],calls:1,queries:1,cacheHits:0,fallbackSuccesses:0,attempts:[],cost:'fixture'}
  },
  indexedSources:async()=>{if(indexFails)throw Error('PRIVATE_INDEX_ERROR');return{sources:indexOnly?[item]:[],health:{status:'fixture'}}},
  diverseSources:items=>items,rankSourcesForPrompt:(_p,items)=>items,uniqueSources:items=>items.filter((item,index)=>items.findIndex(other=>other.url===item.url)===index),
  mapBounded:load('lib/live-intelligence/concurrency.ts').mapBounded,
  fetchPageText:async()=>{
   assert.equal(activity.snapshot().steps.at(-1).state,'running')
   if(cancel)controller.abort(new DOMException('stopped','AbortError'))
   if(readFails)throw Error('PRIVATE_READER_ERROR')
   return readNull?null:{title:'Read page',text:'Actual returned page text. '.repeat(30)}
  },
  assessSources:(_p,items)=>items,process:{env:{}},console:{info:()=>{}},
 }
 const gather=new Function(...Object.keys(deps),js+'\nreturn gatherSources')(...Object.values(deps))
 return {activity,events,controller,run:()=>gather('Проверь информацию',event=>events.push(event),activity,controller.signal)}
}
test('real research publishes running search, link receipts, read receipts and honest final counters',async()=>{
 const f=researchFixture(),result=await f.run(),summary=activitySummary(f.activity.snapshot())
 assert.equal(result.length,1);assert.ok(result[0].readAt);assert.equal(summary.found,1);assert.equal(summary.read,1)
 assert.equal(f.activity.snapshot().steps.every(step=>step.state==='completed'),true)
 assert.match(f.events.at(-1).text,/Отобрано источников · 1; прочитано страниц · 1/)
})
test('index-only success is not incorrectly marked failed',async()=>{
 const f=researchFixture({indexOnly:true});await f.run();assert.equal(f.activity.snapshot().steps[0].state,'completed')
})
test('a failed optional index does not discard successful live search',async()=>{
 const f=researchFixture({indexFails:true});assert.equal((await f.run()).length,1)
})
test('search exceptions produce a failed receipt without leaking raw provider errors',async()=>{
 const f=researchFixture({searchFails:true});await assert.rejects(f.run())
 assert.equal(f.activity.snapshot().steps[0].state,'failed');assert(!JSON.stringify(f.activity.snapshot()).includes('PRIVATE_PROVIDER_ERROR'))
})
test('unread search snippets are not counted or announced as read pages',async()=>{
 const f=researchFixture({readNull:true});await f.run()
 assert.equal(activitySummary(f.activity.snapshot()).read,0);assert.equal(activitySummary(f.activity.snapshot()).unavailable,1)
 assert.match(f.events.at(-1).text,/прочитано страниц · 0/)
})
test('a throwing reader closes its receipt as failed, not forever running',async()=>{
 const f=researchFixture({readFails:true});await f.run()
 assert.equal(f.activity.snapshot().steps.at(-1).state,'failed')
 assert(!JSON.stringify(f.activity.snapshot()).includes('PRIVATE_READER_ERROR'))
})
test('Stop aborts research and closes the real active read as cancelled',async()=>{
 const f=researchFixture({cancel:true});await assert.rejects(f.run(),{name:'AbortError'})
 assert.equal(f.activity.snapshot().steps.at(-1).state,'cancelled');assert(!f.events.some(event=>event.kind==='done'))
})
test('empty search leaves no phantom sources or reads',async()=>{
 const f=researchFixture({empty:true});assert.deepEqual(await f.run(),[])
 assert.equal(f.activity.snapshot().steps[0].state,'failed');assert.equal(activitySummary(f.activity.snapshot()).read,0)
})
test('long source lists remain bounded valid JSON with explicit detail limits',()=>{
 const sources=Array.from({length:16},(_,i)=>source('a'.repeat(1600)+i,`source${i}.org`))
 const output=compactSearchReceipt(sources,{cacheHits:0,reasoning:'PRIVATE'})
 const parsed=JSON.parse(output)
 assert.equal(parsed.found,16);assert.equal(parsed.sites,16);assert.equal(parsed.detailsLimited,true)
 assert(output.length<6000);assert(!output.includes('PRIVATE'))
 const result=activitySummary(trace([step('search','completed',{output})]))
 assert.equal(result.found,16);assert.equal(result.detailsLimited,true);assert.equal(result.read,0)
})
test('multiple truncated search lists use conservative lower bounds, not inflated totals',()=>{
 const output=compactSearchReceipt(Array.from({length:16},(_,i)=>source('x'.repeat(1600)+i)),{})
 const result=activitySummary(trace([step('search','completed',{id:'one',output}),step('search','completed',{id:'two',output})]))
 assert.equal(result.found,16);assert.equal(result.countsAreLowerBounds,true)
})
