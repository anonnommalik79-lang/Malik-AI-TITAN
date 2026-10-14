// Real Markdown + real Recharts in Chromium. Local component harness, NOT app authentication/production.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {workTestLoader} from './work-test-loader.mjs'
import {scienceCases,scienceInput} from './fixtures/oil-science.mjs'
const require=createRequire(import.meta.url),qaRequire=process.env.MALIK_QA_DEPS?createRequire(path.join(process.env.MALIK_QA_DEPS,'fixture.cjs')):require
const {webpack}=qaRequire('next/dist/compiled/webpack/webpack')
const {chromium}=require(process.env.MALIK_QA_PLAYWRIGHT_PATH||'playwright')
const output=fs.mkdtempSync(path.join(os.tmpdir(),'malik-science-browser-'))
const compiler=webpack({mode:'development',target:'web',devtool:false,context:process.cwd(),entry:path.resolve('scripts/qa-oil-science-client.mjs'),output:{path:output,filename:'client.js',publicPath:'/'},resolve:{fullySpecified:false,extensions:['.ts','.tsx','.mjs','.js','.json'],alias:{'@':process.cwd()},modules:[path.join(process.env.MALIK_QA_DEPS||process.cwd(),'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('scripts/qa-typescript-loader.cjs')},{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.css$/,type:'asset/source'}]},optimization:{minimize:false,splitChunks:false},performance:{hints:false}})
await new Promise((resolve,reject)=>compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||new Error(stats.toString({all:false,errors:true})));else resolve()}))
const load=workTestLoader(),{runPetroleum}=load('lib/work/petroleum/engine.ts'),{petroleumReport}=load('lib/work/petroleum/report.ts')
const css=['app/chat-black-surface-final.css','components/sovereign/malik-tex.css','components/sovereign/answer-blocks.css','components/sovereign/visual-engine/visual-engine.css','components/sovereign/oil-report.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n')
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://local')
 if(/^\/[\w.-]+\.js$/.test(url.pathname)){const file=path.join(output,path.basename(url.pathname));if(!fs.existsSync(file)){response.writeHead(404);response.end();return}response.setHeader('content-type','application/javascript');fs.createReadStream(file).pipe(response);return}
 const method=url.searchParams.get('method')||'corey',language=url.searchParams.get('lang')||'ru',example=scienceCases.find(s=>s.method===method)
 if(!example||!['en','ru','kk','ar'].includes(language)){response.writeHead(400);response.end();return}
 const report=petroleumReport(runPetroleum({op:'scientific',input:scienceInput(example)}),language)
 response.setHeader('content-type','text/html;charset=utf-8');response.end(`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;color:#eee;font:16px system-ui}#malik-root{width:calc(100% - 32px);max-width:900px;margin:20px auto 160px;min-width:0}.qa-composer{position:fixed;bottom:0;left:0;right:0;height:90px;background:#000;border-top:1px solid #444}pre{max-width:100%;overflow:auto}${css}</style><main id="malik-root"><div id="root"></div></main><div class="qa-composer">QA composer boundary (not app shell)</div><script id="qa-report" type="application/json">${JSON.stringify(report).replace(/</g,'\\u003c')}</script><script src="/client.js"></script></html>`)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true,executablePath:process.env.MALIK_QA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']})
let passed=0
const methods=['corey','vogel','nodal','net-pay','pipe-profile','esp','forecast-uncertainty','pvt-plot','log-plot','wellbore-stability','formation-evaluation','monte-carlo']
try{for(const width of [390,1280])for(const language of ['ru','en','kk','ar'])for(const method of methods){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,acceptDownloads:true}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(`http://127.0.0.1:${server.address().port}/?method=${method}&lang=${language}`)
 await page.locator('.malik-md-table').first().waitFor({timeout:30000}).catch(async error=>{throw new Error(`${width}/${language}/${method}: ${error.message}; browser errors: ${errors.join('; ')}; body: ${(await page.locator('body').innerText()).slice(0,600)}`)})
 const text=await page.locator('#root').innerText();assert.match(text,/PASS/);assert.match(text,/model calls: 0/);assert.ok(text.includes(method));assert.ok(!text.includes('NaN'));assert.ok(!text.includes('Infinity'))
 if(['corey','vogel','pipe-profile','esp','forecast-uncertainty','pvt-plot','log-plot'].includes(method)){
  assert.match(text,/X: .*Y:/,'Axis names and physical units are visibly captioned')
  await page.locator('.recharts-scatter-symbol').first().waitFor({timeout:30000}).catch(async error=>{throw new Error(`${width}/${language}/${method}: ${error.message}; browser errors: ${errors.join('; ')}; charts: ${(await page.locator('[data-malik-visual-engine], [data-malik-visual-fallback]').allTextContents()).join('; ')}; SVG: ${(await page.locator('svg').allInnerTexts()).join('; ')}`)})
  assert.equal(await page.locator('[data-malik-visual-fallback]').count(),0)
  if(method==='corey'){const toggle=page.locator('.mv-legend button').first();await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true')}
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}/${language}/${method}: overflow`)
 assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr')
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));assert.ok(await page.evaluate(()=>document.getElementById('root').getBoundingClientRect().bottom<=document.querySelector('.qa-composer').getBoundingClientRect().top))
 assert.equal(errors.length,0,errors.join('\n'))
 if(process.env.MALIK_QA_SCREENSHOT_DIR&&language==='ru'&&['corey','forecast-uncertainty','log-plot'].includes(method)){fs.mkdirSync(process.env.MALIK_QA_SCREENSHOT_DIR,{recursive:true});await page.locator('[data-malik-visual-engine]').screenshot({path:path.join(process.env.MALIK_QA_SCREENSHOT_DIR,`science-${method}-${width}.png`)})}
 console.log(`PASS ${width}px/${language}/${method}`)
 await context.close();passed++
}console.log(`PASS ${passed}/${methods.length*8} actual Markdown/Recharts scenarios: 390/1280px, RU/EN/KK/AR, model curves, numerical tables, legends, RTL and no page overflow. App auth and real-device Safari/Android excluded.`)}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
