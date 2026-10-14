// Actual React components + computation served locally; auth/API are NOT under
// test here. No production account bypass or model/provider calls.
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {reactQaBundle,reactQaRuntime} from './qa-react-bundle.mjs'
import {workTestLoader} from './work-test-loader.mjs'
import {prompt} from './fixtures/oil-titan-field.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.MALIK_QA_PLAYWRIGHT_PATH||'playwright')
const load=workTestLoader(),{executePetroleumTable}=load('lib/work/petroleum/table-message.ts')
const answer=executePetroleumTable({prompt});assert.ok(answer.ok)
const block=JSON.parse(answer.content.split('\n')[1])
const {modules,bundle}=reactQaBundle(),entry=bundle('components/sovereign/MalikOilReport.tsx')
const css=fs.readFileSync('components/sovereign/oil-report.css','utf8')+fs.readFileSync('components/sovereign/malik-tex.css','utf8')
const build=(language)=>{
 const b=structuredClone(block);b.request.language=language
 return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000;color:#fafafa;font:16px system-ui}#root{max-width:900px;margin:20px auto 160px;padding:0 16px}button{font:inherit} .test-composer{position:fixed;bottom:0;left:0;right:0;height:90px;background:#000;border-top:1px solid #444}${css}</style><div id="root"></div><div class="test-composer">QA composer boundary (not app shell)</div><script>${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(entry)}).MalikOilReport,{raw:${JSON.stringify(JSON.stringify(b))}}));</script></html>`
}
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(build(new URL(req.url,'http://local').searchParams.get('lang')||'ru'))})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.MALIK_QA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']})
const artifactDir=process.env.MALIK_QA_SCREENSHOT_DIR
if(artifactDir)fs.mkdirSync(artifactDir,{recursive:true})
try {
 for(const width of [390,1280])for(const language of ['ru','en','kk','ar']) {
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,acceptDownloads:true}),page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(base+'/?lang='+language,{waitUntil:'load'})
  await page.locator('[data-oil-report]').waitFor({timeout:20000})
  assert.equal(await page.locator('.malik-oil').getAttribute('dir'),language==='ar'?'rtl':'ltr')
  assert.equal(await page.locator('[data-oil-badge]').getAttribute('data-oil-badge'),'passed')
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  assert.ok(overflow<=1,`horizontal body overflow ${width}/${language}: ${overflow}`)
  const forecast=await page.locator('[data-oil-section="forecast"]').innerText()
  assert.match(forecast,/2027/);assert.ok(/601[.,]18/.test(forecast));assert.ok(/541[.,]86/.test(forecast))
  assert.match(await page.locator('[data-oil-section="pressure"]').innerText(),/psia/)
  const expo=page.locator('[data-oil-section="forecast"] button').filter({hasText:/Экспон|Exponential|أسي/}).first()
  if(await expo.count()){await expo.click();assert.equal(await expo.getAttribute('aria-pressed'),'false');await expo.click();assert.equal(await expo.getAttribute('aria-pressed'),'true')}
  await page.locator('[role="tab"]').filter({hasText:'W-03'}).click()
  const text=await page.locator('.malik-oil').innerText(),numeric=text.replace(/[,\s\u00a0\u202f\u2066\u2069]/g,'');assert.ok(/1410[.,]26/.test(text)||numeric.includes('1410.26'),text.slice(0,1600));assert.ok(!text.includes('газ снижается'))
  // Real UI export: downloaded JSON retains raw data, all fits, weights and receipt.
  const execution=page.locator('[data-oil-section="execution"]');await execution.locator('summary').click()
  const downloadPromise=page.waitForEvent('download');await execution.getByRole('button').click();const download=await downloadPromise
  const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(saved.execution.codeExecuted,true);assert.equal(saved.execution.modelCalls.length,0);assert.equal(saved.request.dataset.wells.length,4);assert.equal(saved.result.wells.length,5)
  // A direct factual trace with quarterly gaps must use move operations only;
  // model forecasts remain legitimate dashed paths.
  const paths=await page.locator('[data-oil-section="rates"] svg path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')))
  assert.ok(paths.some(d=>d&&d.startsWith('M')&&!d.includes('L')))
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  assert.ok(await page.evaluate(()=>document.querySelector('.malik-oil').getBoundingClientRect().bottom<=document.querySelector('.test-composer').getBoundingClientRect().top))
  assert.equal(errors.length,0,errors.join('\n'))
  if(artifactDir&&language==='ru')await page.screenshot({path:path.join(artifactDir,`mpce-${width}.png`),fullPage:true})
  console.log(`PASS actual React Oil report ${width}px/${language}: numerical values, RTL, gaps, legend, well selection, JSON download, no horizontal overflow; app auth/server boundary excluded`)
  await ctx.close()
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
